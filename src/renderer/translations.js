/**
 * 界面文案词典。
 *
 * 这里集中维护所有用户可见文本，渲染逻辑只通过语言键读取文案。新增语言或
 * 调整措辞时无需修改日期计算、更新检查等业务逻辑。
 */
(function exposeTranslations(root) {
  root.VibeCalendarTranslations = Object.freeze({
    'zh-CN': Object.freeze({
      appTitle: '氛围日历',
      close: '关闭窗口',
      previousMonth: '上个月（←）',
      nextMonth: '下个月（→）',
      calendar: '月历',
      goToday: '回到今天',
      todayShortcut: '回到今天（快捷键 T）',
      versionAnnouncement: '查看最新版本更新公告',
      checkUpdates: '检查更新',
      checkingUpdates: '正在检查…',
      updateAvailable: '发现新版本 v{version}，正在准备下载',
      upToDate: '当前已是最新版本',
      updateCheckError: '检查更新失败，请稍后重试',
      updateUnavailable: '当前版本暂不支持自动更新',
      releaseTitle: '最新版本更新公告',
      releaseLoading: '正在加载…',
      releaseNoNotes: '此版本没有附加更新说明。',
      releaseLoadError: '更新公告加载失败，请检查网络后重试。',
      closeRelease: '关闭更新公告',
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
      versionAnnouncement: 'View the latest release notes',
      checkUpdates: 'Check for Updates',
      checkingUpdates: 'Checking…',
      updateAvailable: 'Version {version} is available and is being prepared',
      upToDate: 'You are using the latest version',
      updateCheckError: 'Could not check for updates. Try again later.',
      updateUnavailable: 'Automatic updates are unavailable in this build',
      releaseTitle: 'Latest Release Notes',
      releaseLoading: 'Loading…',
      releaseNoNotes: 'No release notes were provided for this version.',
      releaseLoadError: 'Could not load the release notes. Check your connection and try again.',
      closeRelease: 'Close release notes',
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
      // 日期格使用统一短标签；悬停提示和无障碍文本保留完整英文名称。
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
})(window);
