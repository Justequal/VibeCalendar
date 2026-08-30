/**
 * 日历界面控制器。
 *
 * calendar-core.js 负责日期计算，holidays.js 负责数据获取；本文件只维护界面
 * 状态、DOM 渲染和用户交互，避免把不同职责混在一个大函数里。
 */
(function bootstrapCalendar() {
  const STORAGE_KEYS = Object.freeze({
    startOnMonday: 'vibe-calendar:preference:v2:start-on-monday',
    language: 'vibe-calendar:preference:language'
  });

  const TRANSLATIONS = Object.freeze({
    'zh-CN': Object.freeze({
      appTitle: '氛围日历',
      close: '关闭窗口',
      previousMonth: '上个月（←）',
      nextMonth: '下个月（→）',
      calendar: '月历',
      goToday: '回到今天',
      todayShortcut: '回到今天（快捷键 T）',
      firstDayMonday: '首日：周一',
      firstDaySunday: '首日：周日',
      toggleWeek: '切换一周起始日',
      languageButton: 'EN',
      switchLanguage: '切换到英文',
      dayOffMarker: '休',
      workdayMarker: '班',
      legend: '标记说明',
      festivalLegend: '节日',
      dayOffLegend: '休假',
      workdayLegend: '补班',
      festivalDayStatus: '节日本日',
      holidayStatus: '休息',
      workdayStatus: '补班',
      festivals: Object.freeze({
        newYear: '元旦',
        springFestival: '春节',
        qingming: '清明节',
        labourDay: '劳动节',
        dragonBoat: '端午节',
        midAutumn: '中秋节',
        nationalDay: '国庆节'
      }),
      festivalMarkers: Object.freeze({
        newYear: '元旦',
        springFestival: '春节',
        qingming: '清明',
        labourDay: '劳动节',
        dragonBoat: '端午',
        midAutumn: '中秋',
        nationalDay: '国庆'
      })
    }),
    en: Object.freeze({
      appTitle: 'Vibe Calendar',
      close: 'Close window',
      previousMonth: 'Previous month (←)',
      nextMonth: 'Next month (→)',
      calendar: 'Monthly calendar',
      goToday: 'Go to Today',
      todayShortcut: 'Go to Today (shortcut: T)',
      firstDayMonday: '1st: Mon',
      firstDaySunday: '1st: Sun',
      toggleWeek: 'Change the first day of the week',
      languageButton: '中文',
      switchLanguage: 'Switch to Chinese',
      dayOffMarker: 'Rest',
      workdayMarker: 'Work',
      legend: 'Calendar marker legend',
      festivalLegend: 'Fest.',
      dayOffLegend: 'Day off',
      workdayLegend: 'Work',
      festivalDayStatus: 'festival day',
      holidayStatus: 'day off',
      workdayStatus: 'make-up workday',
      festivals: Object.freeze({
        newYear: "New Year's Day",
        springFestival: 'Spring Festival',
        qingming: 'Qingming Festival',
        labourDay: 'Labour Day',
        dragonBoat: 'Dragon Boat Festival',
        midAutumn: 'Mid-Autumn Festival',
        nationalDay: 'National Day'
      }),
      // 日历格使用短标签；悬停提示和无障碍文本仍使用上面的完整名称。
      festivalMarkers: Object.freeze({
        newYear: 'Fest',
        springFestival: 'Fest',
        qingming: 'Fest',
        labourDay: 'Fest',
        dragonBoat: 'Fest',
        midAutumn: 'Fest',
        nationalDay: 'Fest'
      })
    })
  });

  const elements = {
    app: document.getElementById('app-container'),
    monthYear: document.getElementById('month-year'),
    calendarGrid: document.getElementById('calendar-grid'),
    calendarLegend: document.getElementById('calendar-legend'),
    festivalLegend: document.getElementById('festival-legend'),
    dayOffLegend: document.getElementById('day-off-legend'),
    workdayLegend: document.getElementById('workday-legend'),
    weekdays: document.getElementById('weekdays-container'),
    previousMonth: document.getElementById('prev-month'),
    nextMonth: document.getElementById('next-month'),
    close: document.getElementById('close-btn'),
    clock: document.getElementById('clock'),
    goToday: document.getElementById('go-today-btn'),
    toggleWeek: document.getElementById('toggle-week-btn'),
    languageToggle: document.getElementById('language-toggle-btn')
  };

  const state = {
    visibleDate: CalendarCore.startOfMonth(new Date()),
    startOnMonday: readBooleanPreference(STORAGE_KEYS.startOnMonday, true),
    language: readLanguagePreference(),
    renderVersion: 0
  };

  function readBooleanPreference(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value === 'true';
    } catch (error) {
      console.warn('读取界面偏好失败：', error);
      return fallback;
    }
  }

  function saveBooleanPreference(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (error) {
      console.warn('保存界面偏好失败：', error);
    }
  }

  function readLanguagePreference() {
    try {
      return localStorage.getItem(STORAGE_KEYS.language) === 'en' ? 'en' : 'zh-CN';
    } catch (error) {
      console.warn('读取语言偏好失败：', error);
      return 'zh-CN';
    }
  }

  function saveLanguagePreference(language) {
    try {
      localStorage.setItem(STORAGE_KEYS.language, language);
    } catch (error) {
      console.warn('保存语言偏好失败：', error);
    }
  }

  function getText() {
    return TRANSLATIONS[state.language];
  }

  function renderLocalizedControls() {
    const text = getText();
    document.documentElement.lang = state.language;
    document.title = text.appTitle;

    elements.previousMonth.setAttribute('aria-label', text.previousMonth);
    elements.previousMonth.title = text.previousMonth;
    elements.nextMonth.setAttribute('aria-label', text.nextMonth);
    elements.nextMonth.title = text.nextMonth;
    elements.close.setAttribute('aria-label', text.close);
    elements.close.title = text.close;
    elements.calendarGrid.setAttribute('aria-label', text.calendar);
    elements.goToday.textContent = text.goToday;
    elements.goToday.title = text.todayShortcut;
    elements.languageToggle.textContent = text.languageButton;
    elements.languageToggle.setAttribute('aria-label', text.switchLanguage);
    elements.languageToggle.title = text.switchLanguage;
    elements.calendarLegend.setAttribute('aria-label', text.legend);
    elements.dayOffLegend.textContent = text.dayOffLegend;
    elements.workdayLegend.textContent = text.workdayLegend;
  }

  /** 图例优先展示当前日期窗口中真正出现的节日名称。 */
  function renderLegend(cells) {
    const text = getText();
    const visibleFestivals = [...new Set(cells
      .map((cell) => {
        const dateKey = CalendarCore.toDateKey(cell.year, cell.month, cell.day);
        return window.holidayManager.getHolidays(cell.year)[dateKey]?.festival;
      })
      .filter(Boolean))];

    elements.festivalLegend.textContent = visibleFestivals.length > 0
      ? visibleFestivals.map((festival) => text.festivals[festival]).join(' / ')
      : text.festivalLegend;
  }

  /** 渲染星期标题，并同步更新切换按钮的可访问性描述。 */
  function renderWeekdays() {
    elements.weekdays.replaceChildren(...CalendarCore
      .getWeekdayLabels(state.startOnMonday, state.language)
      .map((label) => {
        const cell = document.createElement('div');
        cell.textContent = label;
        return cell;
      }));

    const text = getText();
    elements.toggleWeek.textContent = state.startOnMonday
      ? text.firstDayMonday
      : text.firstDaySunday;
    elements.toggleWeek.setAttribute('aria-label', text.toggleWeek);
    elements.toggleWeek.title = text.toggleWeek;
    elements.toggleWeek.setAttribute('aria-pressed', String(state.startOnMonday));
  }

  /** 创建一个日期单元格；节假日信息只影响展示，不参与日期计算。 */
  function createDayElement(cell, today) {
    const dateKey = CalendarCore.toDateKey(cell.year, cell.month, cell.day);
    const holidayData = window.holidayManager.getHolidays(cell.year)[dateKey];
    const isWeekend = cell.dayOfWeek === 0 || cell.dayOfWeek === 6;
    const isWorkDay = holidayData ? !holidayData.isHoliday : !isWeekend;
    const isFestival = Boolean(holidayData?.festival);

    const dayElement = document.createElement('div');
    dayElement.classList.add('day', isWorkDay ? 'is-workday' : 'is-holiday');
    if (isWeekend) dayElement.classList.add('is-weekend');
    if (isFestival) dayElement.classList.add('is-festival');
    if (holidayData?.isHoliday && !isFestival) dayElement.classList.add('is-day-off');
    if (holidayData && !holidayData.isHoliday) dayElement.classList.add('is-makeup-workday');
    dayElement.setAttribute('role', 'gridcell');
    if (!cell.isCurrentMonth) dayElement.classList.add('off-month');

    const dateNumber = document.createElement('span');
    dateNumber.className = 'date-num';
    dateNumber.textContent = cell.day;
    dayElement.appendChild(dateNumber);

    if (holidayData) {
      const text = getText();
      const holidayName = holidayData.holiday
        ? text.festivals[holidayData.holiday]
        : holidayData.name;
      const festivalName = holidayData.festival
        ? text.festivals[holidayData.festival]
        : null;
      const festivalMarker = holidayData.festival
        ? text.festivalMarkers[holidayData.festival]
        : null;
      const marker = document.createElement('span');
      marker.className = festivalMarker
        ? 'festival-text'
        : holidayData.isHoliday ? 'holiday-text' : 'work-text';
      marker.textContent = festivalMarker
        || (holidayData.isHoliday ? text.dayOffMarker : text.workdayMarker);
      marker.title = festivalName
        || `${holidayName || ''} · ${holidayData.isHoliday
          ? text.holidayStatus
          : text.workdayStatus}`;
      dayElement.appendChild(marker);
    }

    const isToday = cell.year === today.getFullYear()
      && cell.month === today.getMonth()
      && cell.day === today.getDate();
    if (isToday) dayElement.classList.add('today');

    const text = getText();
    const accessibleDate = new Intl.DateTimeFormat(state.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date(cell.year, cell.month, cell.day));
    const festivalLabel = holidayData?.festival
      ? text.festivals[holidayData.festival]
      : null;
    const holidayName = holidayData?.holiday
      ? text.festivals[holidayData.holiday]
      : holidayData?.name;
    let accessibleLabel = accessibleDate;
    if (festivalLabel) {
      accessibleLabel += `, ${festivalLabel}, ${text.festivalDayStatus}`;
    } else if (holidayData?.isHoliday) {
      accessibleLabel += `, ${holidayName || ''}, ${text.holidayStatus}`;
    } else if (holidayData) {
      accessibleLabel += `, ${holidayName || ''}, ${text.workdayStatus}`;
    }
    dayElement.setAttribute('aria-label', accessibleLabel);
    return dayElement;
  }

  /** 使用当前缓存同步绘制界面，因此网络慢或离线时不会出现空白日历。 */
  function renderCalendarGrid() {
    const year = state.visibleDate.getFullYear();
    const month = state.visibleDate.getMonth();
    const cells = CalendarCore.buildWeekWindowCells(
      state.visibleDate,
      state.startOnMonday
    );
    const today = new Date();

    elements.monthYear.textContent = CalendarCore.getMonthLabel(
      year,
      month,
      state.language
    );
    renderLocalizedControls();
    renderLegend(cells);
    renderWeekdays();

    const fragment = document.createDocumentFragment();
    cells.forEach((cell) => fragment.appendChild(createDayElement(cell, today)));
    elements.calendarGrid.replaceChildren(fragment);
  }

  function getVisibleYears() {
    const cells = CalendarCore.buildWeekWindowCells(
      state.visibleDate,
      state.startOnMonday
    );
    return [...new Set(cells.map((cell) => cell.year))];
  }

  /**
   * 先同步绘制，再后台刷新节假日并重绘。
   * renderVersion 用于丢弃快速翻月过程中较早请求产生的过期渲染结果。
   */
  async function renderCalendar() {
    const version = ++state.renderVersion;
    renderCalendarGrid();

    await Promise.all(getVisibleYears().map((year) => (
      window.holidayManager.fetchHolidays(year)
    )));

    if (version === state.renderVersion) {
      renderCalendarGrid();
    }
  }

  function moveMonth(offset) {
    state.visibleDate = CalendarCore.addMonths(state.visibleDate, offset);
    renderCalendar();
  }

  function moveWeek(offset) {
    state.visibleDate = CalendarCore.addDays(state.visibleDate, offset * 7);
    renderCalendar();
  }

  function updateClock() {
    elements.clock.textContent = new Date().toLocaleTimeString('en-US', {
      hour12: false
    });
  }

  function bindEvents() {
    elements.toggleWeek.addEventListener('click', () => {
      state.startOnMonday = !state.startOnMonday;
      saveBooleanPreference(STORAGE_KEYS.startOnMonday, state.startOnMonday);
      renderCalendar();
    });

    elements.languageToggle.addEventListener('click', () => {
      state.language = state.language === 'zh-CN' ? 'en' : 'zh-CN';
      saveLanguagePreference(state.language);
      renderCalendar();
    });

    elements.goToday.addEventListener('click', () => {
      state.visibleDate = CalendarCore.startOfMonth(new Date());
      renderCalendar();
    });

    elements.previousMonth.addEventListener('click', () => moveMonth(-1));
    elements.nextMonth.addEventListener('click', () => moveMonth(1));
    elements.close.addEventListener('click', () => window.close());

    // 累计滚轮输入并按实际幅度换算行数，快速滚动时不丢弃后续事件。
    // Chromium 的像素模式通常约 100px/刻度；Firefox 常用 3 行/刻度。
    let wheelRowRemainder = 0;
    elements.app.addEventListener('wheel', (event) => {
      if (event.deltaY === 0) return;

      const rowDelta = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? event.deltaY / 3
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? event.deltaY * 6
          : event.deltaY / 100;

      wheelRowRemainder += rowDelta;
      const wholeRows = Math.trunc(wheelRowRemainder);
      if (wholeRows === 0) return;

      wheelRowRemainder -= wholeRows;
      moveWeek(wholeRows);
    }, { passive: true });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') moveMonth(-1);
      if (event.key === 'ArrowRight') moveMonth(1);
      if (event.key.toLowerCase() === 't') {
        state.visibleDate = CalendarCore.startOfMonth(new Date());
        renderCalendar();
      }
    });
  }

  bindEvents();
  updateClock();
  setInterval(updateClock, 1000);
  renderCalendar();
})();
