/**
 * 输入设备换算逻辑。
 *
 * 滚轮事件可能以像素、行或页面为单位。把换算和余量累计保持为纯逻辑后，既能
 * 测试快速滚动幅度，也避免 renderer.js 直接依赖不同浏览器的经验数值。
 */
(function exposeInteractionCore(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) root.InteractionCore = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  const DOM_DELTA_PIXEL = 0;
  const DOM_DELTA_LINE = 1;
  const DOM_DELTA_PAGE = 2;
  const PIXELS_PER_ROW = 100;
  const LINES_PER_ROW = 3;
  const ROWS_PER_PAGE = 6;

  function toRowDelta(deltaY, deltaMode = DOM_DELTA_PIXEL) {
    if (!Number.isFinite(deltaY)) return 0;
    if (deltaMode === DOM_DELTA_LINE) return deltaY / LINES_PER_ROW;
    if (deltaMode === DOM_DELTA_PAGE) return deltaY * ROWS_PER_PAGE;
    return deltaY / PIXELS_PER_ROW;
  }

  function createWheelRowAccumulator() {
    let remainder = 0;

    return Object.freeze({
      /** 返回本次累计后应移动的完整行数，绝不丢弃不足一行的余量。 */
      push(deltaY, deltaMode = DOM_DELTA_PIXEL) {
        remainder += toRowDelta(deltaY, deltaMode);
        const wholeRows = Math.trunc(remainder);
        remainder -= wholeRows;
        return wholeRows;
      }
    });
  }

  return Object.freeze({
    DOM_DELTA_PIXEL,
    DOM_DELTA_LINE,
    DOM_DELTA_PAGE,
    createWheelRowAccumulator,
    toRowDelta
  });
});
