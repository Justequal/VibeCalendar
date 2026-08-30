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

  /** 按自然日移动，避免直接修改调用方传入的 Date。 */
  function addDays(date, offset) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
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
    return buildWeekWindowCells(new Date(year, month, 1), startOnMonday);
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
    const firstCellDate = new Date(
      year,
      month,
      anchorDate.getDate() - leadingCount
    );

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

    if (holidayKey === 'qingming') {
      const shortYear = year % 100;
      const centuryConstant = year >= 2000 ? 4.81 : 5.59;
      const qingmingDay = Math.floor(shortYear * 0.2422 + centuryConstant)
        - Math.floor(shortYear / 4);
      if (month === 3 && day === qingmingDay) return 'qingming';
    }

    if (!['springFestival', 'dragonBoat', 'midAutumn'].includes(holidayKey)) {
      return null;
    }

    const lunarParts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      month: 'numeric',
      day: 'numeric'
    }).formatToParts(new Date(year, month, day, 12));
    const lunarMonth = Number(lunarParts.find((part) => part.type === 'month')?.value);
    const lunarDay = Number(lunarParts.find((part) => part.type === 'day')?.value);

    if (holidayKey === 'springFestival' && lunarMonth === 1 && lunarDay === 1) {
      return 'springFestival';
    }
    if (holidayKey === 'dragonBoat' && lunarMonth === 5 && lunarDay === 5) {
      return 'dragonBoat';
    }
    if (holidayKey === 'midAutumn' && lunarMonth === 8 && lunarDay === 15) {
      return 'midAutumn';
    }
    return null;
  }

  return Object.freeze({
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
