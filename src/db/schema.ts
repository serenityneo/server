import { pgTable, index, foreignKey, text, timestamp, integer, uniqueIndex, jsonb, boolean, varchar, serial, numeric, doublePrecision, pgEnum } from "drizzle-orm/pg-core"
import { sql, relations } from "drizzle-orm"

// Enums
export const accountStatus = pgEnum("AccountStatus", ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'])
// Updated AccountType Enum
export const accountType = pgEnum("AccountType", ['S01_STANDARD', 'S02_MANDATORY_SAVINGS', 'S03_CAUTION', 'S04_CREDIT', 'S05_BWAKISA_CARTE', 'S06_FINES'])
export const civilStatus = pgEnum("CivilStatus", ['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED'])
export const creditStatus = pgEnum("CreditStatus", ['PENDING', 'APPROVED', 'DISBURSED', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED'])
export const currency = pgEnum("Currency", ['CDF', 'USD'])
export const customerCategory = pgEnum("CustomerCategory", ['CATEGORY_1', 'CATEGORY_2', 'GOLD'])
export const customerStatus = pgEnum("CustomerStatus", ['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED'])
export const customerType = pgEnum("CustomerType", ['MEMBER', 'PARTNER'])
export const modificationChangeType = pgEnum("ModificationChangeType", ['BALANCE_UPDATE', 'INFO_UPDATE', 'STATUS_CHANGE', 'ACCOUNT_CREATION'])
export const modificationStatus = pgEnum("ModificationStatus", ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'])
export const deviceStatus = pgEnum("DeviceStatus", ['TRUSTED', 'PENDING', 'SUSPICIOUS', 'BLOCKED'])
export const deviceType = pgEnum("DeviceType", ['MOBILE', 'DESKTOP', 'TABLET', 'UNKNOWN'])
export const fraudType = pgEnum("FraudType", ['LOCATION_ANOMALY', 'DEVICE_ANOMALY', 'BEHAVIORAL_ANOMALY', 'VPN_PROXY_DETECTED', 'MULTIPLE_DEVICES', 'RAPID_TRANSACTIONS', 'SUSPICIOUS_PATTERN'])
export const gender = pgEnum("Gender", ['M', 'F'])
export const kycStatus = pgEnum("KYCStatus", [
    'NOT_STARTED',
    // KYC Level 1 - Basic Verification
    'KYC1_PENDING',
    'KYC1_UNDER_REVIEW',
    'KYC1_COMPLETED',
    'KYC1_VERIFIED',
    'KYC1_REJECTED',
    // KYC Level 2 - Advanced Verification
    'KYC2_PENDING',
    'KYC2_UNDER_REVIEW',
    'KYC2_VERIFIED',
    'KYC2_REJECTED',
    // KYC Level 3 - Enterprise/Complete Verification
    'KYC3_PENDING',
    'KYC3_UNDER_REVIEW',
    'KYC3_VERIFIED',
    'KYC3_REJECTED',
    // Global rejection
    'REJECTED'
])
export const kycLockStep = pgEnum("KycLockStep", ['NONE', 'STEP1', 'STEP2', 'STEP3', 'AGENCY_ASSIGNED'])
export const loginStatus = pgEnum("LoginStatus", ['SUCCESS', 'FAILED_PASSWORD', 'FAILED_OTP', 'BLOCKED_SUSPICIOUS', 'BLOCKED_DEVICE', 'BLOCKED_LOCATION', 'FAILED_SECURITY_QUESTION'])
export const partnerActionType = pgEnum("PartnerActionType", ['CREATE_CUSTOMER', 'UPDATE_CUSTOMER', 'DEPOSIT', 'WITHDRAWAL', 'CREDIT_APPLICATION', 'CREDIT_APPROVAL', 'ACCOUNT_SUSPENSION', 'DOCUMENT_UPLOAD', 'KYC_VALIDATION', 'TRANSACTION_REVERSAL'])
export const partnerLimitType = pgEnum("PartnerLimitType", ['DAILY_TRANSACTIONS', 'MONTHLY_TRANSACTIONS', 'SINGLE_TRANSACTION', 'CUSTOMER_CREATION', 'CREDIT_APPROVAL'])
export const repaymentFrequency = pgEnum("RepaymentFrequency", ['DAILY', 'WEEKLY', 'MONTHLY'])
export const riskLevel = pgEnum("RiskLevel", ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
export const securityQuestionType = pgEnum("SecurityQuestionType", ['PERSONAL', 'FAMILY', 'PREFERENCE', 'HISTORICAL'])
export const settingCategory = pgEnum("SettingCategory", ['SYSTEM', 'SECURITY', 'CREDIT', 'EXCHANGE_RATES', 'FEES', 'LIMITS', 'NOTIFICATIONS', 'BUSINESS_RULES'])
export const settingType = pgEnum("SettingType", ['STRING', 'INTEGER', 'FLOAT', 'BOOLEAN', 'JSON'])
export const transactionStatus = pgEnum("TransactionStatus", ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'])
export const transactionType = pgEnum("TransactionType", ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'CREDIT_DISBURSEMENT', 'CREDIT_REPAYMENT', 'FEE', 'INTEREST'])
export const requestSource = pgEnum("RequestSource", ['UI', 'SERVER'])


// Tables
export const contactChangeLogs = pgTable("contact_change_logs", {
    id: text().primaryKey().notNull(),
    oldContact: text("old_contact").notNull(),
    newContact: text("new_contact").notNull(),
    contactType: text("contact_type").notNull(),
    purpose: text().notNull(),
    ipAddress: text("ip_address").notNull(),
    userAgent: text("user_agent").notNull(),
    otpId: text("otp_id"),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    customerId: integer("customer_id"),
}, (table) => [
    index("contact_change_logs_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
    index("contact_change_logs_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("contact_change_logs_new_contact_idx").using("btree", table.newContact.asc().nullsLast().op("text_ops")),
    index("contact_change_logs_old_contact_idx").using("btree", table.oldContact.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "contact_change_logs_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

export const kycDrafts = pgTable("kyc_drafts", {
    id: text().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    kycStep: text("kyc_step").notNull(),
    draftData: jsonb("draft_data").notNull(),
    globalDocHashes: jsonb("global_doc_hashes"),
    version: integer().default(1).notNull(),
    isAutoSaved: boolean("is_auto_saved").default(true).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    deviceInfo: jsonb("device_info"),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    expiresAt: timestamp("expires_at", { precision: 3, mode: 'string' }),
}, (table) => [
    index("kyc_drafts_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
    index("kyc_drafts_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    uniqueIndex("kyc_drafts_customer_id_kyc_step_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops"), table.kycStep.asc().nullsLast().op("int4_ops")),
    index("kyc_drafts_kyc_step_idx").using("btree", table.kycStep.asc().nullsLast().op("text_ops")),
    index("kyc_drafts_updated_at_idx").using("btree", table.updatedAt.asc().nullsLast().op("timestamp_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "kyc_drafts_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);

export const otpEvents = pgTable("otp_events", {
    id: text().primaryKey().notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    otpId: text("otp_id"),
    customerId: integer("customer_id"),
    contact: text().notNull(),
    contactType: text("contact_type").notNull(),
    purpose: text().notNull(),
    action: text().notNull(),
    channel: text(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    message: text(),
}, (table) => [
    index("otp_events_contact_created_at_idx").using("btree", table.contact.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
    index("otp_events_customer_id_created_at_idx").using("btree", table.customerId.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("int4_ops")),
    index("otp_events_purpose_action_created_at_idx").using("btree", table.purpose.asc().nullsLast().op("timestamp_ops"), table.action.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.otpId],
        foreignColumns: [otp.id],
        name: "otp_events_otp_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "otp_events_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

export const prismaMigrations = pgTable("_prisma_migrations", {
    id: varchar({ length: 36 }).primaryKey().notNull(),
    checksum: varchar({ length: 64 }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
    migrationName: varchar("migration_name", { length: 255 }).notNull(),
    logs: text(),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true, mode: 'string' }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    appliedStepsCount: integer("applied_steps_count").default(0).notNull(),
});

export const systemSettings = pgTable("system_settings", {
    id: serial().primaryKey().notNull(),
    key: text().notNull(),
    category: text().notNull(),
    value: text().notNull(),
    dataType: text("data_type").default('STRING').notNull(),
    description: text(),
    isSystem: boolean("is_system").default(false).notNull(),
    isEncrypted: boolean("is_encrypted").default(false).notNull(),
    defaultValue: text("default_value"),
    validationRules: jsonb("validation_rules"),
    lastModifiedBy: integer("last_modified_by"),
    history: jsonb(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("system_settings_key_key").using("btree", table.key.asc().nullsLast().op("text_ops")),
]);

// Exchange Rate Audit Trail - Traçabilité complète pour conformité bancaire
export const exchangeRateAudit = pgTable("exchange_rate_audit", {
    id: serial().primaryKey().notNull(),
    oldRate: doublePrecision("old_rate"),
    newRate: doublePrecision("new_rate").notNull(),
    changedBy: integer("changed_by").notNull(), // User ID qui a modifié
    changedByEmail: text("changed_by_email"), // Email pour traçabilité
    changedByRole: text("changed_by_role"), // Role (admin, superadmin)
    changeReason: text("change_reason"), // Raison de la modification
    ipAddress: text("ip_address"), // IP de l'utilisateur
    userAgent: text("user_agent"), // Navigateur/Device
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("exchange_rate_audit_changed_by_idx").using("btree", table.changedBy.asc().nullsLast().op("int4_ops")),
    index("exchange_rate_audit_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
]);

// Request Logs Table for Performance Monitoring
export const requestLogs = pgTable("request_logs", {
    id: text().primaryKey().notNull(),
    endpoint: text().notNull(),
    method: text().notNull(),
    durationMs: integer("duration_ms").notNull(),
    statusCode: integer("status_code"),
    customerId: integer("customer_id"),
    actionType: text("action_type"),
    source: requestSource().notNull().default('SERVER'),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    requestBody: jsonb("request_body"),
    responseSize: integer("response_size"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    date: timestamp("date", { mode: 'date' }).default(sql`CURRENT_DATE`).notNull(),
}, (table) => [
    index("request_logs_endpoint_idx").using("btree", table.endpoint.asc().nullsLast().op("text_ops")),
    index("request_logs_duration_idx").using("btree", table.durationMs.desc().nullsLast().op("int4_ops")),
    index("request_logs_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("request_logs_date_idx").using("btree", table.date.desc().nullsLast().op("date_ops")),
    index("request_logs_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
    index("request_logs_source_idx").using("btree", table.source.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "request_logs_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

export const customers = pgTable("customers", {
    id: serial().primaryKey().notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    mobileMoneyNumber: text("mobile_money_number"),
    email: text(),
    dateOfBirth: timestamp("date_of_birth", { precision: 3, mode: 'string' }),
    placeOfBirth: text("place_of_birth"),
    civilStatus: text("civil_status"),
    gender: text(),
    nationality: text(),
    address: text(),
    profession: text(),
    employer: text(),
    monthlyIncome: numeric("monthly_income", { precision: 15, scale: 2 }),
    idCardNumber: text("id_card_number"),
    idCardExpiry: timestamp("id_card_expiry", { precision: 3, mode: 'string' }),
    idCardFrontUrl: text("id_card_front_url"),
    idCardBackUrl: text("id_card_back_url"),
    passportNumber: text("passport_number"),
    passportExpiry: timestamp("passport_expiry", { precision: 3, mode: 'string' }),
    passportUrl: text("passport_url"),
    birthCertificateUrl: text("birth_certificate_url"),
    residenceCertificateUrl: text("residence_certificate_url"),
    incomeProofUrl: text("income_proof_url"),
    referenceName: text("reference_name"),
    referencePhone: text("reference_phone"),
    referenceRelationship: text("reference_relationship"),
    isPoliticalPerson: boolean("is_political_person"),
    status: customerStatus(),
    kycStatus: kycStatus("kyc_status"),
    category: customerCategory(),
    kyc1CompletionDate: timestamp("kyc1_completion_date", { precision: 3, mode: 'string' }),
    kyc2SubmissionDate: timestamp("kyc2_submission_date", { precision: 3, mode: 'string' }),
    kyc2ValidationDate: timestamp("kyc2_validation_date", { precision: 3, mode: 'string' }),
    goldEligibleDate: timestamp("gold_eligible_date", { precision: 3, mode: 'string' }),
    passwordHash: text("password_hash"),
    isActive: boolean("is_active"),
    lastLogin: timestamp("last_login", { precision: 3, mode: 'string' }),
    accountCreationDate: timestamp("account_creation_date", { precision: 3, mode: 'string' }),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }),
    createdById: integer("created_by_id"),
    businessDocuments: jsonb("business_documents"),
    agencyId: integer("agency_id"),
    commissionRate: numeric("commission_rate", { precision: 5, scale: 4 }),
    customerType: customerType("customer_type").default('MEMBER').notNull(),
    facePhotoUrl: text("face_photo_url"),
    lastActionDate: timestamp("last_action_date", { precision: 3, mode: 'string' }),
    managedByPartnerId: integer("managed_by_partner_id"),
    maxDailyOperations: integer("max_daily_operations").default(50),
    maxTransactionAmount: numeric("max_transaction_amount", { precision: 15, scale: 2 }),
    mfaBackupCodes: jsonb("mfa_backup_codes"),
    mfaConfiguredAt: timestamp("mfa_configured_at", { precision: 3, mode: 'string' }),
    mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
    mfaSecret: text("mfa_secret"),
    partnerActionsCount: integer("partner_actions_count").default(0).notNull(),
    partnerCode: text("partner_code"),
    partnerLevel: text("partner_level"),
    postalCodeId: integer("postal_code_id"),
    quartierId: integer("quartier_id"),
    requiresDualApproval: boolean("requires_dual_approval").default(false).notNull(),
    signaturePhotoUrl: text("signature_photo_url"),
    supervisorId: integer("supervisor_id"),
    suspiciousActivityCount: integer("suspicious_activity_count").default(0).notNull(),
    territoryAssigned: text("territory_assigned"),
    kycCompleted: boolean("kyc_completed").default(false).notNull(),
    kycStep: integer("kyc_step").default(0).notNull(),
    otpVerified: boolean("otp_verified").default(false).notNull(),
    cifCode: text("cif_code"), // Ancien format - à déprécier
    publicId: text("public_id"),
    kycLockStep: kycLockStep("kyc_lock_step").default('NONE').notNull(),
    // Nouvelles colonnes pour nouveau système CIF-AGENCE-AGENT
    cif: varchar("cif", { length: 8 }), // CIF 8 chiffres UNIQUE
    agentId: integer("agent_id"), // Référence vers agents
    accountNumber: varchar("account_number", { length: 8 }), // 8 chiffres, unique par agence
    // First deposit tracking for partner commissions
    firstDepositDate: timestamp("first_deposit_date", { precision: 3, mode: 'string' }),
    firstDepositAmount: numeric("first_deposit_amount", { precision: 15, scale: 2 }),
    firstDepositCommissionAwarded: boolean("first_deposit_commission_awarded").default(false).notNull(),
    // KYC Audit Trail columns (Banking compliance) - Added 2025-12-30
    validatedByUserId: integer("validated_by_user_id"),
    rejectedByUserId: integer("rejected_by_user_id"),
    lastModifiedByUserId: integer("last_modified_by_user_id"),
    rejectionReason: text("rejection_reason"),
    rejectionNotes: text("rejection_notes"), // Internal only
    adminNotes: text("admin_notes"),
    kycAuditTrail: jsonb("kyc_audit_trail"),
    // Admin Creation Audit Trail (Manual customer creation) - Added 2025-12-31
    createdByAdminId: integer("created_by_admin_id"),
    createdByAdminRole: text("created_by_admin_role"),
    createdByAdminIp: text("created_by_admin_ip"),
    createdByAdminName: text("created_by_admin_name"),
    createdByUserAgent: text("created_by_user_agent"), // Browser/Device info
    createdBySessionId: text("created_by_session_id"), // Session tracking
    createdByDeviceFingerprint: text("created_by_device_fingerprint"), // Device identification
    lastModifiedByAdminId: integer("last_modified_by_admin_id"),
    lastModifiedByAdminIp: text("last_modified_by_admin_ip"),
    lastModifiedByUserAgent: text("last_modified_by_user_agent"),
    modificationCount: integer("modification_count").default(0).notNull(), // Track number of modifications
    isManualCreation: boolean("is_manual_creation").default(false).notNull(),
    // Password change tracking for manual creations
    passwordChangedAfterCreation: boolean("password_changed_after_creation").default(false).notNull(),
    // Contract acceptance fields
    termsAccepted: boolean("terms_accepted").default(false).notNull(),
    termsAcceptedAt: timestamp("terms_accepted_at", { precision: 3, mode: 'string' }),
    termsAcceptedIp: text("terms_accepted_ip"),
}, (table) => [
    uniqueIndex("customers_cif_code_key").using("btree", table.cifCode.asc().nullsLast().op("text_ops")),
    uniqueIndex("customers_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
    uniqueIndex("customers_mobile_money_number_key").using("btree", table.mobileMoneyNumber.asc().nullsLast().op("text_ops")),
    uniqueIndex("customers_public_id_key").using("btree", table.publicId.asc().nullsLast().op("text_ops")),
    // Nouveaux index pour nouveau système
    uniqueIndex("customers_cif_key").using("btree", table.cif.asc().nullsLast().op("text_ops")),
    uniqueIndex("customers_agency_account_number_key").using("btree", table.agencyId.asc().nullsLast().op("int4_ops"), table.accountNumber.asc().nullsLast().op("text_ops")),
    index("customers_agent_id_idx").using("btree", table.agentId.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.createdById],
        foreignColumns: [users.id],
        name: "customers_created_by_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.managedByPartnerId],
        foreignColumns: [table.id],
        name: "customers_managed_by_partner_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.agencyId],
        foreignColumns: [agencies.id],
        name: "customers_agency_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.agentId],
        foreignColumns: [agents.id],
        name: "customers_agent_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.quartierId],
        foreignColumns: [quartiers.id],
        name: "customers_quartier_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.postalCodeId],
        foreignColumns: [postalCodes.id],
        name: "customers_postal_code_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    // KYC Audit Trail foreign keys
    foreignKey({
        columns: [table.validatedByUserId],
        foreignColumns: [users.id],
        name: "customers_validated_by_user_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.rejectedByUserId],
        foreignColumns: [users.id],
        name: "customers_rejected_by_user_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.lastModifiedByUserId],
        foreignColumns: [users.id],
        name: "customers_last_modified_by_user_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    // Admin Creation Audit Trail foreign keys
    foreignKey({
        columns: [table.createdByAdminId],
        foreignColumns: [users.id],
        name: "customers_created_by_admin_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.lastModifiedByAdminId],
        foreignColumns: [users.id],
        name: "customers_last_modified_by_admin_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    // Performance Indexes for Dashboard
    index("customers_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
    index("customers_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
    index("customers_kyc_status_idx").using("btree", table.kycStatus.asc().nullsLast().op("enum_ops")),
    index("customers_mfa_enabled_idx").using("btree", table.mfaEnabled.asc().nullsLast().op("bool_ops")),
]);

export const roles = pgTable("roles", {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    description: text(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("roles_name_key").using("btree", table.name.asc().nullsLast().op("text_ops")),
]);

export const users = pgTable("users", {
    id: serial().primaryKey().notNull(),
    username: text("username").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    roleId: integer("role_id").notNull(),
    validated: boolean("validated").notNull(),
    otpCode: text("otp_code"),
    otpExpiresAt: timestamp("otp_expires_at", { precision: 3, mode: 'string' }),
    lastLogin: timestamp("last_login", { precision: 3, mode: 'string' }),
    lastLogout: timestamp("last_logout", { precision: 3, mode: 'string' }),
    lastIp: text("last_ip"),
    lastBrowser: text("last_browser"),
    lastMachine: text("last_machine"),
    lastCountry: text("last_country"),
    agencyId: integer("agency_id"), // User can be assigned to an agency (e.g., Cashiers)
    isActive: boolean("is_active").notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    // 2FA fields for admin users
    mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
    mfaSecret: text("mfa_secret"),
    mfaBackupCodes: jsonb("mfa_backup_codes"),
    mfaConfiguredAt: timestamp("mfa_configured_at", { precision: 3, mode: 'string' }),
    // 2FA failure tracking for intelligent error handling
    mfaFailedAttempts: integer("mfa_failed_attempts").default(0).notNull(),
    mfaLastFailedAt: timestamp("mfa_last_failed_at", { precision: 3, mode: 'string' }),
    mfaFailureLog: jsonb("mfa_failure_log"), // Detailed failure diagnostics
}, (table) => [
    uniqueIndex("users_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
    uniqueIndex("users_username_key").using("btree", table.username.asc().nullsLast().op("text_ops")),
    index("users_agency_id_idx").using("btree", table.agencyId.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.roleId],
        foreignColumns: [roles.id],
        name: "users_role_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    // Note: agencyId foreign key is handled via relations to avoid circular dependency with agencies.managerId
    index("users_is_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
    index("users_mfa_enabled_idx").using("btree", table.mfaEnabled.asc().nullsLast().op("bool_ops")),
]);

export const accounts = pgTable("accounts", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    accountNumber: text("account_number").notNull(),
    accountType: accountType("account_type").notNull(),
    accountTypeCode: varchar("account_type_code", { length: 3 }),
    currency: currency("currency").default('CDF').notNull(),
    balanceCdf: numeric("balance_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
    balanceUsd: numeric("balance_usd", { precision: 15, scale: 2 }).default('0').notNull(),
    status: accountStatus("status").default('ACTIVE').notNull(),
    openedDate: timestamp("opened_date", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    closedDate: timestamp("closed_date", { precision: 3, mode: 'string' }),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("accounts_account_number_key").using("btree", table.accountNumber.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "accounts_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.accountTypeCode],
        foreignColumns: [accountTypes.code],
        name: "accounts_account_type_code_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

export const credits = pgTable("credits", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    cif: text(),
    creditType: varchar("credit_type", { length: 20 }).notNull(),
    amountCdf: numeric("amount_cdf", { precision: 15, scale: 2 }).notNull(),
    amountUsd: numeric("amount_usd", { precision: 15, scale: 2 }),
    processingFeeCdf: numeric("processing_fee_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
    totalToRepayCdf: numeric("total_to_repay_cdf", { precision: 15, scale: 2 }).notNull(),
    interestRate: numeric("interest_rate", { precision: 5, scale: 4 }).notNull(),
    repaymentFrequency: text("repayment_frequency").notNull(),
    installmentAmountCdf: numeric("installment_amount_cdf", { precision: 15, scale: 2 }).notNull(),
    numberOfInstallments: integer("number_of_installments").notNull(),
    applicationDate: timestamp("application_date", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    approvalDate: timestamp("approval_date", { precision: 3, mode: 'string' }),
    disbursementDate: timestamp("disbursement_date", { precision: 3, mode: 'string' }),
    firstPaymentDate: timestamp("first_payment_date", { precision: 3, mode: 'string' }),
    lastPaymentDate: timestamp("last_payment_date", { precision: 3, mode: 'string' }),
    maturityDate: timestamp("maturity_date", { precision: 3, mode: 'string' }),
    creditStatus: text("credit_status").default('PENDING').notNull(),
    productConfig: jsonb("product_config"),
    eligibilitySnapshot: jsonb("eligibility_snapshot"),
    repaymentSchedule: jsonb("repayment_schedule"),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "credits_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.creditType],
        foreignColumns: [creditTypes.code],
        name: "credits_credit_type_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

export const transactions = pgTable("transactions", {
    id: serial().primaryKey().notNull(),
    accountId: integer("account_id"),
    creditId: integer("credit_id"),
    transactionType: text("transaction_type").notNull(),
    amountCdf: numeric("amount_cdf", { precision: 15, scale: 2 }).notNull(),
    amountUsd: numeric("amount_usd", { precision: 15, scale: 2 }),
    currency: currency("currency").default('CDF').notNull(),
    description: text(),
    referenceNumber: text("reference_number"),
    status: text().default('PENDING').notNull(),
    processedAt: timestamp("processed_at", { precision: 3, mode: 'string' }),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("transactions_reference_number_key").using("btree", table.referenceNumber.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.accountId],
        foreignColumns: [accounts.id],
        name: "transactions_account_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.creditId],
        foreignColumns: [credits.id],
        name: "transactions_credit_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

// New Table for Bwakisa Carte Service
export const bwakisaServices = pgTable('bwakisa_services', {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id').notNull().references(() => customers.id),
    targetAmount: numeric('target_amount', { precision: 15, scale: 2 }),
    periodicity: text('periodicity').notNull(), // DAILY, WEEKLY, MONTHLY
    maturityDate: timestamp('maturity_date'),
    startDate: timestamp('start_date').defaultNow().notNull(),
    status: text('status').default('ACTIVE'), // ACTIVE, COMPLETED, CANCELLED
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Catalogue des types de compte (S01–S06)
export const accountTypes = pgTable("account_types", {
    id: serial().primaryKey().notNull(),
    code: varchar("code", { length: 3 }).notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    description: text().notNull(),
    currency: currency("currency").notNull(), // USD ou CDF
    defaultStatus: accountStatus("default_status").default('INACTIVE').notNull(),
    allowedCurrencies: currency("allowed_currencies").array().notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("account_types_code_currency_key").using("btree", table.code.asc().nullsLast().op("text_ops"), table.currency.asc().nullsLast().op("text_ops")),
]);

// Conditions d'activation et d'éligibilité pour les types de compte
export const accountTypeConditions = pgTable("account_type_conditions", {
    id: serial().primaryKey().notNull(),
    accountTypeCode: varchar("account_type_code", { length: 3 }).notNull(),
    conditionType: varchar("condition_type", { length: 50 }).notNull(), // 'ACTIVATION', 'ELIGIBILITY', 'REQUIREMENT'
    conditionKey: varchar("condition_key", { length: 100 }).notNull(),
    conditionLabel: text("condition_label").notNull(),
    conditionDescription: text("condition_description"),
    requiredValue: jsonb("required_value"), // {"amount": 100, "currency": "USD"}
    validationRule: text("validation_rule"), // SQL or JS expression
    displayOrder: integer("display_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("account_type_conditions_code_idx").using("btree", table.accountTypeCode.asc().nullsLast().op("text_ops")),
    index("account_type_conditions_type_idx").using("btree", table.conditionType.asc().nullsLast().op("text_ops")),
]);

export const auditLogs = pgTable("audit_logs", {
    id: serial().primaryKey().notNull(),
    userId: integer("user_id"),
    action: text().notNull(),
    tableName: text("table_name"),
    recordId: text("record_id"),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: "audit_logs_user_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

export const systemErrors = pgTable("system_errors", {
    id: serial().primaryKey().notNull(),
    message: text().notNull(),
    stack: text(),
    path: text(),
    method: text(),
    userId: integer("user_id"),
    severity: text().default('CRITICAL').notNull(),
    metadata: jsonb("metadata"),
    isResolved: boolean("is_resolved").default(false).notNull(),
    resolvedAt: timestamp("resolved_at", { precision: 3, mode: 'string' }),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("system_errors_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
    index("system_errors_severity_idx").using("btree", table.severity.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: "system_errors_user_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

export const emailLogs = pgTable("email_logs", {
    id: serial().primaryKey().notNull(),
    recipient: text().notNull(),
    emailType: text("email_type").notNull(),
    subject: text().notNull(),
    status: text().notNull(), // 'SENT', 'FAILED', 'BOUNCED'
    resendId: text("resend_id"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    sentAt: timestamp("sent_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("email_logs_recipient_idx").using("btree", table.recipient.asc().nullsLast().op("text_ops")),
    index("email_logs_sent_at_idx").using("btree", table.sentAt.desc().nullsLast().op("timestamp_ops")),
]);

export const userSessions = pgTable("user_sessions", {
    id: serial().primaryKey().notNull(),
    userId: integer("user_id").notNull(),
    token: text().notNull(),
    deviceInfo: jsonb("device_info"),
    ipAddress: text("ip_address"),
    expiresAt: timestamp("expires_at", { precision: 3, mode: 'string' }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    browserInfo: jsonb("browser_info"),
    city: text(),
    countryCode: text("country_code"),
    deviceFingerprintId: integer("device_fingerprint_id"),
    isProxy: boolean("is_proxy").default(false).notNull(),
    isVpn: boolean("is_vpn").default(false).notNull(),
    isp: text(),
    language: text(),
    lastActivityAt: timestamp("last_activity_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    riskScore: doublePrecision("risk_score").default(0).notNull(),
    screenResolution: text("screen_resolution"),
    timezone: text(),
}, (table) => [
    uniqueIndex("user_sessions_token_key").using("btree", table.token.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: "user_sessions_user_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.deviceFingerprintId],
        foreignColumns: [deviceFingerprints.id],
        name: "user_sessions_device_fingerprint_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

export const deviceFingerprints = pgTable("device_fingerprints", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    fingerprintHash: text("fingerprint_hash").notNull(),
    deviceType: deviceType("device_type").notNull(),
    deviceStatus: deviceStatus("device_status").default('PENDING').notNull(),
    deviceName: text("device_name"),
    operatingSystem: text("operating_system"),
    browser: text(),
    browserVersion: text("browser_version"),
    screenResolution: text("screen_resolution"),
    timezone: text(),
    language: text(),
    canvasFingerprint: text("canvas_fingerprint"),
    webglFingerprint: text("webgl_fingerprint"),
    audioFingerprint: text("audio_fingerprint"),
    fontsList: jsonb("fonts_list"),
    pluginsList: jsonb("plugins_list"),
    hardwareInfo: jsonb("hardware_info"),
    networkInfo: jsonb("network_info"),
    riskScore: doublePrecision("risk_score").default(0).notNull(),
    trustScore: doublePrecision("trust_score").default(0).notNull(),
    lastSeenAt: timestamp("last_seen_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    firstSeenAt: timestamp("first_seen_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("device_fingerprints_fingerprint_hash_key").using("btree", table.fingerprintHash.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "device_fingerprints_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

export const documentHashes = pgTable("document_hashes", {
    hash: text("hash").primaryKey().notNull(),
    docType: text("doc_type"),
    customerId: integer("customer_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("idx_document_hashes_type_customer").using("btree", table.docType.asc().nullsLast().op("text_ops"), table.customerId.asc().nullsLast().op("int4_ops")),
]);

export const customerSecurityQuestions = pgTable("customer_security_questions", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    questionType: securityQuestionType("question_type").notNull(),
    question: text().notNull(),
    answerHash: text("answer_hash").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "customer_security_questions_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

export const customerLoginHistory = pgTable("customer_login_history", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    deviceFingerprintId: integer("device_fingerprint_id"),
    loginStatus: loginStatus("login_status").notNull(),
    ipAddress: text("ip_address").notNull(),
    countryCode: text("country_code"),
    city: text(),
    region: text(),
    isp: text(),
    isVpn: boolean("is_vpn").default(false).notNull(),
    isProxy: boolean("is_proxy").default(false).notNull(),
    deviceInfo: jsonb("device_info"),
    browserInfo: jsonb("browser_info"),
    userAgent: text("user_agent"),
    screenResolution: text("screen_resolution"),
    timezone: text(),
    language: text(),
    riskScore: doublePrecision("risk_score").default(0).notNull(),
    fraudIndicators: jsonb("fraud_indicators"),
    failureReason: text("failure_reason"),
    otpAttempts: integer("otp_attempts").default(0).notNull(),
    securityQuestionAttempts: integer("security_question_attempts").default(0).notNull(),
    sessionDuration: integer("session_duration"),
    actionsCount: integer("actions_count").default(0).notNull(),
    loginAt: timestamp("login_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    logoutAt: timestamp("logout_at", { precision: 3, mode: 'string' }),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "customer_login_history_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.deviceFingerprintId],
        foreignColumns: [deviceFingerprints.id],
        name: "customer_login_history_device_fingerprint_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

export const fraudAlerts = pgTable("fraud_alerts", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    deviceFingerprintId: integer("device_fingerprint_id"),
    fraudType: fraudType("fraud_type").notNull(),
    riskLevel: riskLevel("risk_level").notNull(),
    confidenceScore: doublePrecision("confidence_score").notNull(),
    description: text().notNull(),
    indicators: jsonb().notNull(),
    ipAddress: text("ip_address"),
    countryCode: text("country_code"),
    deviceInfo: jsonb("device_info"),
    isResolved: boolean("is_resolved").default(false).notNull(),
    resolvedBy: integer("resolved_by"),
    resolutionNotes: text("resolution_notes"),
    resolvedAt: timestamp("resolved_at", { precision: 3, mode: 'string' }),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "fraud_alerts_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.deviceFingerprintId],
        foreignColumns: [deviceFingerprints.id],
        name: "fraud_alerts_device_fingerprint_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.resolvedBy],
        foreignColumns: [users.id],
        name: "fraud_alerts_resolved_by_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

export const jobApplications = pgTable("job_applications", {
    id: serial().primaryKey().notNull(),
    fullName: text("full_name").notNull(),
    email: text().notNull(),
    phone: text().notNull(),
    portfolio: text(),
    coverLetter: text("cover_letter").notNull(),
    jobTitle: text("job_title").notNull(),
    cvUrl: text("cv_url").notNull(), // EdgeStore URL
    status: text().default('PENDING').notNull(), // PENDING, REVIEWED, REJECTED, HIRED
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    deviceInfo: jsonb("device_info"), // Captured from frontend
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("job_applications_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
    index("job_applications_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
    index("job_applications_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
]);

export const customerBehaviorProfiles = pgTable("customer_behavior_profiles", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    typicalLoginHours: jsonb("typical_login_hours"),
    typicalLocations: jsonb("typical_locations"),
    typicalDevices: jsonb("typical_devices"),
    typicalSessionDuration: doublePrecision("typical_session_duration"),
    typicalActionsPerSession: doublePrecision("typical_actions_per_session"),
    loginFrequency: doublePrecision("login_frequency"),
    riskTolerance: doublePrecision("risk_tolerance").default(0.5).notNull(),
    behavioralScore: doublePrecision("behavioral_score").default(0.5).notNull(),
    lastAnalysisAt: timestamp("last_analysis_at", { precision: 3, mode: 'string' }),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("customer_behavior_profiles_customer_id_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "customer_behavior_profiles_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

export const securityEvents = pgTable("security_events", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id"),
    eventType: text("event_type").notNull(),
    severity: riskLevel().notNull(),
    description: text().notNull(),
    metadata: jsonb(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    isResolved: boolean("is_resolved").default(false).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "security_events_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

export const partnerActions = pgTable("partner_actions", {
    id: serial().primaryKey().notNull(),
    partnerId: integer("partner_id").notNull(),
    targetCustomerId: integer("target_customer_id"),
    actionType: partnerActionType("action_type").notNull(),
    actionDescription: text("action_description").notNull(),
    amount: numeric({ precision: 15, scale: 2 }),
    ipAddress: text("ip_address"),
    deviceInfo: jsonb("device_info"),
    locationData: jsonb("location_data"),
    requiresApproval: boolean("requires_approval").default(false).notNull(),
    approvedBy: integer("approved_by"),
    approvalDate: timestamp("approval_date", { precision: 3, mode: 'string' }),
    isSuspicious: boolean("is_suspicious").default(false).notNull(),
    riskScore: doublePrecision("risk_score").default(0).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    foreignKey({
        columns: [table.partnerId],
        foreignColumns: [customers.id],
        name: "partner_actions_partner_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.targetCustomerId],
        foreignColumns: [customers.id],
        name: "partner_actions_target_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.approvedBy],
        foreignColumns: [users.id],
        name: "partner_actions_approved_by_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

export const partnerSecurityLimits = pgTable("partner_security_limits", {
    id: serial().primaryKey().notNull(),
    partnerId: integer("partner_id").notNull(),
    limitType: partnerLimitType("limit_type").notNull(),
    dailyLimit: numeric("daily_limit", { precision: 15, scale: 2 }),
    monthlyLimit: numeric("monthly_limit", { precision: 15, scale: 2 }),
    transactionLimit: numeric("transaction_limit", { precision: 15, scale: 2 }),
    operationCountLimit: integer("operation_count_limit"),
    currentDailyUsage: numeric("current_daily_usage", { precision: 15, scale: 2 }).default('0').notNull(),
    currentMonthlyUsage: numeric("current_monthly_usage", { precision: 15, scale: 2 }).default('0').notNull(),
    currentOperationCount: integer("current_operation_count").default(0).notNull(),
    lastResetDate: timestamp("last_reset_date", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("partner_security_limits_partner_id_limit_type_key").using("btree", table.partnerId.asc().nullsLast().op("int4_ops"), table.limitType.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.partnerId],
        foreignColumns: [customers.id],
        name: "partner_security_limits_partner_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

export const partnerSupervisorRelations = pgTable("partner_supervisor_relations", {
    id: serial().primaryKey().notNull(),
    partnerId: integer("partner_id").notNull(),
    supervisorId: integer("supervisor_id").notNull(),
    assignedDate: timestamp("assigned_date", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    territory: text(),
    notes: text(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("partner_supervisor_relations_partner_id_supervisor_id_key").using("btree", table.partnerId.asc().nullsLast().op("int4_ops"), table.supervisorId.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.partnerId],
        foreignColumns: [customers.id],
        name: "partner_supervisor_relations_partner_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.supervisorId],
        foreignColumns: [customers.id],
        name: "partner_supervisor_relations_supervisor_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

export const otp = pgTable("otp", {
    id: text().primaryKey().notNull(),
    customerId: integer("customer_id"),
    contact: text().notNull(),
    contactType: text("contact_type").notNull(),
    otpCode: text("otp_code").notNull(),
    purpose: text().notNull(),
    expiresAt: timestamp("expires_at", { precision: 3, mode: 'string' }).notNull(),
    currentAttempts: integer("current_attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    isUsed: boolean("is_used").default(false).notNull(),
    sendChannel: text("send_channel"),
    messageId: text("message_id"),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("otp_contact_contact_type_purpose_is_used_idx").using("btree", table.contact.asc().nullsLast().op("text_ops"), table.contactType.asc().nullsLast().op("text_ops"), table.purpose.asc().nullsLast().op("bool_ops"), table.isUsed.asc().nullsLast().op("bool_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "otp_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

export const countries = pgTable("countries", {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    code: text().notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("countries_code_key").using("btree", table.code.asc().nullsLast().op("text_ops")),
    uniqueIndex("countries_name_key").using("btree", table.name.asc().nullsLast().op("text_ops")),
]);

export const cities = pgTable("cities", {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    countryId: integer("country_id").notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("cities_name_country_id_key").using("btree", table.name.asc().nullsLast().op("int4_ops"), table.countryId.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.countryId],
        foreignColumns: [countries.id],
        name: "cities_country_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

export const communes = pgTable("communes", {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    cityId: integer("city_id").notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("communes_name_city_id_key").using("btree", table.name.asc().nullsLast().op("int4_ops"), table.cityId.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.cityId],
        foreignColumns: [cities.id],
        name: "communes_city_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

export const agencies = pgTable("agencies", {
    id: serial().primaryKey().notNull(),
    code: varchar("code", { length: 2 }).notNull(), // '01', '02', '03', '04'
    name: text().notNull(),
    communeId: integer("commune_id"),
    active: boolean().default(true).notNull(),
    address: text(),
    phone: text(),
    managerId: integer("manager_id"), // One manager per agency
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("agencies_commune_id_idx").using("btree", table.communeId.asc().nullsLast().op("int4_ops")),
    index("agencies_manager_id_idx").using("btree", table.managerId.asc().nullsLast().op("int4_ops")),
    uniqueIndex("agencies_name_key").using("btree", table.name.asc().nullsLast().op("text_ops")),
    uniqueIndex("agencies_code_key").using("btree", table.code.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.communeId],
        foreignColumns: [communes.id],
        name: "agencies_commune_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    // Note: managerId foreign key is handled via relations to avoid circular dependency
]);

// Table agents - Agents physiques et virtuels
export const agents = pgTable("agents", {
    id: serial().primaryKey().notNull(),
    code: varchar("code", { length: 5 }).notNull(), // '00001' à '99999'
    type: text("type").notNull(), // 'PHYSICAL' ou 'VIRTUAL'
    name: text().notNull(),
    agencyId: integer("agency_id"), // Agent peut être affecté à une agence
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("agents_code_key").using("btree", table.code.asc().nullsLast().op("text_ops")),
    index("agents_agency_id_idx").using("btree", table.agencyId.asc().nullsLast().op("int4_ops")),
    index("agents_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.agencyId],
        foreignColumns: [agencies.id],
        name: "agents_agency_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

export const quartiers = pgTable("quartiers", {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    communeId: integer("commune_id").notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("quartiers_name_commune_id_key").using("btree", table.name.asc().nullsLast().op("int4_ops"), table.communeId.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.communeId],
        foreignColumns: [communes.id],
        name: "quartiers_commune_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

export const postalCodes = pgTable("postal_codes", {
    id: serial().primaryKey().notNull(),
    code: text().notNull(),
    quartierId: integer("quartier_id").notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("postal_codes_code_quartier_id_key").using("btree", table.code.asc().nullsLast().op("int4_ops"), table.quartierId.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.quartierId],
        foreignColumns: [quartiers.id],
        name: "postal_codes_quartier_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

// Relations
export const contactChangeLogsRelations = relations(contactChangeLogs, ({ one }) => ({
    customer: one(customers, {
        fields: [contactChangeLogs.customerId],
        references: [customers.id]
    }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
    contactChangeLogs: many(contactChangeLogs),
    kycDrafts: many(kycDrafts),
    otpEvents: many(otpEvents),
    user: one(users, {
        fields: [customers.createdById],
        references: [users.id]
    }),
    customer: one(customers, {
        fields: [customers.managedByPartnerId],
        references: [customers.id],
        relationName: "customers_managedByPartnerId_customers_id"
    }),
    customers: many(customers, {
        relationName: "customers_managedByPartnerId_customers_id"
    }),
    agency: one(agencies, {
        fields: [customers.agencyId],
        references: [agencies.id]
    }),
    quartier: one(quartiers, {
        fields: [customers.quartierId],
        references: [quartiers.id]
    }),
    postalCode: one(postalCodes, {
        fields: [customers.postalCodeId],
        references: [postalCodes.id]
    }),
    accounts: many(accounts),
    credits: many(credits),
    deviceFingerprints: many(deviceFingerprints),
    customerSecurityQuestions: many(customerSecurityQuestions),
    customerLoginHistories: many(customerLoginHistory),
    fraudAlerts: many(fraudAlerts),
    customerBehaviorProfiles: many(customerBehaviorProfiles),
    securityEvents: many(securityEvents),
    partnerActions_partnerId: many(partnerActions, {
        relationName: "partnerActions_partnerId_customers_id"
    }),
    partnerActions_targetCustomerId: many(partnerActions, {
        relationName: "partnerActions_targetCustomerId_customers_id"
    }),
    partnerSecurityLimits: many(partnerSecurityLimits),
    partnerSupervisorRelations_partnerId: many(partnerSupervisorRelations, {
        relationName: "partnerSupervisorRelations_partnerId_customers_id"
    }),
    partnerSupervisorRelations_supervisorId: many(partnerSupervisorRelations, {
        relationName: "partnerSupervisorRelations_supervisorId_customers_id"
    }),
    otps: many(otp),
    bwakisaServices: many(bwakisaServices), // Added relation
}));

export const kycDraftsRelations = relations(kycDrafts, ({ one }) => ({
    customer: one(customers, {
        fields: [kycDrafts.customerId],
        references: [customers.id]
    }),
}));

export const otpEventsRelations = relations(otpEvents, ({ one }) => ({
    otp: one(otp, {
        fields: [otpEvents.otpId],
        references: [otp.id]
    }),
    customer: one(customers, {
        fields: [otpEvents.customerId],
        references: [customers.id]
    }),
}));

export const otpRelations = relations(otp, ({ one, many }) => ({
    otpEvents: many(otpEvents),
    customer: one(customers, {
        fields: [otp.customerId],
        references: [customers.id]
    }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
    customers: many(customers),
    role: one(roles, {
        fields: [users.roleId],
        references: [roles.id]
    }),
    agency: one(agencies, {
        fields: [users.agencyId],
        references: [agencies.id]
    }),
    auditLogs: many(auditLogs),
    userSessions: many(userSessions),
    fraudAlerts: many(fraudAlerts),
    partnerActions: many(partnerActions),
}));

export const agenciesRelations = relations(agencies, ({ one, many }) => ({
    customers: many(customers),
    agents: many(agents),
    users: many(users), // Users (e.g., cashiers) assigned to this agency
    commune: one(communes, {
        fields: [agencies.communeId],
        references: [communes.id]
    }),
    manager: one(users, {
        fields: [agencies.managerId],
        references: [users.id]
    }),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
    customers: many(customers),
    agency: one(agencies, {
        fields: [agents.agencyId],
        references: [agencies.id]
    }),
}));

export const quartiersRelations = relations(quartiers, ({ one, many }) => ({
    customers: many(customers),
    commune: one(communes, {
        fields: [quartiers.communeId],
        references: [communes.id]
    }),
    postalCodes: many(postalCodes),
}));

export const postalCodesRelations = relations(postalCodes, ({ one, many }) => ({
    customers: many(customers),
    quartier: one(quartiers, {
        fields: [postalCodes.quartierId],
        references: [quartiers.id]
    }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
    users: many(users),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
    customer: one(customers, {
        fields: [accounts.customerId],
        references: [customers.id]
    }),
    transactions: many(transactions),
}));

export const creditsRelations = relations(credits, ({ one, many }) => ({
    customer: one(customers, {
        fields: [credits.customerId],
        references: [customers.id]
    }),
    transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
    account: one(accounts, {
        fields: [transactions.accountId],
        references: [accounts.id]
    }),
    credit: one(credits, {
        fields: [transactions.creditId],
        references: [credits.id]
    }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
    user: one(users, {
        fields: [auditLogs.userId],
        references: [users.id]
    }),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
    user: one(users, {
        fields: [userSessions.userId],
        references: [users.id]
    }),
    deviceFingerprint: one(deviceFingerprints, {
        fields: [userSessions.deviceFingerprintId],
        references: [deviceFingerprints.id]
    }),
}));

export const deviceFingerprintsRelations = relations(deviceFingerprints, ({ one, many }) => ({
    userSessions: many(userSessions),
    customer: one(customers, {
        fields: [deviceFingerprints.customerId],
        references: [customers.id]
    }),
    customerLoginHistories: many(customerLoginHistory),
    fraudAlerts: many(fraudAlerts),
}));

export const communesRelations = relations(communes, ({ one, many }) => ({
    agencies: many(agencies),
    quartiers: many(quartiers),
    city: one(cities, {
        fields: [communes.cityId],
        references: [cities.id]
    }),
}));

export const customerSecurityQuestionsRelations = relations(customerSecurityQuestions, ({ one }) => ({
    customer: one(customers, {
        fields: [customerSecurityQuestions.customerId],
        references: [customers.id]
    }),
}));

export const customerLoginHistoryRelations = relations(customerLoginHistory, ({ one }) => ({
    customer: one(customers, {
        fields: [customerLoginHistory.customerId],
        references: [customers.id]
    }),
    deviceFingerprint: one(deviceFingerprints, {
        fields: [customerLoginHistory.deviceFingerprintId],
        references: [deviceFingerprints.id]
    }),
}));

export const fraudAlertsRelations = relations(fraudAlerts, ({ one }) => ({
    customer: one(customers, {
        fields: [fraudAlerts.customerId],
        references: [customers.id]
    }),
    deviceFingerprint: one(deviceFingerprints, {
        fields: [fraudAlerts.deviceFingerprintId],
        references: [deviceFingerprints.id]
    }),
    user: one(users, {
        fields: [fraudAlerts.resolvedBy],
        references: [users.id]
    }),
}));

export const customerBehaviorProfilesRelations = relations(customerBehaviorProfiles, ({ one }) => ({
    customer: one(customers, {
        fields: [customerBehaviorProfiles.customerId],
        references: [customers.id]
    }),
}));

export const securityEventsRelations = relations(securityEvents, ({ one }) => ({
    customer: one(customers, {
        fields: [securityEvents.customerId],
        references: [customers.id]
    }),
}));

export const partnerActionsRelations = relations(partnerActions, ({ one }) => ({
    customer_partnerId: one(customers, {
        fields: [partnerActions.partnerId],
        references: [customers.id],
        relationName: "partnerActions_partnerId_customers_id"
    }),
    customer_targetCustomerId: one(customers, {
        fields: [partnerActions.targetCustomerId],
        references: [customers.id],
        relationName: "partnerActions_targetCustomerId_customers_id"
    }),
    user: one(users, {
        fields: [partnerActions.approvedBy],
        references: [users.id]
    }),
}));

export const partnerSecurityLimitsRelations = relations(partnerSecurityLimits, ({ one }) => ({
    customer: one(customers, {
        fields: [partnerSecurityLimits.partnerId],
        references: [customers.id]
    }),
}));

export const partnerSupervisorRelationsRelations = relations(partnerSupervisorRelations, ({ one }) => ({
    customer_partnerId: one(customers, {
        fields: [partnerSupervisorRelations.partnerId],
        references: [customers.id],
        relationName: "partnerSupervisorRelations_partnerId_customers_id"
    }),
    customer_supervisorId: one(customers, {
        fields: [partnerSupervisorRelations.supervisorId],
        references: [customers.id],
        relationName: "partnerSupervisorRelations_supervisorId_customers_id"
    }),
}));

export const citiesRelations = relations(cities, ({ one, many }) => ({
    country: one(countries, {
        fields: [cities.countryId],
        references: [countries.id]
    }),
    communes: many(communes),
}));

export const countriesRelations = relations(countries, ({ many }) => ({
    cities: many(cities),
}));

export const bwakisaServicesRelations = relations(bwakisaServices, ({ one }) => ({
    customer: one(customers, {
        fields: [bwakisaServices.customerId],
        references: [customers.id],
    }),
}));

export const serenityPointsLedger = pgTable("serenity_points_ledger", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    points: integer("points").notNull(),
    type: text("type").notNull(), // EARNED, REDEEMED, EXPIRED, BONUS
    operationType: text("operation_type"), // Reference to loyalty_point_types.code
    operationId: integer("operation_id"), // Reference to specific operation (credit_id, transaction_id, etc)
    description: text("description"),
    metadata: jsonb("metadata"), // Additional context
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Catalogue des types de crédits (aucune donnée statique)
export const creditTypes = pgTable("credit_types", {
    id: serial().primaryKey().notNull(),
    code: varchar("code", { length: 20 }).notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    description: text().notNull(),
    status: accountStatus("status").default('ACTIVE').notNull(),
    allowedCurrencies: currency("allowed_currencies").array().notNull(),
    repaymentFrequency: varchar("repayment_frequency", { length: 20 }).notNull(),
    config: jsonb("config"),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("credit_types_code_key").using("btree", table.code.asc().nullsLast().op("text_ops")),
]);

export const serenityPointsLedgerRelations = relations(serenityPointsLedger, ({ one }) => ({
    customer: one(customers, {
        fields: [serenityPointsLedger.customerId],
        references: [customers.id],
    }),
}));

// 2FA Error Reports table for tracking authentication issues
export const twoFactorErrorReports = pgTable("two_factor_error_reports", {
    id: serial().primaryKey().notNull(),
    // User information (can be null if error occurs before authentication)
    customerId: integer("customer_id"),
    userEmail: text("user_email"),
    userPhone: text("user_phone"),

    // Error context
    errorType: text("error_type").notNull(), // 'LOGIN_FAILED', 'CODE_REJECTED', 'TIMEOUT', 'OTHER'
    errorMessage: text("error_message"),
    userDescription: text("user_description"), // User's description of the issue

    // Technical details
    failedAttempts: integer("failed_attempts").default(0).notNull(),
    authenticatorApp: text("authenticator_app"), // 'Google', 'Microsoft', 'Authy', etc.
    deviceInfo: jsonb("device_info"), // Browser, OS, device type
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    // Screenshot and attachments
    screenshotUrl: text("screenshot_url"), // URL to stored screenshot
    screenshotData: text("screenshot_data"), // Base64 screenshot data (temporary)

    // Admin tracking
    status: text("status").default('PENDING').notNull(), // 'PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'
    assignedTo: integer("assigned_to"), // Admin user ID
    adminNotes: text("admin_notes"),
    resolvedAt: timestamp("resolved_at", { precision: 3, mode: 'string' }),
    resolution: text("resolution"),

    // Timestamps
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("two_factor_error_reports_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("two_factor_error_reports_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
    index("two_factor_error_reports_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "two_factor_error_reports_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.assignedTo],
        foreignColumns: [users.id],
        name: "two_factor_error_reports_assigned_to_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

// ===== PARTNER POINTS SYSTEM =====
// Points earned by partners for various operations
export const partnerPoints = pgTable("partner_points", {
    id: serial().primaryKey().notNull(),
    partnerId: integer("partner_id").notNull(),
    points: integer("points").notNull(), // Points awarded/deducted
    operationType: text("operation_type").notNull(), // 'CLIENT_CREATION', 'DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'CREDIT_APPLICATION', 'APP_INSTALL'
    operationId: integer("operation_id"), // Reference to partner_operations.id
    description: text("description").notNull(),
    metadata: jsonb("metadata"), // Additional context (amount, client info, etc.)
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("partner_points_partner_id_idx").using("btree", table.partnerId.asc().nullsLast().op("int4_ops")),
    index("partner_points_operation_type_idx").using("btree", table.operationType.asc().nullsLast().op("text_ops")),
    index("partner_points_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
    foreignKey({
        columns: [table.partnerId],
        foreignColumns: [customers.id],
        name: "partner_points_partner_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

// Track all partner operations for audit and points calculation
export const partnerOperations = pgTable("partner_operations", {
    id: serial().primaryKey().notNull(),
    partnerId: integer("partner_id").notNull(),
    operationType: text("operation_type").notNull(), // 'CLIENT_CREATION', 'DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'CREDIT'
    targetCustomerId: integer("target_customer_id"), // For operations on members
    amount: numeric("amount", { precision: 15, scale: 2 }), // Transaction amount
    currency: currency("currency").default('CDF'),
    description: text("description").notNull(),
    status: text("status").default('PENDING').notNull(), // 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'
    pointsAwarded: integer("points_awarded").default(0).notNull(),
    metadata: jsonb("metadata"), // Operation-specific data
    approvedBy: integer("approved_by"), // Admin who approved
    approvalDate: timestamp("approval_date", { precision: 3, mode: 'string' }),
    completedAt: timestamp("completed_at", { precision: 3, mode: 'string' }),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("partner_operations_partner_id_idx").using("btree", table.partnerId.asc().nullsLast().op("int4_ops")),
    index("partner_operations_target_customer_id_idx").using("btree", table.targetCustomerId.asc().nullsLast().op("int4_ops")),
    index("partner_operations_operation_type_idx").using("btree", table.operationType.asc().nullsLast().op("text_ops")),
    index("partner_operations_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
    index("partner_operations_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
    foreignKey({
        columns: [table.partnerId],
        foreignColumns: [customers.id],
        name: "partner_operations_partner_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.targetCustomerId],
        foreignColumns: [customers.id],
        name: "partner_operations_target_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.approvedBy],
        foreignColumns: [users.id],
        name: "partner_operations_approved_by_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

// Track mobile app installations attributed to partners
export const mobileAppInstalls = pgTable("mobile_app_installs", {
    id: serial().primaryKey().notNull(),
    partnerId: integer("partner_id").notNull(),
    customerId: integer("customer_id").notNull(), // Member who installed the app
    referralCode: text("referral_code").notNull(), // Unique partner referral code
    deviceInfo: jsonb("device_info"), // Device type, OS, app version
    installDate: timestamp("install_date", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    pointsAwarded: integer("points_awarded").default(0).notNull(),
    verified: boolean("verified").default(false).notNull(), // Admin verification
    verifiedBy: integer("verified_by"),
    verifiedAt: timestamp("verified_at", { precision: 3, mode: 'string' }),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("mobile_app_installs_customer_id_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops")), // One install per customer
    index("mobile_app_installs_partner_id_idx").using("btree", table.partnerId.asc().nullsLast().op("int4_ops")),
    index("mobile_app_installs_referral_code_idx").using("btree", table.referralCode.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.partnerId],
        foreignColumns: [customers.id],
        name: "mobile_app_installs_partner_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "mobile_app_installs_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.verifiedBy],
        foreignColumns: [users.id],
        name: "mobile_app_installs_verified_by_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

// Partner approval workflow - tracks approval status and agency assignment
export const partnerApprovals = pgTable("partner_approvals", {
    id: serial().primaryKey().notNull(),
    partnerId: integer("partner_id").notNull(),
    status: text("status").default('PENDING').notNull(), // 'PENDING', 'APPROVED', 'REJECTED'
    agencyId: integer("agency_id"), // Assigned agency
    approvedBy: integer("approved_by"),
    approvalDate: timestamp("approval_date", { precision: 3, mode: 'string' }),
    rejectionReason: text("rejection_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("partner_approvals_partner_id_key").using("btree", table.partnerId.asc().nullsLast().op("int4_ops")),
    index("partner_approvals_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.partnerId],
        foreignColumns: [customers.id],
        name: "partner_approvals_partner_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.agencyId],
        foreignColumns: [agencies.id],
        name: "partner_approvals_agency_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.approvedBy],
        foreignColumns: [users.id],
        name: "partner_approvals_approved_by_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

// ===== PARTNER COMMISSION SYSTEM =====
// Commission configurations define how much partners earn for operations
export const commissionConfigurations = pgTable("commission_configurations", {
    id: serial().primaryKey().notNull(),
    operationType: text("operation_type").notNull(), // 'CLIENT_CREATION', 'DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'CREDIT_APPLICATION', 'APP_INSTALL'
    commissionAmountUsd: numeric("commission_amount_usd", { precision: 15, scale: 2 }).default('0').notNull(),
    commissionAmountCdf: numeric("commission_amount_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
    commissionPercentage: numeric("commission_percentage", { precision: 5, scale: 2 }), // Optional: percentage of transaction amount
    validFrom: timestamp("valid_from", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    validUntil: timestamp("valid_until", { precision: 3, mode: 'string' }), // NULL = no expiration
    isActive: boolean("is_active").default(true).notNull(),
    description: text("description"),
    conditions: jsonb("conditions"), // Additional conditions (min amount, partner level, etc.)
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("commission_configurations_operation_type_idx").using("btree", table.operationType.asc().nullsLast().op("text_ops")),
    index("commission_configurations_valid_from_idx").using("btree", table.validFrom.asc().nullsLast().op("timestamp_ops")),
    index("commission_configurations_is_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
    foreignKey({
        columns: [table.createdBy],
        foreignColumns: [users.id],
        name: "commission_configurations_created_by_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

// Track commissions earned by partners for each operation
export const partnerCommissions = pgTable("partner_commissions", {
    id: serial().primaryKey().notNull(),
    partnerId: integer("partner_id").notNull(),
    operationId: integer("operation_id").notNull(), // Reference to partner_operations.id
    configurationId: integer("configuration_id").notNull(), // Which commission config was used
    amountUsd: numeric("amount_usd", { precision: 15, scale: 2 }).default('0').notNull(),
    amountCdf: numeric("amount_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
    calculationBasis: jsonb("calculation_basis"), // How commission was calculated (fixed, percentage, etc.)
    status: text("status").default('PENDING').notNull(), // 'PENDING', 'APPROVED', 'PAID', 'CANCELLED'
    paidAt: timestamp("paid_at", { precision: 3, mode: 'string' }),
    paymentReference: text("payment_reference"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("partner_commissions_partner_id_idx").using("btree", table.partnerId.asc().nullsLast().op("int4_ops")),
    index("partner_commissions_operation_id_idx").using("btree", table.operationId.asc().nullsLast().op("int4_ops")),
    index("partner_commissions_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
    index("partner_commissions_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
    foreignKey({
        columns: [table.partnerId],
        foreignColumns: [customers.id],
        name: "partner_commissions_partner_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.operationId],
        foreignColumns: [partnerOperations.id],
        name: "partner_commissions_operation_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.configurationId],
        foreignColumns: [commissionConfigurations.id],
        name: "partner_commissions_configuration_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

// Notifications sent to partners about commission changes
export const commissionNotifications = pgTable("commission_notifications", {
    id: serial().primaryKey().notNull(),
    partnerId: integer("partner_id").notNull(),
    configurationId: integer("configuration_id"), // Which config changed (optional)
    notificationType: text("notification_type").notNull(), // 'CONFIG_CREATED', 'CONFIG_UPDATED', 'CONFIG_EXPIRED', 'COMMISSION_EARNED'
    title: text("title").notNull(),
    message: text("message").notNull(),
    data: jsonb("data"), // Additional data (old values, new values, etc.)
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at", { precision: 3, mode: 'string' }),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("commission_notifications_partner_id_idx").using("btree", table.partnerId.asc().nullsLast().op("int4_ops")),
    index("commission_notifications_is_read_idx").using("btree", table.isRead.asc().nullsLast().op("bool_ops")),
    index("commission_notifications_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
    foreignKey({
        columns: [table.partnerId],
        foreignColumns: [customers.id],
        name: "commission_notifications_partner_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
    foreignKey({
        columns: [table.configurationId],
        foreignColumns: [commissionConfigurations.id],
        name: "commission_notifications_configuration_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

// Billing History - Track all billing charges for customers
export const billingHistory = pgTable("billing_history", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    accountId: integer("account_id"),
    billingType: text("billing_type").notNull(), // 'NOTIFICATION_SERVICE', 'ACCOUNT_MAINTENANCE', 'OTHER'
    serviceType: text("service_type"), // 'EMAIL', 'SMS', 'PUSH_NOTIFICATION', null for account fees
    description: text().notNull(),
    amountUsd: numeric("amount_usd", { precision: 10, scale: 2 }).notNull(),
    amountCdf: numeric("amount_cdf", { precision: 10, scale: 2 }).notNull(),
    currencyCharged: text("currency_charged").notNull(), // 'USD' or 'CDF'
    billingPeriodStart: timestamp("billing_period_start", { precision: 3, mode: 'string' }).notNull(),
    billingPeriodEnd: timestamp("billing_period_end", { precision: 3, mode: 'string' }).notNull(),
    chargedAt: timestamp("charged_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    status: text().default('COMPLETED').notNull(), // 'COMPLETED', 'PENDING', 'FAILED'
    transactionId: integer("transaction_id"), // Link to transaction if applicable
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("billing_history_customer_id_charged_at_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops"), table.chargedAt.desc().nullsLast().op("timestamp_ops")),
    index("billing_history_billing_type_charged_at_idx").using("btree", table.billingType.asc().nullsLast().op("text_ops"), table.chargedAt.desc().nullsLast().op("timestamp_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "billing_history_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
    foreignKey({
        columns: [table.accountId],
        foreignColumns: [accounts.id],
        name: "billing_history_account_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

// Support Tickets - Customer support and service deactivation requests
export const supportTickets = pgTable("support_tickets", {
    id: text().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    publicId: text("public_id").notNull(), // For easy customer reference
    ticketType: text("ticket_type").notNull(), // 'SERVICE_DEACTIVATION', 'ACCOUNT_ISSUE', 'GENERAL_INQUIRY', 'COMPLAINT'
    subject: text().notNull(),
    description: text().notNull(),
    priority: text().default('MEDIUM').notNull(), // 'LOW', 'MEDIUM', 'HIGH', 'URGENT'
    status: text().default('OPEN').notNull(), // 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'
    relatedService: text("related_service"), // Service concerné if applicable ('EMAIL', 'SMS', etc.)
    assignedTo: integer("assigned_to"), // Admin user ID
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    resolvedAt: timestamp("resolved_at", { precision: 3, mode: 'string' }),
    closedAt: timestamp("closed_at", { precision: 3, mode: 'string' }),
}, (table) => [
    uniqueIndex("support_tickets_public_id_key").using("btree", table.publicId.asc().nullsLast().op("text_ops")),
    index("support_tickets_customer_id_status_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops"), table.status.asc().nullsLast().op("text_ops")),
    index("support_tickets_status_priority_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.priority.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "support_tickets_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);

// Ticket Messages - Chat communication for support tickets
export const ticketMessages = pgTable("ticket_messages", {
    id: text().primaryKey().notNull(),
    ticketId: text("ticket_id").notNull(),
    senderType: text("sender_type").notNull(), // 'CUSTOMER', 'SUPPORT', 'SYSTEM'
    senderId: integer("sender_id"), // Customer ID or Admin ID
    message: text().notNull(),
    isInternalNote: boolean("is_internal_note").default(false).notNull(), // Internal notes visible only to support
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("ticket_messages_ticket_id_created_at_idx").using("btree", table.ticketId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
    foreignKey({
        columns: [table.ticketId],
        foreignColumns: [supportTickets.id],
        name: "ticket_messages_ticket_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);

// Customer Account Services - Notification services subscription
export const customerAccountServices = pgTable("customer_account_services", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    accountId: integer("account_id").notNull(),
    smsEnabled: boolean("sms_enabled").default(false).notNull(),
    emailEnabled: boolean("email_enabled").default(false).notNull(),
    pushNotificationEnabled: boolean("push_notification_enabled").default(false).notNull(),
    inAppNotificationEnabled: boolean("in_app_notification_enabled").default(true).notNull(),
    servicesActivatedAt: timestamp("services_activated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    monthlyTotalFeeUsd: numeric("monthly_total_fee_usd", { precision: 10, scale: 2 }).default('0').notNull(),
    monthlyTotalFeeCdf: numeric("monthly_total_fee_cdf", { precision: 10, scale: 2 }).default('0').notNull(),
    lastBillingDate: timestamp("last_billing_date", { precision: 3, mode: 'string' }),
    nextBillingDate: timestamp("next_billing_date", { precision: 3, mode: 'string' }),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("customer_account_services_customer_id_account_id_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops"), table.accountId.asc().nullsLast().op("int4_ops")),
    index("customer_account_services_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("customer_account_services_next_billing_date_idx").using("btree", table.nextBillingDate.asc().nullsLast().op("timestamp_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "customer_account_services_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
    foreignKey({
        columns: [table.accountId],
        foreignColumns: [accounts.id],
        name: "customer_account_services_account_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);

// Notification Service Fees Configuration
export const notificationServiceFees = pgTable("notification_service_fees", {
    id: serial().primaryKey().notNull(),
    serviceType: text("service_type").notNull(), // 'EMAIL', 'SMS', 'PUSH_NOTIFICATION'
    serviceName: text("service_name").notNull(),
    description: text(),
    monthlyFeeUsd: numeric("monthly_fee_usd", { precision: 10, scale: 2 }).default('0').notNull(),
    monthlyFeeCdf: numeric("monthly_fee_cdf", { precision: 10, scale: 2 }).default('0').notNull(),
    isFree: boolean("is_free").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("notification_service_fees_service_type_key").using("btree", table.serviceType.asc().nullsLast().op("text_ops")),
]);

// ====================
// S04 CREDIT ALLOCATION SYSTEM
// ====================

// S04 Allocation - Buffer account (compte tampon) for credit management
export const s04Allocations = pgTable("s04_allocations", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    s04AccountId: integer("s04_account_id").notNull(),
    currency: text().default('USD').notNull(),
    totalAllocated: numeric("total_allocated", { precision: 15, scale: 2 }).default('0').notNull(),
    totalDebt: numeric("total_debt", { precision: 15, scale: 2 }).default('0').notNull(),
    availableBalance: numeric("available_balance", { precision: 15, scale: 2 }).default('0').notNull(),
    commissionRate: numeric("commission_rate", { precision: 5, scale: 4 }).default('0.10').notNull(),
    commissionCollected: numeric("commission_collected", { precision: 15, scale: 2 }).default('0').notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("s04_allocations_customer_id_s04_account_id_currency_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops"), table.s04AccountId.asc().nullsLast().op("int4_ops"), table.currency.asc().nullsLast().op("text_ops")),
    index("s04_allocations_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("s04_allocations_s04_account_id_idx").using("btree", table.s04AccountId.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "s04_allocations_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.s04AccountId],
        foreignColumns: [accounts.id],
        name: "s04_allocations_s04_account_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

// Credit Requests - Demandes de crédit pour S04
export const creditRequests = pgTable("credit_requests", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    s04AccountId: integer("s04_account_id").notNull(),
    allocationId: integer("allocation_id").notNull(),
    requestNumber: text("request_number").notNull(),
    amountRequested: numeric("amount_requested", { precision: 15, scale: 2 }).notNull(),
    amountApproved: numeric("amount_approved", { precision: 15, scale: 2 }),
    commissionAmount: numeric("commission_amount", { precision: 15, scale: 2 }).default('0').notNull(),
    netAmount: numeric("net_amount", { precision: 15, scale: 2 }),
    currency: text().default('USD').notNull(),
    status: text().default('PENDING').notNull(),
    requestedAt: timestamp("requested_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    approvedAt: timestamp("approved_at", { precision: 3, mode: 'string' }),
    disbursedAt: timestamp("disbursed_at", { precision: 3, mode: 'string' }),
    approvedBy: integer("approved_by"),
    rejectionReason: text("rejection_reason"),
    dueDate: timestamp("due_date", { precision: 3, mode: 'string' }),
    repaymentStatus: text("repayment_status").default('UNPAID').notNull(),
    amountRepaid: numeric("amount_repaid", { precision: 15, scale: 2 }).default('0').notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("credit_requests_request_number_key").using("btree", table.requestNumber.asc().nullsLast().op("text_ops")),
    index("credit_requests_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("credit_requests_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
    index("credit_requests_allocation_id_idx").using("btree", table.allocationId.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "credit_requests_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.s04AccountId],
        foreignColumns: [accounts.id],
        name: "credit_requests_s04_account_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.allocationId],
        foreignColumns: [s04Allocations.id],
        name: "credit_requests_allocation_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

// Credit Repayments - Historique des remboursements
export const creditRepayments = pgTable("credit_repayments", {
    id: serial().primaryKey().notNull(),
    creditRequestId: integer("credit_request_id").notNull(),
    customerId: integer("customer_id").notNull(),
    allocationId: integer("allocation_id").notNull(),
    amount: numeric({ precision: 15, scale: 2 }).notNull(),
    currency: text().default('USD').notNull(),
    paymentMethod: text("payment_method"),
    sourceAccountId: integer("source_account_id"),
    repaidAt: timestamp("repaid_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    processedBy: integer("processed_by"),
    notes: text(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("credit_repayments_credit_request_id_idx").using("btree", table.creditRequestId.asc().nullsLast().op("int4_ops")),
    index("credit_repayments_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.creditRequestId],
        foreignColumns: [creditRequests.id],
        name: "credit_repayments_credit_request_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "credit_repayments_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

// Customer Credit Eligibility - Whitelist/Blacklist
export const customerCreditEligibility = pgTable("customer_credit_eligibility", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    eligibilityStatus: text("eligibility_status").default('NEUTRAL').notNull(),
    creditScore: integer("credit_score").default(0).notNull(),
    maxCreditLimit: numeric("max_credit_limit", { precision: 15, scale: 2 }).default('0').notNull(),
    currentCreditUsed: numeric("current_credit_used", { precision: 15, scale: 2 }).default('0').notNull(),
    totalLoansCompleted: integer("total_loans_completed").default(0).notNull(),
    totalLoansDefaulted: integer("total_loans_defaulted").default(0).notNull(),
    onTimeRepaymentRate: numeric("on_time_repayment_rate", { precision: 5, scale: 2 }).default('0').notNull(),
    blacklistReason: text("blacklist_reason"),
    blacklistedAt: timestamp("blacklisted_at", { precision: 3, mode: 'string' }),
    blacklistedBy: integer("blacklisted_by"),
    whitelistReason: text("whitelist_reason"),
    whitelistedAt: timestamp("whitelisted_at", { precision: 3, mode: 'string' }),
    whitelistedBy: integer("whitelisted_by"),
    lastReviewDate: timestamp("last_review_date", { precision: 3, mode: 'string' }),
    nextReviewDate: timestamp("next_review_date", { precision: 3, mode: 'string' }),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("customer_credit_eligibility_customer_id_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("customer_credit_eligibility_eligibility_status_idx").using("btree", table.eligibilityStatus.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "customer_credit_eligibility_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);

// Pending Customer Modifications - Approval Workflow System
export const pendingCustomerChanges = pgTable("pending_customer_changes", {
    id: serial().primaryKey().notNull(),
    // Customer reference
    customerId: integer("customer_id").notNull(),
    // Type of modification requested
    changeType: modificationChangeType("change_type").notNull(),
    // Requested changes in JSONB format
    // Example: { s01_cdf: 5000, s01_usd: 100, firstName: "John" }
    requestedChanges: jsonb("requested_changes").notNull(),
    // Original values before modification (for rollback)
    originalValues: jsonb("original_values"),
    // Mandatory reason for modification (min 20 chars)
    reason: text("reason").notNull(),
    // Requester information
    requestedByAdminId: integer("requested_by_admin_id").notNull(),
    requestedByRole: text("requested_by_role").notNull(), // 'ADMIN', 'MANAGER', 'SUPER_ADMIN'
    requestedByName: text("requested_by_name").notNull(),
    requestedByIp: text("requested_by_ip").notNull(),
    requestedByUserAgent: text("requested_by_user_agent"),
    requestedByDeviceFingerprint: text("requested_by_device_fingerprint"),
    // Approver information (null if still pending)
    approvedByAdminId: integer("approved_by_admin_id"),
    approvedByRole: text("approved_by_role"),
    approvedByName: text("approved_by_name"),
    approvedAt: timestamp("approved_at", { precision: 3, mode: 'string' }),
    // Workflow status
    status: modificationStatus("status").default('PENDING').notNull(),
    rejectionReason: text("rejection_reason"), // Required if REJECTED
    // Expiration (auto-reject after 72h)
    expiresAt: timestamp("expires_at", { precision: 3, mode: 'string' }).notNull(),
    // Audit timestamps
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("pending_changes_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("pending_changes_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
    index("pending_changes_change_type_idx").using("btree", table.changeType.asc().nullsLast().op("enum_ops")),
    index("pending_changes_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamp_ops")),
    index("pending_changes_requested_by_idx").using("btree", table.requestedByAdminId.asc().nullsLast().op("int4_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "pending_changes_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
    foreignKey({
        columns: [table.requestedByAdminId],
        foreignColumns: [users.id],
        name: "pending_changes_requested_by_admin_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    foreignKey({
        columns: [table.approvedByAdminId],
        foreignColumns: [users.id],
        name: "pending_changes_approved_by_admin_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);

// ====================
// DYNAMIC CONDITIONS & ELIGIBILITY SYSTEM
// ====================

// Enums for eligibility system
export const notificationType = pgEnum("NotificationType", ['CELEBRATION', 'PROGRESS', 'MOTIVATION', 'ALERT', 'REMINDER', 'SYSTEM']);
export const notificationPriority = pgEnum("NotificationPriority", ['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const eligibilityTargetType = pgEnum("EligibilityTargetType", ['ACCOUNT', 'SERVICE']);
export const conditionOperator = pgEnum("ConditionOperator", ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'IN', 'NOT_IN', 'BETWEEN', 'CONTAINS']);

// Service Conditions - Conditions for credit services (BOMBÉ, TELEMA, MOPAO, VIMBISA, LIKÉLEMBA)
export const serviceConditions = pgTable("service_conditions", {
    id: serial().primaryKey().notNull(),
    // Service reference (links to credit_types.code)
    serviceCode: varchar("service_code", { length: 20 }).notNull(),
    // Condition categorization
    conditionType: varchar("condition_type", { length: 50 }).notNull(), // 'ELIGIBILITY', 'AMOUNT_RANGE', 'DURATION', 'INTEREST', 'FEES', 'REQUIREMENT'
    conditionKey: varchar("condition_key", { length: 100 }).notNull(), // 's02_min_balance', 'deposit_days', 'kyc_level'
    // Display information
    conditionLabel: text("condition_label").notNull(),
    conditionDescription: text("condition_description"),
    // Evaluation parameters
    operator: conditionOperator("operator").default('GREATER_THAN_OR_EQUAL').notNull(),
    requiredValue: jsonb("required_value").notNull(), // {value: 25, currency: 'USD'} or {values: ['KYC1', 'KYC2']} or {min: 10, max: 100}
    validationQuery: text("validation_query"), // SQL query template for dynamic evaluation
    // Weight for eligibility score calculation (0-100)
    weight: integer("weight").default(10).notNull(),
    // Display order in UI
    displayOrder: integer("display_order").default(0).notNull(),
    // Status
    isActive: boolean("is_active").default(true).notNull(),
    isMandatory: boolean("is_mandatory").default(true).notNull(), // If false, condition is optional for eligibility
    // Timestamps
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("service_conditions_service_code_idx").using("btree", table.serviceCode.asc().nullsLast().op("text_ops")),
    index("service_conditions_type_idx").using("btree", table.conditionType.asc().nullsLast().op("text_ops")),
    uniqueIndex("service_conditions_service_code_condition_key_key").using("btree", table.serviceCode.asc().nullsLast().op("text_ops"), table.conditionKey.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.serviceCode],
        foreignColumns: [creditTypes.code],
        name: "service_conditions_service_code_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);

// Customer Eligibility Status - Track each user's eligibility for ALL accounts + services
export const customerEligibilityStatus = pgTable("customer_eligibility_status", {
    id: serial().primaryKey().notNull(),
    // Customer reference
    customerId: integer("customer_id").notNull(),
    // Target (account or service)
    targetType: eligibilityTargetType("target_type").notNull(), // 'ACCOUNT' or 'SERVICE'
    targetCode: varchar("target_code", { length: 20 }).notNull(), // 'S01', 'S02', 'BOMBE', 'TELEMA'
    // Eligibility state
    isEligible: boolean("is_eligible").default(false).notNull(),
    isActivated: boolean("is_activated").default(false).notNull(), // Has the account/service been activated for this user?
    eligibilityScore: numeric("eligibility_score", { precision: 5, scale: 2 }).default('0').notNull(), // 0-100%
    // Detailed conditions tracking (JSONB for flexibility)
    conditionsMet: jsonb("conditions_met"), // [{conditionId: 1, key: 's02_balance', met: true, currentValue: 30, requiredValue: 25}]
    conditionsMissing: jsonb("conditions_missing"), // [{conditionId: 2, key: 'deposit_days', met: false, currentValue: 20, requiredValue: 26, daysRemaining: 6}]
    // Progress tracking
    progressPercentage: numeric("progress_percentage", { precision: 5, scale: 2 }).default('0').notNull(),
    estimatedDaysToEligibility: integer("estimated_days_to_eligibility"), // null if already eligible
    // Timestamps
    lastEvaluatedAt: timestamp("last_evaluated_at", { precision: 3, mode: 'string' }),
    eligibleSince: timestamp("eligible_since", { precision: 3, mode: 'string' }), // When user first became eligible
    activatedAt: timestamp("activated_at", { precision: 3, mode: 'string' }), // When account/service was activated
    lastNotifiedAt: timestamp("last_notified_at", { precision: 3, mode: 'string' }), // When user was last notified about this target
    // Auto-activation settings
    autoActivateWhenEligible: boolean("auto_activate_when_eligible").default(true).notNull(),
    // Metadata
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("customer_eligibility_status_customer_target_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops"), table.targetType.asc().nullsLast().op("text_ops"), table.targetCode.asc().nullsLast().op("text_ops")),
    index("customer_eligibility_status_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("customer_eligibility_status_is_eligible_idx").using("btree", table.isEligible.asc().nullsLast().op("bool_ops")),
    index("customer_eligibility_status_target_type_idx").using("btree", table.targetType.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "customer_eligibility_status_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);

// Customer Notifications - Smart notifications per customer (celebration, progress, motivation, alerts)
export const customerNotifications = pgTable("customer_notifications", {
    id: serial().primaryKey().notNull(),
    // Customer reference
    customerId: integer("customer_id").notNull(),
    // Notification type and priority
    notificationType: notificationType("notification_type").notNull(),
    priority: notificationPriority("priority").default('MEDIUM').notNull(),
    // Content
    title: text("title").notNull(),
    message: text("message").notNull(),
    actionLabel: text("action_label"), // 'Voir le compte', 'Faire un dépôt'
    actionUrl: text("action_url"), // '/dashboard/accounts/S02'
    icon: text("icon"), // Emoji or icon name
    // Related target (optional)
    targetType: eligibilityTargetType("target_type"), // 'ACCOUNT' or 'SERVICE'
    targetCode: varchar("target_code", { length: 20 }), // 'S02', 'BOMBE'
    // Display settings
    displayDurationSeconds: integer("display_duration_seconds").default(300).notNull(), // 5 minutes default
    isRepeatable: boolean("is_repeatable").default(false).notNull(), // Can reappear after being dismissed
    repeatIntervalHours: integer("repeat_interval_hours"), // How often to reappear if repeatable
    // Status tracking
    isRead: boolean("is_read").default(false).notNull(),
    isDismissed: boolean("is_dismissed").default(false).notNull(),
    isActionTaken: boolean("is_action_taken").default(false).notNull(),
    readAt: timestamp("read_at", { precision: 3, mode: 'string' }),
    dismissedAt: timestamp("dismissed_at", { precision: 3, mode: 'string' }),
    actionTakenAt: timestamp("action_taken_at", { precision: 3, mode: 'string' }),
    // Scheduling
    scheduledFor: timestamp("scheduled_for", { precision: 3, mode: 'string' }), // If null, show immediately
    expiresAt: timestamp("expires_at", { precision: 3, mode: 'string' }), // Auto-dismiss after this time
    lastShownAt: timestamp("last_shown_at", { precision: 3, mode: 'string' }),
    shownCount: integer("shown_count").default(0).notNull(),
    // Metadata
    metadata: jsonb("metadata"), // Additional context (progressPercent, daysRemaining, etc.)
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("customer_notifications_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("customer_notifications_type_idx").using("btree", table.notificationType.asc().nullsLast().op("text_ops")),
    index("customer_notifications_is_read_idx").using("btree", table.isRead.asc().nullsLast().op("bool_ops")),
    index("customer_notifications_scheduled_for_idx").using("btree", table.scheduledFor.asc().nullsLast().op("timestamp_ops")),
    index("customer_notifications_created_at_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamp_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "customer_notifications_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);

// Eligibility Evaluation Log - Track all eligibility evaluations for audit
export const eligibilityEvaluationLogs = pgTable("eligibility_evaluation_logs", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    targetType: eligibilityTargetType("target_type").notNull(),
    targetCode: varchar("target_code", { length: 20 }).notNull(),
    // Evaluation results
    previousEligibility: boolean("previous_eligibility"),
    newEligibility: boolean("new_eligibility").notNull(),
    previousScore: numeric("previous_score", { precision: 5, scale: 2 }),
    newScore: numeric("new_score", { precision: 5, scale: 2 }).notNull(),
    // What changed
    conditionsEvaluated: jsonb("conditions_evaluated").notNull(), // Full evaluation details
    triggerEvent: text("trigger_event"), // 'DEPOSIT', 'DAILY_CHECK', 'MANUAL', 'REGISTRATION'
    // Action taken
    actionTaken: text("action_taken"), // 'ACTIVATED', 'NOTIFIED', 'NONE'
    notificationId: integer("notification_id"), // If notification was created
    // Timestamps
    evaluatedAt: timestamp("evaluated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("eligibility_evaluation_logs_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("eligibility_evaluation_logs_target_idx").using("btree", table.targetType.asc().nullsLast().op("text_ops"), table.targetCode.asc().nullsLast().op("text_ops")),
    index("eligibility_evaluation_logs_evaluated_at_idx").using("btree", table.evaluatedAt.desc().nullsLast().op("timestamp_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "eligibility_evaluation_logs_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);

// Relations for new tables
export const serviceConditionsRelations = relations(serviceConditions, ({ one }) => ({
    creditType: one(creditTypes, {
        fields: [serviceConditions.serviceCode],
        references: [creditTypes.code],
    }),
}));

export const customerEligibilityStatusRelations = relations(customerEligibilityStatus, ({ one }) => ({
    customer: one(customers, {
        fields: [customerEligibilityStatus.customerId],
        references: [customers.id],
    }),
}));

export const customerNotificationsRelations = relations(customerNotifications, ({ one }) => ({
    customer: one(customers, {
        fields: [customerNotifications.customerId],
        references: [customers.id],
    }),
}));

export const eligibilityEvaluationLogsRelations = relations(eligibilityEvaluationLogs, ({ one }) => ({
    customer: one(customers, {
        fields: [eligibilityEvaluationLogs.customerId],
        references: [customers.id],
    }),
}));

// ===== LOYALTY POINTS SYSTEM TABLES =====

// Loyalty Point Types - Dynamic configuration
export const loyaltyPointTypes = pgTable("loyalty_point_types", {
    id: serial().primaryKey().notNull(),
    code: varchar({ length: 50 }).notNull(),
    label: text().notNull(),
    description: text(),
    points: integer().notNull(),
    applicableTo: varchar("applicable_to", { length: 20 }).notNull(), // 'MEMBER', 'PARTNER', 'ALL'
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    uniqueIndex("loyalty_point_types_code_key").using("btree", table.code.asc().nullsLast().op("text_ops")),
]);

// Loyalty Rewards - Catalog
export const loyaltyRewards = pgTable("loyalty_rewards", {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    description: text(),
    category: varchar({ length: 50 }).notNull(),
    pointsRequired: integer("points_required").notNull(),
    imageUrl: text("image_url"),
    stockQuantity: integer("stock_quantity"),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("loyalty_rewards_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
    index("loyalty_rewards_points_required_idx").using("btree", table.pointsRequired.asc().nullsLast().op("int4_ops")),
]);

// Loyalty Redemptions - History
export const loyaltyRedemptions = pgTable("loyalty_redemptions", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    rewardId: integer("reward_id").notNull(),
    pointsSpent: integer("points_spent").notNull(),
    status: varchar({ length: 20 }).notNull().default('PENDING'), // 'PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'
    metadata: jsonb(),
    redeemedAt: timestamp("redeemed_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    fulfilledAt: timestamp("fulfilled_at", { precision: 3, mode: 'string' }),
    updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("loyalty_redemptions_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("loyalty_redemptions_reward_id_idx").using("btree", table.rewardId.asc().nullsLast().op("int4_ops")),
    index("loyalty_redemptions_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "loyalty_redemptions_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
    foreignKey({
        columns: [table.rewardId],
        foreignColumns: [loyaltyRewards.id],
        name: "loyalty_redemptions_reward_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);

// Loyalty Notifications - Smart notifications with animations
export const loyaltyNotifications = pgTable("loyalty_notifications", {
    id: serial().primaryKey().notNull(),
    customerId: integer("customer_id").notNull(),
    points: integer().notNull().default(0),
    pointTypeCode: varchar("point_type_code", { length: 50 }),
    message: text().notNull(),
    animationType: varchar("animation_type", { length: 20 }).default('bounce'),
    isRead: boolean("is_read").default(false).notNull(),
    metadata: jsonb(),
    createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    index("loyalty_notifications_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    index("loyalty_notifications_is_read_idx").using("btree", table.isRead.asc().nullsLast().op("bool_ops")),
    foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "loyalty_notifications_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);
