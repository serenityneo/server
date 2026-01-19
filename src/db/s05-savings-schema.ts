/**
 * S05 BUAKISA CARTE - DRIZZLE ORM SCHEMA
 * 
 * Système d'épargne programmée avec périodicité flexible
 * - Premier dépôt → Allocation système
 * - Dépôts suivants → Solde client
 * - Sortie anticipée → Pénalité 10% → S06
 */

import { pgTable, serial, integer, numeric, text, timestamp, boolean, index, foreignKey, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customers, accounts } from "./schema";

/**
 * Table: s05_savings_accounts
 * Comptes d'épargne programmée S05
 */
export const s05SavingsAccounts = pgTable("s05_savings_accounts", {
  id: serial().primaryKey().notNull(),
  customerId: integer("customer_id").notNull(),
  accountId: integer("account_id").notNull(),
  
  // Configuration
  periodicity: text().notNull(), // DAILY, WEEKLY, MONTHLY, YEARLY
  targetAmountCdf: numeric("target_amount_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  targetAmountUsd: numeric("target_amount_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  numberOfPeriods: integer("number_of_periods").notNull(),
  
  // Calculs automatiques
  allocationPercentage: numeric("allocation_percentage", { precision: 5, scale: 2 }).notNull(),
  allocationAmountCdf: numeric("allocation_amount_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  allocationAmountUsd: numeric("allocation_amount_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  balanceTargetCdf: numeric("balance_target_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  balanceTargetUsd: numeric("balance_target_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  amountPerPeriodCdf: numeric("amount_per_period_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  amountPerPeriodUsd: numeric("amount_per_period_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  
  // Tracking
  currentPeriod: integer("current_period").notNull().default(0),
  totalDepositedCdf: numeric("total_deposited_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  totalDepositedUsd: numeric("total_deposited_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  s05AllocationCdf: numeric("s05_allocation_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  s05AllocationUsd: numeric("s05_allocation_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  s05BalanceCdf: numeric("s05_balance_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  s05BalanceUsd: numeric("s05_balance_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  
  // Dates
  startDate: timestamp("start_date", { precision: 3, mode: 'string' }).notNull(),
  maturityDate: timestamp("maturity_date", { precision: 3, mode: 'string' }).notNull(),
  completedAt: timestamp("completed_at", { precision: 3, mode: 'string' }),
  terminatedAt: timestamp("terminated_at", { precision: 3, mode: 'string' }),
  
  // Statut
  status: text().notNull().default('ACTIVE'), // ACTIVE, COMPLETED, TERMINATED_EARLY
  
  // Pénalité
  earlyTerminationPenaltyCdf: numeric("early_termination_penalty_cdf", { precision: 15, scale: 2 }),
  earlyTerminationPenaltyUsd: numeric("early_termination_penalty_usd", { precision: 15, scale: 2 }),
  earlyTerminationReason: text("early_termination_reason"),
  
  // Métadonnées
  notes: text(),
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("idx_s05_customer").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("idx_s05_account").using("btree", table.accountId.asc().nullsLast().op("int4_ops")),
  index("idx_s05_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
  index("idx_s05_maturity_date").using("btree", table.maturityDate.asc().nullsLast().op("timestamp_ops")),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "fk_s05_customer"
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.accountId],
    foreignColumns: [accounts.id],
    name: "fk_s05_account"
  }).onDelete("restrict"),
]);

/**
 * Table: s05_deposits
 * Historique des dépôts S05
 */
export const s05Deposits = pgTable("s05_deposits", {
  id: serial().primaryKey().notNull(),
  savingsId: integer("savings_id").notNull(),
  customerId: integer("customer_id").notNull(),
  
  // Montant
  amountCdf: numeric("amount_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  amountUsd: numeric("amount_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  currency: text().notNull(), // CDF, USD
  
  // Destination
  goesTo: text("goes_to").notNull(), // ALLOCATION, BALANCE
  periodNumber: integer("period_number"),
  
  // Validation
  periodCompleted: boolean("period_completed").notNull().default(false),
  periodTargetMet: boolean("period_target_met").notNull().default(false),
  
  // Métadonnées
  depositMethod: text("deposit_method"),
  referenceNumber: text("reference_number"),
  notes: text(),
  
  depositDate: timestamp("deposit_date", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("idx_s05_deposits_savings").using("btree", table.savingsId.asc().nullsLast().op("int4_ops")),
  index("idx_s05_deposits_customer").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("idx_s05_deposits_date").using("btree", table.depositDate.desc().nullsLast().op("timestamp_ops")),
  index("idx_s05_deposits_period").using("btree", table.periodNumber.asc().nullsLast().op("int4_ops")),
  foreignKey({
    columns: [table.savingsId],
    foreignColumns: [s05SavingsAccounts.id],
    name: "fk_s05_deposit_savings"
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "fk_s05_deposit_customer"
  }).onDelete("restrict"),
]);

/**
 * Table: s05_period_tracking
 * Suivi des périodes d'épargne
 */
export const s05PeriodTracking = pgTable("s05_period_tracking", {
  id: serial().primaryKey().notNull(),
  savingsId: integer("savings_id").notNull(),
  periodNumber: integer("period_number").notNull(),
  
  // Objectifs
  targetAmountCdf: numeric("target_amount_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  targetAmountUsd: numeric("target_amount_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  depositedAmountCdf: numeric("deposited_amount_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  depositedAmountUsd: numeric("deposited_amount_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  
  // Statut
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at", { precision: 3, mode: 'string' }),
  
  // Dates
  periodStartDate: timestamp("period_start_date", { precision: 3, mode: 'string' }).notNull(),
  periodEndDate: timestamp("period_end_date", { precision: 3, mode: 'string' }).notNull(),
  
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("idx_s05_period_savings").using("btree", table.savingsId.asc().nullsLast().op("int4_ops")),
  index("idx_s05_period_number").using("btree", table.periodNumber.asc().nullsLast().op("int4_ops")),
  index("idx_s05_period_dates").using("btree", table.periodStartDate.asc().nullsLast().op("timestamp_ops"), table.periodEndDate.asc().nullsLast().op("timestamp_ops")),
  uniqueIndex("unique_savings_period").using("btree", table.savingsId.asc().nullsLast().op("int4_ops"), table.periodNumber.asc().nullsLast().op("int4_ops")),
  foreignKey({
    columns: [table.savingsId],
    foreignColumns: [s05SavingsAccounts.id],
    name: "fk_s05_period_savings"
  }).onDelete("cascade"),
]);

/**
 * Table: s05_withdrawals
 * Historique des retraits/terminaisons S05
 */
export const s05Withdrawals = pgTable("s05_withdrawals", {
  id: serial().primaryKey().notNull(),
  savingsId: integer("savings_id").notNull(),
  customerId: integer("customer_id").notNull(),
  
  // Type
  withdrawalType: text("withdrawal_type").notNull(), // MATURITY, EARLY_TERMINATION
  
  // Montants
  totalSavedCdf: numeric("total_saved_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  totalSavedUsd: numeric("total_saved_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  penaltyAmountCdf: numeric("penalty_amount_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  penaltyAmountUsd: numeric("penalty_amount_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  amountReturnedCdf: numeric("amount_returned_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  amountReturnedUsd: numeric("amount_returned_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  
  // Métadonnées
  reason: text(),
  approvedBy: integer("approved_by"),
  withdrawalDate: timestamp("withdrawal_date", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("idx_s05_withdrawals_savings").using("btree", table.savingsId.asc().nullsLast().op("int4_ops")),
  index("idx_s05_withdrawals_customer").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("idx_s05_withdrawals_date").using("btree", table.withdrawalDate.desc().nullsLast().op("timestamp_ops")),
  foreignKey({
    columns: [table.savingsId],
    foreignColumns: [s05SavingsAccounts.id],
    name: "fk_s05_withdrawal_savings"
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "fk_s05_withdrawal_customer"
  }).onDelete("restrict"),
]);
