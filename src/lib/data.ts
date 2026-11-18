"use client";

import type { VendorRule } from "@/lib/postes";
import { TableStore } from "@/lib/store";
import type {
  AccessRow, AppRow, CommentRow, CountryVerdict, ExpenseFlag, MetaSpend, OsDaily, QontoBalance, QontoTx, RcCountryWeekly, RcDaily, SyncRun, Decision, Expense, ExpenseCheck, ExpenseRule, Item, Legal,
  LinkRow, MetricsSnapshot, PageRow, ProcessRow, Profile, ReadRow, Routine,
} from "@/lib/types";

// Une instance par table, partagée par toute l'app.
export const itemsStore = new TableStore<Item>("items", "id");
export const decisionsStore = new TableStore<Decision>("decisions", "id");
export const linksStore = new TableStore<LinkRow>("links", "id");
export const accessStore = new TableStore<AccessRow>("access", "id");
export const legalStore = new TableStore<Legal>("legal", "id");
export const checksStore = new TableStore<ExpenseCheck>("expense_checks", "anomaly_id");
export const metricsStore = new TableStore<MetricsSnapshot>("metrics_snapshots", "id");
export const processesStore = new TableStore<ProcessRow>("processes", "id");
export const routinesStore = new TableStore<Routine>("routines", "id");
export const pagesStore = new TableStore<PageRow>("pages", "id");
export const commentsStore = new TableStore<CommentRow>("comments", "id");
export const expensesStore = new TableStore<Expense>("expenses", "id");
export const expenseRulesStore = new TableStore<ExpenseRule>("expense_rules", "id");
export const profilesStore = new TableStore<Profile>("profiles", "id");
export const readsStore = new TableStore<ReadRow>("reads", "id");

// Données des vraies sources (écrites par le serveur, lues ici).
export const appsStore = new TableStore<AppRow>("apps", "key");
export const syncRunsStore = new TableStore<SyncRun>("sync_runs", "id");
export const rcDailyStore = new TableStore<RcDaily>("rc_daily", "date", (r) => `${r.date}|${r.app}`);
export const rcCountryStore = new TableStore<RcCountryWeekly>("rc_country_weekly", "week", (r) => `${r.week}|${r.app}|${r.country}`);
export const verdictsStore = new TableStore<CountryVerdict>("country_verdicts", "code");
export const qontoTxStore = new TableStore<QontoTx>("qonto_transactions", "id");
export const qontoBalanceStore = new TableStore<QontoBalance>("qonto_balance_daily", "date");
export const vendorRulesStore = new TableStore<VendorRule & Record<string, unknown>>("vendor_rules", "id");
export const flagsStore = new TableStore<ExpenseFlag>("expense_flags", "id");
export const metaStore = new TableStore<MetaSpend>("meta_spend_daily", "date", (r) => `${r.date}|${r.campaign_id}`);
export const osStore = new TableStore<OsDaily>("os_daily", "date", (r) => `${r.date}|${r.app}`);
