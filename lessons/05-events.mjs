/** 实验5：订阅返回取消函数。这是教学用的内存事件源，不是Electron IPC实现。 */
import assert from 'node:assert/strict';

export function run() {
  const listeners = new Set();
  function subscribe(listener) {
    listeners.add(listener);
    // 闭包记住同一个函数引用；调用者无需知道listeners这个内部容器。
    return () => listeners.delete(listener);
  }
  function publish(value) {
    // 复制订阅者列表，让本轮通知不受回调新增订阅影响。
    for (const listener of [...listeners]) listener(value);
  }
  const received = [];
  const unsubscribe = subscribe(value => received.push(value));
  publish('downloaded');
  unsubscribe();
  publish('installing');
  assert.deepEqual(received, ['downloaded']);
  return { received, remainingListeners: listeners.size };
}
