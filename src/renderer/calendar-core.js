/**
 * 日历领域层。
 *
 * 这里只放与 DOM、Electron 和网络无关的纯函数。这样日期计算既容易复用，
 * 也可以直接使用 Node.js 内置测试运行器验证。
 */
(function exposeCalendarCore(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.CalendarCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, () => {
  const WEEKDAYS = Object.freeze({
    sunday: Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']),
    monday: Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  });

  const MONTH_NAMES = Object.freeze([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]);

  /** 将任意日期规范到所在月份的第一天。 */
  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  /**
   * 在月份之间移动。
   *
   * 先把日期设为 1 日，避免 1 月 31 日加一个月后溢出到 3 月的问题。
   */
  function addMonths(date, offset) {
    const normalized = startOfMonth(date);
    normalized.setMonth(normalized.getMonth() + offset);
    return normalized;
  }

  /** 返回用于节假日查询的 YYYY-MM-DD 键。 */
  function toDateKey(year, month, day) {
    return [
      year,
      String(month + 1).padStart(2, '0'),
      String(day).padStart(2, '0')
    ].join('-');
  }

  /** 根据一周起始日，将原生 getDay() 转换为网格列索引。 */
  function getLeadingCellCount(firstDayOfWeek, startOnMonday) {
    if (!startOnMonday) return firstDayOfWeek;
    return firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  }

  /**
   * 生成固定 6 行 × 7 列的月份网格数据。
   * 每个单元格都携带自己的真实年月，跨年时无需在渲染层做特殊判断。
   */
  function buildMonthCells(year, month, startOnMonday = false) {
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const leadingCount = getLeadingCellCount(firstDayOfWeek, startOnMonday);
    const firstCellDate = new Date(year, month, 1 - leadingCount);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(
        firstCellDate.getFullYear(),
        firstCellDate.getMonth(),
        firstCellDate.getDate() + index
      );

      return {
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate(),
        dayOfWeek: date.getDay(),
        isCurrentMonth: date.getFullYear() === year && date.getMonth() === month
      };
    });
  }

  function getWeekdayLabels(startOnMonday = false) {
    return startOnMonday ? WEEKDAYS.monday : WEEKDAYS.sunday;
  }

  function getMonthLabel(year, month) {
    return `${MONTH_NAMES[month]} ${year}`;
  }

  return Object.freeze({
    addMonths,
    buildMonthCells,
    getLeadingCellCount,
    getMonthLabel,
    getWeekdayLabels,
    startOfMonth,
    toDateKey
  });
});
