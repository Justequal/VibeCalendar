/**
 * 日历界面控制器。
 *
 * calendar-core.js 负责日期计算，holidays.js 负责数据获取；本文件只维护界面
 * 状态、DOM 渲染和用户交互，避免把不同职责混在一个大函数里。
 */
(function bootstrapCalendar() {
  const STORAGE_KEYS = Object.freeze({
    startOnMonday: 'vibe-calendar:preference:start-on-monday'
  });

  const elements = {
    app: document.getElementById('app-container'),
    monthYear: document.getElementById('month-year'),
    calendarGrid: document.getElementById('calendar-grid'),
    weekdays: document.getElementById('weekdays-container'),
    previousMonth: document.getElementById('prev-month'),
    nextMonth: document.getElementById('next-month'),
    close: document.getElementById('close-btn'),
    clock: document.getElementById('clock'),
    goToday: document.getElementById('go-today-btn'),
    toggleWeek: document.getElementById('toggle-week-btn')
  };

  const state = {
    visibleMonth: CalendarCore.startOfMonth(new Date()),
    startOnMonday: readBooleanPreference(STORAGE_KEYS.startOnMonday, false),
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

  /** 渲染星期标题，并同步更新切换按钮的可访问性描述。 */
  function renderWeekdays() {
    elements.weekdays.replaceChildren(...CalendarCore
      .getWeekdayLabels(state.startOnMonday)
      .map((label) => {
        const cell = document.createElement('div');
        cell.textContent = label;
        return cell;
      }));

    const firstDay = state.startOnMonday ? 'Mon' : 'Sun';
    elements.toggleWeek.textContent = `1st: ${firstDay}`;
    elements.toggleWeek.setAttribute('aria-pressed', String(state.startOnMonday));
  }

  /** 创建一个日期单元格；节假日信息只影响展示，不参与日期计算。 */
  function createDayElement(cell, today) {
    const dateKey = CalendarCore.toDateKey(cell.year, cell.month, cell.day);
    const holidayData = window.holidayManager.getHolidays(cell.year)[dateKey];
    const isWeekend = cell.dayOfWeek === 0 || cell.dayOfWeek === 6;
    const isWorkDay = holidayData ? !holidayData.isHoliday : !isWeekend;

    const dayElement = document.createElement('div');
    dayElement.classList.add('day', isWorkDay ? 'is-workday' : 'is-holiday');
    if (!cell.isCurrentMonth) dayElement.classList.add('off-month');

    const dateNumber = document.createElement('span');
    dateNumber.className = 'date-num';
    dateNumber.textContent = cell.day;
    dayElement.appendChild(dateNumber);

    if (holidayData) {
      const marker = document.createElement('span');
      marker.className = holidayData.isHoliday ? 'holiday-text' : 'work-text';
      marker.textContent = holidayData.isHoliday ? (holidayData.name || '休') : '班';
      dayElement.appendChild(marker);
    }

    const isToday = cell.year === today.getFullYear()
      && cell.month === today.getMonth()
      && cell.day === today.getDate();
    if (isToday) dayElement.classList.add('today');

    const accessibleDate = `${cell.year}-${cell.month + 1}-${cell.day}`;
    dayElement.setAttribute('aria-label', holidayData?.name
      ? `${accessibleDate}，${holidayData.name}${holidayData.isHoliday ? '，休息' : '，补班'}`
      : accessibleDate);
    return dayElement;
  }

  /** 使用当前缓存同步绘制界面，因此网络慢或离线时不会出现空白日历。 */
  function renderCalendarGrid() {
    const year = state.visibleMonth.getFullYear();
    const month = state.visibleMonth.getMonth();
    const cells = CalendarCore.buildMonthCells(year, month, state.startOnMonday);
    const today = new Date();

    elements.monthYear.textContent = CalendarCore.getMonthLabel(year, month);
    renderWeekdays();

    const fragment = document.createDocumentFragment();
    cells.forEach((cell) => fragment.appendChild(createDayElement(cell, today)));
    elements.calendarGrid.replaceChildren(fragment);
  }

  function getVisibleYears() {
    const year = state.visibleMonth.getFullYear();
    const month = state.visibleMonth.getMonth();
    const years = new Set([year]);
    if (month === 0) years.add(year - 1);
    if (month === 11) years.add(year + 1);
    return [...years];
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
    state.visibleMonth = CalendarCore.addMonths(state.visibleMonth, offset);
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

    elements.goToday.addEventListener('click', () => {
      state.visibleMonth = CalendarCore.startOfMonth(new Date());
      renderCalendar();
    });

    elements.previousMonth.addEventListener('click', () => moveMonth(-1));
    elements.nextMonth.addEventListener('click', () => moveMonth(1));
    elements.close.addEventListener('click', () => window.close());

    // 滚轮每 200ms 最多翻一页，防止触控板惯性一次跨过多个月份。
    let wheelLocked = false;
    elements.app.addEventListener('wheel', (event) => {
      if (wheelLocked || event.deltaY === 0) return;
      moveMonth(event.deltaY > 0 ? 1 : -1);
      wheelLocked = true;
      setTimeout(() => { wheelLocked = false; }, 200);
    }, { passive: true });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') moveMonth(-1);
      if (event.key === 'ArrowRight') moveMonth(1);
      if (event.key.toLowerCase() === 't') {
        state.visibleMonth = CalendarCore.startOfMonth(new Date());
        renderCalendar();
      }
    });
  }

  bindEvents();
  updateClock();
  setInterval(updateClock, 1000);
  renderCalendar();
})();
