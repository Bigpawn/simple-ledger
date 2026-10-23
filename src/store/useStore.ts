import { create } from 'zustand';
import {
  ensureCurrentBudgetSnapshot,
  listAccounts,
  listCategories,
  loadSettings,
} from '@/db/repo';
import type { Account, AppSettings, Category } from '@/db/types';

interface StoreState {
  ready: boolean;
  notice: string | null;
  accounts: Account[];
  categories: Category[];
  settings: AppSettings;
  /** 任何数据变更后自增，页面据此重新查询 */
  dataVersion: number;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  ready: false,
  notice: null,
  accounts: [],
  categories: [],
  settings: { monthlyBudget: 0, defaultAccountId: null },
  dataVersion: 0,

  init: async () => {
    if (get().ready) return;
    await get().refresh();
    set({ ready: true });
  },

  refresh: async () => {
    await ensureCurrentBudgetSnapshot();
    const [accounts, categories, settings] = await Promise.all([
      listAccounts(),
      listCategories(),
      loadSettings(),
    ]);
    set((s) => ({ accounts, categories, settings, dataVersion: s.dataVersion + 1 }));
  },
}));

export function accountById(id: string | null | undefined): Account | undefined {
  return useStore.getState().accounts.find((a) => a.id === id);
}

export function categoryById(id: string | null | undefined): Category | undefined {
  return useStore.getState().categories.find((c) => c.id === id);
}
