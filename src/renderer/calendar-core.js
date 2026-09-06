/**
 * 日历领域层。
 *
 * 这里只放与 DOM、Electron 和网络无关的纯函数。这样日期计算既容易复用，
 * 也可以直接使用 Node.js 内置测试运行器验证。
 *
 * 学习入口：docs/learning/02-functions.md。
 * 推荐顺序：toDateKey → createDate → addMonths → buildWeekWindowCells。
 * 第一次阅读可以略过文件首尾的双环境包装，它只负责导出，不参与日期计算。
 */
(function exposeCalendarCore(root, factory) {
  const api = factory(root?.VibeFestivalDates || (typeof module !== 'undefined' && module.exports
    ? require('./festival-dates') : {}));

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.CalendarCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, (festivalDates) => {
  const DAYS_PER_WEEK = 7;
  const CALENDAR_ROW_COUNT = 6;
  const CALENDAR_CELL_COUNT = DAYS_PER_WEEK * CALENDAR_ROW_COUNT;
  const MIN_YEAR = 1;
  const MAX_YEAR = 9999;

  /**
   * 统一创建本地日期，避免new Date(1, 0, 1)把年份1解释成1901。
   * 先建立一个Date，再用setFullYear显式设置完整年份；月份从0开始。
   * month和day允许越界，让Date完成跨月归一化，这是生成相邻月份网格的基础。
   * 本函数不限制导航范围；addDays/addMonths负责限制，网格允许临时生成边缘占位日期。
   * @param {number} year 公历完整年份
   * @param {number} month 0为一月，11为十二月
   * @param {number} [day=1] 月内日期
   * @param {number} [hour=0] 本地小时；网格游标通常取12
   * @returns {Date} 独立的新对象
   */
  function createDate(year, month, day = 1, hour = 0) {
    const result = new Date(0);
    result.setHours(hour, 0, 0, 0);
    result.setFullYear(year, month, day);
    return result;
  }

  function isSupportedYear(year) {
    return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
  }

  const WEEKDAYS = Object.freeze({
    en: Object.freeze({
      sunday: Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']),
      monday: Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    }),
    'zh-CN': Object.freeze({
      sunday: Object.freeze(['日', '一', '二', '三', '四', '五', '六']),
      monday: Object.freeze(['一', '二', '三', '四', '五', '六', '日'])
    })
  });

  const MONTH_NAMES = Object.freeze([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]);

  /** 将任意日期规范到所在月份的第一天。 */
  function startOfMonth(date) {
    return createDate(date.getFullYear(), date.getMonth(), 1);
  }

  /**
   * 在月份之间移动。
   *
   * 先把日期设为 1 日，避免 1 月 31 日加一个月后溢出到 3 月的问题。
   * 实现把年月展开成连续的月份编号，限制范围后再还原，年月进位由同一规则处理。
   * @param {Date} date 不会被修改的原日期
   * @param {number} offset 月份偏移，小数向零截断
   * @returns {Date} 目标月份第一天
   * @throws {RangeError} offset不是有限数时抛出；边界之外的有限偏移会停在边界
   */
  function addMonths(date, offset) {
    if (!Number.isFinite(offset)) throw new RangeError('Invalid month offset');
    const monthIndex = Math.min(MAX_YEAR * 12 + 11, Math.max(MIN_YEAR * 12,
      date.getFullYear() * 12 + date.getMonth() + Math.trunc(offset)));
    return createDate(Math.floor(monthIndex / 12), monthIndex % 12);
  }

  /**
   * 按自然日移动，返回新Date。不要把“加一天”写成固定加86400000毫秒：
   * 夏令时切换时本地一天不一定恰好24小时。最后再限制导航年份。
   * @param {Date} date
   * @param {number} offset 天数偏移，小数向零截断
   * @returns {Date}
   */
  function addDays(date, offset) {
    if (!Number.isFinite(offset)) throw new RangeError('Invalid day offset');
    const boundedOffset = Math.min(366 * MAX_YEAR, Math.max(-366 * MAX_YEAR, Math.trunc(offset)));
    const result = createDate(date.getFullYear(), date.getMonth(), date.getDate() + boundedOffset);
    if (result.getFullYear() < MIN_YEAR) return createDate(MIN_YEAR, 0, 1);
    if (result.getFullYear() > MAX_YEAR) return createDate(MAX_YEAR, 11, 31);
    return result;
  }

  /** 返回用于节假日查询的 YYYY-MM-DD 键。 */
  function toDateKey(year, month, day) {
    return [
      String(year).padStart(4, '0'),
      String(month + 1).padStart(2, '0'),
      String(day).padStart(2, '0')
    ].join('-');
  }

  /** 根据一周起始日，将原生 getDay() 转换为网格列索引。 */
  function getLeadingCellCount(firstDayOfWeek, startOnMonday) {
    const weekStart = startOnMonday ? 1 : 0;
    return (firstDayOfWeek - weekStart + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  }

  /**
   * 生成固定 6 行 × 7 列的月份网格数据。
   * 每个单元格都携带自己的真实年月，跨年时无需在渲染层做特殊判断。
   */
  function buildMonthCells(year, month, startOnMonday = false) {
    return buildWeekWindowCells(createDate(year, month, 1), startOnMonday);
  }

  /**
   * 生成从锚点日期所在周开始的 6 行日期，用于按周逐行滚动日历。
   * 当前月份以锚点日期为准，因此滚动跨月后标题和弱化样式会一起更新。
   */
  function buildWeekWindowCells(anchorDate, startOnMonday = false) {
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    const firstDayOfWeek = anchorDate.getDay();
    const leadingCount = getLeadingCellCount(firstDayOfWeek, startOnMonday);
    // 使用正午作为内部游标，避免部分时区在夏令时切换日午夜附近出现跳日。
    const cursor = createDate(
      year,
      month,
      anchorDate.getDate() - leadingCount,
      12
    );
    // 每个格子保存普通数值，渲染层不需要反复解析Date，也不能误改共享游标。
    // 在1年/9999年边缘，少数格子可能在范围外，由界面显示为空白占位格。
    const cells = new Array(CALENDAR_CELL_COUNT);

    for (let index = 0; index < CALENDAR_CELL_COUNT; index += 1) {
      const cellYear = cursor.getFullYear();
      const cellMonth = cursor.getMonth();
      cells[index] = {
        year: cellYear,
        month: cellMonth,
        day: cursor.getDate(),
        dayOfWeek: cursor.getDay(),
        isCurrentMonth: cellYear === year && cellMonth === month
      };
      cursor.setDate(cursor.getDate() + 1);
    }

    return cells;
  }

  function getWeekdayLabels(startOnMonday = false, language = 'en') {
    const labels = WEEKDAYS[language] || WEEKDAYS.en;
    return startOnMonday ? labels.monday : labels.sunday;
  }

  function getMonthLabel(year, month, language = 'en') {
    if (language === 'zh-CN') return `${year}年${month + 1}月`;
    return `${MONTH_NAMES[month]} ${year}`;
  }

  /**
   * 判断法定假期记录是否正好落在节日本日。
   * 数据源会把整个假期都赋予同一个名称，因此不能仅凭 name 判断。
   */
  function getChineseHolidayKey(holidayName = '') {
    const name = String(holidayName);
    if (name.includes('元旦')) return 'newYear';
    if (name.includes('春节')) return 'springFestival';
    if (name.includes('清明')) return 'qingming';
    if (name.includes('劳动')) return 'labourDay';
    if (name.includes('端午')) return 'dragonBoat';
    if (name.includes('中秋')) return 'midAutumn';
    if (name.includes('国庆')) return 'nationalDay';
    return null;
  }

  function getChineseFestivalKey(year, month, day, holidayName = '') {
    const holidayKey = getChineseHolidayKey(holidayName);
    const monthDay = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    if (holidayKey === 'newYear' && monthDay === '01-01') return holidayKey;
    if (holidayKey === 'labourDay' && monthDay === '05-01') return holidayKey;
    if (holidayKey === 'nationalDay' && monthDay === '10-01') return holidayKey;

    // 仅使用天文台已发布的1901–2100历表，不在范围外外推农历或节气。
    return festivalDates[year]?.[holidayKey] === monthDay ? holidayKey : null;
  }

  return Object.freeze({
    MIN_YEAR,
    MAX_YEAR,
    createDate,
    isSupportedYear,
    addDays,
    addMonths,
    buildMonthCells,
    buildWeekWindowCells,
    getLeadingCellCount,
    getChineseHolidayKey,
    getChineseFestivalKey,
    getMonthLabel,
    getWeekdayLabels,
    startOfMonth,
    toDateKey
  });
});
