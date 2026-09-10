/**
 * 主线程的轻量代理：首帧后立即启动Worker，不设置启动等待。
 * performance.now只用于线程故障后的重试冷却。
 * 首屏保留少量同步缓存读取；网络JSON解析和数据合并交给Worker。
 */
(function exposeBackgroundHolidays(root) {
  function createBackgroundHolidayManager({
    local = root.holidayManager,
    createWorker = () => new Worker('holiday-worker.js'),
    now = () => performance.now()
  } = {}) {
    let worker;
    let sequence = 0;
    let retryAfter = 0;
    let disposed = false;
    const pendingRequests = new Map();

    function finish(task, data) {
      clearTimeout(task.timer);
      pendingRequests.delete(task.year);
      task.resolve(data);
    }

    function stopWorker() {
      worker?.terminate();
      worker = null;
      retryAfter = now() + 30_000;
      // Worker崩溃或超时不能留下永远不完成的Promise，也不退回主线程联网。
      for (const task of [...pendingRequests.values()]) finish(task, local.getHolidays(task.year));
    }

    function ensureWorker() {
      if (worker) return;
      worker = createWorker();
      worker.onerror = stopWorker;
      worker.onmessageerror = stopWorker;
      worker.onmessage = ({ data: message }) => {
        const task = pendingRequests.get(message.year);
        if (!task || task.id !== message.id) return;
        if (!message.error && message.entry) {
          // structured clone不会保留Object.freeze。恢复只读约束，以便渲染器
          // 继续通过引用判断快照是否改变；未变化的旧缓存保留原引用。
          const previous = local.getCachedEntry(task.year);
          const entry = message.entry;
          if (message.unchanged && previous) entry.data = previous.data;
          else {
            Object.values(entry.data).forEach(Object.freeze);
            Object.freeze(entry.data);
          }
          local.setCacheEntry(task.year, Object.freeze(entry));
          local.writeStoredEntry(task.year, entry);
        }
        finish(task, local.getHolidays(task.year));
      };
    }

    function fetchHolidays(year, options) {
      year = root.HolidayData.normalizeYear(year);
      if (disposed || now() < retryAfter) return Promise.resolve(local.getHolidays(year));
      if (pendingRequests.has(year)) return pendingRequests.get(year).promise;
      const entry = local.getCachedEntry(year);
      const retryDegraded = options?.retryFallback && ['local-fallback', 'stale-cache', 'remote-single'].includes(entry?.source);
      if (entry && entry.expiresAt > Date.now() && !retryDegraded) return Promise.resolve(entry.data);
      // 与服务端“2个运行+4个等待”的容量一致。优先保留最近浏览的年份，
      // 否则快速翻动后的最终年份可能被丢弃，直到下一次操作才有机会刷新。
      if (pendingRequests.size >= 6) {
        const oldest = pendingRequests.values().next().value;
        finish(oldest, local.getHolidays(oldest.year));
      }
      try { ensureWorker(); } catch { stopWorker(); return Promise.resolve(local.getHolidays(year)); }
      const task = { id: ++sequence, year };
      task.promise = new Promise(resolve => { task.resolve = resolve; });
      task.timer = setTimeout(stopWorker, 45_000);
      pendingRequests.set(year, task);
      try { worker.postMessage({ id: task.id, year, entry, options }); } catch { stopWorker(); }
      return task.promise;
    }

    return {
      getHolidays: year => local.getHolidays(year),
      fetchHolidays,
      pendingRequests,
      dispose() { disposed = true; stopWorker(); }
    };
  }
  root.createBackgroundHolidayManager = createBackgroundHolidayManager;
  root.holidayManager = createBackgroundHolidayManager();
})(window);
