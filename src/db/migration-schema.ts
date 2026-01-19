/**
 * CUSTOMER MIGRATION & APPROVAL SYSTEM SCHEMA
 * 
 * Unified approval system with maker-checker workflow:
 * - Manager creates → Admin validates
 * - Admin creates → Super Admin validates  
 * - All requests tracked in single approval_requests table
 */

import { pgTable, serial, integer, numeric, text, timestamp, jsonb, boolean, index, foreignKey, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customers, users } from "./schema";

// Enums
export const approvalStatus = pgEnum("ApprovalStatus", ['PENDING', 'APPROVED', 'REJECTED']);
export const approvalRequestType = pgEnum("ApprovalRequestType", ['MIGRATION', 'SERVICE_ACTIVATION', 'BALANCE_UPDATE']);

/**
 * Table: approval_requests (UNIFIED)
 * Central table for all approval workflows
 */
export const approvalRequests = pgTable("approval_requests", {
  id: serial().primaryKey().notNull(),
  
  // Request type and reference
  requestType: approvalRequestType("request_type").notNull(),
  referenceId: integer("reference_id"), // ID of migration_requests or service_activation_requests
  customerId: integer("customer_id").notNull(), // For quick filtering
  
  // Creator info
  createdByUserId: integer("created_by_user_id").notNull(),
  createdByRole: text("created_by_role").notNull(), // Manager, Admin
  createdByName: text("created_by_name").notNull(),
  
  // Validator requirements
  requiresValidationByRole: text("requires_validation_by_role").notNull(), // Admin, Super Admin
  
  // Validator info (filled after validation)
  validatedByUserId: integer("validated_by_user_id"),
  validatedByRole: text("validated_by_role"),
  validatedByName: text("validated_by_name"),
  validatedAt: timestamp("validated_at", { precision: 3, mode: 'string' }),
  
  // Status
  status: approvalStatus().default('PENDING').notNull(),
  rejectionReason: text("rejection_reason"),
  
  // Request data (JSON for flexibility)
  requestData: jsonb("request_data").notNull(),
  
  // Audit
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("approval_requests_status_idx").using("btree", table.status.asc().nullsLast()),
  index("approval_requests_creator_idx").using("btree", table.createdByUserId.asc().nullsLast()),
  index("approval_requests_customer_idx").using("btree", table.customerId.asc().nullsLast()),
  index("approval_requests_requires_role_idx").using("btree", table.requiresValidationByRole.asc().nullsLast()),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "approval_requests_customer_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  foreignKey({
    columns: [table.createdByUserId],
    foreignColumns: [users.id],
    name: "approval_requests_created_by_user_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
  foreignKey({
    columns: [table.validatedByUserId],
    foreignColumns: [users.id],
    name: "approval_requests_validated_by_user_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
]);

/**
 * Table: migration_requests
 * Stores migration data (MEMBER customers only)
 */
export const migrationRequests = pgTable("migration_requests", {
  id: serial().primaryKey().notNull(),
  customerId: integer("customer_id").notNull(),
  createdByUserId: integer("created_by_user_id").notNull(),
  
  // Account deposits (S01-S06)
  depositS01Cdf: numeric("deposit_s01_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  depositS01Usd: numeric("deposit_s01_usd", { precision: 15, scale: 2 }).default('0').notNull(),
  depositS02Cdf: numeric("deposit_s02_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  depositS02Usd: numeric("deposit_s02_usd", { precision: 15, scale: 2 }).default('0').notNull(),
  depositS03Cdf: numeric("deposit_s03_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  depositS03Usd: numeric("deposit_s03_usd", { precision: 15, scale: 2 }).default('0').notNull(),
  depositS04Cdf: numeric("deposit_s04_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  depositS04Usd: numeric("deposit_s04_usd", { precision: 15, scale: 2 }).default('0').notNull(),
  depositS05Cdf: numeric("deposit_s05_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  depositS05Usd: numeric("deposit_s05_usd", { precision: 15, scale: 2 }).default('0').notNull(),
  depositS06Cdf: numeric("deposit_s06_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
  depositS06Usd: numeric("deposit_s06_usd", { precision: 15, scale: 2 }).default('0').notNull(),
  
  // KYC data
  kycData: jsonb("kyc_data"),
  missingKycFields: jsonb("missing_kyc_fields"),
  
  // Services requested (for later activation)
  requestedServices: jsonb("requested_services"),
  
  // Approval reference
  approvalRequestId: integer("approval_request_id"),
  
  // Audit
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("migration_requests_customer_id_idx").using("btree", table.customerId.asc().nullsLast()),
  index("migration_requests_approval_idx").using("btree", table.approvalRequestId.asc().nullsLast()),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "migration_requests_customer_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  foreignKey({
    columns: [table.createdByUserId],
    foreignColumns: [users.id],
    name: "migration_requests_created_by_user_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
  foreignKey({
    columns: [table.approvalRequestId],
    foreignColumns: [approvalRequests.id],
    name: "migration_requests_approval_request_id_fkey"
  }).onUpdate("cascade").onDelete("set null"),
]);

/**
 * Table: service_activation_requests
 * Service activation requests (manager/admin → super_admin)
 */
export const serviceActivationRequests = pgTable("service_activation_requests", {
  id: serial().primaryKey().notNull(),
  customerId: integer("customer_id").notNull(),
  createdByUserId: integer("created_by_user_id").notNull(),
  
  // Services to activate
  services: jsonb("services").notNull(),
  
  // Optional link to migration
  migrationRequestId: integer("migration_request_id"),
  
  // Approval reference
  approvalRequestId: integer("approval_request_id"),
  
  // Audit
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("service_activation_requests_customer_id_idx").using("btree", table.customerId.asc().nullsLast()),
  index("service_activation_requests_approval_idx").using("btree", table.approvalRequestId.asc().nullsLast()),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "service_activation_requests_customer_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  foreignKey({
    columns: [table.createdByUserId],
    foreignColumns: [users.id],
    name: "service_activation_requests_created_by_user_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
  foreignKey({
    columns: [table.migrationRequestId],
    foreignColumns: [migrationRequests.id],
    name: "service_activation_requests_migration_request_id_fkey"
  }).onUpdate("cascade").onDelete("set null"),
  foreignKey({
    columns: [table.approvalRequestId],
    foreignColumns: [approvalRequests.id],
    name: "service_activation_requests_approval_request_id_fkey"
  }).onUpdate("cascade").onDelete("set null"),
]);

/**
 * Table: customer_services
 * Active services per customer
 */
export const customerServices = pgTable("customer_services", {
  id: serial().primaryKey().notNull(),
  customerId: integer("customer_id").notNull(),
  serviceCode: text("service_code").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  
  // Activation
  activatedByUserId: integer("activated_by_user_id").notNull(),
  activatedAt: timestamp("activated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  
  // Deactivation
  deactivatedByUserId: integer("deactivated_by_user_id"),
  deactivatedAt: timestamp("deactivated_at", { precision: 3, mode: 'string' }),
  deactivationReason: text("deactivation_reason"),
  
  createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("customer_services_customer_id_idx").using("btree", table.customerId.asc().nullsLast()),
  index("customer_services_service_code_idx").using("btree", table.serviceCode.asc().nullsLast()),
  index("customer_services_is_active_idx").using("btree", table.isActive.asc().nullsLast()),
  foreignKey({
    columns: [table.customerId],
    foreignColumns: [customers.id],
    name: "customer_services_customer_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  foreignKey({
    columns: [table.activatedByUserId],
    foreignColumns: [users.id],
    name: "customer_services_activated_by_user_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
  foreignKey({
    columns: [table.deactivatedByUserId],
    foreignColumns: [users.id],
    name: "customer_services_deactivated_by_user_id_fkey"
  }).onUpdate("cascade").onDelete("restrict"),
]);
