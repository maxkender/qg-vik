"use client";

import { TableStore } from "@/lib/store";
import type {
  AccessRow, CommentRow, Decision, Expense, ExpenseCheck, ExpenseRule, Item, Legal,
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
