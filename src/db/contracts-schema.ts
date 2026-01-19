/**
 * Contracts Schema
 * Manages customer contracts, agreements, and legal documents
 * 
 * Business Context:
 * Contracts are essential for formalizing banking relationships and service agreements.
 * They include account opening contracts, loan agreements, savings plans, and other legal documents.
 */

import { pgTable, serial, text, integer, timestamp, varchar, boolean, decimal } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { customers, users } from './schema';

/**
 * Contracts Table
 * Stores all contract information including terms, status, and associated documents
 */
export const contracts = pgTable('contracts', {
  // Primary Key
  id: serial('id').primaryKey(),
  
  // Contract Identification
  contractNumber: varchar('contract_number', { length: 50 }).notNull().unique(),
  
  // Relationships
  customerId: integer('customer_id').notNull(), // References customers.id
  createdByUserId: integer('created_by_user_id'), // Admin who created the contract
  approvedByUserId: integer('approved_by_user_id'), // Admin who approved the contract
  
  // Contract Type
  type: varchar('type', { length: 100 }).notNull(), // 'ACCOUNT_OPENING', 'LOAN_AGREEMENT', 'SAVINGS_PLAN', 'SERVICE_AGREEMENT', etc.
  category: varchar('category', { length: 50 }), // 'BANKING', 'CREDIT', 'SAVINGS', 'INVESTMENT'
  
  // Status Management
  status: varchar('status', { length: 20 }).notNull().default('DRAFT'), // 'DRAFT', 'PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED'
  
  // Contract Dates
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'), // NULL for indefinite contracts
  signedDate: timestamp('signed_date'), // When customer signed
  approvedDate: timestamp('approved_date'), // When admin approved
  
  // Financial Terms
  amount: decimal('amount', { precision: 15, scale: 2 }), // Contract amount (if applicable)
  currency: varchar('currency', { length: 10 }).default('CDF'), // CDF, USD, EUR
  interestRate: decimal('interest_rate', { precision: 5, scale: 2 }), // For loan contracts
  
  // Contract Details
  title: varchar('title', { length: 200 }).notNull(), // Contract title/description
  terms: text('terms'), // Full contract terms and conditions (can be JSON)
  notes: text('notes'), // Internal notes for admins
  
  // Document Management
  documentUrl: varchar('document_url', { length: 500 }), // Signed PDF document URL
  documentHash: varchar('document_hash', { length: 128 }), // SHA-256 hash for integrity verification
  
  // Renewal Management
  autoRenew: boolean('auto_renew').default(false),
  renewalPeriodDays: integer('renewal_period_days'), // 30, 90, 365, etc.
  renewalCount: integer('renewal_count').default(0), // Number of times renewed
  
  // Audit Trail
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'), // Soft delete
});

/**
 * Contract Signatories Table
 * Tracks all parties who need to sign the contract
 */
export const contractSignatories = pgTable('contract_signatories', {
  id: serial('id').primaryKey(),
  contractId: integer('contract_id').notNull(), // References contracts.id
  
  // Signatory Information
  signatoryType: varchar('signatory_type', { length: 50 }).notNull(), // 'CUSTOMER', 'GUARANTOR', 'ADMIN', 'WITNESS'
  signatoryName: varchar('signatory_name', { length: 200 }).notNull(),
  signatoryEmail: varchar('signatory_email', { length: 200 }),
  signatoryPhone: varchar('signatory_phone', { length: 20 }),
  
  // Signature Status
  signed: boolean('signed').default(false),
  signedDate: timestamp('signed_date'),
  signatureUrl: varchar('signature_url', { length: 500 }), // Digital signature image URL
  ipAddress: varchar('ip_address', { length: 50 }), // IP address when signed
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Contract History Table
 * Tracks all changes made to contracts for audit purposes
 */
export const contractHistory = pgTable('contract_history', {
  id: serial('id').primaryKey(),
  contractId: integer('contract_id').notNull(), // References contracts.id
  
  // Change Information
  action: varchar('action', { length: 50 }).notNull(), // 'CREATED', 'UPDATED', 'SIGNED', 'APPROVED', 'CANCELLED', 'RENEWED'
  changedBy: integer('changed_by').notNull(), // User ID who made the change
  changes: text('changes'), // JSON string of what changed
  reason: text('reason'), // Reason for the change
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Contract Attachments Table
 * Stores additional documents related to a contract
 */
export const contractAttachments = pgTable('contract_attachments', {
  id: serial('id').primaryKey(),
  contractId: integer('contract_id').notNull(), // References contracts.id
  
  // Attachment Information
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileUrl: varchar('file_url', { length: 500 }).notNull(),
  fileType: varchar('file_type', { length: 100 }), // MIME type
  fileSize: integer('file_size'), // Size in bytes
  
  // Attachment Details
  attachmentType: varchar('attachment_type', { length: 50 }), // 'ID_PROOF', 'INCOME_PROOF', 'SUPPORTING_DOC', etc.
  description: text('description'),
  
  // Audit
  uploadedBy: integer('uploaded_by'), // User ID who uploaded
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const contractsRelations = relations(contracts, ({ one, many }) => ({
  customer: one(customers, {
    fields: [contracts.customerId],
    references: [customers.id],
  }),
  createdBy: one(users, {
    fields: [contracts.createdByUserId],
    references: [users.id],
  }),
  approvedBy: one(users, {
    fields: [contracts.approvedByUserId],
    references: [users.id],
  }),
  signatories: many(contractSignatories),
  history: many(contractHistory),
  attachments: many(contractAttachments),
}));

export const contractSignatoriesRelations = relations(contractSignatories, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractSignatories.contractId],
    references: [contracts.id],
  }),
}));

export const contractHistoryRelations = relations(contractHistory, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractHistory.contractId],
    references: [contracts.id],
  }),
  changedByUser: one(users, {
    fields: [contractHistory.changedBy],
    references: [users.id],
  }),
}));

export const contractAttachmentsRelations = relations(contractAttachments, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractAttachments.contractId],
    references: [contracts.id],
  }),
  uploadedByUser: one(users, {
    fields: [contractAttachments.uploadedBy],
    references: [users.id],
  }),
}));

/**
 * Contract Notifications Table
 * Tracks notifications sent to customers about new contracts requiring signature
 */
export const contractNotifications = pgTable('contract_notifications', {
  id: serial('id').primaryKey(),
  contractId: integer('contract_id').notNull(), // References contracts.id
  customerId: integer('customer_id').notNull(), // References customers.id
  
  // Notification Status
  isRead: boolean('is_read').default(false).notNull(),
  isSigned: boolean('is_signed').default(false).notNull(),
  
  // Notification Details
  notificationType: varchar('notification_type', { length: 50 }).default('NEW_CONTRACT').notNull(),
  message: text('message'),
  priority: varchar('priority', { length: 20 }).default('NORMAL'), // 'LOW', 'NORMAL', 'HIGH', 'URGENT'
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  readAt: timestamp('read_at'),
  signedAt: timestamp('signed_at'),
  expiresAt: timestamp('expires_at'),
  
  // Audit Trail
  ipAddress: varchar('ip_address', { length: 50 }),
  userAgent: text('user_agent'),
});

export const contractNotificationsRelations = relations(contractNotifications, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractNotifications.contractId],
    references: [contracts.id],
  }),
  customer: one(customers, {
    fields: [contractNotifications.customerId],
    references: [customers.id],
  }),
}));
