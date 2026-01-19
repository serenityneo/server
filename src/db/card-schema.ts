/**
 * CARD REQUEST SCHEMA
 * Tables for managing card types and card requests
 * 
 * Flow:
 * 1. Customer completes KYC2 → becomes eligible for card
 * 2. Customer selects card type and payment method
 * 3. Payment via Mobile Money or S01 account deduction
 * 4. Admin reviews and approves/rejects
 * 5. Card is prepared and marked as ready
 * 6. Customer picks up card (delivered)
 */

import { pgTable, serial, text, varchar, numeric, boolean, timestamp, integer, index, foreignKey, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customers } from "./schema";

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Card Request Status
 * - PENDING: Request submitted, awaiting payment
 * - PAYMENT_PENDING: Awaiting payment confirmation
 * - PAID: Payment received, awaiting admin review
 * - PROCESSING: Admin approved, card being prepared
 * - READY: Card is ready for pickup
 * - DELIVERED: Card has been delivered to customer
 * - REJECTED: Request rejected by admin
 * - CANCELLED: Request cancelled by customer
 */
export const cardRequestStatus = pgEnum("CardRequestStatus", [
  'PENDING',
  'PAYMENT_PENDING', 
  'PAID',
  'PROCESSING',
  'READY',
  'DELIVERED',
  'REJECTED',
  'CANCELLED'
]);

/**
 * Card Payment Method
 * - MOBILE_MONEY: Payment via M-Pesa, Airtel Money, Orange Money
 * - S01_ACCOUNT: Deduction from S01 standard account balance
 */
export const cardPaymentMethod = pgEnum("CardPaymentMethod", [
  'MOBILE_MONEY',
  'S01_ACCOUNT'
]);

/**
 * Mobile Money Provider
 */
export const mobileMoneyProvider = pgEnum("MobileMoneyProvider", [
  'MPESA',
  'AIRTEL_MONEY',
  'ORANGE_MONEY',
  'AFRIMONEY'
]);

// ============================================================================
// CARD TYPES TABLE
// ============================================================================

/**
 * Card Types Catalog
 * Different types of cards available for customers
 */
export const cardTypes = pgTable("card_types", {
  id: serial("id").primaryKey().notNull(),
  
  // Card Type Identification
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  
  // Pricing
  priceUsd: numeric("price_usd", { precision: 10, scale: 2 }).notNull(),
  priceCdf: numeric("price_cdf", { precision: 15, scale: 2 }).notNull(),
  
  // Design
  imageUrl: text("image_url"),
  cardColor: varchar("card_color", { length: 20 }).default('#5C4033'),
  
  // Features
  features: text("features"), // JSON array of features
  
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  
  // Timestamps
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("card_types_code_key").using("btree", table.code.asc().nullsLast().op("text_ops")),
]);

// ============================================================================
// CARD REQUESTS TABLE
// ============================================================================

/**
 * Card Requests
 * Customer card request and status tracking
 */
export const cardRequests = pgTable("card_requests", {
  id: serial("id").primaryKey().notNull(),
  
  // References
  customerId: integer("customer_id").notNull(),
  cardTypeId: integer("card_type_id").notNull(),
  
  // Request Reference
  requestNumber: varchar("request_number", { length: 30 }).notNull().unique(),
  
  // Payment Information
  paymentMethod: cardPaymentMethod("payment_method").notNull(),
  mobileMoneyProvider: mobileMoneyProvider("mobile_money_provider"),
  mobileMoneyNumber: varchar("mobile_money_number", { length: 20 }),
  paymentReference: varchar("payment_reference", { length: 100 }),
  
  // Amount
  amountUsd: numeric("amount_usd", { precision: 10, scale: 2 }).notNull(),
  amountCdf: numeric("amount_cdf", { precision: 15, scale: 2 }).notNull(),
  currencyPaid: varchar("currency_paid", { length: 3 }).default('USD'),
  
  // Card Details (filled after approval)
  cardNumber: varchar("card_number", { length: 20 }),
  cardExpiryDate: varchar("card_expiry_date", { length: 7 }), // MM/YYYY
  
  // Status
  status: cardRequestStatus("status").default('PENDING').notNull(),
  
  // Admin Actions
  reviewedById: integer("reviewed_by_id"),
  reviewNote: text("review_note"),
  rejectionReason: text("rejection_reason"),
  
  // Timestamps
  requestedAt: timestamp("requested_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  paidAt: timestamp("paid_at", { precision: 3, mode: 'string' }),
  approvedAt: timestamp("approved_at", { precision: 3, mode: 'string' }),
  readyAt: timestamp("ready_at", { precision: 3, mode: 'string' }),
  deliveredAt: timestamp("delivered_at", { precision: 3, mode: 'string' }),
  rejectedAt: timestamp("rejected_at", { precision: 3, mode: 'string' }),
  cancelledAt: timestamp("cancelled_at", { precision: 3, mode: 'string' }),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("card_requests_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("card_requests_card_type_id_idx").using("btree", table.cardTypeId.asc().nullsLast().op("int4_ops")),
  index("card_requests_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
  index("card_requests_requested_at_idx").using("btree", table.requestedAt.desc().nullsLast().op("timestamp_ops")),
  uniqueIndex("card_requests_request_number_key").using("btree", table.requestNumber.asc().nullsLast().op("text_ops")),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "card_requests_customer_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

// ============================================================================
// CARD PAYMENTS TABLE
// ============================================================================

/**
 * Card Payments
 * Track all payments for card requests (for revenue reporting)
 */
export const cardPayments = pgTable("card_payments", {
  id: serial("id").primaryKey().notNull(),
  
  // References
  cardRequestId: integer("card_request_id").notNull(),
  customerId: integer("customer_id").notNull(),
  
  // Payment Details
  paymentMethod: cardPaymentMethod("payment_method").notNull(),
  mobileMoneyProvider: mobileMoneyProvider("mobile_money_provider"),
  
  // Amounts
  amountUsd: numeric("amount_usd", { precision: 10, scale: 2 }).notNull(),
  amountCdf: numeric("amount_cdf", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default('USD'),
  
  // Transaction Reference
  transactionReference: varchar("transaction_reference", { length: 100 }),
  externalReference: varchar("external_reference", { length: 100 }), // Mobile Money reference
  
  // Status
  status: varchar("status", { length: 20 }).default('PENDING').notNull(), // PENDING, COMPLETED, FAILED, REFUNDED
  
  // S01 Deduction Details
  s01AccountId: integer("s01_account_id"),
  s01TransactionId: integer("s01_transaction_id"),
  
  // Timestamps
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at", { precision: 3, mode: 'string' }),
  failedAt: timestamp("failed_at", { precision: 3, mode: 'string' }),
  failureReason: text("failure_reason"),
}, (table) => [
  index("card_payments_card_request_id_idx").using("btree", table.cardRequestId.asc().nullsLast().op("int4_ops")),
  index("card_payments_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("card_payments_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
  index("card_payments_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
  foreignKey({
    columns: [table.cardRequestId],
    foreignColumns: [cardRequests.id],
    name: "card_payments_card_request_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "card_payments_customer_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type CardType = typeof cardTypes.$inferSelect;
export type NewCardType = typeof cardTypes.$inferInsert;

export type CardRequest = typeof cardRequests.$inferSelect;
export type NewCardRequest = typeof cardRequests.$inferInsert;

export type CardPayment = typeof cardPayments.$inferSelect;
export type NewCardPayment = typeof cardPayments.$inferInsert;

export type CardRequestStatusType = typeof cardRequestStatus.enumValues[number];
export type CardPaymentMethodType = typeof cardPaymentMethod.enumValues[number];
export type MobileMoneyProviderType = typeof mobileMoneyProvider.enumValues[number];
