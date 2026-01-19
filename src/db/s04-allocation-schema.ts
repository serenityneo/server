/**
 * S04 ALLOCATION SYSTEM - Database Schema Extension
 * 
 * Nouvelles tables pour gérer:
 * - Compte tampon d'allocation
 * - Whitelist/Blacklist des clients crédit
 * - Historique des remboursements
 * - Gestion automatique dette vs solde
 */

import { pgTable, serial, integer, numeric, text, timestamp, boolean, jsonb, index, foreignKey, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { customers, credits, accounts } from "./schema"

/**
 * Table: credit_allocations
 * Gère le compte tampon "Allocation" pour chaque crédit
 */
export const creditAllocations = pgTable("credit_allocations", {
  id: serial().primaryKey().notNull(),
  creditId: integer("credit_id").notNull(),
  customerId: integer("customer_id").notNull(),
  
  // Montants en CDF et USD
  requestedAmountCdf: numeric("requested_amount_cdf", { precision: 15, scale: 2 }).notNull(),
  requestedAmountUsd: numeric("requested_amount_usd", { precision: 15, scale: 2 }),
  
  // Frais prélevés (allocation)
  feeAmountCdf: numeric("fee_amount_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  feeAmountUsd: numeric("fee_amount_usd", { precision: 15, scale: 2 }).default('0'),
  feePercentage: numeric("fee_percentage", { precision: 5, scale: 2 }).default('10').notNull(), // 10% par défaut
  
  // Montant disponible dans S04 (après déduction frais)
  availableAmountCdf: numeric("available_amount_cdf", { precision: 15, scale: 2 }).notNull(),
  availableAmountUsd: numeric("available_amount_usd", { precision: 15, scale: 2 }),
  
  // Dette totale à rembourser
  totalDebtCdf: numeric("total_debt_cdf", { precision: 15, scale: 2 }).notNull(),
  totalDebtUsd: numeric("total_debt_usd", { precision: 15, scale: 2 }),
  
  // Dette restante (mise à jour à chaque remboursement)
  remainingDebtCdf: numeric("remaining_debt_cdf", { precision: 15, scale: 2 }).notNull(),
  remainingDebtUsd: numeric("remaining_debt_usd", { precision: 15, scale: 2 }),
  
  // Solde S04 (positif si remboursement > dette)
  s04BalanceCdf: numeric("s04_balance_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  s04BalanceUsd: numeric("s04_balance_usd", { precision: 15, scale: 2 }).default('0'),
  
  // Montant total récupéré dans allocation
  allocationBalanceCdf: numeric("allocation_balance_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  allocationBalanceUsd: numeric("allocation_balance_usd", { precision: 15, scale: 2 }).default('0'),
  
  // Statut
  status: text().default('ACTIVE').notNull(), // ACTIVE, REPAID, DEFAULTED
  
  // Compte S04 lié
  s04AccountId: integer("s04_account_id"),
  
  // Dates
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  fullyRepaidAt: timestamp("fully_repaid_at", { precision: 3, mode: 'string' }),
}, (table) => [
  index("credit_allocations_credit_id_idx").using("btree", table.creditId.asc().nullsLast().op("int4_ops")),
  index("credit_allocations_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("credit_allocations_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
  foreignKey({
    columns: [table.creditId],
    foreignColumns: [credits.id],
    name: "credit_allocations_credit_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "credit_allocations_customer_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
  foreignKey({
    columns: [table.s04AccountId],
    foreignColumns: [accounts.id],
    name: "credit_allocations_s04_account_id_fkey"
  }).onUpdate("cascade").onDelete("set null"),
]);

/**
 * Table: credit_repayments
 * Historique détaillé de tous les remboursements
 */
export const creditRepayments = pgTable("credit_repayments", {
  id: serial().primaryKey().notNull(),
  allocationId: integer("allocation_id").notNull(),
  creditId: integer("credit_id").notNull(),
  customerId: integer("customer_id").notNull(),
  
  // Montant remboursé
  repaymentAmountCdf: numeric("repayment_amount_cdf", { precision: 15, scale: 2 }).notNull(),
  repaymentAmountUsd: numeric("repayment_amount_usd", { precision: 15, scale: 2 }),
  currency: text().notNull(), // CDF ou USD
  
  // Répartition du remboursement
  amountToDebtCdf: numeric("amount_to_debt_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  amountToDebtUsd: numeric("amount_to_debt_usd", { precision: 15, scale: 2 }).default('0'),
  amountToAllocationCdf: numeric("amount_to_allocation_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  amountToAllocationUsd: numeric("amount_to_allocation_usd", { precision: 15, scale: 2 }).default('0'),
  amountToBalanceCdf: numeric("amount_to_balance_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  amountToBalanceUsd: numeric("amount_to_balance_usd", { precision: 15, scale: 2 }).default('0'),
  
  // Solde avant/après
  debtBeforeCdf: numeric("debt_before_cdf", { precision: 15, scale: 2 }).notNull(),
  debtAfterCdf: numeric("debt_after_cdf", { precision: 15, scale: 2 }).notNull(),
  balanceBeforeCdf: numeric("balance_before_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  balanceAfterCdf: numeric("balance_after_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  
  // Métadonnées
  paymentMethod: text("payment_method"), // MOBILE_MONEY, BANK_TRANSFER, CASH
  referenceNumber: text("reference_number"),
  notes: text(),
  
  // Date de paiement
  paymentDate: timestamp("payment_date", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("credit_repayments_allocation_id_idx").using("btree", table.allocationId.asc().nullsLast().op("int4_ops")),
  index("credit_repayments_credit_id_idx").using("btree", table.creditId.asc().nullsLast().op("int4_ops")),
  index("credit_repayments_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("credit_repayments_payment_date_idx").using("btree", table.paymentDate.desc().nullsLast().op("timestamp_ops")),
  uniqueIndex("credit_repayments_reference_number_key").using("btree", table.referenceNumber.asc().nullsLast().op("text_ops")),
  foreignKey({
    columns: [table.allocationId],
    foreignColumns: [creditAllocations.id],
    name: "credit_repayments_allocation_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
  foreignKey({
    columns: [table.creditId],
    foreignColumns: [credits.id],
    name: "credit_repayments_credit_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "credit_repayments_customer_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
]);

/**
 * Table: customer_credit_status
 * Whitelist/Blacklist et scoring crédit
 */
export const customerCreditStatus = pgTable("customer_credit_status", {
  id: serial().primaryKey().notNull(),
  customerId: integer("customer_id").notNull(),
  
  // Statut crédit
  creditStatus: text("credit_status").default('WHITELISTED').notNull(), // WHITELISTED, BLACKLISTED, PROBATION
  
  // Scoring
  creditScore: numeric("credit_score", { precision: 5, scale: 2 }).default('100').notNull(), // 0-100
  
  // Statistiques
  totalCreditsRequested: integer("total_credits_requested").default(0).notNull(),
  totalCreditsApproved: integer("total_credits_approved").default(0).notNull(),
  totalCreditsCompleted: integer("total_credits_completed").default(0).notNull(),
  totalCreditsDefaulted: integer("total_credits_defaulted").default(0).notNull(),
  
  // Montants totaux
  totalAmountBorrowedCdf: numeric("total_amount_borrowed_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  totalAmountBorrowedUsd: numeric("total_amount_borrowed_usd", { precision: 15, scale: 2 }).default('0'),
  totalAmountRepaidCdf: numeric("total_amount_repaid_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  totalAmountRepaidUsd: numeric("total_amount_repaid_usd", { precision: 15, scale: 2 }).default('0'),
  
  // Performance
  averageRepaymentTimeDays: numeric("average_repayment_time_days", { precision: 10, scale: 2 }),
  onTimeRepaymentPercentage: numeric("on_time_repayment_percentage", { precision: 5, scale: 2 }).default('100'),
  
  // Blacklist info
  blacklistedAt: timestamp("blacklisted_at", { precision: 3, mode: 'string' }),
  blacklistReason: text("blacklist_reason"),
  blacklistBy: integer("blacklist_by"), // User ID qui a blacklisté
  
  // Whitelist restoration
  whitelistedAt: timestamp("whitelisted_at", { precision: 3, mode: 'string' }),
  whitelistBy: integer("whitelist_by"),
  
  // Metadata
  notes: text(),
  lastCreditApplicationDate: timestamp("last_credit_application_date", { precision: 3, mode: 'string' }),
  lastRepaymentDate: timestamp("last_repayment_date", { precision: 3, mode: 'string' }),
  
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("customer_credit_status_customer_id_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("customer_credit_status_credit_status_idx").using("btree", table.creditStatus.asc().nullsLast().op("text_ops")),
  index("customer_credit_status_credit_score_idx").using("btree", table.creditScore.desc().nullsLast().op("numeric_ops")),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "customer_credit_status_customer_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
]);

/**
 * Table: credit_status_history
 * Historique des changements de statut crédit (whitelist/blacklist)
 */
export const creditStatusHistory = pgTable("credit_status_history", {
  id: serial().primaryKey().notNull(),
  customerId: integer("customer_id").notNull(),
  
  previousStatus: text("previous_status"),
  newStatus: text("new_status").notNull(),
  
  previousScore: numeric("previous_score", { precision: 5, scale: 2 }),
  newScore: numeric("new_score", { precision: 5, scale: 2 }),
  
  reason: text().notNull(),
  changedBy: integer("changed_by"), // User ID
  changedByName: text("changed_by_name"),
  
  metadata: jsonb(), // Extra info
  
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("credit_status_history_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("credit_status_history_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "credit_status_history_customer_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
]);

/**
 * Table: system_credit_config
 * Configuration globale du système de crédit
 */
export const systemCreditConfig = pgTable("system_credit_config", {
  id: serial().primaryKey().notNull(),
  
  // Frais et taux
  defaultFeePercentage: numeric("default_fee_percentage", { precision: 5, scale: 2 }).default('10').notNull(),
  minFeePercentage: numeric("min_fee_percentage", { precision: 5, scale: 2 }).default('5').notNull(),
  maxFeePercentage: numeric("max_fee_percentage", { precision: 5, scale: 2 }).default('20').notNull(),
  
  // Seuils blacklist
  blacklistAfterDefaultedCredits: integer("blacklist_after_defaulted_credits").default(2).notNull(),
  blacklistAfterDaysOverdue: integer("blacklist_after_days_overdue").default(30).notNull(),
  minimumCreditScoreForApproval: numeric("minimum_credit_score_for_approval", { precision: 5, scale: 2 }).default('60').notNull(),
  
  // Auto-whitelist conditions
  autoWhitelistAfterDays: integer("auto_whitelist_after_days").default(90),
  autoWhitelistRequireFullRepayment: boolean("auto_whitelist_require_full_repayment").default(true).notNull(),
  
  // Toutes opérations S04 gratuites
  s04FeesEnabled: boolean("s04_fees_enabled").default(false).notNull(), // Toujours false (gratuit)
  
  isActive: boolean("is_active").default(true).notNull(),
  updatedBy: integer("updated_by"),
  
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});
