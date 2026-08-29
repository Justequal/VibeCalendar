/**
 * 中国法定节假日数据服务。
 *
 * 设计目标：
 * 1. 网络不可用时，日历仍然可以立即显示；
 * 2. 同一年只发起一次在途请求，避免快速翻月造成重复流量；
 * 3. CDN 与 GitHub Raw 被视为同一提供方的两个镜像，不伪装成独立票源；
 * 4. 成功结果写入 localStorage，下一次启动可以先使用缓存。
 */
(function exposeHolidayManager(root) {
  const CACHE_VERSION = 1;
  const CACHE_PREFIX = `vibe-calendar:holidays:v${CACHE_VERSION}:`;
  const REMOTE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
  const FALLBACK_CACHE_TTL = 6 * 60 * 60 * 1000;
  const REQUEST_TIMEOUT = 5000;

  // 网络完全不可用时的最低限度兜底。这里只包含固定公历日期，
  // 不尝试猜测春节、清明等日期以及调休安排。
  const LOCAL_FALLBACK = Object.freeze({
    '01-01': { name: '元旦', isHoliday: true },
    '05-01': { name: '劳动节', isHoliday: true },
    '10-01': { name: '国庆节', isHoliday: true }
  });

  /** 使用 AbortController 真正取消超时请求，而不只是停止等待。 */
  async function fetchJson(url, timeout = REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function normalizeNateData(data) {
    if (!data || !Array.isArray(data.days)) {
      throw new Error('NateScarlet 数据格式无效');
    }

    return Object.fromEntries(data.days.map((item) => [
      item.date,
      { name: item.name, isHoliday: Boolean(item.isOffDay) }
    ]));
  }

  function normalizeTimorData(data) {
    if (!data || data.code !== 0 || !data.holiday) {
      throw new Error('Timor 数据格式无效');
    }

    return Object.fromEntries(Object.values(data.holiday).map((item) => [
      item.date,
      { name: item.name, isHoliday: Boolean(item.holiday) }
    ]));
  }

  /**
   * NateScarlet 的两个地址是镜像关系，因此并行请求并取首个成功结果，
   * 最终只作为一个数据提供方参与合并。
   */
  async function fetchNateProvider(year) {
    const urls = [
      `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
      `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`
    ];
    const data = await Promise.any(urls.map((url) => fetchJson(url)));
    return normalizeNateData(data);
  }

  async function fetchTimorProvider(year) {
    const data = await fetchJson(`https://timor.tech/api/holiday/year/${year}`);
    return normalizeTimorData(data);
  }

  /**
   * NateScarlet 作为主数据集，Timor 补充缺失日期；发生冲突时保留主数据，
   * 同时输出诊断信息，避免用“多数投票”掩盖只有两个独立来源的事实。
   */
  function mergeProviderData(providerResults) {
    const [primary, secondary] = providerResults;
    if (!primary) return secondary || {};
    if (!secondary) return primary;

    const merged = { ...primary };
    for (const [date, value] of Object.entries(secondary)) {
      if (!merged[date]) {
        merged[date] = value;
      } else if (merged[date].isHoliday !== value.isHoliday) {
        console.warn(`节假日数据冲突：${date}，已采用主数据源。`);
      }
    }
    return merged;
  }

  class HolidayManager {
    constructor() {
      this.cache = new Map();
      this.pendingRequests = new Map();
    }

    /** 同步读取当前可用数据，供日历首屏立即渲染。 */
    getHolidays(year) {
      const memoryEntry = this.cache.get(year);
      if (memoryEntry) return memoryEntry.data;

      const storedEntry = this.readStoredEntry(year);
      if (storedEntry) {
        this.cache.set(year, storedEntry);
        return storedEntry.data;
      }
      return {};
    }

    /** 获取并缓存指定年份；多个调用者会共享同一个在途 Promise。 */
    async fetchHolidays(year) {
      const existing = this.cache.get(year) || this.readStoredEntry(year);
      if (existing && existing.expiresAt > Date.now()) {
        this.cache.set(year, existing);
        return existing.data;
      }

      if (this.pendingRequests.has(year)) {
        return this.pendingRequests.get(year);
      }

      const request = this.fetchAndCache(year, existing)
        .finally(() => this.pendingRequests.delete(year));
      this.pendingRequests.set(year, request);
      return request;
    }

    async fetchAndCache(year, staleEntry) {
      const settled = await Promise.allSettled([
        fetchNateProvider(year),
        fetchTimorProvider(year)
      ]);
      const providers = settled.map((result) => (
        result.status === 'fulfilled' ? result.value : null
      ));
      const successfulProviders = providers.filter(Boolean);

      let data;
      let ttl;
      let source;

      if (successfulProviders.length > 0) {
        data = mergeProviderData(providers);
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

      const entry = { data, source, expiresAt: Date.now() + ttl };
      this.cache.set(year, entry);
      this.writeStoredEntry(year, entry);
      return data;
    }

    generateLocalFallback(year) {
      return Object.fromEntries(Object.entries(LOCAL_FALLBACK).map(([mmdd, data]) => [
        `${year}-${mmdd}`,
        data
      ]));
    }

    readStoredEntry(year) {
      try {
        const raw = localStorage.getItem(`${CACHE_PREFIX}${year}`);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (!entry || !entry.data || !Number.isFinite(entry.expiresAt)) return null;
        return entry;
      } catch (error) {
        console.warn('读取节假日缓存失败：', error);
        return null;
      }
    }

    writeStoredEntry(year, entry) {
      try {
        localStorage.setItem(`${CACHE_PREFIX}${year}`, JSON.stringify(entry));
      } catch (error) {
        // 缓存失败不应影响日历的核心展示。
        console.warn('写入节假日缓存失败：', error);
      }
    }
  }

  root.holidayManager = new HolidayManager();
})(window);
