/**
 * 中国法定节假日数据服务。
 *
 * 浏览器侧仍只通过 window.holidayManager 使用该服务；同时导出可注入依赖的
 * HolidayManager，便于在 Node.js 中验证缓存、并发和离线恢复，而无需模拟 DOM。
 */
(function exposeHolidayService(root, factory) {
  const isCommonJs = typeof module !== 'undefined' && module.exports;
  const calendarCore = root?.CalendarCore
    || (isCommonJs ? require('./calendar-core') : null);
  const api = factory(calendarCore);

  if (isCommonJs) {
    module.exports = api;
  }

  if (root && typeof root.document !== 'undefined') {
    root.HolidayService = api;
    root.holidayManager = api.createHolidayManager();
  }
})(typeof window !== 'undefined' ? window : globalThis, (CalendarCore) => {
  if (!CalendarCore) {
    throw new Error('HolidayService 需要先加载 CalendarCore');
  }

  // v3 增加 holiday 字段，用于在英文界面翻译整段假期的名称。
  const CACHE_VERSION = 3;
  const CACHE_PREFIX = `vibe-calendar:holidays:v${CACHE_VERSION}:`;
  const REMOTE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
  const FALLBACK_CACHE_TTL = 6 * 60 * 60 * 1000;
  const REQUEST_TIMEOUT = 5000;
  const MAX_DAYS_PER_YEAR = 366;
  const MAX_MEMORY_CACHE_YEARS = 12;
  const EMPTY_HOLIDAYS = Object.freeze({});

  // 网络完全不可用时的最低限度兜底。这里只包含固定公历日期，
  // 不尝试猜测春节、清明等日期以及调休安排。
  const LOCAL_FALLBACK = Object.freeze({
    '01-01': Object.freeze({ name: '元旦', isHoliday: true }),
    '05-01': Object.freeze({ name: '劳动节', isHoliday: true }),
    '10-01': Object.freeze({ name: '国庆节', isHoliday: true })
  });

  function getDefaultFetch() {
    return typeof globalThis.fetch === 'function'
      ? globalThis.fetch.bind(globalThis)
      : null;
  }

  function getDefaultStorage() {
    try {
      return typeof globalThis.localStorage === 'undefined'
        ? null
        : globalThis.localStorage;
    } catch (_error) {
      // 某些隐私模式会在读取 localStorage 属性时直接抛出异常。
      return null;
    }
  }

  function normalizeYear(year) {
    const value = Number(year);
    if (!Number.isInteger(value) || value < 1 || value > 9999) {
      throw new RangeError(`无效年份：${year}`);
    }
    return value;
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isDateKeyForYear(dateKey, expectedYear) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
    if (!match) return false;

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (year !== expectedYear) return false;

    // Date.UTC 会把 0–99 年自动映射为 1900–1999；显式设置年份可避免该隐式规则。
    const normalized = new Date(0);
    normalized.setUTCHours(0, 0, 0, 0);
    normalized.setUTCFullYear(year, month - 1, day);
    return normalized.getUTCFullYear() === year
      && normalized.getUTCMonth() === month - 1
      && normalized.getUTCDate() === day;
  }

  function createHolidayRecord(date, name, isHoliday, expectedYear) {
    if (!isDateKeyForYear(date, expectedYear)) return null;
    if (typeof name !== 'string' || name.trim() === '') return null;
    if (typeof isHoliday !== 'boolean') return null;

    return [date, Object.freeze({ name: name.trim(), isHoliday })];
  }

  function createHolidayMap(records, providerName) {
    const validRecords = records.filter(Boolean);
    if (validRecords.length === 0) {
      throw new Error(`${providerName} 未返回有效节假日记录`);
    }
    return Object.freeze(Object.fromEntries(validRecords));
  }

  /** 使用 AbortController 真正取消超时请求，而不只是停止等待。 */
  async function fetchJson(url, options = {}) {
    const fetchImpl = options.fetchImpl === undefined
      ? getDefaultFetch()
      : options.fetchImpl;
    const timeout = options.timeout ?? REQUEST_TIMEOUT;
    if (!fetchImpl) throw new Error('当前环境不支持 fetch');

    const controller = typeof AbortController === 'function'
      ? new AbortController()
      : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), timeout)
      : null;

    try {
      const response = await fetchImpl(url, controller
        ? { signal: controller.signal }
        : undefined);
      if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'unknown'}`);
      return await response.json();
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  }

  function normalizeNateData(data, expectedYear) {
    const year = normalizeYear(expectedYear);
    if (!isObject(data) || !Array.isArray(data.days)) {
      throw new Error('NateScarlet 数据格式无效');
    }

    return createHolidayMap(data.days.map((item) => (
      isObject(item)
        ? createHolidayRecord(item.date, item.name, item.isOffDay, year)
        : null
    )), 'NateScarlet');
  }

  function normalizeTimorData(data, expectedYear) {
    const year = normalizeYear(expectedYear);
    if (!isObject(data) || data.code !== 0 || !isObject(data.holiday)) {
      throw new Error('Timor 数据格式无效');
    }

    return createHolidayMap(Object.values(data.holiday).map((item) => (
      isObject(item)
        ? createHolidayRecord(item.date, item.name, item.holiday, year)
        : null
    )), 'Timor');
  }

  /**
   * 补充“整段假期”和“节日本日”两个语义字段。结果只读，避免渲染层意外
   * 修改共享缓存后影响其他月份。
   */
  function annotateFestivalDays(data) {
    const entries = Object.entries(data).map(([dateKey, value]) => {
      const [year, month, day] = dateKey.split('-').map(Number);
      return [dateKey, Object.freeze({
        name: value.name,
        isHoliday: value.isHoliday,
        holiday: CalendarCore.getChineseHolidayKey(value.name),
        festival: CalendarCore.getChineseFestivalKey(
          year,
          month - 1,
          day,
          value.name
        )
      })];
    });
    return Object.freeze(Object.fromEntries(entries));
  }

  /**
   * NateScarlet 作为主数据集，Timor 补充缺失日期。发生冲突时保留主数据，
   * 同时输出诊断信息，避免用“多数投票”掩盖只有两个独立来源的事实。
   */
  function mergeProviderData(providerResults, logger = console) {
    const [primary, secondary] = providerResults;
    if (!primary) return secondary || EMPTY_HOLIDAYS;
    if (!secondary) return primary;

    const merged = { ...primary };
    for (const [date, value] of Object.entries(secondary)) {
      if (!merged[date]) {
        merged[date] = value;
      } else if (merged[date].isHoliday !== value.isHoliday) {
        logger.warn?.(`节假日数据冲突：${date}，已采用主数据源。`);
      }
    }
    return Object.freeze(merged);
  }

  /** 把不可信的 localStorage 内容收窄为当前服务认可的数据结构。 */
  function normalizeStoredEntry(entry, expectedYear) {
    const year = normalizeYear(expectedYear);
    if (!isObject(entry) || !isObject(entry.data)) return null;
    if (!Number.isFinite(entry.expiresAt)) return null;

    const records = Object.entries(entry.data);
    if (records.length === 0 || records.length > MAX_DAYS_PER_YEAR) return null;

    const normalizedRecords = records.map(([date, value]) => (
      isObject(value)
        ? createHolidayRecord(date, value.name, value.isHoliday, year)
        : null
    ));
    if (normalizedRecords.some((record) => record === null)) return null;

    return Object.freeze({
      data: annotateFestivalDays(Object.fromEntries(normalizedRecords)),
      source: typeof entry.source === 'string' ? entry.source : 'stored-cache',
      expiresAt: entry.expiresAt
    });
  }

  class HolidayManager {
    constructor(options = {}) {
      this.fetchImpl = options.fetchImpl === undefined
        ? getDefaultFetch()
        : options.fetchImpl;
      this.storage = options.storage === undefined
        ? getDefaultStorage()
        : options.storage;
      this.now = options.now || Date.now;
      this.logger = options.logger || console;
      this.requestTimeout = options.requestTimeout ?? REQUEST_TIMEOUT;

      this.cache = new Map();
      this.pendingRequests = new Map();
      // 负缓存：即使某年没有持久化数据，也只读取 localStorage 一次。
      this.hydratedYears = new Set();
    }

    /** 同步读取当前可用数据，供日历首屏立即渲染。 */
    getHolidays(year) {
      return this.getCachedEntry(normalizeYear(year))?.data || EMPTY_HOLIDAYS;
    }

    /** 获取并缓存指定年份；多个调用者会共享同一个在途请求。 */
    async fetchHolidays(year) {
      const normalizedYear = normalizeYear(year);
      const existing = this.getCachedEntry(normalizedYear);
      if (existing && existing.expiresAt > this.now()) {
        return existing.data;
      }

      if (this.pendingRequests.has(normalizedYear)) {
        return this.pendingRequests.get(normalizedYear);
      }

      const request = this.fetchAndCache(normalizedYear, existing)
        .finally(() => this.pendingRequests.delete(normalizedYear));
      this.pendingRequests.set(normalizedYear, request);
      return request;
    }

    getCachedEntry(year) {
      const memoryEntry = this.cache.get(year);
      if (memoryEntry) return memoryEntry;
      if (this.hydratedYears.has(year)) return null;

      this.hydratedYears.add(year);
      const storedEntry = this.readStoredEntry(year);
      if (storedEntry) this.setCacheEntry(year, storedEntry);
      return storedEntry;
    }

    /** 限制常驻年份数，避免长时间连续滚动后缓存无限增长。 */
    setCacheEntry(year, entry) {
      // 重新写入的年份移动到末尾，Map 的插入顺序即为轻量 LRU 顺序。
      this.cache.delete(year);
      this.cache.set(year, entry);
      this.hydratedYears.add(year);

      if (this.cache.size <= MAX_MEMORY_CACHE_YEARS) return;
      const oldestYear = this.cache.keys().next().value;
      this.cache.delete(oldestYear);
      // 被淘汰年份下次访问时可从持久化缓存快速恢复。
      this.hydratedYears.delete(oldestYear);
    }

    async fetchAndCache(year, staleEntry) {
      const settled = await Promise.allSettled([
        this.fetchNateProvider(year),
        this.fetchTimorProvider(year)
      ]);
      const providers = settled.map((result) => (
        result.status === 'fulfilled' ? result.value : null
      ));
      const successfulProviders = providers.filter(Boolean);

      let data;
      let ttl;
      let source;

      if (successfulProviders.length > 0) {
        data = mergeProviderData(providers, this.logger);
        ttl = REMOTE_CACHE_TTL;
        source = successfulProviders.length === 2 ? 'remote-merged' : 'remote-single';
      } else if (staleEntry) {
        // 过期数据通常仍比固定日期兜底完整，网络恢复后会再次刷新。
        data = staleEntry.data;
        ttl = FALLBACK_CACHE_TTL;
        source = 'stale-cache';
      } else {
        data = this.generateLocalFallback(year);
        ttl = FALLBACK_CACHE_TTL;
        source = 'local-fallback';
      }

      const entry = Object.freeze({
        data: annotateFestivalDays(data),
        source,
        expiresAt: this.now() + ttl
      });
      this.setCacheEntry(year, entry);
      this.writeStoredEntry(year, entry);
      return entry.data;
    }

    /** 两个镜像并行请求，任意一个成功即可完成主数据源读取。 */
    async fetchNateProvider(year) {
      const urls = [
        `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
        `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`
      ];
      return Promise.any(urls.map(async (url) => {
        const data = await fetchJson(url, {
          fetchImpl: this.fetchImpl,
          timeout: this.requestTimeout
        });
        // 每个镜像先独立校验；一个镜像格式损坏时仍可等待另一个有效结果。
        return normalizeNateData(data, year);
      }));
    }

    async fetchTimorProvider(year) {
      const data = await fetchJson(`https://timor.tech/api/holiday/year/${year}`, {
        fetchImpl: this.fetchImpl,
        timeout: this.requestTimeout
      });
      return normalizeTimorData(data, year);
    }

    generateLocalFallback(year) {
      return Object.freeze(Object.fromEntries(
        Object.entries(LOCAL_FALLBACK).map(([mmdd, data]) => [
          `${year}-${mmdd}`,
          data
        ])
      ));
    }

    readStoredEntry(year) {
      if (!this.storage) return null;

      const key = `${CACHE_PREFIX}${year}`;
      try {
        const raw = this.storage.getItem(key);
        if (!raw) return null;

        const entry = normalizeStoredEntry(JSON.parse(raw), year);
        if (!entry) throw new Error('缓存结构无效');
        return entry;
      } catch (error) {
        this.logger.warn?.('读取节假日缓存失败：', error);
        try {
          this.storage.removeItem?.(key);
        } catch (_removeError) {
          // 删除失败无需继续打断首屏渲染。
        }
        return null;
      }
    }

    writeStoredEntry(year, entry) {
      if (!this.storage) return;

      try {
        this.storage.setItem(`${CACHE_PREFIX}${year}`, JSON.stringify(entry));
      } catch (error) {
        // 缓存失败不应影响日历的核心展示。
        this.logger.warn?.('写入节假日缓存失败：', error);
      }
    }
  }

  function createHolidayManager(options) {
    return new HolidayManager(options);
  }

  return Object.freeze({
    HolidayManager,
    annotateFestivalDays,
    createHolidayManager,
    fetchJson,
    mergeProviderData,
    normalizeNateData,
    normalizeStoredEntry,
    normalizeTimorData
  });
});
