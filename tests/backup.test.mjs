import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackupHealth } from '../src/utils/backupHealth.ts';

const day = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-10-19T12:00:00.000Z');

test('一天内的快照和三十天内的外部备份视为健康', () => {
  const health = buildBackupHealth(
    new Date(now - 5 * day).toISOString(),
    new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    true,
    now
  );
  assert.equal(health.snapshotStale, false);
  assert.equal(health.exportStale, false);
});

test('没有快照或外部备份时提示需要处理', () => {
  const health = buildBackupHealth(null, null, false, now);
  assert.equal(health.snapshotStale, true);
  assert.equal(health.exportStale, true);
});

test('快照超过一天、外部备份超过三十天时过期', () => {
  const health = buildBackupHealth(
    new Date(now - 31 * day).toISOString(),
    new Date(now - 25 * 60 * 60 * 1000).toISOString(),
    true,
    now
  );
  assert.equal(health.snapshotStale, true);
  assert.equal(health.exportStale, true);
});
