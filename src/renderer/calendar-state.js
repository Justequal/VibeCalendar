/**
 * 第3层：日历状态转换。学习入口：docs/learning/03-state.md。
 *
 * 一个用户动作可以来自按钮、键盘或滚轮。把“动作如何改变数据”集中在这里，
 * 控制器就只需处理事件、保存偏好和重绘，不必在多个监听器里重复日期规则。
 *
 * 这种“旧状态 + 动作 → 新状态”的函数称为reducer（状态归约函数）。
 * 本模块没有框架依赖，也不自动通知界面；调用方仍需显式渲染。
 * 它不读取当前时钟：回到今天需要调用方传入now，所以测试能重放相同动作。
 */
(function exposeCalendarState(root, factory) {
  const isCommonJs = typeof module !== 'undefined' && module.exports;
  const core = root?.CalendarCore || (isCommonJs ? require('./calendar-core') : null);
  const api = factory(core);
  if (isCommonJs) module.exports = api;
  if (root) root.CalendarState = api;
})(typeof window !== 'undefined' ? window : globalThis, (CalendarCore) => {
  /**
   * @typedef {Object} State
   * @property {Date} visibleDate 六周窗口的锚点，不是用户选中的日期
   * @property {boolean} startOnMonday 一周是否从周一开始
   * @property {'en'|'zh-CN'} language 界面语言
   * @property {number} [renderVersion] 控制器管理的异步序号，转换时原样保留
   *
   * @typedef {Object} Action
   * @property {string} type 动作名称，见下面的switch分支
   * @property {number} [offset] 月份数或星期数，可以为负数
   * @property {Date} [now] 仅go-today需要，由调用方提供
   */

  /**
   * 不改写传入对象或其中的Date。展开语法只复制一层，Date仍然是引用：
   * 因此日期变化必须使用返回新Date的CalendarCore方法，不能对旧Date调用setMonth。
   * 未识别动作返回原对象，适合调用方在不同动作消费者之间共享事件。
   * @param {State} state
   * @param {Action} action
   * @returns {State}
   */
  function transition(state, action) {
    switch (action.type) {
      case 'move-month':
        return { ...state, visibleDate: CalendarCore.addMonths(state.visibleDate, action.offset) };
      case 'move-week': {
        // 保留原滚轮限制：先限制天数，再交给日期模块限制年份。
        const days = Math.max(-4_000_000, Math.min(4_000_000, action.offset * 7));
        return { ...state, visibleDate: CalendarCore.addDays(state.visibleDate, days) };
      }
      case 'go-today':
        return { ...state, visibleDate: CalendarCore.startOfMonth(action.now) };
      case 'toggle-week-start':
        return { ...state, startOnMonday: !state.startOnMonday };
      case 'toggle-language':
        return { ...state, language: state.language === 'zh-CN' ? 'en' : 'zh-CN' };
      default:
        return state;
    }
  }

  return Object.freeze({ transition });
});
