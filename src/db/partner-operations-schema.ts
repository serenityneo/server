/**
 * PARTNER KYC AND CARD MANAGEMENT SCHEMA
 * 
 * Additional tables for partner operations:
 * - partner_kyc_completions: Partner KYC completion tracking
 * - card_cancellation_requests: Card cancellation/renewal workflow
 * 
 * These extend the existing card_schema.ts
 */

import { pgTable, serial, text, varchar, numeric, boolean, timestamp, integer, index, foreignKey, pgEnum, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customers } from "./schema";
import { cardRequests } from "./card-schema";

// ============================================================================
// ENUMS
// ============================================================================

export const authorizationStatus = pgEnum("AuthorizationStatus", [
  'PENDING',
  'GRANTED',
  'EXPIRED',
  'DENIED',
  'REVOKED'
]);

export const kycCompletionStatus = pgEnum("KycCompletionStatus", [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED'
]);

export const reviewStatus = pgEnum("ReviewStatus", [
  'APPROVED',
  'REJECTED',
  'PENDING_REVIEW'
]);

export const cancellationRequestType = pgEnum("CancellationRequestType", [
  'CANCELLATION',
  'RENEWAL'
]);

export const urgencyLevel = pgEnum("UrgencyLevel", [
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT'
]);

export const cancellationRequestStatus = pgEnum("CancellationRequestStatus", [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'PROCESSED'
]);

// ============================================================================
// PARTNER KYC COMPLETIONS TABLE
// ============================================================================

/**
 * Partner KYC Completions
 * Tracks when partners complete KYC on behalf of customers
 */
export const partnerKycCompletions = pgTable("partner_kyc_completions", {
  id: serial("id").primaryKey().notNull(),
  
  // References
  partnerId: integer("partner_id").notNull().references(() => customers.id, { onDelete: 'restrict' }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: 'cascade' }),
  
  // Authorization tracking
  authorizationRequestedAt: timestamp("authorization_requested_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  authorizationGrantedAt: timestamp("authorization_granted_at", { precision: 3, mode: 'string' }),
  authorizationExpiresAt: timestamp("authorization_expires_at", { precision: 3, mode: 'string' }),
  authorizationStatus: text("authorization_status").default('PENDING').notNull(),
  authorizationToken: text("authorization_token").unique(),
  
  // KYC completion tracking
  kycStepCompleted: integer("kyc_step_completed"), // 1, 2, 3, 4
  completionStartedAt: timestamp("completion_started_at", { precision: 3, mode: 'string' }),
  completionFinishedAt: timestamp("completion_finished_at", { precision: 3, mode: 'string' }),
  completionStatus: text("completion_status").default('NOT_STARTED').notNull(),
  
  // Data
  dataFilled: jsonb("data_filled"),
  documentsUploaded: jsonb("documents_uploaded"),
  
  // Audit trail
  partnerIpAddress: text("partner_ip_address").notNull(),
  partnerUserAgent: text("partner_user_agent"),
  partnerDeviceInfo: jsonb("partner_device_info"),
  partnerLocationData: jsonb("partner_location_data"),
  partnerSessionId: text("partner_session_id"),
  applicationSource: text("application_source").default('WEB').notNull(),
  
  // Admin review
  reviewedByAdminId: integer("reviewed_by_admin_id"),
  reviewedAt: timestamp("reviewed_at", { precision: 3, mode: 'string' }),
  reviewStatus: text("review_status"),
  reviewNotes: text("review_notes"),
  rejectionReason: text("rejection_reason"),
  
  // Notification
  customerNotified: boolean("customer_notified").default(false),
  customerNotifiedAt: timestamp("customer_notified_at", { precision: 3, mode: 'string' }),
  notificationMethod: text("notification_method"),
  
  // Lock mechanism
  isLocked: boolean("is_locked").default(false),
  lockedUntil: timestamp("locked_until", { precision: 3, mode: 'string' }),
  lockReason: text("lock_reason"),
  
  // Metadata
  notes: text("notes"),
  metadata: jsonb("metadata"),
  
  // Timestamps
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("idx_partner_kyc_partner_id").using("btree", table.partnerId.asc().nullsLast().op("int4_ops")),
  index("idx_partner_kyc_customer_id").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("idx_partner_kyc_authorization_token").using("btree", table.authorizationToken.asc().nullsLast().op("text_ops")),
  index("idx_partner_kyc_authorization_status").using("btree", table.authorizationStatus.asc().nullsLast().op("text_ops")),
  index("idx_partner_kyc_completion_status").using("btree", table.completionStatus.asc().nullsLast().op("text_ops")),
  index("idx_partner_kyc_is_locked").using("btree", table.isLocked.asc().nullsLast()),
  index("idx_partner_kyc_created_at").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
]);

// ============================================================================
// CARD CANCELLATION REQUESTS TABLE
// ============================================================================

/**
 * Card Cancellation/Renewal Requests
 * Handles requests to cancel or renew cards (from customers or partners)
 */
export const cardCancellationRequests = pgTable("card_cancellation_requests", {
  id: serial("id").primaryKey().notNull(),
  
  // References
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: 'cascade' }),
  cardRequestId: integer("card_request_id").references(() => cardRequests.id, { onDelete: 'cascade' }),
  requestedByPartnerId: integer("requested_by_partner_id").references(() => customers.id, { onDelete: 'set null' }),
  isPartnerRequest: boolean("is_partner_request").default(false),
  
  // Card info
  cardNumber: text("card_number").notNull(),
  cardType: text("card_type"),
  
  // Request details
  requestType: text("request_type").default('CANCELLATION').notNull(),
  cancellationReason: text("cancellation_reason"),
  renewalReason: text("renewal_reason"),
  additionalNotes: text("additional_notes"),
  urgencyLevel: text("urgency_level").default('NORMAL').notNull(),
  
  // Status
  status: text("status").default('PENDING').notNull(),
  
  // Admin review
  reviewedByAdminId: integer("reviewed_by_admin_id"),
  reviewedAt: timestamp("reviewed_at", { precision: 3, mode: 'string' }),
  reviewNotes: text("review_notes"),
  rejectionReason: text("rejection_reason"),
  approvalNotes: text("approval_notes"),
  
  // Processing
  processedByAdminId: integer("processed_by_admin_id"),
  processedAt: timestamp("processed_at", { precision: 3, mode: 'string' }),
  processingNotes: text("processing_notes"),
  newCardRequestId: integer("new_card_request_id").references(() => cardRequests.id, { onDelete: 'set null' }),
  
  // Audit trail
  requesterIpAddress: text("requester_ip_address").notNull(),
  requesterUserAgent: text("requester_user_agent"),
  requesterDeviceInfo: jsonb("requester_device_info"),
  applicationSource: text("application_source").default('WEB').notNull(),
  
  // Notifications
  customerNotified: boolean("customer_notified").default(false),
  customerNotifiedAt: timestamp("customer_notified_at", { precision: 3, mode: 'string' }),
  partnerNotified: boolean("partner_notified").default(false),
  partnerNotifiedAt: timestamp("partner_notified_at", { precision: 3, mode: 'string' }),
  
  // Metadata
  metadata: jsonb("metadata"),
  
  // Timestamps
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("idx_card_cancel_customer_id").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
  index("idx_card_cancel_partner_id").using("btree", table.requestedByPartnerId.asc().nullsLast().op("int4_ops")),
  index("idx_card_cancel_card_number").using("btree", table.cardNumber.asc().nullsLast().op("text_ops")),
  index("idx_card_cancel_card_request_id").using("btree", table.cardRequestId.asc().nullsLast().op("int4_ops")),
  index("idx_card_cancel_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
  index("idx_card_cancel_request_type").using("btree", table.requestType.asc().nullsLast().op("text_ops")),
  index("idx_card_cancel_is_partner").using("btree", table.isPartnerRequest.asc().nullsLast()),
  index("idx_card_cancel_created_at").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
]);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type PartnerKycCompletion = typeof partnerKycCompletions.$inferSelect;
export type NewPartnerKycCompletion = typeof partnerKycCompletions.$inferInsert;

export type CardCancellationRequest = typeof cardCancellationRequests.$inferSelect;
export type NewCardCancellationRequest = typeof cardCancellationRequests.$inferInsert;
