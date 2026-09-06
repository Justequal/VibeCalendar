/** 实验4：依赖注入让真实服务离线运行。假fetch只替换外部世界，不重写服务逻辑。 */
import assert from 'node:assert/strict';
import service from '../src/renderer/holidays.js';

export async function run() {
  let requests = 0;
  const manager = service.createHolidayManager({
    storage: null,
    now: () => 1_000,
    logger: { warn() {}, error() {}, info() {} },
    fetchImpl: async () => {
      requests += 1;
      // 两个提供方共用这个实验响应，各自适配器只读取自己认识的字段。
      return { ok: true, json: async () => ({
        days: [{ date: '2026-01-01', name: '元旦', isOffDay: true }],
        code: 0, holiday: { '01-01': { date: '2026-01-01', name: '元旦', holiday: true } }
      }) };
    }
  });
  const results = await Promise.allSettled([manager.fetchHolidays(2026), manager.fetchHolidays(2026)]);
  assert.ok(results.every(result => result.status === 'fulfilled'));
  assert.equal(requests, 3); // 同年共享工作：两个Nate镜像加一个Timor地址，而不是每次调用各发三次。
  await manager.fetchHolidays(2026);
  assert.equal(requests, 3); // 缓存命中不访问外部世界。
  return { callers: results.length, requests, cached: manager.getHolidays(2026)['2026-01-01'].name };
}
