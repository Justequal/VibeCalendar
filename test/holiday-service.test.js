const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HolidayManager,
  mergeProviderData,
  normalizeNateData,
  normalizeTimorData
} = require('../src/renderer/holidays');

const CACHE_KEY_2026 = 'vibe-calendar:holidays:v3:2026';

function createMemoryStorage(initialEntries = {}) {
  const values = new Map(Object.entries(initialEntries));
  const calls = { get: 0, set: 0, remove: 0 };

  return {
    calls,
    getItem(key) {
      calls.get += 1;
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      calls.set += 1;
      values.set(key, value);
    },
    removeItem(key) {
      calls.remove += 1;
      values.delete(key);
    },
    read(key) {
      return values.get(key);
    }
  };
}

function okJson(data) {
  return {
    ok: true,
    status: 200,
    json: async () => data
  };
}

test('两个远端数据源会标准化记录并拒绝错误年份', () => {
  const nate = normalizeNateData({
    days: [
      { date: '2026-01-01', name: ' 元旦 ', isOffDay: true },
      { date: '2025-01-01', name: '错误年份', isOffDay: true }
    ]
  }, 2026);
  assert.deepEqual(nate, {
    '2026-01-01': { name: '元旦', isHoliday: true }
  });

  const timor = normalizeTimorData({
    code: 0,
    holiday: {
      '01-01': {
        date: '2026-01-01',
        name: '元旦',
        holiday: true
      }
    }
  }, 2026);
  assert.deepEqual(timor, {
    '2026-01-01': { name: '元旦', isHoliday: true }
  });

  assert.throws(
    () => normalizeNateData({ days: [{ date: 'bad', name: '无效', isOffDay: true }] }, 2026),
    /未返回有效节假日记录/
  );
});

test('合并数据时主数据源优先，次数据源只补充缺失日期', () => {
  const warnings = [];
  const merged = mergeProviderData([
    { '2026-01-01': { name: '元旦', isHoliday: true } },
    {
      '2026-01-01': { name: '元旦', isHoliday: false },
      '2026-02-15': { name: '春节', isHoliday: true }
    }
  ], { warn: (message) => warnings.push(message) });

  assert.equal(merged['2026-01-01'].isHoliday, true);
  assert.equal(merged['2026-02-15'].name, '春节');
  assert.equal(warnings.length, 1);
});

test('不存在持久化缓存的年份只读取 localStorage 一次', () => {
  const storage = createMemoryStorage();
  const manager = new HolidayManager({ storage, fetchImpl: null });

  const first = manager.getHolidays(2026);
  const second = manager.getHolidays(2026);
  const third = manager.getHolidays(2026);

  assert.strictEqual(first, second);
  assert.strictEqual(second, third);
  assert.deepEqual(first, {});
  assert.equal(storage.calls.get, 1);
});

test('同一年并发刷新共享网络工作，成功结果写入缓存并保持只读', async () => {
  const storage = createMemoryStorage();
  let fetchCount = 0;
  let releaseRequests;
  const requestGate = new Promise((resolve) => {
    releaseRequests = resolve;
  });

  const fetchImpl = async (url) => {
    fetchCount += 1;
    await requestGate;
    if (url.includes('timor.tech')) throw new Error('secondary unavailable');
    return okJson({
      days: [{ date: '2026-01-01', name: '元旦', isOffDay: true }]
    });
  };
  const manager = new HolidayManager({
    fetchImpl,
    storage,
    now: () => 1_000
  });

  const firstRequest = manager.fetchHolidays(2026);
  const secondRequest = manager.fetchHolidays(2026);
  assert.equal(fetchCount, 3);

  releaseRequests();
  const [first, second] = await Promise.all([firstRequest, secondRequest]);
  assert.strictEqual(first, second);
  assert.equal(first['2026-01-01'].festival, 'newYear');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first['2026-01-01']), true);
  assert.equal(storage.calls.set, 1);

  await manager.fetchHolidays(2026);
  assert.equal(fetchCount, 3, '未过期内存缓存不应再次访问网络');
  assert.equal(JSON.parse(storage.read(CACHE_KEY_2026)).source, 'remote-single');
});

test('一个主数据镜像格式损坏时会采用另一个有效镜像', async () => {
  const manager = new HolidayManager({
    fetchImpl: async (url) => {
      if (url.includes('timor.tech')) throw new Error('secondary unavailable');
      if (url.includes('cdn.jsdelivr.net')) {
        return okJson({ days: [{ date: 'bad', name: '损坏', isOffDay: true }] });
      }
      return okJson({
        days: [{ date: '2026-05-01', name: '劳动节', isOffDay: true }]
      });
    },
    storage: null,
    now: () => 1_000
  });

  const holidays = await manager.fetchHolidays(2026);
  assert.equal(holidays['2026-05-01'].festival, 'labourDay');
});

test('远端全部失败时优先沿用过期缓存', async () => {
  const storage = createMemoryStorage({
    [CACHE_KEY_2026]: JSON.stringify({
      data: {
        '2026-02-17': { name: '春节', isHoliday: true }
      },
      source: 'remote-merged',
      expiresAt: 100
    })
  });
  const manager = new HolidayManager({
    fetchImpl: async () => {
      throw new Error('offline');
    },
    storage,
    now: () => 1_000
  });

  const holidays = await manager.fetchHolidays(2026);
  assert.equal(holidays['2026-02-17'].festival, 'springFestival');
  assert.equal(JSON.parse(storage.read(CACHE_KEY_2026)).source, 'stale-cache');
});

test('无网络且无缓存时提供固定公历日期兜底', async () => {
  const manager = new HolidayManager({
    fetchImpl: async () => {
      throw new Error('offline');
    },
    storage: null,
    now: () => 1_000
  });

  const holidays = await manager.fetchHolidays(2026);
  assert.deepEqual(Object.keys(holidays).sort(), [
    '2026-01-01',
    '2026-05-01',
    '2026-10-01'
  ]);
  assert.equal(holidays['2026-10-01'].festival, 'nationalDay');
});

test('损坏的持久化缓存会被移除且不会重复解析', () => {
  const warnings = [];
  const storage = createMemoryStorage({
    [CACHE_KEY_2026]: JSON.stringify({
      data: { bad: { name: '损坏数据', isHoliday: true } },
      expiresAt: 1000
    })
  });
  const manager = new HolidayManager({
    storage,
    fetchImpl: null,
    logger: { warn: (...args) => warnings.push(args) }
  });

  assert.deepEqual(manager.getHolidays(2026), {});
  assert.deepEqual(manager.getHolidays(2026), {});
  assert.equal(storage.calls.get, 1);
  assert.equal(storage.calls.remove, 1);
  assert.equal(warnings.length, 1);
});
