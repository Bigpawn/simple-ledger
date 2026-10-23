const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const EXPORT_WARNING_MS = 30 * 24 * 60 * 60 * 1000;

export interface BackupHealth {
  lastExportAt: string | null;
  lastSnapshotAt: string | null;
  hasSnapshot: boolean;
  snapshotStale: boolean;
  exportStale: boolean;
}

export function buildBackupHealth(
  lastExportAt: string | null,
  lastSnapshotAt: string | null,
  hasSnapshot: boolean,
  now = Date.now()
): BackupHealth {
  const snapshotTime = lastSnapshotAt ? Date.parse(lastSnapshotAt) : NaN;
  const exportTime = lastExportAt ? Date.parse(lastExportAt) : NaN;
  return {
    lastExportAt,
    lastSnapshotAt,
    hasSnapshot,
    snapshotStale:
      !hasSnapshot || !Number.isFinite(snapshotTime) || now - snapshotTime > SNAPSHOT_INTERVAL_MS,
    exportStale:
      !Number.isFinite(exportTime) || now - exportTime > EXPORT_WARNING_MS,
  };
}
