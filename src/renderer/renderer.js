/**
 * 教学入口：docs/learning/01-page.md。输入事件 → CalendarState转换 → 渲染；存储与DOM副作用留在控制器。
 *
 * 日历界面控制器。
 *
 * calendar-core.js 负责日期计算，holidays.js 负责数据获取；本文件只维护界面
 * 状态、DOM 渲染和用户交互，避免把不同职责混在一个大函数里。
 *
 * 给前端初学者的阅读提示：DOM 是浏览器中的页面对象树，elements 保存常用节点；
 * state 保存会变化的数据；render* 函数把 state 转成页面内容；bindEvents 把按钮、
 * 键盘和滚轮输入转换为 state 变化。文件末尾给出页面启动顺序和后台任务的延迟入口。
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
    installUpdate: document.getElementById('install-update-btn'),
    releaseModal: document.getElementById('release-modal'),
    releaseTitle: document.getElementById('release-title'),
    releaseVersion: document.getElementById('release-version'),
    releaseNotes: document.getElementById('release-notes'),
    releaseClose: document.getElementById('release-close-btn')
  };

  // 页面业务状态；渲染快照和输入节流也各自保存内部状态。
  // visibleDate 是当前 6×7 窗口的锚点，而不是“选中的日期”；
  // renderVersion 是异步请求序号，只有最新调用可以在请求完成后要求重绘。
  let state = {
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
  const emptyHolidays = Object.freeze({});
  let renderedControlsLanguage;
  let renderedWeekdayKey;
  let renderedGrid;
  let clockDateKey;

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
    if (!CalendarCore.isSupportedYear(cell.year)) {
      const placeholder = document.createElement('div');
      placeholder.className = 'day off-month';
      placeholder.setAttribute('role', 'gridcell');
      placeholder.setAttribute('aria-disabled', 'true');
      return placeholder;
    }
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
    const accessibleDate = dateFormatter.format(CalendarCore.createDate(cell.year, cell.month, cell.day, 12));
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
   * 42 个日期先组装，再一次替换旧网格，使DOM提交集中在一个位置。
   * 这不意味着逐个append必然触发42次布局；布局时机由浏览器决定。
   */
  function renderCalendarGrid() {
    const year = state.visibleDate.getFullYear();
    const month = state.visibleDate.getMonth();
    const cells = CalendarCore.buildWeekWindowCells(
      state.visibleDate,
      state.startOnMonday
    );
    const today = new Date();
    // map提取年份，Set去重，Map保存每年的只读快照：跨年窗口也只读每年一次。
    const visibleYears = [...new Set(cells.map((cell) => cell.year))];
    const holidaysByYear = new Map(visibleYears
      .map((visibleYear) => [visibleYear, CalendarCore.isSupportedYear(visibleYear)
        ? window.holidayManager.getHolidays(visibleYear) : emptyHolidays]));
    const renderKey = [
      year, month, CalendarCore.toDateKey(cells[0].year, cells[0].month, cells[0].day),
      state.language, state.startOnMonday,
      CalendarCore.toDateKey(today.getFullYear(), today.getMonth(), today.getDate())
    ].join(':');
    // 数据服务替换整个冻结快照，因此引用相同就表示该年的数据没有变化。
    const hasSameSnapshot = renderedGrid?.key === renderKey && [...holidaysByYear].every(
      ([visibleYear, data]) => renderedGrid.holidays.get(visibleYear) === data
    );
    if (hasSameSnapshot) return holidaysByYear;
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
    renderedGrid = { key: renderKey, holidays: holidaysByYear };
    return holidaysByYear;
  }

  /**
   * 先同步绘制，再后台刷新节假日并重绘。
   * renderVersion 用于丢弃快速翻月过程中较早请求产生的过期渲染结果。
   */
  async function renderCalendar(options) {
    const version = ++state.renderVersion;
    const holidaysByYear = renderCalendarGrid();

    // 数据服务本身会降级，但这里仍使用 allSettled 隔离未知异常，确保新增提供方
    // 或浏览器存储故障永远不会形成未处理的 Promise 并影响日历交互。
    await Promise.allSettled([...holidaysByYear.keys()].filter(CalendarCore.isSupportedYear).map((year) => (
      window.holidayManager.fetchHolidays(year, options)
    )));

    if (version === state.renderVersion) {
      // 只有最新调用可以要求重绘；网格函数随后再判断快照是否真的变化。
      renderCalendarGrid();
    }
  }

  function moveMonth(offset) {
    // 只改锚点并走统一渲染入口，按钮和键盘不会形成两套日期切换逻辑。
    state = CalendarState.transition(state, { type: 'move-month', offset });
    renderCalendar();
  }

  function moveWeek(offset) {
    state = CalendarState.transition(state, { type: 'move-week', offset });
    renderCalendar();
  }

  /** 按钮和快捷键复用同一动作；读取时钟是控制器的责任。 */
  function goToday() {
    state = CalendarState.transition(state, { type: 'go-today', now: new Date() });
    renderCalendar();
  }

  function updateClock() {
    const now = new Date();
    // 固定 HH:mm:ss 无需每秒构造本地化格式器；直接读取本地时间也能跟随系统时区。
    elements.clock.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((part) => String(part).padStart(2, '0')).join(':');
    elements.clock.dateTime = now.toISOString();
    const dateKey = CalendarCore.toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
    if (clockDateKey !== undefined && clockDateKey !== dateKey) {
      // 跨午夜或系统日期调整后更新今天标记，保留用户正在浏览的月份。
      void renderCalendar();
    }
    clockDateKey = dateKey;
  }

  /** 每次按整秒边界重新调度，避免长期运行后 setInterval 累积漂移。 */
  function scheduleClockTick() {
    updateClock();
    const delay = 1000 - (Date.now() % 1000) + 5;
    setTimeout(scheduleClockTick, delay);
  }

  function bindEvents() {
    const refreshOnReturn = () => {
      updateClock();
      void renderCalendar();
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshOnReturn();
    });
    window.addEventListener('online', () => void renderCalendar({ retryFallback: true }));
    elements.toggleWeek.addEventListener('click', () => {
      state = CalendarState.transition(state, { type: 'toggle-week-start' });
      saveBooleanPreference(STORAGE_KEYS.startOnMonday, state.startOnMonday);
      renderCalendar();
    });

    elements.languageToggle.addEventListener('click', () => {
      state = CalendarState.transition(state, { type: 'toggle-language' });
      saveLanguagePreference(state.language);
      updateClock();
      renderCalendar();
    });

    elements.goToday.addEventListener('click', goToday);

    elements.previousMonth.addEventListener('click', () => moveMonth(-1));
    elements.nextMonth.addEventListener('click', () => moveMonth(1));
    elements.close.addEventListener('click', () => window.close());

    // 累加器负责“滚了几行”，requestAnimationFrame 负责“何时更新页面”。浏览器
    // 一帧内收到的多次滚轮事件会合并成一次 DOM 重绘，但总滚动幅度完整保留。
    const wheelRows = InteractionCore.createWheelRowAccumulator();
    let queuedWheelRows = 0;
    let wheelFrame = 0;
    elements.app.addEventListener('wheel', (event) => {
      if (event.ctrlKey || event.deltaY === 0 || updateController.isReleaseNotesOpen()) return;

      const wholeRows = wheelRows.push(event.deltaY, event.deltaMode);
      if (wholeRows === 0) return;

      queuedWheelRows += wholeRows;
      if (wheelFrame) return;

      wheelFrame = requestAnimationFrame(() => {
        const rows = queuedWheelRows;
        queuedWheelRows = 0;
        wheelFrame = 0;
        if (rows !== 0 && !updateController.isReleaseNotesOpen()) moveWeek(rows);
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
        goToday();
      }
    });
  }

  bindEvents();
  scheduleClockTick();
  renderCalendar();
  performance.mark('calendar-ready');
  // 日历先完成同步绘制，版本号和更新快照的IPC随后初始化。
  updateController.initialize();
  const backgroundTimer = setTimeout(() => void renderCalendar(), 60_000);
  window.addEventListener('pagehide', () => {
    clearTimeout(backgroundTimer);
    window.holidayManager.dispose?.();
  }, { once: true });
})();
