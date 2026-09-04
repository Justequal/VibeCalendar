/**
 * 日历界面控制器。
 *
 * calendar-core.js 负责日期计算，holidays.js 负责数据获取；本文件只维护界面
 * 状态、DOM 渲染和用户交互，避免把不同职责混在一个大函数里。
 *
 * 给前端初学者的阅读提示：DOM 是浏览器中的页面对象树，elements 保存常用节点；
 * state 保存会变化的数据；render* 函数把 state 转成页面内容；bindEvents 把按钮、
 * 键盘和滚轮输入转换为 state 变化。文件末尾四行就是整个页面的启动顺序。
 */
(function bootstrapCalendar() {
  const STORAGE_KEYS = Object.freeze({
    startOnMonday: 'vibe-calendar:preference:v2:start-on-monday',
    language: 'vibe-calendar:preference:language'
  });

  const TRANSLATIONS = window.VibeCalendarTranslations;

  // 页面节点只查找一次。后续代码通过有含义的名字访问节点，避免在业务函数中
  // 反复散落 document.getElementById，也能一眼看出本控制器依赖哪些 HTML 元素。
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
    languageToggle: document.getElementById('language-toggle-btn'),
    version: document.getElementById('version-btn'),
    checkUpdate: document.getElementById('check-update-btn'),
    releaseModal: document.getElementById('release-modal'),
    releaseTitle: document.getElementById('release-title'),
    releaseVersion: document.getElementById('release-version'),
    releaseNotes: document.getElementById('release-notes'),
    releaseClose: document.getElementById('release-close-btn')
  };

  // 页面唯一可变状态。visibleDate 是当前 6×7 窗口的锚点，而不是“选中的日期”；
  // renderVersion 是异步请求序号，用于阻止较早月份的慢请求覆盖后来切换的月份。
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

  const updateController = window.createUpdateController({ elements, getText });
  const accessibleDateFormatters = new Map();
  let renderedControlsLanguage;
  let renderedWeekdayKey;

  function getAccessibleDateFormatter() {
    if (!accessibleDateFormatters.has(state.language)) {
      accessibleDateFormatters.set(state.language, new Intl.DateTimeFormat(state.language, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }));
    }
    return accessibleDateFormatters.get(state.language);
  }

  function renderLocalizedControls() {
    // 日期滚动通常不改变语言，缓存语言可避免每次滚轮重绘都重复写按钮属性。
    if (renderedControlsLanguage === state.language) return;

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
    updateController.syncLanguage();
    renderedControlsLanguage = state.language;
  }

  /** 图例优先展示当前日期窗口中真正出现的节日名称。 */
  function renderLegend(cells, holidaysByYear) {
    const text = getText();
    const visibleFestivals = [...new Set(cells
      .map((cell) => {
        const dateKey = CalendarCore.toDateKey(cell.year, cell.month, cell.day);
        return holidaysByYear.get(cell.year)[dateKey]?.festival;
      })
      .filter(Boolean))];

    elements.festivalLegend.textContent = visibleFestivals.length > 0
      ? visibleFestivals.map((festival) => text.festivals[festival]).join(' / ')
      : text.festivalLegend;
  }

  /** 渲染星期标题，并同步更新切换按钮的可访问性描述。 */
  function renderWeekdays() {
    const renderKey = `${state.language}:${state.startOnMonday}`;
    if (renderedWeekdayKey === renderKey) return;

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
    renderedWeekdayKey = renderKey;
  }

  /**
   * 创建一个日期单元格。
   * cell 来自纯日期模块，holidayData 来自数据服务，本函数只决定 CSS 类、短标签
   * 和无障碍说明。这样改变颜色不会影响日期，替换数据源也不会改动页面结构。
   */
  function createDayElement(cell, today, dateFormatter, holidaysByYear) {
    const dateKey = CalendarCore.toDateKey(cell.year, cell.month, cell.day);
    const holidayData = holidaysByYear.get(cell.year)[dateKey];
    const isWeekend = cell.dayOfWeek === 0 || cell.dayOfWeek === 6;
    const isWorkDay = holidayData ? !holidayData.isHoliday : !isWeekend;
    const isFestival = Boolean(holidayData?.festival);

    const dayElement = document.createElement('div');
    dayElement.classList.add('day', isWorkDay ? 'is-workday' : 'is-holiday');
    dayElement.dataset.date = dateKey;
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
    if (isToday) dayElement.setAttribute('aria-current', 'date');

    const text = getText();
    const accessibleDate = dateFormatter.format(new Date(cell.year, cell.month, cell.day));
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

  /**
   * 使用当前缓存同步绘制完整界面。DocumentFragment 是内存中的临时节点容器：
   * 42 个日期先在内存中创建，再一次替换旧网格，减少反复触发布局计算。
   */
  function renderCalendarGrid() {
    const year = state.visibleDate.getFullYear();
    const month = state.visibleDate.getMonth();
    const cells = CalendarCore.buildWeekWindowCells(
      state.visibleDate,
      state.startOnMonday
    );
    const today = new Date();
    const holidaysByYear = new Map([...new Set(cells.map((cell) => cell.year))]
      .map((visibleYear) => [visibleYear, window.holidayManager.getHolidays(visibleYear)]));
    const dateFormatter = getAccessibleDateFormatter();

    elements.monthYear.textContent = CalendarCore.getMonthLabel(
      year,
      month,
      state.language
    );
    renderLocalizedControls();
    renderLegend(cells, holidaysByYear);
    renderWeekdays();

    const fragment = document.createDocumentFragment();
    cells.forEach((cell) => fragment.appendChild(createDayElement(
      cell,
      today,
      dateFormatter,
      holidaysByYear
    )));
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

    // 数据服务本身会降级，但这里仍使用 allSettled 隔离未知异常，确保新增提供方
    // 或浏览器存储故障永远不会形成未处理的 Promise 并影响日历交互。
    await Promise.allSettled(getVisibleYears().map((year) => (
      window.holidayManager.fetchHolidays(year)
    )));

    if (version === state.renderVersion) {
      renderCalendarGrid();
    }
  }

  function moveMonth(offset) {
    // 只改锚点并走统一渲染入口，按钮和键盘不会形成两套日期切换逻辑。
    state.visibleDate = CalendarCore.addMonths(state.visibleDate, offset);
    renderCalendar();
  }

  function moveWeek(offset) {
    state.visibleDate = CalendarCore.addDays(state.visibleDate, offset * 7);
    renderCalendar();
  }

  function updateClock() {
    const now = new Date();
    elements.clock.textContent = now.toLocaleTimeString('en-US', {
      hour12: false
    });
    elements.clock.dateTime = now.toISOString();
  }

  /** 每次按整秒边界重新调度，避免长期运行后 setInterval 累积漂移。 */
  function scheduleClockTick() {
    updateClock();
    const delay = 1000 - (Date.now() % 1000) + 5;
    setTimeout(scheduleClockTick, delay);
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
      updateClock();
      renderCalendar();
    });

    elements.goToday.addEventListener('click', () => {
      state.visibleDate = CalendarCore.startOfMonth(new Date());
      renderCalendar();
    });

    elements.previousMonth.addEventListener('click', () => moveMonth(-1));
    elements.nextMonth.addEventListener('click', () => moveMonth(1));
    elements.close.addEventListener('click', () => window.close());

    // 累加器负责“滚了几行”，requestAnimationFrame 负责“何时更新页面”。浏览器
    // 一帧内收到的多次滚轮事件会合并成一次 DOM 重绘，但总滚动幅度完整保留。
    const wheelRows = InteractionCore.createWheelRowAccumulator();
    let queuedWheelRows = 0;
    let wheelFrame = 0;
    elements.app.addEventListener('wheel', (event) => {
      if (event.deltaY === 0 || updateController.isReleaseNotesOpen()) return;

      const wholeRows = wheelRows.push(event.deltaY, event.deltaMode);
      if (wholeRows === 0) return;

      queuedWheelRows += wholeRows;
      if (wheelFrame) return;

      wheelFrame = requestAnimationFrame(() => {
        const rows = queuedWheelRows;
        queuedWheelRows = 0;
        wheelFrame = 0;
        if (rows !== 0) moveWeek(rows);
      });
    }, { passive: true });

    document.addEventListener('keydown', (event) => {
      if (updateController.isReleaseNotesOpen()) return;
      // Ctrl/Alt/Command 组合键属于系统或应用快捷键，不能被单字母 T 意外截获。
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveMonth(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveMonth(1);
      }
      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        state.visibleDate = CalendarCore.startOfMonth(new Date());
        renderCalendar();
      }
    });
  }

  bindEvents();
  scheduleClockTick();
  updateController.initialize();
  renderCalendar();
})();
