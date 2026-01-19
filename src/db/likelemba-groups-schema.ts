/**
 * DRIZZLE ORM SCHEMA - GROUPES LIKÉLEMBA (TONTINE)
 * Système de groupes d'épargne tournante
 */

import { pgTable, serial, integer, numeric, text, timestamp, boolean, jsonb, index, foreignKey, uniqueIndex, pgEnum, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customers } from "./schema";

// ===== ENUMS =====
export const groupStatus = pgEnum("group_status", [
  'PENDING_APPROVAL',
  'APPROVED',
  'PENDING_MEMBERS',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED'
]);

export const memberStatus = pgEnum("member_status", [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXITED'
]);

export const invitationStatus = pgEnum("invitation_status", [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED'
]);

export const distributionMethod = pgEnum("distribution_method", [
  'LOTTERY',
  'BIDDING',
  'ROTATION',
  'NEED_BASED'
]);

// ===== TABLE PRINCIPALE: GROUPES =====
export const likElementbaGroups = pgTable("likelemba_groups", {
  id: serial().primaryKey().notNull(),
  creatorId: integer("creator_id").notNull(),
  
  // Informations groupe
  groupName: varchar("group_name", { length: 200 }).notNull(),
  groupDescription: text("group_description"),
  
  // Configuration financière
  monthlyContributionUsd: numeric("monthly_contribution_usd", { precision: 15, scale: 2 }).notNull(),
  monthlyContributionCdf: numeric("monthly_contribution_cdf", { precision: 15, scale: 2 }).default('0'),
  currency: varchar({ length: 3 }).notNull().default('USD'),
  
  // Membres
  totalMembers: integer("total_members").notNull(),
  currentMembers: integer("current_members").default(1),
  minMembers: integer("min_members").default(3),
  maxMembers: integer("max_members").default(50),
  
  // Durée
  durationMonths: integer("duration_months").notNull().default(12),
  currentRound: integer("current_round").default(1),
  totalRounds: integer("total_rounds"),
  
  // Calculs
  totalFundPerRound: numeric("total_fund_per_round", { precision: 15, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 5, scale: 2 }).default('0.50'),
  totalInterestPerRound: numeric("total_interest_per_round", { precision: 15, scale: 2 }),
  
  // Méthode de distribution
  distributionMethod: distributionMethod().default('LOTTERY'),
  
  // Status
  status: groupStatus().default('PENDING_APPROVAL'),
  isActive: boolean("is_active").default(false),
  
  // Admin approval
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at", { precision: 3, mode: 'string' }),
  rejectedBy: integer("rejected_by"),
  rejectedAt: timestamp("rejected_at", { precision: 3, mode: 'string' }),
  rejectionReason: text("rejection_reason"),
  
  // Dates
  startDate: timestamp("start_date", { precision: 3, mode: 'string' }),
  endDate: timestamp("end_date", { precision: 3, mode: 'string' }),
  nextDistributionDate: timestamp("next_distribution_date", { precision: 3, mode: 'string' }),
  
  // Règles
  latePaymentPenaltyRate: numeric("late_payment_penalty_rate", { precision: 5, scale: 2 }).default('2.00'),
  maxMissedPayments: integer("max_missed_payments").default(2),
  allowEarlyExit: boolean("allow_early_exit").default(false),
  exitPenaltyPercentage: numeric("exit_penalty_percentage", { precision: 5, scale: 2 }).default('10.00'),
  
  // Metadata
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_groups_creator").using("btree", table.creatorId.asc().nullsLast().op("int4_ops")),
  index("idx_groups_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
  index("idx_groups_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
  foreignKey({
    columns: [table.creatorId],
    foreignColumns: [customers.id],
    name: "fk_group_creator"
  }).onDelete("restrict"),
]);

// ===== MEMBRES DU GROUPE =====
export const likelembaMembers = pgTable("likelemba_members", {
  id: serial().primaryKey().notNull(),
  groupId: integer("group_id").notNull(),
  customerId: integer("customer_id").notNull(),
  
  // Statut
  status: memberStatus().default('PENDING'),
  isCreator: boolean("is_creator").default(false),
  isActive: boolean("is_active").default(true),
  
  // Participation
  joinedAt: timestamp("joined_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  exitedAt: timestamp("exited_at", { precision: 3, mode: 'string' }),
  
  // Position dans le tirage
  drawPosition: integer("draw_position"),
  hasReceivedFund: boolean("has_received_fund").default(false),
  receivedFundRound: integer("received_fund_round"),
  receivedFundDate: timestamp("received_fund_date", { precision: 3, mode: 'string' }),
  receivedAmountUsd: numeric("received_amount_usd", { precision: 15, scale: 2 }),
  receivedAmountCdf: numeric("received_amount_cdf", { precision: 15, scale: 2 }),
  
  // Paiements
  totalContributionsUsd: numeric("total_contributions_usd", { precision: 15, scale: 2 }).default('0'),
  totalContributionsCdf: numeric("total_contributions_cdf", { precision: 15, scale: 2 }).default('0'),
  totalPenaltiesUsd: numeric("total_penalties_usd", { precision: 15, scale: 2 }).default('0'),
  totalPenaltiesCdf: numeric("total_penalties_cdf", { precision: 15, scale: 2 }).default('0'),
  missedPaymentsCount: integer("missed_payments_count").default(0),
  
  // Metadata
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_members_group").using("btree", table.groupId.asc().nullsLast().op("int4_ops")),
  index("idx_members_customer").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  uniqueIndex("unique_group_customer").using("btree", table.groupId.asc().nullsLast().op("int4_ops"), table.customerId.asc().nullsLast().op("int4_ops")),
  foreignKey({
    columns: [table.groupId],
    foreignColumns: [likElementbaGroups.id],
    name: "fk_member_group"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "fk_member_customer"
  }).onDelete("cascade"),
]);

// ===== INVITATIONS =====
export const likelembaInvitations = pgTable("likelemba_invitations", {
  id: serial().primaryKey().notNull(),
  groupId: integer("group_id").notNull(),
  
  // Invité (peut ne pas être encore client)
  invitedCustomerId: integer("invited_customer_id"),
  invitedName: varchar("invited_name", { length: 200 }),
  invitedEmail: varchar("invited_email", { length: 200 }),
  invitedPhone: varchar("invited_phone", { length: 50 }),
  
  // Inviteur
  invitedBy: integer("invited_by").notNull(),
  
  // Statut
  status: invitationStatus().default('PENDING'),
  
  // Token pour acceptation
  invitationToken: varchar("invitation_token", { length: 100 }),
  expiresAt: timestamp("expires_at", { precision: 3, mode: 'string' }),
  
  // Réponse
  respondedAt: timestamp("responded_at", { precision: 3, mode: 'string' }),
  rejectionReason: text("rejection_reason"),
  
  // Metadata
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_invitations_group").using("btree", table.groupId.asc().nullsLast().op("int4_ops")),
  index("idx_invitations_customer").using("btree", table.invitedCustomerId.asc().nullsLast().op("int4_ops")),
  index("idx_invitations_email").using("btree", table.invitedEmail.asc().nullsLast().op("text_ops")),
  foreignKey({
    columns: [table.groupId],
    foreignColumns: [likElementbaGroups.id],
    name: "fk_invitation_group"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.invitedBy],
    foreignColumns: [customers.id],
    name: "fk_invitation_inviter"
  }).onDelete("cascade"),
]);

// ===== CONTRIBUTIONS MENSUELLES =====
export const likelembaContributions = pgTable("likelemba_contributions", {
  id: serial().primaryKey().notNull(),
  groupId: integer("group_id").notNull(),
  memberId: integer("member_id").notNull(),
  customerId: integer("customer_id").notNull(),
  
  // Période
  roundNumber: integer("round_number").notNull(),
  contributionMonth: timestamp("contribution_month", { mode: 'date' }).notNull(),
  dueDate: timestamp("due_date", { mode: 'date' }).notNull(),
  
  // Montants
  expectedAmountUsd: numeric("expected_amount_usd", { precision: 15, scale: 2 }).notNull(),
  expectedAmountCdf: numeric("expected_amount_cdf", { precision: 15, scale: 2 }).default('0'),
  paidAmountUsd: numeric("paid_amount_usd", { precision: 15, scale: 2 }).default('0'),
  paidAmountCdf: numeric("paid_amount_cdf", { precision: 15, scale: 2 }).default('0'),
  
  // Pénalités
  penaltyAmountUsd: numeric("penalty_amount_usd", { precision: 15, scale: 2 }).default('0'),
  penaltyAmountCdf: numeric("penalty_amount_cdf", { precision: 15, scale: 2 }).default('0'),
  daysLate: integer("days_late").default(0),
  
  // Statut
  isPaid: boolean("is_paid").default(false),
  isLate: boolean("is_late").default(false),
  paidAt: timestamp("paid_at", { precision: 3, mode: 'string' }),
  
  // Transaction
  transactionId: integer("transaction_id"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  
  // Metadata
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_contributions_group").using("btree", table.groupId.asc().nullsLast().op("int4_ops")),
  index("idx_contributions_member").using("btree", table.memberId.asc().nullsLast().op("int4_ops")),
  index("idx_contributions_round").using("btree", table.roundNumber.asc().nullsLast().op("int4_ops")),
  index("idx_contributions_due_date").using("btree", table.dueDate.asc().nullsLast().op("date_ops")),
  uniqueIndex("unique_member_round").using("btree", table.memberId.asc().nullsLast().op("int4_ops"), table.roundNumber.asc().nullsLast().op("int4_ops")),
  foreignKey({
    columns: [table.groupId],
    foreignColumns: [likElementbaGroups.id],
    name: "fk_contribution_group"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.memberId],
    foreignColumns: [likelembaMembers.id],
    name: "fk_contribution_member"
  }).onDelete("cascade"),
]);

// ===== DISTRIBUTIONS (TIRAGES) =====
export const likelembaDistributions = pgTable("likelemba_distributions", {
  id: serial().primaryKey().notNull(),
  groupId: integer("group_id").notNull(),
  roundNumber: integer("round_number").notNull(),
  
  // Gagnant
  winnerId: integer("winner_id").notNull(),
  winnerCustomerId: integer("winner_customer_id").notNull(),
  
  // Montants
  distributedAmountUsd: numeric("distributed_amount_usd", { precision: 15, scale: 2 }).notNull(),
  distributedAmountCdf: numeric("distributed_amount_cdf", { precision: 15, scale: 2 }).default('0'),
  interestAmountUsd: numeric("interest_amount_usd", { precision: 15, scale: 2 }).default('0'),
  interestAmountCdf: numeric("interest_amount_cdf", { precision: 15, scale: 2 }).default('0'),
  totalDistributedUsd: numeric("total_distributed_usd", { precision: 15, scale: 2 }).notNull(),
  totalDistributedCdf: numeric("total_distributed_cdf", { precision: 15, scale: 2 }).default('0'),
  
  // Méthode
  distributionMethod: distributionMethod().notNull(),
  lotteryDetails: jsonb("lottery_details"),
  biddingDetails: jsonb("bidding_details"),
  
  // Statut
  isCompleted: boolean("is_completed").default(false),
  isPaid: boolean("is_paid").default(false),
  
  // Dates
  distributionDate: timestamp("distribution_date", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  paidAt: timestamp("paid_at", { precision: 3, mode: 'string' }),
  
  // Transaction
  transactionId: integer("transaction_id"),
  
  // Metadata
  notes: text(),
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_distributions_group").using("btree", table.groupId.asc().nullsLast().op("int4_ops")),
  index("idx_distributions_round").using("btree", table.roundNumber.asc().nullsLast().op("int4_ops")),
  index("idx_distributions_winner").using("btree", table.winnerId.asc().nullsLast().op("int4_ops")),
  uniqueIndex("unique_group_round").using("btree", table.groupId.asc().nullsLast().op("int4_ops"), table.roundNumber.asc().nullsLast().op("int4_ops")),
  foreignKey({
    columns: [table.groupId],
    foreignColumns: [likElementbaGroups.id],
    name: "fk_distribution_group"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.winnerId],
    foreignColumns: [likelembaMembers.id],
    name: "fk_distribution_winner"
  }).onDelete("cascade"),
]);
