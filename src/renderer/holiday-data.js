/**
 * 第4层：节假日数据契约与适配器。学习入口：docs/learning/04-data.md。
 *
 * 本模块把不同来源的字段统一成日历认识的结构，不主动联网、不读写缓存、不操作DOM。
 * 先读 normalizeNateData 的一个输入例子，再读辅助校验；不必从包装函数逐行向下读。
 * mergeProviderData 的诊断日志由调用方传入，这是本模块唯一可选的外部效果。
 *
 * @typedef {Object} HolidayRecord
 * @property {string} name 提供方名称，去除首尾空白后保留
 * @property {boolean} isHoliday true表示休息，false表示明确的补班安排
 * @property {string|null} [holiday] 整段假期的稳定翻译键，标注前可以不存在
 * @property {string|null} [festival] 当天的节日本日键；普通假期日为null
 *
 * @typedef {Object<string, Readonly<HolidayRecord>>} HolidayMap YYYY-MM-DD到记录的只读映射
 * @typedef {{data: HolidayMap, source: string, expiresAt: number}} CacheEntry
 * expiresAt是毫秒时间戳；缓存过期不代表数据无效，只代表应该尝试刷新。
 */
(function exposeHolidayData(root, factory) {
  // 这段包装只解决运行环境差异：Node测试使用require，普通网页使用window属性。
  // 它不负责下载、打包或业务调度；初读时可以先跳到下面的normalize*函数。
  const isCommonJs = typeof module !== 'undefined' && module.exports;
  const core = root?.CalendarCore || (isCommonJs ? require('./calendar-core') : null);
  const api = factory(core);
  if (isCommonJs) module.exports = api;
  if (root) root.HolidayData = api;
})(typeof window !== 'undefined' ? window : globalThis, (CalendarCore) => {
  if (!CalendarCore) throw new Error('HolidayData 需要先加载 CalendarCore');
  const MAX_DAYS_PER_YEAR = 366;
  const EMPTY_HOLIDAYS = Object.freeze({});

  /** 入口先统一数字/数字字符串；非法年份属于调用错误，所以抛出RangeError。 */
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

  /**
   * 校验单条外部记录。无效记录返回null，让提供方适配器过滤；
   * 这与normalizeYear抛错不同：一条脏数据不必让整个合法年份失效。
   * 返回[key, value]，可以直接交给Object.fromEntries构造按日期查询的映射。
   */
  function createHolidayRecord(date, name, isHoliday, expectedYear) {
    if (!isDateKeyForYear(date, expectedYear)) return null;
    if (typeof name !== 'string' || name.trim() === '' || name.length > 100) return null;
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

  /**
   * 适配器示例：把Nate的isOffDay翻译为应用的isHoliday。
   * 输入{days:[{date:'2026-01-01', name:'元旦', isOffDay:true}]}，
   * 输出{'2026-01-01':{name:'元旦', isHoliday:true}}。
   * @param {unknown} data 网络JSON不能因为已经解析成功就视为可信
   * @param {number|string} expectedYear
   * @returns {HolidayMap}
   * @throws {Error} 外层结构错误、记录过多或没有任何有效记录
   */
  function normalizeNateData(data, expectedYear) {
    const year = normalizeYear(expectedYear);
    if (!isObject(data) || !Array.isArray(data.days) || data.days.length > MAX_DAYS_PER_YEAR) {
      throw new Error('NateScarlet 数据格式无效');
    }

    return createHolidayMap(data.days.map((item) => (
      isObject(item)
        ? createHolidayRecord(item.date, item.name, item.isOffDay, year)
        : null
    )), 'NateScarlet');
  }

  /** Timor的字段名不同，但输出契约相同，因此后续合并与渲染不需要区分提供方。 */
  function normalizeTimorData(data, expectedYear) {
    const year = normalizeYear(expectedYear);
    if (!isObject(data) || data.code !== 0 || !isObject(data.holiday)
      || Object.keys(data.holiday).length > MAX_DAYS_PER_YEAR) {
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

  /**
   * 存储JSON同样需要校验；旧版本、手动编辑和写入中断都可能造成错误内容。
   * 与远端记录的“过滤坏项”不同，缓存包含坏项时整条返回null，让服务层移除它。
   * 只还原支持的字段，并重新标注节日，避免旧缓存携带的派生字段过时。
   * @param {unknown} entry
   * @param {number|string} expectedYear
   * @returns {Readonly<CacheEntry>|null}
   */
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

  return Object.freeze({
    EMPTY_HOLIDAYS, normalizeYear, annotateFestivalDays, mergeProviderData,
    normalizeNateData, normalizeStoredEntry, normalizeTimorData
  });
});
