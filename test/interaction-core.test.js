const { test } = require('node:test');
const assert = require('node:assert/strict');
const InteractionCore = require('../src/renderer/interaction-core');

test('像素滚轮会保留不足一行的余量', () => {
  const accumulator = InteractionCore.createWheelRowAccumulator();

  assert.equal(accumulator.push(40, InteractionCore.DOM_DELTA_PIXEL), 0);
  assert.equal(accumulator.push(60, InteractionCore.DOM_DELTA_PIXEL), 1);
});

test('快速滚轮按完整幅度移动多行，不会被压缩为一行', () => {
  const accumulator = InteractionCore.createWheelRowAccumulator();

  assert.equal(accumulator.push(350, InteractionCore.DOM_DELTA_PIXEL), 3);
  assert.equal(accumulator.push(50, InteractionCore.DOM_DELTA_PIXEL), 1);
  assert.equal(accumulator.push(-600, InteractionCore.DOM_DELTA_PIXEL), -6);
});

test('行模式和页面模式会换算成一致的日历行数', () => {
  const accumulator = InteractionCore.createWheelRowAccumulator();

  assert.equal(accumulator.push(6, InteractionCore.DOM_DELTA_LINE), 2);
  assert.equal(accumulator.push(2, InteractionCore.DOM_DELTA_PAGE), 12);
});

test('无效滚轮数值不会污染后续累计', () => {
  const accumulator = InteractionCore.createWheelRowAccumulator();

  assert.equal(accumulator.push(Number.NaN), 0);
  assert.equal(accumulator.push(100), 1);
});
