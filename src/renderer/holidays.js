/**
 * 中国法定节假日数据服务。
 *
 * 浏览器侧仍只通过 window.holidayManager 使用该服务；同时导出可注入依赖的
 * HolidayManager，便于在 Node.js 中验证缓存、并发和离线恢复，而无需模拟 DOM。
 *
 * 学习入口：docs/learning/05-async.md。数据格式见holiday-data.js。
 * 阅读主线：getHolidays（立即读取）→ fetchHolidays（决定是否排队）
 * → drainRequests（启动工作）→ fetchAndCache（请求、合并、保存）。
 * 网络与存储是“副作用”：它们依赖外部环境，因此通过构造参数注入以便替换和测试。
 */
(function exposeHolidayService(root, factory) {
  const isCommonJs = typeof module !== 'undefined' && module.exports;
  const holidayData = root?.HolidayData
    || (isCommonJs ? require('./holiday-data') : null);
  const api = factory(holidayData);

  if (isCommonJs) {
    module.exports = api;
  }

  if (root && typeof root.document !== 'undefined') {
    root.HolidayService = api;
    root.holidayManager = api.createHolidayManager();
  }
})(typeof window !== 'undefined' ? window : globalThis, (HolidayData) => {
  if (!HolidayData) throw new Error('HolidayService 需要先加载 HolidayData');
  // 适配器只整理数据；本服务决定何时请求、缓存多久、失败后如何恢复。
  const {
    EMPTY_HOLIDAYS, normalizeYear, annotateFestivalDays, mergeProviderData,
    normalizeNateData, normalizeStoredEntry, normalizeTimorData
  } = HolidayData;

  // v3 增加 holiday 字段，用于在英文界面翻译整段假期的名称。
  const CACHE_VERSION = 3;
  const CACHE_PREFIX = `vibe-calendar:holidays:v${CACHE_VERSION}:`;
  const REMOTE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
  const FALLBACK_CACHE_TTL = 6 * 60 * 60 * 1000;
  const REQUEST_TIMEOUT = 5000;
  const MAX_MEMORY_CACHE_YEARS = 12;
  const MAX_STORED_CACHE_YEARS = 24;
  const MAX_ACTIVE_YEARS = 2;
  const MAX_QUEUED_YEARS = 4;

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

  /**
   * 请求JSON，并在成功或失败后释放计时器和取消监听。
   * AbortController负责传递取消信号；fetch及响应体读取负责响应信号。
   * 注意await response.json()也在try中，所以响应头到达并不会提前结束超时保护。
   * options.signal是外部取消（例如镜像胜出），timeout是单次请求自己的时间限制。
   * @param {string} url
   * @param {{fetchImpl?: Function|null, timeout?: number, signal?: AbortSignal}} [options]
   * @returns {Promise<unknown>} 返回后仍需用HolidayData校验结构
   */
  async function fetchJson(url, options = {}) {
    const fetchImpl = options.fetchImpl === undefined
      ? getDefaultFetch()
      : options.fetchImpl;
    const timeout = options.timeout ?? REQUEST_TIMEOUT;
    if (!fetchImpl) throw new Error('当前环境不支持 fetch');

    const controller = typeof AbortController === 'function'
      ? new AbortController()
      : null;
    const abortRequest = () => controller?.abort();
    if (options.signal?.aborted) abortRequest();
    else options.signal?.addEventListener('abort', abortRequest, { once: true });
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
      options.signal?.removeEventListener('abort', abortRequest);
    }
  }

  class HolidayManager {
    /**
     * 依赖注入不需要容器或框架：调用方传一个具有相同方法的对象即可。
     * undefined表示使用真实环境默认值；显式null表示禁用该能力（离线测试会用到）。
     * now只返回毫秒时间戳，所以测试可通过修改一个数字模拟六小时后，而不用真的等待。
     * @param {{fetchImpl?: Function|null, storage?: Storage|null, now?: Function,
     * logger?: Object, requestTimeout?: number}} [options]
     */
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

      // 三种容器解决三种问题：Map保存“年份→结果/任务”，数组保存等待顺序，
      // Set只回答“这个年份是否已经尝试读取存储”。它们不是同一份缓存的重复副本。
      this.cache = new Map();
      this.pendingRequests = new Map();
      this.activeYears = 0;
      this.requestQueue = [];
      // 负缓存：即使某年没有持久化数据，也只读取 localStorage 一次。
      this.hydratedYears = new Set();
    }

    /** 同步读取当前可用数据，供日历首屏立即渲染。 */
    getHolidays(year) {
      return this.getCachedEntry(normalizeYear(year))?.data || EMPTY_HOLIDAYS;
    }

    /**
     * 决策顺序：有效缓存 → 已有工作 → 创建新工作。
     * 调用者共享在途工作与结果；由于本方法是async，返回的包装Promise不保证===相同。
     * retryFallback只绕过不完整数据的有效期，不会强制刷新正常的双源缓存。
     * @param {number|string} year
     * @param {{retryFallback?: boolean}} [options]
     * @returns {Promise<import('./holiday-data').HolidayMap>}
     */
    async fetchHolidays(year, { retryFallback = false } = {}) {
      const normalizedYear = normalizeYear(year);
      const existing = this.getCachedEntry(normalizedYear);
      const retryDegraded = retryFallback
        && ['local-fallback', 'stale-cache', 'remote-single'].includes(existing?.source);
      if (existing && existing.expiresAt > this.now() && !retryDegraded) {
        return existing.data;
      }

      if (this.pendingRequests.has(normalizedYear)) {
        return this.pendingRequests.get(normalizedYear);
      }

      // 创建一个现在返回、稍后由队列完成的Promise。这里必须保留resolve/reject，
      // 因为“接收请求”和“取得并发名额”可能发生在不同时间。
      let resolve;
      let reject;
      const request = new Promise((done, fail) => { resolve = done; reject = fail; });
      this.pendingRequests.set(normalizedYear, request);
      this.requestQueue.push({ year: normalizedYear, existing, resolve, reject });
      if (this.requestQueue.length > MAX_QUEUED_YEARS) {
        // 快速跨年时只保留最近的浏览意图；被跳过的调用仍正常完成。
        const skipped = this.requestQueue.shift();
        this.pendingRequests.delete(skipped.year);
        skipped.resolve(skipped.existing?.data || EMPTY_HOLIDAYS);
      }
      this.drainRequests();
      return request;
    }

    /**
     * 有名额就启动等待任务；pop优先最新浏览，shift在超限时丢弃最旧等待任务。
     * finish是共同出口：无论成功还是失败，先释放年份锁和并发名额，再继续调度。
     * 这里限制的是年份任务数，每个年份内部还会启动两个镜像和一个补充提供方。
     */
    drainRequests() {
      while (this.activeYears < MAX_ACTIVE_YEARS && this.requestQueue.length) {
        const job = this.requestQueue.pop();
        this.activeYears += 1;
        const finish = (callback, value) => {
          this.pendingRequests.delete(job.year);
          this.activeYears -= 1;
          callback(value);
          this.drainRequests();
        };
        this.fetchAndCache(job.year, job.existing).then(
          data => finish(job.resolve, data), error => finish(job.reject, error)
        );
      }
    }

    /** 先内存、后存储；Map删除后重新插入，让读取本身更新最近访问顺序。 */
    getCachedEntry(year) {
      const memoryEntry = this.cache.get(year);
      if (memoryEntry) {
        this.cache.delete(year);
        this.cache.set(year, memoryEntry);
        return memoryEntry;
      }
      if (this.hydratedYears.has(year)) return null;

      this.markHydrated(year);
      const storedEntry = this.readStoredEntry(year);
      if (storedEntry) this.setCacheEntry(year, storedEntry);
      return storedEntry;
    }

    /** 限制常驻年份数，避免长时间连续滚动后缓存无限增长。 */
    setCacheEntry(year, entry) {
      // 重新写入的年份移动到末尾，Map 的插入顺序即为轻量 LRU 顺序。
      this.cache.delete(year);
      this.cache.set(year, entry);
      this.markHydrated(year);

      if (this.cache.size <= MAX_MEMORY_CACHE_YEARS) return;
      const oldestYear = this.cache.keys().next().value;
      this.cache.delete(oldestYear);
      // 被淘汰年份下次访问时可从持久化缓存快速恢复。
      this.hydratedYears.delete(oldestYear);
    }

    markHydrated(year) {
      this.hydratedYears.delete(year);
      this.hydratedYears.add(year);
      if (this.hydratedYears.size > MAX_MEMORY_CACHE_YEARS) {
        this.hydratedYears.delete(this.hydratedYears.values().next().value);
      }
    }

    /**
     * allSettled等待两个独立提供方的结论，即使一个失败也保留另一个的成功数据。
     * 然后按双源/单源/旧缓存/最小兜底四种来源选择数据和有效期。
     * 这段是服务的用例编排；字段转换由HolidayData承担，DOM显示由renderer承担。
     */
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
        ttl = successfulProviders.length === 2 ? REMOTE_CACHE_TTL : FALLBACK_CACHE_TTL;
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
        // 沿用旧数据时保留只读映射身份，让界面识别无需重绘的失败刷新。
        data: source === 'stale-cache' ? data : annotateFestivalDays(data),
        source,
        expiresAt: this.now() + ttl
      });
      this.setCacheEntry(year, entry);
      this.writeStoredEntry(year, entry);
      return entry.data;
    }

    /** 两个镜像并行请求，任意一个成功即可完成主数据源读取。 */
    async fetchNateProvider(year) {
      const controller = new AbortController();
      const urls = [
        `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
        `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`
      ];
      try {
        return await Promise.any(urls.map(async (url) => {
          const data = await fetchJson(url, {
            fetchImpl: this.fetchImpl,
            timeout: this.requestTimeout,
            signal: controller.signal
          });
          // 每个镜像先独立校验；一个镜像格式损坏时仍可等待另一个有效结果。
          return normalizeNateData(data, year);
        }));
      } finally {
        // 首个有效镜像完成后，取消另一个镜像的下载及响应体读取。
        controller.abort();
      }
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
          `${String(year).padStart(4, '0')}-${mmdd}`,
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

        if (raw.length > 200_000) throw new Error('缓存内容过大');
        let entry = normalizeStoredEntry(JSON.parse(raw), year);
        if (!entry) throw new Error('缓存结构无效');
        if (entry.source === 'remote-single' && entry.expiresAt > this.now() + FALLBACK_CACHE_TTL) {
          entry = Object.freeze({ ...entry, expiresAt: this.now() + FALLBACK_CACHE_TTL });
        }
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
        this.pruneStoredEntries(year);
        this.storage.setItem(`${CACHE_PREFIX}${year}`, JSON.stringify(entry));
      } catch (error) {
        // 缓存失败不应影响日历的核心展示。
        this.logger.warn?.('写入节假日缓存失败：', error);
      }
    }

    pruneStoredEntries(keepYear) {
      if (typeof this.storage.key !== 'function') return;
      const candidates = [];
      // 仅处理本应用节假日命名空间，绝不清除偏好或其他站点的数据。
      for (let index = 0; index < this.storage.length; index += 1) {
        const key = this.storage.key(index);
        if (!/^vibe-calendar:holidays:v\d+:\d+$/.test(key) || key === `${CACHE_PREFIX}${keepYear}`) continue;
        let expiresAt = 0;
        try { expiresAt = JSON.parse(this.storage.getItem(key))?.expiresAt || 0; } catch {}
        candidates.push({ key, expiresAt: key.startsWith(CACHE_PREFIX) ? expiresAt : 0 });
      }
      candidates.sort((a, b) => a.expiresAt - b.expiresAt || a.key.localeCompare(b.key));
      for (const item of candidates.slice(0, Math.max(0, candidates.length - MAX_STORED_CACHE_YEARS + 1))) {
        this.storage.removeItem(item.key);
      }
    }
  }

  function createHolidayManager(options) {
    return new HolidayManager(options);
  }

  // 保留旧入口的适配器导出，让已有调用方继续工作；新读者可直接阅读HolidayData。
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
