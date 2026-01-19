"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.partnerActions = exports.securityEvents = exports.customerBehaviorProfiles = exports.fraudAlerts = exports.customerLoginHistory = exports.customerSecurityQuestions = exports.deviceFingerprints = exports.postalCodes = exports.quartiers = exports.agencies = exports.userSessions = exports.auditLogs = exports.transactions = exports.credits = exports.accountTypeConfigurations = exports.accounts = exports.users = exports.roles = exports.agents = exports.customers = exports.systemSettings = exports.prismaMigrations = exports.otpEvents = exports.kycDrafts = exports.contactChangeLogs = exports.transactionType = exports.transactionStatus = exports.settingType = exports.settingCategory = exports.securityQuestionType = exports.riskLevel = exports.repaymentFrequency = exports.partnerLimitType = exports.partnerActionType = exports.loginStatus = exports.kycLockStep = exports.kycStatus = exports.gender = exports.fraudType = exports.deviceType = exports.deviceStatus = exports.customerType = exports.customerStatus = exports.customerCategory = exports.currency = exports.creditType = exports.creditStatus = exports.civilStatus = exports.accountType = exports.accountStatus = void 0;
exports.customerCreditEligibility = exports.creditRepayments = exports.creditRequests = exports.s04Allocations = exports.notificationServiceFees = exports.customerAccountServices = exports.ticketMessages = exports.supportTickets = exports.billingHistory = exports.communes = exports.cities = exports.countries = exports.otp = exports.partnerSupervisorRelations = exports.partnerSecurityLimits = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
exports.accountStatus = (0, pg_core_1.pgEnum)("AccountStatus", ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED']);
exports.accountType = (0, pg_core_1.pgEnum)("AccountType", ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'SAVINGS', 'CURRENT', 'CREDIT', 'MOBILE_MONEY']);
exports.civilStatus = (0, pg_core_1.pgEnum)("CivilStatus", ['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED']);
exports.creditStatus = (0, pg_core_1.pgEnum)("CreditStatus", ['PENDING', 'APPROVED', 'DISBURSED', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED']);
exports.creditType = (0, pg_core_1.pgEnum)("CreditType", ['VIMBISA', 'BOMBE', 'TELEMA', 'MOPAO', 'LIKELEMBA']);
exports.currency = (0, pg_core_1.pgEnum)("Currency", ['CDF', 'USD']);
exports.customerCategory = (0, pg_core_1.pgEnum)("CustomerCategory", ['CATEGORY_1', 'CATEGORY_2', 'GOLD']);
exports.customerStatus = (0, pg_core_1.pgEnum)("CustomerStatus", ['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']);
exports.customerType = (0, pg_core_1.pgEnum)("CustomerType", ['MEMBER', 'PARTNER']);
exports.deviceStatus = (0, pg_core_1.pgEnum)("DeviceStatus", ['TRUSTED', 'PENDING', 'SUSPICIOUS', 'BLOCKED']);
exports.deviceType = (0, pg_core_1.pgEnum)("DeviceType", ['MOBILE', 'DESKTOP', 'TABLET', 'UNKNOWN']);
exports.fraudType = (0, pg_core_1.pgEnum)("FraudType", ['LOCATION_ANOMALY', 'DEVICE_ANOMALY', 'BEHAVIORAL_ANOMALY', 'VPN_PROXY_DETECTED', 'MULTIPLE_DEVICES', 'RAPID_TRANSACTIONS', 'SUSPICIOUS_PATTERN']);
exports.gender = (0, pg_core_1.pgEnum)("Gender", ['M', 'F']);
exports.kycStatus = (0, pg_core_1.pgEnum)("KYCStatus", ['NOT_STARTED', 'KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED', 'REJECTED']);
exports.kycLockStep = (0, pg_core_1.pgEnum)("KycLockStep", ['NONE', 'STEP1', 'STEP2', 'STEP3']);
exports.loginStatus = (0, pg_core_1.pgEnum)("LoginStatus", ['SUCCESS', 'FAILED_PASSWORD', 'FAILED_OTP', 'BLOCKED_SUSPICIOUS', 'BLOCKED_DEVICE', 'BLOCKED_LOCATION', 'FAILED_SECURITY_QUESTION']);
exports.partnerActionType = (0, pg_core_1.pgEnum)("PartnerActionType", ['CREATE_CUSTOMER', 'UPDATE_CUSTOMER', 'DEPOSIT', 'WITHDRAWAL', 'CREDIT_APPLICATION', 'CREDIT_APPROVAL', 'ACCOUNT_SUSPENSION', 'DOCUMENT_UPLOAD', 'KYC_VALIDATION', 'TRANSACTION_REVERSAL']);
exports.partnerLimitType = (0, pg_core_1.pgEnum)("PartnerLimitType", ['DAILY_TRANSACTIONS', 'MONTHLY_TRANSACTIONS', 'SINGLE_TRANSACTION', 'CUSTOMER_CREATION', 'CREDIT_APPROVAL']);
exports.repaymentFrequency = (0, pg_core_1.pgEnum)("RepaymentFrequency", ['DAILY', 'WEEKLY', 'MONTHLY']);
exports.riskLevel = (0, pg_core_1.pgEnum)("RiskLevel", ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
exports.securityQuestionType = (0, pg_core_1.pgEnum)("SecurityQuestionType", ['PERSONAL', 'FAMILY', 'PREFERENCE', 'HISTORICAL']);
exports.settingCategory = (0, pg_core_1.pgEnum)("SettingCategory", ['SYSTEM', 'SECURITY', 'CREDIT', 'EXCHANGE_RATES', 'FEES', 'LIMITS', 'NOTIFICATIONS', 'BUSINESS_RULES']);
exports.settingType = (0, pg_core_1.pgEnum)("SettingType", ['STRING', 'INTEGER', 'FLOAT', 'BOOLEAN', 'JSON']);
exports.transactionStatus = (0, pg_core_1.pgEnum)("TransactionStatus", ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED']);
exports.transactionType = (0, pg_core_1.pgEnum)("TransactionType", ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'CREDIT_DISBURSEMENT', 'CREDIT_REPAYMENT', 'FEE', 'INTEREST']);
exports.contactChangeLogs = (0, pg_core_1.pgTable)("contact_change_logs", {
    id: (0, pg_core_1.text)().primaryKey().notNull(),
    oldContact: (0, pg_core_1.text)("old_contact").notNull(),
    newContact: (0, pg_core_1.text)("new_contact").notNull(),
    contactType: (0, pg_core_1.text)("contact_type").notNull(),
    purpose: (0, pg_core_1.text)().notNull(),
    ipAddress: (0, pg_core_1.text)("ip_address").notNull(),
    userAgent: (0, pg_core_1.text)("user_agent").notNull(),
    otpId: (0, pg_core_1.text)("otp_id"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    customerId: (0, pg_core_1.integer)("customer_id"),
}, (table) => [
    (0, pg_core_1.index)("contact_change_logs_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
    (0, pg_core_1.index)("contact_change_logs_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.index)("contact_change_logs_new_contact_idx").using("btree", table.newContact.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.index)("contact_change_logs_old_contact_idx").using("btree", table.oldContact.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "contact_change_logs_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.kycDrafts = (0, pg_core_1.pgTable)("kyc_drafts", {
    id: (0, pg_core_1.text)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    kycStep: (0, pg_core_1.text)("kyc_step").notNull(),
    draftData: (0, pg_core_1.jsonb)("draft_data").notNull(),
    globalDocHashes: (0, pg_core_1.jsonb)("global_doc_hashes"),
    version: (0, pg_core_1.integer)().default(1).notNull(),
    isAutoSaved: (0, pg_core_1.boolean)("is_auto_saved").default(true).notNull(),
    ipAddress: (0, pg_core_1.text)("ip_address"),
    userAgent: (0, pg_core_1.text)("user_agent"),
    deviceInfo: (0, pg_core_1.jsonb)("device_info"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { precision: 3, mode: 'string' }),
}, (table) => [
    (0, pg_core_1.index)("kyc_drafts_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
    (0, pg_core_1.index)("kyc_drafts_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.uniqueIndex)("kyc_drafts_customer_id_kyc_step_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops"), table.kycStep.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.index)("kyc_drafts_kyc_step_idx").using("btree", table.kycStep.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.index)("kyc_drafts_updated_at_idx").using("btree", table.updatedAt.asc().nullsLast().op("timestamp_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "kyc_drafts_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);
exports.otpEvents = (0, pg_core_1.pgTable)("otp_events", {
    id: (0, pg_core_1.text)().primaryKey().notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    otpId: (0, pg_core_1.text)("otp_id"),
    customerId: (0, pg_core_1.integer)("customer_id"),
    contact: (0, pg_core_1.text)().notNull(),
    contactType: (0, pg_core_1.text)("contact_type").notNull(),
    purpose: (0, pg_core_1.text)().notNull(),
    action: (0, pg_core_1.text)().notNull(),
    channel: (0, pg_core_1.text)(),
    ipAddress: (0, pg_core_1.text)("ip_address"),
    userAgent: (0, pg_core_1.text)("user_agent"),
    message: (0, pg_core_1.text)(),
}, (table) => [
    (0, pg_core_1.index)("otp_events_contact_created_at_idx").using("btree", table.contact.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
    (0, pg_core_1.index)("otp_events_customer_id_created_at_idx").using("btree", table.customerId.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.index)("otp_events_purpose_action_created_at_idx").using("btree", table.purpose.asc().nullsLast().op("timestamp_ops"), table.action.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.otpId],
        foreignColumns: [exports.otp.id],
        name: "otp_events_otp_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "otp_events_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.prismaMigrations = (0, pg_core_1.pgTable)("_prisma_migrations", {
    id: (0, pg_core_1.varchar)({ length: 36 }).primaryKey().notNull(),
    checksum: (0, pg_core_1.varchar)({ length: 64 }).notNull(),
    finishedAt: (0, pg_core_1.timestamp)("finished_at", { withTimezone: true, mode: 'string' }),
    migrationName: (0, pg_core_1.varchar)("migration_name", { length: 255 }).notNull(),
    logs: (0, pg_core_1.text)(),
    rolledBackAt: (0, pg_core_1.timestamp)("rolled_back_at", { withTimezone: true, mode: 'string' }),
    startedAt: (0, pg_core_1.timestamp)("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    appliedStepsCount: (0, pg_core_1.integer)("applied_steps_count").default(0).notNull(),
});
exports.systemSettings = (0, pg_core_1.pgTable)("system_settings", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    key: (0, pg_core_1.text)().notNull(),
    category: (0, pg_core_1.text)().notNull(),
    value: (0, pg_core_1.text)().notNull(),
    dataType: (0, pg_core_1.text)("data_type").default('STRING').notNull(),
    description: (0, pg_core_1.text)(),
    isSystem: (0, pg_core_1.boolean)("is_system").default(false).notNull(),
    isEncrypted: (0, pg_core_1.boolean)("is_encrypted").default(false).notNull(),
    defaultValue: (0, pg_core_1.text)("default_value"),
    validationRules: (0, pg_core_1.jsonb)("validation_rules"),
    lastModifiedBy: (0, pg_core_1.integer)("last_modified_by"),
    history: (0, pg_core_1.jsonb)(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("system_settings_key_key").using("btree", table.key.asc().nullsLast().op("text_ops")),
]);
exports.customers = (0, pg_core_1.pgTable)("customers", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    firstName: (0, pg_core_1.text)("first_name"),
    lastName: (0, pg_core_1.text)("last_name"),
    mobileMoneyNumber: (0, pg_core_1.text)("mobile_money_number"),
    email: (0, pg_core_1.text)(),
    dateOfBirth: (0, pg_core_1.timestamp)("date_of_birth", { precision: 3, mode: 'string' }),
    placeOfBirth: (0, pg_core_1.text)("place_of_birth"),
    civilStatus: (0, pg_core_1.text)("civil_status"),
    gender: (0, pg_core_1.text)(),
    nationality: (0, pg_core_1.text)(),
    address: (0, pg_core_1.text)(),
    profession: (0, pg_core_1.text)(),
    employer: (0, pg_core_1.text)(),
    monthlyIncome: (0, pg_core_1.numeric)("monthly_income", { precision: 15, scale: 2 }),
    idCardNumber: (0, pg_core_1.text)("id_card_number"),
    idCardExpiry: (0, pg_core_1.timestamp)("id_card_expiry", { precision: 3, mode: 'string' }),
    idCardFrontUrl: (0, pg_core_1.text)("id_card_front_url"),
    idCardBackUrl: (0, pg_core_1.text)("id_card_back_url"),
    passportNumber: (0, pg_core_1.text)("passport_number"),
    passportExpiry: (0, pg_core_1.timestamp)("passport_expiry", { precision: 3, mode: 'string' }),
    passportUrl: (0, pg_core_1.text)("passport_url"),
    birthCertificateUrl: (0, pg_core_1.text)("birth_certificate_url"),
    residenceCertificateUrl: (0, pg_core_1.text)("residence_certificate_url"),
    incomeProofUrl: (0, pg_core_1.text)("income_proof_url"),
    referenceName: (0, pg_core_1.text)("reference_name"),
    referencePhone: (0, pg_core_1.text)("reference_phone"),
    referenceRelationship: (0, pg_core_1.text)("reference_relationship"),
    isPoliticalPerson: (0, pg_core_1.boolean)("is_political_person"),
    status: (0, exports.customerStatus)(),
    kycStatus: (0, exports.kycStatus)("kyc_status"),
    category: (0, exports.customerCategory)(),
    kyc1CompletionDate: (0, pg_core_1.timestamp)("kyc1_completion_date", { precision: 3, mode: 'string' }),
    kyc2SubmissionDate: (0, pg_core_1.timestamp)("kyc2_submission_date", { precision: 3, mode: 'string' }),
    kyc2ValidationDate: (0, pg_core_1.timestamp)("kyc2_validation_date", { precision: 3, mode: 'string' }),
    goldEligibleDate: (0, pg_core_1.timestamp)("gold_eligible_date", { precision: 3, mode: 'string' }),
    passwordHash: (0, pg_core_1.text)("password_hash"),
    isActive: (0, pg_core_1.boolean)("is_active"),
    lastLogin: (0, pg_core_1.timestamp)("last_login", { precision: 3, mode: 'string' }),
    accountCreationDate: (0, pg_core_1.timestamp)("account_creation_date", { precision: 3, mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }),
    createdById: (0, pg_core_1.integer)("created_by_id"),
    businessDocuments: (0, pg_core_1.jsonb)("business_documents"),
    agencyId: (0, pg_core_1.integer)("agency_id"),
    commissionRate: (0, pg_core_1.numeric)("commission_rate", { precision: 5, scale: 4 }),
    customerType: (0, exports.customerType)("customer_type").default('MEMBER').notNull(),
    facePhotoUrl: (0, pg_core_1.text)("face_photo_url"),
    lastActionDate: (0, pg_core_1.timestamp)("last_action_date", { precision: 3, mode: 'string' }),
    managedByPartnerId: (0, pg_core_1.integer)("managed_by_partner_id"),
    maxDailyOperations: (0, pg_core_1.integer)("max_daily_operations").default(50),
    maxTransactionAmount: (0, pg_core_1.numeric)("max_transaction_amount", { precision: 15, scale: 2 }),
    mfaBackupCodes: (0, pg_core_1.jsonb)("mfa_backup_codes"),
    mfaConfiguredAt: (0, pg_core_1.timestamp)("mfa_configured_at", { precision: 3, mode: 'string' }),
    mfaEnabled: (0, pg_core_1.boolean)("mfa_enabled").default(false).notNull(),
    mfaSecret: (0, pg_core_1.text)("mfa_secret"),
    partnerActionsCount: (0, pg_core_1.integer)("partner_actions_count").default(0).notNull(),
    partnerCode: (0, pg_core_1.text)("partner_code"),
    partnerLevel: (0, pg_core_1.text)("partner_level"),
    postalCodeId: (0, pg_core_1.integer)("postal_code_id"),
    quartierId: (0, pg_core_1.integer)("quartier_id"),
    requiresDualApproval: (0, pg_core_1.boolean)("requires_dual_approval").default(false).notNull(),
    signaturePhotoUrl: (0, pg_core_1.text)("signature_photo_url"),
    supervisorId: (0, pg_core_1.integer)("supervisor_id"),
    suspiciousActivityCount: (0, pg_core_1.integer)("suspicious_activity_count").default(0).notNull(),
    territoryAssigned: (0, pg_core_1.text)("territory_assigned"),
    kycCompleted: (0, pg_core_1.boolean)("kyc_completed").default(false).notNull(),
    kycStep: (0, pg_core_1.integer)("kyc_step").default(0).notNull(),
    otpVerified: (0, pg_core_1.boolean)("otp_verified").default(false).notNull(),
    cifCode: (0, pg_core_1.text)("cif_code"),
    publicId: (0, pg_core_1.text)("public_id"),
    kycLockStep: (0, exports.kycLockStep)("kyc_lock_step").default('NONE').notNull(),
    // Partner and agent-related columns
    cif: (0, pg_core_1.varchar)("cif", { length: 8 }),
    agentId: (0, pg_core_1.integer)("agent_id"),
    accountNumber: (0, pg_core_1.varchar)("account_number", { length: 8 }),
    firstDepositDate: (0, pg_core_1.timestamp)("first_deposit_date", { precision: 3, mode: 'string' }),
    firstDepositAmount: (0, pg_core_1.numeric)("first_deposit_amount", { precision: 15, scale: 2 }),
    firstDepositCommissionAwarded: (0, pg_core_1.boolean)("first_deposit_commission_awarded").default(false).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("customers_cif_code_key").using("btree", table.cifCode.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.uniqueIndex)("customers_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.uniqueIndex)("customers_mobile_money_number_key").using("btree", table.mobileMoneyNumber.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.uniqueIndex)("customers_public_id_key").using("btree", table.publicId.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.uniqueIndex)("customers_cif_key").using("btree", table.cif.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.index)("customers_agent_id_idx").using("btree", table.agentId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.createdById],
        foreignColumns: [exports.users.id],
        name: "customers_created_by_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    (0, pg_core_1.foreignKey)({
        columns: [table.managedByPartnerId],
        foreignColumns: [table.id],
        name: "customers_managed_by_partner_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    (0, pg_core_1.foreignKey)({
        columns: [table.agencyId],
        foreignColumns: [exports.agencies.id],
        name: "customers_agency_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    (0, pg_core_1.foreignKey)({
        columns: [table.quartierId],
        foreignColumns: [exports.quartiers.id],
        name: "customers_quartier_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    (0, pg_core_1.foreignKey)({
        columns: [table.postalCodeId],
        foreignColumns: [exports.postalCodes.id],
        name: "customers_postal_code_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    (0, pg_core_1.foreignKey)({
        columns: [table.agentId],
        foreignColumns: [exports.agents.id],
        name: "customers_agent_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.agents = (0, pg_core_1.pgTable)("agents", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    code: (0, pg_core_1.varchar)({ length: 5 }).notNull(),
    type: (0, pg_core_1.text)().notNull(),
    name: (0, pg_core_1.text)().notNull(),
    agencyId: (0, pg_core_1.integer)("agency_id"),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("agents_code_key").using("btree", table.code.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.index)("agents_agency_id_idx").using("btree", table.agencyId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.index)("agents_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.agencyId],
        foreignColumns: [exports.agencies.id],
        name: "agents_agency_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.roles = (0, pg_core_1.pgTable)("roles", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    name: (0, pg_core_1.text)().notNull(),
    description: (0, pg_core_1.text)(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("roles_name_key").using("btree", table.name.asc().nullsLast().op("text_ops")),
]);
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    username: (0, pg_core_1.text)().notNull(),
    email: (0, pg_core_1.text)().notNull(),
    passwordHash: (0, pg_core_1.text)("password_hash").notNull(),
    roleId: (0, pg_core_1.integer)("role_id").notNull(),
    validated: (0, pg_core_1.boolean)().notNull(),
    otpCode: (0, pg_core_1.text)("otp_code"),
    otpExpiresAt: (0, pg_core_1.timestamp)("otp_expires_at", { precision: 3, mode: 'string' }),
    lastLogin: (0, pg_core_1.timestamp)("last_login", { precision: 3, mode: 'string' }),
    lastLogout: (0, pg_core_1.timestamp)("last_logout", { precision: 3, mode: 'string' }),
    lastIp: (0, pg_core_1.text)("last_ip"),
    lastBrowser: (0, pg_core_1.text)("last_browser"),
    lastMachine: (0, pg_core_1.text)("last_machine"),
    lastCountry: (0, pg_core_1.text)("last_country"),
    isActive: (0, pg_core_1.boolean)("is_active").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("users_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.uniqueIndex)("users_username_key").using("btree", table.username.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.roleId],
        foreignColumns: [exports.roles.id],
        name: "users_role_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
exports.accounts = (0, pg_core_1.pgTable)("accounts", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    accountNumber: (0, pg_core_1.text)("account_number").notNull(),
    // Legacy field - kept for backward compatibility
    accountType: (0, pg_core_1.text)("account_type").notNull(),
    // New standardized field
    accountTypeCode: (0, pg_core_1.text)("account_type_code"),
    // CIF reference from customers table
    cif: (0, pg_core_1.varchar)("cif", { length: 8 }),
    currency: (0, pg_core_1.text)().default('CDF').notNull(),
    balanceCdf: (0, pg_core_1.numeric)("balance_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
    balanceUsd: (0, pg_core_1.numeric)("balance_usd", { precision: 15, scale: 2 }).default('0').notNull(),
    status: (0, pg_core_1.text)().default('ACTIVE').notNull(),
    openedDate: (0, pg_core_1.timestamp)("opened_date", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    closedDate: (0, pg_core_1.timestamp)("closed_date", { precision: 3, mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("accounts_account_number_key").using("btree", table.accountNumber.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "accounts_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
exports.accountTypeConfigurations = (0, pg_core_1.pgTable)("account_type_configurations", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    code: (0, pg_core_1.text)().notNull(),
    label: (0, pg_core_1.text)().notNull(),
    description: (0, pg_core_1.text)(),
    // Using text array for allowed_currencies to be compatible with Prisma's enum array
    allowedCurrencies: (0, pg_core_1.text)("allowed_currencies").array(),
    defaultStatus: (0, exports.accountStatus)("default_status").default('ACTIVE').notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("account_type_configurations_code_key").using("btree", table.code.asc().nullsLast().op("text_ops")),
]);
exports.credits = (0, pg_core_1.pgTable)("credits", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    cif: (0, pg_core_1.text)(),
    creditType: (0, pg_core_1.text)("credit_type").notNull(),
    amountCdf: (0, pg_core_1.numeric)("amount_cdf", { precision: 15, scale: 2 }).notNull(),
    amountUsd: (0, pg_core_1.numeric)("amount_usd", { precision: 15, scale: 2 }),
    processingFeeCdf: (0, pg_core_1.numeric)("processing_fee_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
    totalToRepayCdf: (0, pg_core_1.numeric)("total_to_repay_cdf", { precision: 15, scale: 2 }).notNull(),
    interestRate: (0, pg_core_1.numeric)("interest_rate", { precision: 5, scale: 4 }).notNull(),
    repaymentFrequency: (0, pg_core_1.text)("repayment_frequency").notNull(),
    installmentAmountCdf: (0, pg_core_1.numeric)("installment_amount_cdf", { precision: 15, scale: 2 }).notNull(),
    numberOfInstallments: (0, pg_core_1.integer)("number_of_installments").notNull(),
    applicationDate: (0, pg_core_1.timestamp)("application_date", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    approvalDate: (0, pg_core_1.timestamp)("approval_date", { precision: 3, mode: 'string' }),
    disbursementDate: (0, pg_core_1.timestamp)("disbursement_date", { precision: 3, mode: 'string' }),
    firstPaymentDate: (0, pg_core_1.timestamp)("first_payment_date", { precision: 3, mode: 'string' }),
    lastPaymentDate: (0, pg_core_1.timestamp)("last_payment_date", { precision: 3, mode: 'string' }),
    maturityDate: (0, pg_core_1.timestamp)("maturity_date", { precision: 3, mode: 'string' }),
    creditStatus: (0, pg_core_1.text)("credit_status").default('PENDING').notNull(),
    productConfig: (0, pg_core_1.jsonb)("product_config"),
    eligibilitySnapshot: (0, pg_core_1.jsonb)("eligibility_snapshot"),
    repaymentSchedule: (0, pg_core_1.jsonb)("repayment_schedule"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "credits_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
exports.transactions = (0, pg_core_1.pgTable)("transactions", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    accountId: (0, pg_core_1.integer)("account_id"),
    creditId: (0, pg_core_1.integer)("credit_id"),
    transactionType: (0, pg_core_1.text)("transaction_type").notNull(),
    amountCdf: (0, pg_core_1.numeric)("amount_cdf", { precision: 15, scale: 2 }).notNull(),
    amountUsd: (0, pg_core_1.numeric)("amount_usd", { precision: 15, scale: 2 }),
    currency: (0, pg_core_1.text)().default('CDF').notNull(),
    description: (0, pg_core_1.text)(),
    referenceNumber: (0, pg_core_1.text)("reference_number"),
    status: (0, pg_core_1.text)().default('PENDING').notNull(),
    processedAt: (0, pg_core_1.timestamp)("processed_at", { precision: 3, mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("transactions_reference_number_key").using("btree", table.referenceNumber.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.accountId],
        foreignColumns: [exports.accounts.id],
        name: "transactions_account_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    (0, pg_core_1.foreignKey)({
        columns: [table.creditId],
        foreignColumns: [exports.credits.id],
        name: "transactions_credit_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.auditLogs = (0, pg_core_1.pgTable)("audit_logs", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    userId: (0, pg_core_1.integer)("user_id"),
    action: (0, pg_core_1.text)().notNull(),
    tableName: (0, pg_core_1.text)("table_name"),
    recordId: (0, pg_core_1.text)("record_id"),
    oldValues: (0, pg_core_1.jsonb)("old_values"),
    newValues: (0, pg_core_1.jsonb)("new_values"),
    ipAddress: (0, pg_core_1.text)("ip_address"),
    userAgent: (0, pg_core_1.text)("user_agent"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.userId],
        foreignColumns: [exports.users.id],
        name: "audit_logs_user_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.userSessions = (0, pg_core_1.pgTable)("user_sessions", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    userId: (0, pg_core_1.integer)("user_id").notNull(),
    token: (0, pg_core_1.text)().notNull(),
    deviceInfo: (0, pg_core_1.jsonb)("device_info"),
    ipAddress: (0, pg_core_1.text)("ip_address"),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { precision: 3, mode: 'string' }).notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    browserInfo: (0, pg_core_1.jsonb)("browser_info"),
    city: (0, pg_core_1.text)(),
    countryCode: (0, pg_core_1.text)("country_code"),
    deviceFingerprintId: (0, pg_core_1.integer)("device_fingerprint_id"),
    isProxy: (0, pg_core_1.boolean)("is_proxy").default(false).notNull(),
    isVpn: (0, pg_core_1.boolean)("is_vpn").default(false).notNull(),
    isp: (0, pg_core_1.text)(),
    language: (0, pg_core_1.text)(),
    lastActivityAt: (0, pg_core_1.timestamp)("last_activity_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    riskScore: (0, pg_core_1.doublePrecision)("risk_score").default(0).notNull(),
    screenResolution: (0, pg_core_1.text)("screen_resolution"),
    timezone: (0, pg_core_1.text)(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("user_sessions_token_key").using("btree", table.token.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.userId],
        foreignColumns: [exports.users.id],
        name: "user_sessions_user_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    (0, pg_core_1.foreignKey)({
        columns: [table.deviceFingerprintId],
        foreignColumns: [exports.deviceFingerprints.id],
        name: "user_sessions_device_fingerprint_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.agencies = (0, pg_core_1.pgTable)("agencies", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    name: (0, pg_core_1.text)().notNull(),
    communeId: (0, pg_core_1.integer)("commune_id"),
    active: (0, pg_core_1.boolean)().default(true).notNull(),
    address: (0, pg_core_1.text)(),
    phone: (0, pg_core_1.text)(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.index)("agencies_commune_id_idx").using("btree", table.communeId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.uniqueIndex)("agencies_name_key").using("btree", table.name.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.communeId],
        foreignColumns: [exports.communes.id],
        name: "agencies_commune_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.quartiers = (0, pg_core_1.pgTable)("quartiers", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    name: (0, pg_core_1.text)().notNull(),
    communeId: (0, pg_core_1.integer)("commune_id").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("quartiers_name_commune_id_key").using("btree", table.name.asc().nullsLast().op("int4_ops"), table.communeId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.communeId],
        foreignColumns: [exports.communes.id],
        name: "quartiers_commune_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
exports.postalCodes = (0, pg_core_1.pgTable)("postal_codes", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    code: (0, pg_core_1.text)().notNull(),
    quartierId: (0, pg_core_1.integer)("quartier_id").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("postal_codes_code_quartier_id_key").using("btree", table.code.asc().nullsLast().op("int4_ops"), table.quartierId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.quartierId],
        foreignColumns: [exports.quartiers.id],
        name: "postal_codes_quartier_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
exports.deviceFingerprints = (0, pg_core_1.pgTable)("device_fingerprints", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    fingerprintHash: (0, pg_core_1.text)("fingerprint_hash").notNull(),
    deviceType: (0, exports.deviceType)("device_type").notNull(),
    deviceStatus: (0, exports.deviceStatus)("device_status").default('PENDING').notNull(),
    deviceName: (0, pg_core_1.text)("device_name"),
    operatingSystem: (0, pg_core_1.text)("operating_system"),
    browser: (0, pg_core_1.text)(),
    browserVersion: (0, pg_core_1.text)("browser_version"),
    screenResolution: (0, pg_core_1.text)("screen_resolution"),
    timezone: (0, pg_core_1.text)(),
    language: (0, pg_core_1.text)(),
    canvasFingerprint: (0, pg_core_1.text)("canvas_fingerprint"),
    webglFingerprint: (0, pg_core_1.text)("webgl_fingerprint"),
    audioFingerprint: (0, pg_core_1.text)("audio_fingerprint"),
    fontsList: (0, pg_core_1.jsonb)("fonts_list"),
    pluginsList: (0, pg_core_1.jsonb)("plugins_list"),
    hardwareInfo: (0, pg_core_1.jsonb)("hardware_info"),
    networkInfo: (0, pg_core_1.jsonb)("network_info"),
    riskScore: (0, pg_core_1.doublePrecision)("risk_score").default(0).notNull(),
    trustScore: (0, pg_core_1.doublePrecision)("trust_score").default(0).notNull(),
    lastSeenAt: (0, pg_core_1.timestamp)("last_seen_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    firstSeenAt: (0, pg_core_1.timestamp)("first_seen_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("device_fingerprints_fingerprint_hash_key").using("btree", table.fingerprintHash.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "device_fingerprints_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
exports.customerSecurityQuestions = (0, pg_core_1.pgTable)("customer_security_questions", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    questionType: (0, exports.securityQuestionType)("question_type").notNull(),
    question: (0, pg_core_1.text)().notNull(),
    answerHash: (0, pg_core_1.text)("answer_hash").notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "customer_security_questions_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
exports.customerLoginHistory = (0, pg_core_1.pgTable)("customer_login_history", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    deviceFingerprintId: (0, pg_core_1.integer)("device_fingerprint_id"),
    loginStatus: (0, exports.loginStatus)("login_status").notNull(),
    ipAddress: (0, pg_core_1.text)("ip_address").notNull(),
    countryCode: (0, pg_core_1.text)("country_code"),
    city: (0, pg_core_1.text)(),
    region: (0, pg_core_1.text)(),
    isp: (0, pg_core_1.text)(),
    isVpn: (0, pg_core_1.boolean)("is_vpn").default(false).notNull(),
    isProxy: (0, pg_core_1.boolean)("is_proxy").default(false).notNull(),
    deviceInfo: (0, pg_core_1.jsonb)("device_info"),
    browserInfo: (0, pg_core_1.jsonb)("browser_info"),
    userAgent: (0, pg_core_1.text)("user_agent"),
    screenResolution: (0, pg_core_1.text)("screen_resolution"),
    timezone: (0, pg_core_1.text)(),
    language: (0, pg_core_1.text)(),
    riskScore: (0, pg_core_1.doublePrecision)("risk_score").default(0).notNull(),
    fraudIndicators: (0, pg_core_1.jsonb)("fraud_indicators"),
    failureReason: (0, pg_core_1.text)("failure_reason"),
    otpAttempts: (0, pg_core_1.integer)("otp_attempts").default(0).notNull(),
    securityQuestionAttempts: (0, pg_core_1.integer)("security_question_attempts").default(0).notNull(),
    sessionDuration: (0, pg_core_1.integer)("session_duration"),
    actionsCount: (0, pg_core_1.integer)("actions_count").default(0).notNull(),
    loginAt: (0, pg_core_1.timestamp)("login_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    logoutAt: (0, pg_core_1.timestamp)("logout_at", { precision: 3, mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "customer_login_history_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    (0, pg_core_1.foreignKey)({
        columns: [table.deviceFingerprintId],
        foreignColumns: [exports.deviceFingerprints.id],
        name: "customer_login_history_device_fingerprint_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.fraudAlerts = (0, pg_core_1.pgTable)("fraud_alerts", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    deviceFingerprintId: (0, pg_core_1.integer)("device_fingerprint_id"),
    fraudType: (0, exports.fraudType)("fraud_type").notNull(),
    riskLevel: (0, exports.riskLevel)("risk_level").notNull(),
    confidenceScore: (0, pg_core_1.doublePrecision)("confidence_score").notNull(),
    description: (0, pg_core_1.text)().notNull(),
    indicators: (0, pg_core_1.jsonb)().notNull(),
    ipAddress: (0, pg_core_1.text)("ip_address"),
    countryCode: (0, pg_core_1.text)("country_code"),
    deviceInfo: (0, pg_core_1.jsonb)("device_info"),
    isResolved: (0, pg_core_1.boolean)("is_resolved").default(false).notNull(),
    resolvedBy: (0, pg_core_1.integer)("resolved_by"),
    resolutionNotes: (0, pg_core_1.text)("resolution_notes"),
    resolvedAt: (0, pg_core_1.timestamp)("resolved_at", { precision: 3, mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "fraud_alerts_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    (0, pg_core_1.foreignKey)({
        columns: [table.deviceFingerprintId],
        foreignColumns: [exports.deviceFingerprints.id],
        name: "fraud_alerts_device_fingerprint_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    (0, pg_core_1.foreignKey)({
        columns: [table.resolvedBy],
        foreignColumns: [exports.users.id],
        name: "fraud_alerts_resolved_by_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.customerBehaviorProfiles = (0, pg_core_1.pgTable)("customer_behavior_profiles", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    typicalLoginHours: (0, pg_core_1.jsonb)("typical_login_hours"),
    typicalLocations: (0, pg_core_1.jsonb)("typical_locations"),
    typicalDevices: (0, pg_core_1.jsonb)("typical_devices"),
    typicalSessionDuration: (0, pg_core_1.doublePrecision)("typical_session_duration"),
    typicalActionsPerSession: (0, pg_core_1.doublePrecision)("typical_actions_per_session"),
    loginFrequency: (0, pg_core_1.doublePrecision)("login_frequency"),
    riskTolerance: (0, pg_core_1.doublePrecision)("risk_tolerance").default(0.5).notNull(),
    behavioralScore: (0, pg_core_1.doublePrecision)("behavioral_score").default(0.5).notNull(),
    lastAnalysisAt: (0, pg_core_1.timestamp)("last_analysis_at", { precision: 3, mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("customer_behavior_profiles_customer_id_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "customer_behavior_profiles_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
exports.securityEvents = (0, pg_core_1.pgTable)("security_events", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id"),
    eventType: (0, pg_core_1.text)("event_type").notNull(),
    severity: (0, exports.riskLevel)().notNull(),
    description: (0, pg_core_1.text)().notNull(),
    metadata: (0, pg_core_1.jsonb)(),
    ipAddress: (0, pg_core_1.text)("ip_address"),
    userAgent: (0, pg_core_1.text)("user_agent"),
    isResolved: (0, pg_core_1.boolean)("is_resolved").default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "security_events_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.partnerActions = (0, pg_core_1.pgTable)("partner_actions", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    partnerId: (0, pg_core_1.integer)("partner_id").notNull(),
    targetCustomerId: (0, pg_core_1.integer)("target_customer_id"),
    actionType: (0, exports.partnerActionType)("action_type").notNull(),
    actionDescription: (0, pg_core_1.text)("action_description").notNull(),
    amount: (0, pg_core_1.numeric)({ precision: 15, scale: 2 }),
    ipAddress: (0, pg_core_1.text)("ip_address"),
    deviceInfo: (0, pg_core_1.jsonb)("device_info"),
    locationData: (0, pg_core_1.jsonb)("location_data"),
    requiresApproval: (0, pg_core_1.boolean)("requires_approval").default(false).notNull(),
    approvedBy: (0, pg_core_1.integer)("approved_by"),
    approvalDate: (0, pg_core_1.timestamp)("approval_date", { precision: 3, mode: 'string' }),
    isSuspicious: (0, pg_core_1.boolean)("is_suspicious").default(false).notNull(),
    riskScore: (0, pg_core_1.doublePrecision)("risk_score").default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.partnerId],
        foreignColumns: [exports.customers.id],
        name: "partner_actions_partner_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    (0, pg_core_1.foreignKey)({
        columns: [table.targetCustomerId],
        foreignColumns: [exports.customers.id],
        name: "partner_actions_target_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
    (0, pg_core_1.foreignKey)({
        columns: [table.approvedBy],
        foreignColumns: [exports.users.id],
        name: "partner_actions_approved_by_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.partnerSecurityLimits = (0, pg_core_1.pgTable)("partner_security_limits", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    partnerId: (0, pg_core_1.integer)("partner_id").notNull(),
    limitType: (0, exports.partnerLimitType)("limit_type").notNull(),
    dailyLimit: (0, pg_core_1.numeric)("daily_limit", { precision: 15, scale: 2 }),
    monthlyLimit: (0, pg_core_1.numeric)("monthly_limit", { precision: 15, scale: 2 }),
    transactionLimit: (0, pg_core_1.numeric)("transaction_limit", { precision: 15, scale: 2 }),
    operationCountLimit: (0, pg_core_1.integer)("operation_count_limit"),
    currentDailyUsage: (0, pg_core_1.numeric)("current_daily_usage", { precision: 15, scale: 2 }).default('0').notNull(),
    currentMonthlyUsage: (0, pg_core_1.numeric)("current_monthly_usage", { precision: 15, scale: 2 }).default('0').notNull(),
    currentOperationCount: (0, pg_core_1.integer)("current_operation_count").default(0).notNull(),
    lastResetDate: (0, pg_core_1.timestamp)("last_reset_date", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("partner_security_limits_partner_id_limit_type_key").using("btree", table.partnerId.asc().nullsLast().op("int4_ops"), table.limitType.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.partnerId],
        foreignColumns: [exports.customers.id],
        name: "partner_security_limits_partner_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
exports.partnerSupervisorRelations = (0, pg_core_1.pgTable)("partner_supervisor_relations", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    partnerId: (0, pg_core_1.integer)("partner_id").notNull(),
    supervisorId: (0, pg_core_1.integer)("supervisor_id").notNull(),
    assignedDate: (0, pg_core_1.timestamp)("assigned_date", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    territory: (0, pg_core_1.text)(),
    notes: (0, pg_core_1.text)(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("partner_supervisor_relations_partner_id_supervisor_id_key").using("btree", table.partnerId.asc().nullsLast().op("int4_ops"), table.supervisorId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.partnerId],
        foreignColumns: [exports.customers.id],
        name: "partner_supervisor_relations_partner_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    (0, pg_core_1.foreignKey)({
        columns: [table.supervisorId],
        foreignColumns: [exports.customers.id],
        name: "partner_supervisor_relations_supervisor_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
exports.otp = (0, pg_core_1.pgTable)("otp", {
    id: (0, pg_core_1.text)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id"),
    contact: (0, pg_core_1.text)().notNull(),
    contactType: (0, pg_core_1.text)("contact_type").notNull(),
    otpCode: (0, pg_core_1.text)("otp_code").notNull(),
    purpose: (0, pg_core_1.text)().notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { precision: 3, mode: 'string' }).notNull(),
    currentAttempts: (0, pg_core_1.integer)("current_attempts").default(0).notNull(),
    maxAttempts: (0, pg_core_1.integer)("max_attempts").default(5).notNull(),
    isUsed: (0, pg_core_1.boolean)("is_used").default(false).notNull(),
    sendChannel: (0, pg_core_1.text)("send_channel"),
    messageId: (0, pg_core_1.text)("message_id"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.index)("otp_contact_contact_type_purpose_is_used_idx").using("btree", table.contact.asc().nullsLast().op("text_ops"), table.contactType.asc().nullsLast().op("text_ops"), table.purpose.asc().nullsLast().op("bool_ops"), table.isUsed.asc().nullsLast().op("bool_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "otp_customer_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
exports.countries = (0, pg_core_1.pgTable)("countries", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    name: (0, pg_core_1.text)().notNull(),
    code: (0, pg_core_1.text)().notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("countries_code_key").using("btree", table.code.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.uniqueIndex)("countries_name_key").using("btree", table.name.asc().nullsLast().op("text_ops")),
]);
exports.cities = (0, pg_core_1.pgTable)("cities", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    name: (0, pg_core_1.text)().notNull(),
    countryId: (0, pg_core_1.integer)("country_id").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("cities_name_country_id_key").using("btree", table.name.asc().nullsLast().op("int4_ops"), table.countryId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.countryId],
        foreignColumns: [exports.countries.id],
        name: "cities_country_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
exports.communes = (0, pg_core_1.pgTable)("communes", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    name: (0, pg_core_1.text)().notNull(),
    cityId: (0, pg_core_1.integer)("city_id").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("communes_name_city_id_key").using("btree", table.name.asc().nullsLast().op("int4_ops"), table.cityId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.cityId],
        foreignColumns: [exports.cities.id],
        name: "communes_city_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
// Billing History - Track all billing charges for customers
exports.billingHistory = (0, pg_core_1.pgTable)("billing_history", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    accountId: (0, pg_core_1.integer)("account_id"),
    billingType: (0, pg_core_1.text)("billing_type").notNull(), // 'NOTIFICATION_SERVICE', 'ACCOUNT_MAINTENANCE', 'OTHER'
    serviceType: (0, pg_core_1.text)("service_type"), // 'EMAIL', 'SMS', 'PUSH_NOTIFICATION', null for account fees
    description: (0, pg_core_1.text)().notNull(),
    amountUsd: (0, pg_core_1.numeric)("amount_usd", { precision: 10, scale: 2 }).notNull(),
    amountCdf: (0, pg_core_1.numeric)("amount_cdf", { precision: 10, scale: 2 }).notNull(),
    currencyCharged: (0, pg_core_1.text)("currency_charged").notNull(), // 'USD' or 'CDF'
    billingPeriodStart: (0, pg_core_1.timestamp)("billing_period_start", { precision: 3, mode: 'string' }).notNull(),
    billingPeriodEnd: (0, pg_core_1.timestamp)("billing_period_end", { precision: 3, mode: 'string' }).notNull(),
    chargedAt: (0, pg_core_1.timestamp)("charged_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    status: (0, pg_core_1.text)().default('COMPLETED').notNull(), // 'COMPLETED', 'PENDING', 'FAILED'
    transactionId: (0, pg_core_1.integer)("transaction_id"), // Link to transaction if applicable
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.index)("billing_history_customer_id_charged_at_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops"), table.chargedAt.desc().nullsLast().op("timestamp_ops")),
    (0, pg_core_1.index)("billing_history_billing_type_charged_at_idx").using("btree", table.billingType.asc().nullsLast().op("text_ops"), table.chargedAt.desc().nullsLast().op("timestamp_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "billing_history_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
    (0, pg_core_1.foreignKey)({
        columns: [table.accountId],
        foreignColumns: [exports.accounts.id],
        name: "billing_history_account_id_fkey"
    }).onUpdate("cascade").onDelete("set null"),
]);
// Support Tickets - Customer support and service deactivation requests
exports.supportTickets = (0, pg_core_1.pgTable)("support_tickets", {
    id: (0, pg_core_1.text)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    publicId: (0, pg_core_1.text)("public_id").notNull(), // For easy customer reference
    ticketType: (0, pg_core_1.text)("ticket_type").notNull(), // 'SERVICE_DEACTIVATION', 'ACCOUNT_ISSUE', 'GENERAL_INQUIRY', 'COMPLAINT'
    subject: (0, pg_core_1.text)().notNull(),
    description: (0, pg_core_1.text)().notNull(),
    priority: (0, pg_core_1.text)().default('MEDIUM').notNull(), // 'LOW', 'MEDIUM', 'HIGH', 'URGENT'
    status: (0, pg_core_1.text)().default('OPEN').notNull(), // 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'
    relatedService: (0, pg_core_1.text)("related_service"), // Service concerné if applicable ('EMAIL', 'SMS', etc.)
    assignedTo: (0, pg_core_1.integer)("assigned_to"), // Admin user ID
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    resolvedAt: (0, pg_core_1.timestamp)("resolved_at", { precision: 3, mode: 'string' }),
    closedAt: (0, pg_core_1.timestamp)("closed_at", { precision: 3, mode: 'string' }),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("support_tickets_public_id_key").using("btree", table.publicId.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.index)("support_tickets_customer_id_status_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops"), table.status.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.index)("support_tickets_status_priority_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.priority.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "support_tickets_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);
// Ticket Messages - Chat communication for support tickets
exports.ticketMessages = (0, pg_core_1.pgTable)("ticket_messages", {
    id: (0, pg_core_1.text)().primaryKey().notNull(),
    ticketId: (0, pg_core_1.text)("ticket_id").notNull(),
    senderType: (0, pg_core_1.text)("sender_type").notNull(), // 'CUSTOMER', 'SUPPORT', 'SYSTEM'
    senderId: (0, pg_core_1.integer)("sender_id"), // Customer ID or Admin ID
    message: (0, pg_core_1.text)().notNull(),
    isInternalNote: (0, pg_core_1.boolean)("is_internal_note").default(false).notNull(), // Internal notes visible only to support
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.index)("ticket_messages_ticket_id_created_at_idx").using("btree", table.ticketId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.ticketId],
        foreignColumns: [exports.supportTickets.id],
        name: "ticket_messages_ticket_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);
// Customer Account Services - Notification services subscription
exports.customerAccountServices = (0, pg_core_1.pgTable)("customer_account_services", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    accountId: (0, pg_core_1.integer)("account_id").notNull(),
    smsEnabled: (0, pg_core_1.boolean)("sms_enabled").default(false).notNull(),
    emailEnabled: (0, pg_core_1.boolean)("email_enabled").default(false).notNull(),
    pushNotificationEnabled: (0, pg_core_1.boolean)("push_notification_enabled").default(false).notNull(),
    inAppNotificationEnabled: (0, pg_core_1.boolean)("in_app_notification_enabled").default(true).notNull(),
    servicesActivatedAt: (0, pg_core_1.timestamp)("services_activated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    monthlyTotalFeeUsd: (0, pg_core_1.numeric)("monthly_total_fee_usd", { precision: 10, scale: 2 }).default('0').notNull(),
    monthlyTotalFeeCdf: (0, pg_core_1.numeric)("monthly_total_fee_cdf", { precision: 10, scale: 2 }).default('0').notNull(),
    lastBillingDate: (0, pg_core_1.timestamp)("last_billing_date", { precision: 3, mode: 'string' }),
    nextBillingDate: (0, pg_core_1.timestamp)("next_billing_date", { precision: 3, mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("customer_account_services_customer_id_account_id_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops"), table.accountId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.index)("customer_account_services_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.index)("customer_account_services_next_billing_date_idx").using("btree", table.nextBillingDate.asc().nullsLast().op("timestamp_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "customer_account_services_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
    (0, pg_core_1.foreignKey)({
        columns: [table.accountId],
        foreignColumns: [exports.accounts.id],
        name: "customer_account_services_account_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);
// Notification Service Fees Configuration
exports.notificationServiceFees = (0, pg_core_1.pgTable)("notification_service_fees", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    serviceType: (0, pg_core_1.text)("service_type").notNull(), // 'EMAIL', 'SMS', 'PUSH_NOTIFICATION'
    serviceName: (0, pg_core_1.text)("service_name").notNull(),
    description: (0, pg_core_1.text)(),
    monthlyFeeUsd: (0, pg_core_1.numeric)("monthly_fee_usd", { precision: 10, scale: 2 }).default('0').notNull(),
    monthlyFeeCdf: (0, pg_core_1.numeric)("monthly_fee_cdf", { precision: 10, scale: 2 }).default('0').notNull(),
    isFree: (0, pg_core_1.boolean)("is_free").default(false).notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("notification_service_fees_service_type_key").using("btree", table.serviceType.asc().nullsLast().op("text_ops")),
]);
// ====================
// S04 CREDIT ALLOCATION SYSTEM
// ====================
// S04 Allocation - Buffer account (compte tampon) for credit management
exports.s04Allocations = (0, pg_core_1.pgTable)("s04_allocations", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    s04AccountId: (0, pg_core_1.integer)("s04_account_id").notNull(), // Reference to S04 account
    currency: (0, pg_core_1.text)().default('USD').notNull(), // 'CDF' or 'USD'
    totalAllocated: (0, pg_core_1.numeric)("total_allocated", { precision: 15, scale: 2 }).default('0').notNull(), // Total dans allocation
    totalDebt: (0, pg_core_1.numeric)("total_debt", { precision: 15, scale: 2 }).default('0').notNull(), // Dette actuelle
    availableBalance: (0, pg_core_1.numeric)("available_balance", { precision: 15, scale: 2 }).default('0').notNull(), // Solde disponible
    commissionRate: (0, pg_core_1.numeric)("commission_rate", { precision: 5, scale: 4 }).default('0.10').notNull(), // 10% par défaut
    commissionCollected: (0, pg_core_1.numeric)("commission_collected", { precision: 15, scale: 2 }).default('0').notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("s04_allocations_customer_id_s04_account_id_currency_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops"), table.s04AccountId.asc().nullsLast().op("int4_ops"), table.currency.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.index)("s04_allocations_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.index)("s04_allocations_s04_account_id_idx").using("btree", table.s04AccountId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "s04_allocations_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    (0, pg_core_1.foreignKey)({
        columns: [table.s04AccountId],
        foreignColumns: [exports.accounts.id],
        name: "s04_allocations_s04_account_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
// Credit Requests - Demandes de crédit pour S04
exports.creditRequests = (0, pg_core_1.pgTable)("credit_requests", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    s04AccountId: (0, pg_core_1.integer)("s04_account_id").notNull(),
    allocationId: (0, pg_core_1.integer)("allocation_id").notNull(),
    requestNumber: (0, pg_core_1.text)("request_number").notNull(), // Unique request number
    amountRequested: (0, pg_core_1.numeric)("amount_requested", { precision: 15, scale: 2 }).notNull(),
    amountApproved: (0, pg_core_1.numeric)("amount_approved", { precision: 15, scale: 2 }),
    commissionAmount: (0, pg_core_1.numeric)("commission_amount", { precision: 15, scale: 2 }).default('0').notNull(),
    netAmount: (0, pg_core_1.numeric)("net_amount", { precision: 15, scale: 2 }),
    currency: (0, pg_core_1.text)().default('USD').notNull(),
    status: (0, pg_core_1.text)().default('PENDING').notNull(), // PENDING, APPROVED, DISBURSED, REJECTED, CANCELLED
    requestedAt: (0, pg_core_1.timestamp)("requested_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    approvedAt: (0, pg_core_1.timestamp)("approved_at", { precision: 3, mode: 'string' }),
    disbursedAt: (0, pg_core_1.timestamp)("disbursed_at", { precision: 3, mode: 'string' }),
    approvedBy: (0, pg_core_1.integer)("approved_by"), // Admin user ID
    rejectionReason: (0, pg_core_1.text)("rejection_reason"),
    dueDate: (0, pg_core_1.timestamp)("due_date", { precision: 3, mode: 'string' }), // Date limite de remboursement
    repaymentStatus: (0, pg_core_1.text)("repayment_status").default('UNPAID').notNull(), // UNPAID, PARTIAL, PAID, OVERPAID
    amountRepaid: (0, pg_core_1.numeric)("amount_repaid", { precision: 15, scale: 2 }).default('0').notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("credit_requests_request_number_key").using("btree", table.requestNumber.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.index)("credit_requests_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.index)("credit_requests_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.index)("credit_requests_allocation_id_idx").using("btree", table.allocationId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "credit_requests_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    (0, pg_core_1.foreignKey)({
        columns: [table.s04AccountId],
        foreignColumns: [exports.accounts.id],
        name: "credit_requests_s04_account_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    (0, pg_core_1.foreignKey)({
        columns: [table.allocationId],
        foreignColumns: [exports.s04Allocations.id],
        name: "credit_requests_allocation_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
// Credit Repayments - Historique des remboursements
exports.creditRepayments = (0, pg_core_1.pgTable)("credit_repayments", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    creditRequestId: (0, pg_core_1.integer)("credit_request_id").notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    allocationId: (0, pg_core_1.integer)("allocation_id").notNull(),
    amount: (0, pg_core_1.numeric)({ precision: 15, scale: 2 }).notNull(),
    currency: (0, pg_core_1.text)().default('USD').notNull(),
    paymentMethod: (0, pg_core_1.text)("payment_method"), // 'TRANSFER', 'CASH', 'AUTO_DEBIT'
    sourceAccountId: (0, pg_core_1.integer)("source_account_id"), // Account used for repayment
    repaidAt: (0, pg_core_1.timestamp)("repaid_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    processedBy: (0, pg_core_1.integer)("processed_by"), // Admin user ID if manual
    notes: (0, pg_core_1.text)(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.index)("credit_repayments_credit_request_id_idx").using("btree", table.creditRequestId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.index)("credit_repayments_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.creditRequestId],
        foreignColumns: [exports.creditRequests.id],
        name: "credit_repayments_credit_request_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "credit_repayments_customer_id_fkey"
    }).onUpdate("cascade").onDelete("restrict"),
]);
// Customer Credit Eligibility - Whitelist/Blacklist
exports.customerCreditEligibility = (0, pg_core_1.pgTable)("customer_credit_eligibility", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    customerId: (0, pg_core_1.integer)("customer_id").notNull(),
    eligibilityStatus: (0, pg_core_1.text)("eligibility_status").default('NEUTRAL').notNull(), // WHITELISTED, BLACKLISTED, NEUTRAL
    creditScore: (0, pg_core_1.integer)("credit_score").default(0).notNull(), // Score de crédit (0-100)
    maxCreditLimit: (0, pg_core_1.numeric)("max_credit_limit", { precision: 15, scale: 2 }).default('0').notNull(),
    currentCreditUsed: (0, pg_core_1.numeric)("current_credit_used", { precision: 15, scale: 2 }).default('0').notNull(),
    totalLoansCompleted: (0, pg_core_1.integer)("total_loans_completed").default(0).notNull(),
    totalLoansDefaulted: (0, pg_core_1.integer)("total_loans_defaulted").default(0).notNull(),
    onTimeRepaymentRate: (0, pg_core_1.numeric)("on_time_repayment_rate", { precision: 5, scale: 2 }).default('0').notNull(), // Percentage
    blacklistReason: (0, pg_core_1.text)("blacklist_reason"),
    blacklistedAt: (0, pg_core_1.timestamp)("blacklisted_at", { precision: 3, mode: 'string' }),
    blacklistedBy: (0, pg_core_1.integer)("blacklisted_by"),
    whitelistReason: (0, pg_core_1.text)("whitelist_reason"),
    whitelistedAt: (0, pg_core_1.timestamp)("whitelisted_at", { precision: 3, mode: 'string' }),
    whitelistedBy: (0, pg_core_1.integer)("whitelisted_by"),
    lastReviewDate: (0, pg_core_1.timestamp)("last_review_date", { precision: 3, mode: 'string' }),
    nextReviewDate: (0, pg_core_1.timestamp)("next_review_date", { precision: 3, mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { precision: 3, mode: 'string' }).default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("customer_credit_eligibility_customer_id_key").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
    (0, pg_core_1.index)("customer_credit_eligibility_eligibility_status_idx").using("btree", table.eligibilityStatus.asc().nullsLast().op("text_ops")),
    (0, pg_core_1.foreignKey)({
        columns: [table.customerId],
        foreignColumns: [exports.customers.id],
        name: "customer_credit_eligibility_customer_id_fkey"
    }).onUpdate("cascade").onDelete("cascade"),
]);
