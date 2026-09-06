/**
 * 独立Worker线程：网络响应解析、提供方校验、合并、超时和请求队列都在这里运行。
 * 不接触DOM和localStorage。主线程只传入当前年份的缓存快照，接收完成后的结果。
 * 复用已有服务，避免在线程版本中复制一套日期和降级规则。
 */
importScripts('festival-dates.js', 'calendar-core.js', 'holiday-data.js', 'holidays.js');
const manager = HolidayService.createHolidayManager({ storage: null });

self.onmessage = async ({ data: request }) => {
  const { id, year, entry, options } = request;
  try {
    const cached = entry && HolidayData.normalizeStoredEntry(entry, year);
    if (cached && !manager.pendingRequests.has(year)) manager.setCacheEntry(year, cached);
    await manager.fetchHolidays(year, options);
    const result = manager.getCachedEntry(year);
    const unchanged = Boolean(entry && JSON.stringify(entry.data) === JSON.stringify(result?.data));
    self.postMessage({ id, year, entry: result, unchanged });
  } catch (error) {
    self.postMessage({ id, year, error: String(error.message || error) });
  }
};
