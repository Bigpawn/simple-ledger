import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryChartData } from '../src/utils/chartData.ts';

const palette = ['#3169DC', '#C83D39', '#138252'];
const data = (count) => Array.from({ length: count }, (_, i) => ({ categoryId: `cat-${i}`, name: `分类${i}`, icon: '📦', total: 10000 - i * 100, count: i + 1 }));

test('十个以内的分类完整保留，不改变输入', () => {
  for (const size of [0, 1, 10]) {
    const input = data(size);
    const original = structuredClone(input);
    const chart = categoryChartData(input, palette);
    assert.equal(chart.length, size);
    assert.deepEqual(chart.map(({ color, ...item }) => item), input);
    assert.deepEqual(input, original);
  }
});

test('超过十类时合并长尾，金额与笔数覆盖所有流水', () => {
  for (const size of [11, 18, 80]) {
    const input = data(size);
    const chart = categoryChartData(input, palette);
    assert.equal(chart.length, 10);
    assert.equal(chart.reduce((sum, item) => sum + item.total, 0), input.reduce((sum, item) => sum + item.total, 0));
    assert.equal(chart.reduce((sum, item) => sum + item.count, 0), input.reduce((sum, item) => sum + item.count, 0));
    assert.equal(chart[9].name, '其他分类');
    assert.deepEqual(chart.slice(0, 9).map((item) => item.categoryId), input.slice(0, 9).map((item) => item.categoryId));
  }
});
