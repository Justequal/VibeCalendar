const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HolidayManager,
  fetchJson,
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
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
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

test('读取热点年份会更新淘汰顺序，负缓存也有容量限制', async () => {
  const storage = createMemoryStorage();
  const manager = new HolidayManager({ storage, fetchImpl: null });
  for (let year = 2020; year < 2032; year += 1) await manager.fetchHolidays(year);
  const hot = manager.getHolidays(2020);
  await manager.fetchHolidays(2032);
  assert.strictEqual(manager.getHolidays(2020), hot);
  assert.equal(manager.cache.has(2021), false);
  assert.equal(manager.cache.size, 12);
  const reads = storage.calls.get;
  assert.ok(manager.getHolidays(2021)['2021-01-01']);
  assert.equal(storage.calls.get, reads + 1, '淘汰数据应可从磁盘恢复');
  for (let year = 2100; year < 2200; year += 1) manager.getHolidays(year);
  assert.ok(manager.hydratedYears.size <= 12);
  assert.ok(manager.cache.size <= 12);
});

test('离线刷新复用旧映射，恢复联网可立即重试而正常缓存仍有效', async () => {
  let now = 1_000;
  let online = false;
  let requests = 0;
  const manager = new HolidayManager({
    storage: null, now: () => now,
    fetchImpl: async (url) => {
      requests += 1;
      if (!online) throw new Error('offline');
      if (url.includes('timor.tech')) return okJson({ code: 0, holiday: {
        '02-17': { date: '2026-02-17', name: '春节', holiday: true }
      } });
      return okJson({ days: [{ date: '2026-02-17', name: '春节', isOffDay: true }] });
    }
  });
  const fallback = await manager.fetchHolidays(2026);
  now += 7 * 60 * 60 * 1000;
  assert.strictEqual(await manager.fetchHolidays(2026), fallback);
  assert.equal(manager.cache.get(2026).source, 'stale-cache');
  online = true;
  const before = requests;
  assert.strictEqual(await manager.fetchHolidays(2026), fallback);
  assert.equal(requests, before);
  const restored = await manager.fetchHolidays(2026, { retryFallback: true });
  assert.equal(restored['2026-02-17'].festival, 'springFestival');
  assert.equal(requests, before + 3);
  await manager.fetchHolidays(2026, { retryFallback: true });
  assert.equal(requests, before + 3, '网络恢复事件不应绕过正常远端缓存');
});

test('首个有效镜像返回后取消慢镜像，独立提供方仍参与合并', async () => {
  let mirrorAborted = false;
  const manager = new HolidayManager({
    storage: null,
    fetchImpl: async (url, { signal }) => {
      if (url.includes('raw.githubusercontent.com')) {
        return { ok: true, json: () => new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            mirrorAborted = true;
            reject(new Error('cancelled'));
          }, { once: true });
        }) };
      }
      if (url.includes('timor.tech')) return okJson({ code: 0, holiday: {
        '10-01': { date: '2026-10-01', name: '国庆节', holiday: true }
      } });
      return okJson({ days: [{ date: '2026-01-01', name: '元旦', isOffDay: true }] });
    }
  });
  const data = await manager.fetchHolidays(2026);
  assert.equal(mirrorAborted, true);
  assert.equal(data['2026-01-01'].festival, 'newYear');
  assert.equal(data['2026-10-01'].festival, 'nationalDay');
  assert.equal(manager.pendingRequests.size, 0);
});

test('响应体超时会取消读取，失败任务清理后可以重试', async () => {
  let aborted = false;
  await assert.rejects(fetchJson('https://example.invalid', {
    timeout: 10,
    fetchImpl: async (_url, { signal }) => ({
      ok: true,
      json: () => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('body timeout'));
        }, { once: true });
      })
    })
  }), /body timeout/);
  assert.equal(aborted, true);
  assert.deepEqual(await fetchJson('https://example.invalid', {
    fetchImpl: async () => okJson({ recovered: true })
  }), { recovered: true });
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

test('跨年请求限制并发与队列，优先处理最新年份并释放跳过的调用', async () => {
  let active = 0;
  let peak = 0;
  const started = [];
  const gates = [];
  const manager = new HolidayManager({ storage: null, fetchImpl: null });
  manager.fetchAndCache = year => new Promise(resolve => {
    active += 1;
    peak = Math.max(peak, active);
    started.push(year);
    gates.push(() => { active -= 1; resolve({ year }); });
  });
  const requests = Array.from({ length: 50 }, (_, index) => manager.fetchHolidays(2000 + index));
  assert.equal(peak, 2);
  assert.equal(manager.pendingRequests.size, 6);
  assert.equal(manager.requestQueue.length, 4);
  while (gates.length) {
    gates.shift()();
    await new Promise(resolve => setImmediate(resolve));
  }
  await Promise.all(requests);
  assert.equal(peak, 2);
  assert.deepEqual(started.slice(0, 3), [2000, 2001, 2049]);
  assert.equal(started.length, 6);
  assert.equal(manager.pendingRequests.size, 0);
  assert.equal(manager.activeYears, 0);
});

test('磁盘缓存只保留24年且不删除用户偏好，部分源六小时后允许补全', async () => {
  const storage = createMemoryStorage({ 'vibe-calendar:preference:language': 'en' });
  const manager = new HolidayManager({ storage, fetchImpl: null, now: () => 1000 });
  for (let year = 2000; year < 2030; year += 1) await manager.fetchHolidays(year);
  assert.equal(storage.length, 25);
  assert.equal(storage.read('vibe-calendar:preference:language'), 'en');
  assert.ok(storage.read('vibe-calendar:holidays:v3:2029'));

  let now = 1000;
  let calls = 0;
  const partial = new HolidayManager({ storage: null, now: () => now, fetchImpl: async url => {
    calls += 1;
    if (url.includes('timor.tech')) throw new Error('unavailable');
    return okJson({ days: [{ date: '2026-01-01', name: '元旦', isOffDay: true }] });
  } });
  await partial.fetchHolidays(2026);
  assert.equal(partial.cache.get(2026).expiresAt, now + 6 * 60 * 60 * 1000);
  await partial.fetchHolidays(2026);
  assert.equal(calls, 3);
  now += 6 * 60 * 60 * 1000;
  await partial.fetchHolidays(2026);
  assert.equal(calls, 6);
});
