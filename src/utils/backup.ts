import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import {
  exportAll,
  getSetting,
  saveSetting,
  type BackupData,
} from '@/db/repo';
import { buildBackupHealth, type BackupHealth } from './backupHealth';

const SNAPSHOT_FILE = 'ledger-auto-backup.json';
const SNAPSHOT_WEB_KEY = 'simple-ledger-auto-backup';
const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type { BackupHealth } from './backupHealth';

function snapshotFile(): File {
  return new File(Paths.document, SNAPSHOT_FILE);
}

async function writeSnapshot(data: BackupData): Promise<void> {
  const json = JSON.stringify(data);
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') throw new Error('STORAGE_UNAVAILABLE');
    localStorage.setItem(SNAPSHOT_WEB_KEY, json);
    return;
  }
  const file = snapshotFile();
  file.create({ overwrite: true, intermediates: true });
  file.write(json);
}

export async function readAutoSnapshot(): Promise<BackupData | null> {
  try {
    let text: string | null = null;
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return null;
      text = localStorage.getItem(SNAPSHOT_WEB_KEY);
    } else {
      text = await snapshotFile().text();
    }
    if (!text) return null;
    const data = JSON.parse(text) as BackupData;
    if (!Array.isArray(data.accounts) || !Array.isArray(data.transactions)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function createAutoSnapshot(force = false): Promise<boolean> {
  const lastSnapshotAt = await getSetting('lastSnapshotAt');
  if (!force && lastSnapshotAt) {
    const last = Date.parse(lastSnapshotAt);
    if (Number.isFinite(last) && Date.now() - last < SNAPSHOT_INTERVAL_MS) return false;
  }
  const data = await exportAll();
  await writeSnapshot(data);
  await saveSetting('lastSnapshotAt', new Date().toISOString());
  return true;
}

export async function getBackupHealth(): Promise<BackupHealth> {
  const [lastExportAt, lastSnapshotAt, snapshot] = await Promise.all([
    getSetting('lastBackupAt'),
    getSetting('lastSnapshotAt'),
    readAutoSnapshot(),
  ]);
  return buildBackupHealth(lastExportAt, lastSnapshotAt, !!snapshot);
}

export async function recordExternalBackup(): Promise<void> {
  await saveSetting('lastBackupAt', new Date().toISOString());
}
