import * as SQLite from 'expo-sqlite';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './seed';
import {
  CATEGORY_TREE_VERSION,
  planCategoryTree,
  type CategoryType,
} from './categoryTree';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((error) => {
      console.error('[db] migration failed', String(error));
      throw error;
    });
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('ledger.db');
  let step = 'open';
  try {
  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const version = versionRow?.user_version ?? 0;
  step = 'pragmas';
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  if (version < 1) {
    step = 'v1-create';
    await db.execAsync(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        initial_balance INTEGER NOT NULL DEFAULT 0,
        sort INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('expense','income')),
        monthly_budget INTEGER,
        sort INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE transactions (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
        amount INTEGER NOT NULL CHECK (amount > 0),
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        to_account_id TEXT REFERENCES accounts(id),
        date TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX idx_txn_date ON transactions(date);
      CREATE INDEX idx_txn_category ON transactions(category_id);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    step = 'v1-seed';
    await seedDefaults(db);
    step = 'v1-version';
    await db.execAsync('PRAGMA user_version = 1;');
  }
  if (version < 2) {
    step = 'v2-create';
    await db.execAsync(`
      CREATE TABLE recurring_rules (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
        amount INTEGER NOT NULL CHECK (amount > 0),
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        to_account_id TEXT REFERENCES accounts(id),
        note TEXT NOT NULL DEFAULT '',
        day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
        start_month TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE recurring_occurrences (
        id TEXT PRIMARY KEY NOT NULL,
        rule_id TEXT NOT NULL REFERENCES recurring_rules(id) ON DELETE CASCADE,
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','completed','skipped')),
        transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
        completed_at INTEGER,
        UNIQUE(rule_id, due_date)
      );

      CREATE INDEX idx_recurring_occurrence_status
        ON recurring_occurrences(status, due_date);

      CREATE TABLE budget_amounts (
        month TEXT NOT NULL,
        budget_key TEXT NOT NULL,
        amount INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (month, budget_key)
      );
    `);
    step = 'v2-backfill';
    await db.execAsync(`
      INSERT OR IGNORE INTO budget_amounts (month, budget_key, amount)
      SELECT strftime('%Y-%m','now','localtime'), '__total__', CAST(value AS INTEGER)
      FROM settings
      WHERE key = 'monthlyBudget' AND CAST(value AS INTEGER) > 0;

      INSERT OR IGNORE INTO budget_amounts (month, budget_key, amount)
      SELECT strftime('%Y-%m','now','localtime'), id, monthly_budget
      FROM categories
      WHERE monthly_budget IS NOT NULL AND monthly_budget > 0;
    `);
    step = 'v2-version';
    await db.execAsync('PRAGMA user_version = 2;');
  }
  if (version < 3) {
    step = 'v3';
    await addColumn(db, 'categories', 'parent_id', 'parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE');
    await addColumn(db, 'categories', 'icon_image', 'icon_image TEXT');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);');
    await db.execAsync('PRAGMA user_version = 3;');
  }

  if (version < 4) {
    step = 'v4';
    await addColumn(db, 'transactions', 'fee', 'fee INTEGER NOT NULL DEFAULT 0');
    await addColumn(db, 'transactions', 'discount', 'discount INTEGER NOT NULL DEFAULT 0');
    await addColumn(db, 'transactions', 'claim_status', 'claim_status TEXT');
    await addColumn(db, 'transactions', 'claim_account_id', 'claim_account_id TEXT');
    await addColumn(db, 'transactions', 'claim_txn_id', 'claim_txn_id TEXT');
    await addColumn(db, 'transactions', 'refund_of', 'refund_of TEXT REFERENCES transactions(id)');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_txn_refund ON transactions(refund_of);');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_txn_claim ON transactions(claim_status);');
    await db.execAsync('PRAGMA user_version = 4;');
  }
  if (version < 5) {
    step = 'v5';
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        sort INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS transaction_tags (
        transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (transaction_id, tag_id)
      );
      CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags(tag_id);
    `);
    await db.execAsync('PRAGMA user_version = 5;');
  }
  if (version < 6) {
    step = 'v6';
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS installments (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        principal INTEGER NOT NULL CHECK (principal > 0),
        periods INTEGER NOT NULL CHECK (periods > 0),
        fee INTEGER NOT NULL DEFAULT 0,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        start_month TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS installment_entries (
        id TEXT PRIMARY KEY NOT NULL,
        installment_id TEXT NOT NULL REFERENCES installments(id) ON DELETE CASCADE,
        period INTEGER NOT NULL,
        due_month TEXT NOT NULL,
        amount INTEGER NOT NULL,
        transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
        UNIQUE(installment_id, period)
      );
      CREATE INDEX IF NOT EXISTS idx_installment_entries_plan
        ON installment_entries(installment_id, period);
    `);
    await db.execAsync('PRAGMA user_version = 6;');
  }

  step = 'category-tree';
  await ensureCategoryTree(db);
  return db;
  } catch (error) {
    console.error('[db] migration failed at step=' + step, String(error));
    throw error;
  }
}

async function columnExists(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string
): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}

/** 幂等加列：上次迁移被中断时重跑不会因 duplicate column 卡死 */
async function addColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  if (await columnExists(db, table, column)) return;
  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

interface CategoryTreeRow {
  id: string;
  name: string;
  type: CategoryType;
  parent_id: string | null;
  icon_image: string | null;
}

/**
 * 把分类表对齐到两级树。幂等：只补不删，旧分类优先“挂靠”为父/子节点，
 * 因此升级后老流水仍指向原来的 id。
 */
export async function ensureCategoryTree(db: SQLite.SQLiteDatabase): Promise<void> {
  const seeded = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'categoryTreeVersion'"
  );
  if (seeded?.value === CATEGORY_TREE_VERSION) return;

  const rows = await db.getAllAsync<CategoryTreeRow>(
    'SELECT id, name, type, parent_id, icon_image FROM categories'
  );
  const plan = planCategoryTree(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      parentId: r.parent_id,
      iconImage: r.icon_image,
    }))
  );

  // 先插入新分类，再挂靠旧分类：子分类的 parent_id 可能指向本次新建的父分类，
  // 顺序反了会触发外键失败（web 上表现为 finalize 错误）。
  for (const i of plan.inserts) {
    await db.runAsync(
      `INSERT OR IGNORE INTO categories
        (id, name, icon, type, monthly_budget, sort, parent_id, icon_image)
       VALUES (?,?,?,?,?,?,?,?)`,
      [i.id, i.name, i.emoji, i.type, null, i.sort, i.parentId, i.iconImage]
    );
  }
  for (const u of plan.updates) {
    await db.runAsync(
      'UPDATE categories SET name=?, parent_id=?, sort=?, icon_image=? WHERE id=?',
      [u.name, u.parentId, u.sort, u.iconImage, u.id]
    );
  }
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
    'categoryTreeVersion',
    CATEGORY_TREE_VERSION,
  ]);
}

async function seedDefaults(db: SQLite.SQLiteDatabase) {
  for (const [i, acc] of DEFAULT_ACCOUNTS.entries()) {
    await db.runAsync(
      'INSERT INTO accounts (id, name, icon, initial_balance, sort) VALUES (?,?,?,?,?)',
      [acc.id, acc.name, acc.icon, acc.initialBalance, i]
    );
  }
  for (const [i, cat] of DEFAULT_CATEGORIES.entries()) {
    await db.runAsync(
      'INSERT INTO categories (id, name, icon, type, monthly_budget, sort) VALUES (?,?,?,?,?,?)',
      [cat.id, cat.name, cat.icon, cat.type, cat.monthlyBudget, i]
    );
  }
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?,?)',
    ['monthlyBudget', '0']
  );
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?,?)',
    ['defaultAccountId', DEFAULT_ACCOUNTS[0].id]
  );
}
