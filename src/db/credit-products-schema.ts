/**
 * DRIZZLE ORM SCHEMA - SYSTÈME CRÉDIT COMPLET
 * 5 Produits: BOMBÉ, TELEMA, MOPAO, VIMBISA, LIKELEMBA
 */

import { pgTable, serial, integer, numeric, text, timestamp, boolean, jsonb, index, foreignKey, uniqueIndex, pgEnum, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customers, accounts } from "./schema";

// ===== ENUMS =====
export const creditProductType = pgEnum("credit_product_type", [
  'BOMBE',
  'TELEMA',
  'MOPAO',
  'VIMBISA',
  'LIKELEMBA'
]);

export const creditLifecycleStatus = pgEnum("credit_lifecycle_status", [
  'ELIGIBILITY_CHECK',
  'DOCUMENTS_PENDING',
  'DOCUMENTS_SUBMITTED',
  'ADMIN_REVIEW',
  'CAUTION_PENDING',
  'APPROVED',
  'DISBURSED',
  'ACTIVE',
  'COMPLETED',
  'DEFAULTED',
  'VIRTUAL_PRISON',
  'LEGAL_PURSUIT',
  'CANCELLED'
]);

export const repaymentStatus = pgEnum("repayment_status", [
  'ON_TIME',
  'LATE',
  'PARTIALLY_PAID',
  'MISSED',
  'RECOVERED'
]);

// ===== TABLE PRINCIPALE: CRÉDITS =====
export const creditApplications = pgTable("credit_applications", {
  id: serial().primaryKey().notNull(),
  customerId: integer("customer_id").notNull(),
  productType: creditProductType("product_type").notNull(),
  
  // Montants
  requestedAmountCdf: numeric("requested_amount_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  requestedAmountUsd: numeric("requested_amount_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  approvedAmountCdf: numeric("approved_amount_cdf", { precision: 15, scale: 2 }),
  approvedAmountUsd: numeric("approved_amount_usd", { precision: 15, scale: 2 }),
  disbursedAmountCdf: numeric("disbursed_amount_cdf", { precision: 15, scale: 2 }),
  disbursedAmountUsd: numeric("disbursed_amount_usd", { precision: 15, scale: 2 }),
  
  // Frais et intérêts
  processingFeeCdf: numeric("processing_fee_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  processingFeeUsd: numeric("processing_fee_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  interestRate: numeric("interest_rate", { precision: 5, scale: 2 }).notNull().default('0'),
  totalInterestCdf: numeric("total_interest_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  totalInterestUsd: numeric("total_interest_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  
  // Durée
  durationMonths: integer("duration_months"),
  durationDays: integer("duration_days"),
  
  // Comptes liés
  s02AccountId: integer("s02_account_id"),
  s03CautionAccountId: integer("s03_caution_account_id"),
  s04CreditAccountId: integer("s04_credit_account_id"),
  
  // Caution
  cautionPercentage: numeric("caution_percentage", { precision: 5, scale: 2 }).notNull().default('30.00'),
  cautionAmountCdf: numeric("caution_amount_cdf", { precision: 15, scale: 2 }),
  cautionAmountUsd: numeric("caution_amount_usd", { precision: 15, scale: 2 }),
  cautionDeposited: boolean("caution_deposited").default(false),
  
  // Documents
  businessDocuments: jsonb("business_documents"),
  documentsValidated: boolean("documents_validated").default(false),
  documentsValidatorId: integer("documents_validator_id"),
  documentsValidationDate: timestamp("documents_validation_date", { precision: 3, mode: 'string' }),
  
  // Lifecycle
  status: creditLifecycleStatus().notNull().default('ELIGIBILITY_CHECK'),
  eligibilityCheckPassed: boolean("eligibility_check_passed").default(false),
  eligibilityReasons: text("eligibility_reasons").array(),
  
  // Remboursement
  monthlyPaymentCdf: numeric("monthly_payment_cdf", { precision: 15, scale: 2 }),
  monthlyPaymentUsd: numeric("monthly_payment_usd", { precision: 15, scale: 2 }),
  dailyPaymentCdf: numeric("daily_payment_cdf", { precision: 15, scale: 2 }),
  dailyPaymentUsd: numeric("daily_payment_usd", { precision: 15, scale: 2 }),
  totalPaidCdf: numeric("total_paid_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  totalPaidUsd: numeric("total_paid_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  remainingBalanceCdf: numeric("remaining_balance_cdf", { precision: 15, scale: 2 }),
  remainingBalanceUsd: numeric("remaining_balance_usd", { precision: 15, scale: 2 }),
  
  // Pénalités
  lateInterestRate: numeric("late_interest_rate", { precision: 5, scale: 2 }).default('5.00'),
  totalLateInterestCdf: numeric("total_late_interest_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  totalLateInterestUsd: numeric("total_late_interest_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  penaltyAmountCdf: numeric("penalty_amount_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  penaltyAmountUsd: numeric("penalty_amount_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  
  // Dates
  applicationDate: timestamp("application_date", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  approvalDate: timestamp("approval_date", { precision: 3, mode: 'string' }),
  disbursementDate: timestamp("disbursement_date", { precision: 3, mode: 'string' }),
  maturityDate: timestamp("maturity_date", { precision: 3, mode: 'string' }),
  completionDate: timestamp("completion_date", { precision: 3, mode: 'string' }),
  defaultDate: timestamp("default_date", { precision: 3, mode: 'string' }),
  
  // BOMBÉ spécifique
  isAutoRenewable: boolean("is_auto_renewable").default(false),
  renewalCount: integer("renewal_count").default(0),
  lastRenewalDate: timestamp("last_renewal_date", { precision: 3, mode: 'string' }),
  nextRenewalDate: timestamp("next_renewal_date", { precision: 3, mode: 'string' }),
  
  // MOPAO spécifique
  sponsorCustomerId: integer("sponsor_customer_id"),
  sponsoredCustomers: integer("sponsored_customers").array(),
  sponsorGuaranteePercentage: numeric("sponsor_guarantee_percentage", { precision: 5, scale: 2 }).default('40.00'),
  
  // Admin
  approvedBy: integer("approved_by"),
  notes: text(),
  
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_credit_applications_customer").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("idx_credit_applications_product").using("btree", table.productType.asc().nullsLast().op("text_ops")),
  index("idx_credit_applications_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
  index("idx_credit_applications_disbursement").using("btree", table.disbursementDate.desc().nullsLast().op("timestamp_ops")),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "fk_credit_customer"
  }).onDelete("restrict"),
]);

// ===== REMBOURSEMENTS =====
export const creditRepayments = pgTable("credit_repayments", {
  id: serial().primaryKey().notNull(),
  creditId: integer("credit_id").notNull(),
  customerId: integer("customer_id").notNull(),
  
  amountCdf: numeric("amount_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  amountUsd: numeric("amount_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  currency: varchar({ length: 3 }).notNull(),
  
  paymentType: varchar("payment_type", { length: 20 }).notNull(),
  isOnTime: boolean("is_on_time").default(true),
  
  dueDate: timestamp("due_date", { mode: 'date' }),
  paymentDate: timestamp("payment_date", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  daysLate: integer("days_late").default(0),
  
  status: repaymentStatus().notNull().default('ON_TIME'),
  
  paidFromAccountId: integer("paid_from_account_id"),
  autoDebitedFromS02: boolean("auto_debited_from_s02").default(false),
  autoDebitedFromS03: boolean("auto_debited_from_s03").default(false),
  
  referenceNumber: varchar("reference_number", { length: 100 }),
  notes: text(),
  
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_repayments_credit").using("btree", table.creditId.asc().nullsLast().op("int4_ops")),
  index("idx_repayments_customer").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("idx_repayments_due_date").using("btree", table.dueDate.asc().nullsLast().op("date_ops")),
  foreignKey({
    columns: [table.creditId],
    foreignColumns: [creditApplications.id],
    name: "fk_repayment_credit"
  }).onDelete("cascade"),
]);

// ===== NOTIFICATIONS =====
export const creditNotifications = pgTable("credit_notifications", {
  id: serial().primaryKey().notNull(),
  creditId: integer("credit_id").notNull(),
  customerId: integer("customer_id").notNull(),
  
  notificationType: varchar("notification_type", { length: 50 }).notNull(),
  title: varchar({ length: 200 }).notNull(),
  message: text().notNull(),
  
  sentViaSms: boolean("sent_via_sms").default(false),
  sentViaEmail: boolean("sent_via_email").default(false),
  sentViaPush: boolean("sent_via_push").default(false),
  
  isSent: boolean("is_sent").default(false),
  isRead: boolean("is_read").default(false),
  sentAt: timestamp("sent_at", { precision: 3, mode: 'string' }),
  readAt: timestamp("read_at", { precision: 3, mode: 'string' }),
  
  scheduledFor: timestamp("scheduled_for", { precision: 3, mode: 'string' }),
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_notifications_credit").using("btree", table.creditId.asc().nullsLast().op("int4_ops")),
  index("idx_notifications_customer").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("idx_notifications_scheduled").using("btree", table.scheduledFor.asc().nullsLast().op("timestamp_ops")),
  foreignKey({
    columns: [table.creditId],
    foreignColumns: [creditApplications.id],
    name: "fk_notification_credit"
  }).onDelete("cascade"),
]);

// ===== BOMBÉ RENEWAL HISTORY =====
export const bombeRenewalHistory = pgTable("bombe_renewal_history", {
  id: serial().primaryKey().notNull(),
  customerId: integer("customer_id").notNull(),
  previousCreditId: integer("previous_credit_id"),
  newCreditId: integer("new_credit_id").notNull(),
  
  amountUsd: numeric("amount_usd", { precision: 10, scale: 2 }).notNull(),
  renewalDate: timestamp("renewal_date", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  autoRenewed: boolean("auto_renewed").default(true),
  
  renewalBlocked: boolean("renewal_blocked").default(false),
  blockedReason: text("blocked_reason"),
  
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_renewal_customer").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("idx_renewal_date").using("btree", table.renewalDate.desc().nullsLast().op("timestamp_ops")),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "fk_renewal_customer"
  }).onDelete("cascade"),
]);

// ===== S02 DEPOSIT TRACKING =====
export const s02DepositTracking = pgTable("s02_deposit_tracking", {
  id: serial().primaryKey().notNull(),
  customerId: integer("customer_id").notNull(),
  s02AccountId: integer("s02_account_id").notNull(),
  
  depositDate: timestamp("deposit_date", { mode: 'date' }).notNull(),
  amountCdf: numeric("amount_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  amountUsd: numeric("amount_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  
  isConsecutive: boolean("is_consecutive").default(true),
  consecutiveDaysCount: integer("consecutive_days_count").default(1),
  consecutiveWeeksCount: integer("consecutive_weeks_count").default(1),
  
  transactionId: integer("transaction_id"),
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_s02_tracking_customer").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("idx_s02_tracking_date").using("btree", table.depositDate.desc().nullsLast().op("date_ops")),
  uniqueIndex("unique_customer_deposit_date").using("btree", table.customerId.asc().nullsLast().op("int4_ops"), table.depositDate.asc().nullsLast().op("date_ops")),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "fk_s02_tracking_customer"
  }).onDelete("cascade"),
]);

// ===== VIRTUAL PRISON =====
export const creditVirtualPrison = pgTable("credit_virtual_prison", {
  id: serial().primaryKey().notNull(),
  customerId: integer("customer_id").notNull(),
  creditId: integer("credit_id").notNull(),
  
  blockedReason: varchar("blocked_reason", { length: 100 }).notNull(),
  
  outstandingPrincipalCdf: numeric("outstanding_principal_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  outstandingPrincipalUsd: numeric("outstanding_principal_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  outstandingInterestCdf: numeric("outstanding_interest_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  outstandingInterestUsd: numeric("outstanding_interest_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  penaltyCdf: numeric("penalty_cdf", { precision: 15, scale: 2 }).notNull().default('0'),
  penaltyUsd: numeric("penalty_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  
  blockedSince: timestamp("blocked_since", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  releasedAt: timestamp("released_at", { precision: 3, mode: 'string' }),
  
  isActive: boolean("is_active").default(true),
  daysBlocked: integer("days_blocked").default(0),
  
  releaseConditions: text("release_conditions"),
  amountPaidToReleaseCdf: numeric("amount_paid_to_release_cdf", { precision: 15, scale: 2 }),
  amountPaidToReleaseUsd: numeric("amount_paid_to_release_usd", { precision: 15, scale: 2 }),
  
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_prison_customer").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("idx_prison_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "fk_prison_customer"
  }).onDelete("cascade"),
]);

// ===== MOPAO SPONSORSHIPS =====
export const mopaoSponsorships = pgTable("mopao_sponsorships", {
  id: serial().primaryKey().notNull(),
  sponsorCustomerId: integer("sponsor_customer_id").notNull(),
  sponsoredCustomerId: integer("sponsored_customer_id").notNull(),
  creditId: integer("credit_id").notNull(),
  
  sponsorGuaranteePercentage: numeric("sponsor_guarantee_percentage", { precision: 5, scale: 2 }).notNull().default('40.00'),
  sponsorGuaranteeAmountCdf: numeric("sponsor_guarantee_amount_cdf", { precision: 15, scale: 2 }).notNull(),
  sponsorGuaranteeAmountUsd: numeric("sponsor_guarantee_amount_usd", { precision: 15, scale: 2 }).notNull(),
  sponsorS02LockedAmountCdf: numeric("sponsor_s02_locked_amount_cdf", { precision: 15, scale: 2 }),
  sponsorS02LockedAmountUsd: numeric("sponsor_s02_locked_amount_usd", { precision: 15, scale: 2 }),
  
  isActive: boolean("is_active").default(true),
  sponsorLiabilityTriggered: boolean("sponsor_liability_triggered").default(false),
  sponsorPaidCdf: numeric("sponsor_paid_cdf", { precision: 15, scale: 2 }).default('0'),
  sponsorPaidUsd: numeric("sponsor_paid_usd", { precision: 15, scale: 2 }).default('0'),
  
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  releasedAt: timestamp("released_at", { precision: 3, mode: 'string' }),
}, (table) => [
  index("idx_sponsorships_sponsor").using("btree", table.sponsorCustomerId.asc().nullsLast().op("int4_ops")),
  index("idx_sponsorships_sponsored").using("btree", table.sponsoredCustomerId.asc().nullsLast().op("int4_ops")),
  foreignKey({
    columns: [table.sponsorCustomerId],
    foreignColumns: [customers.id],
    name: "fk_sponsorship_sponsor"
  }).onDelete("restrict"),
]);
