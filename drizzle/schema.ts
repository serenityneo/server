import { pgTable, index, foreignKey, text, timestamp, integer, uniqueIndex, jsonb, boolean, varchar, serial, numeric, doublePrecision, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const accountStatus = pgEnum("AccountStatus", ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'])
export const accountType = pgEnum("AccountType", ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'SAVINGS', 'CURRENT', 'CREDIT', 'MOBILE_MONEY'])
export const civilStatus = pgEnum("CivilStatus", ['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED'])
export const creditStatus = pgEnum("CreditStatus", ['PENDING', 'APPROVED', 'DISBURSED', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED'])
export const creditType = pgEnum("CreditType", ['VIMBISA', 'BOMBE', 'TELEMA', 'MOPAO', 'LIKELEMBA'])
export const currency = pgEnum("Currency", ['CDF', 'USD'])
export const customerCategory = pgEnum("CustomerCategory", ['CATEGORY_1', 'CATEGORY_2', 'GOLD'])
export const customerStatus = pgEnum("CustomerStatus", ['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED'])
export const customerType = pgEnum("CustomerType", ['MEMBER', 'PARTNER'])
export const deviceStatus = pgEnum("DeviceStatus", ['TRUSTED', 'PENDING', 'SUSPICIOUS', 'BLOCKED'])
export const deviceType = pgEnum("DeviceType", ['MOBILE', 'DESKTOP', 'TABLET', 'UNKNOWN'])
export const fraudType = pgEnum("FraudType", ['LOCATION_ANOMALY', 'DEVICE_ANOMALY', 'BEHAVIORAL_ANOMALY', 'VPN_PROXY_DETECTED', 'MULTIPLE_DEVICES', 'RAPID_TRANSACTIONS', 'SUSPICIOUS_PATTERN'])
export const gender = pgEnum("Gender", ['M', 'F'])
export const kycStatus = pgEnum("KYCStatus", ['NOT_STARTED', 'KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED', 'REJECTED'])
export const kycLockStep = pgEnum("KycLockStep", ['NONE', 'STEP1', 'STEP2', 'STEP3'])
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
	cifCode: text("cif_code"),
	publicId: text("public_id"),
	kycLockStep: kycLockStep("kyc_lock_step").default('NONE').notNull(),
	// Partner and agent-related columns
	cif: varchar("cif", { length: 8 }),
	agentId: integer("agent_id"),
	accountNumber: varchar("account_number", { length: 8 }),
	firstDepositDate: timestamp("first_deposit_date", { precision: 3, mode: 'string' }),
	firstDepositAmount: numeric("first_deposit_amount", { precision: 15, scale: 2 }),
	firstDepositCommissionAwarded: boolean("first_deposit_commission_awarded").default(false).notNull(),
}, (table) => [
	uniqueIndex("customers_cif_code_key").using("btree", table.cifCode.asc().nullsLast().op("text_ops")),
	uniqueIndex("customers_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
	uniqueIndex("customers_mobile_money_number_key").using("btree", table.mobileMoneyNumber.asc().nullsLast().op("text_ops")),
	uniqueIndex("customers_public_id_key").using("btree", table.publicId.asc().nullsLast().op("text_ops")),
	uniqueIndex("customers_cif_key").using("btree", table.cif.asc().nullsLast().op("text_ops")),
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
		columns: [table.quartierId],
		foreignColumns: [quartiers.id],
		name: "customers_quartier_id_fkey"
	}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
		columns: [table.postalCodeId],
		foreignColumns: [postalCodes.id],
		name: "customers_postal_code_id_fkey"
	}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
		columns: [table.agentId],
		foreignColumns: [agents.id],
		name: "customers_agent_id_fkey"
	}).onUpdate("cascade").onDelete("set null"),
]);

export const agents = pgTable("agents", {
	id: serial().primaryKey().notNull(),
	code: varchar({ length: 5 }).notNull(),
	type: text().notNull(),
	name: text().notNull(),
	agencyId: integer("agency_id"),
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
	username: text().notNull(),
	email: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	roleId: integer("role_id").notNull(),
	validated: boolean().notNull(),
	otpCode: text("otp_code"),
	otpExpiresAt: timestamp("otp_expires_at", { precision: 3, mode: 'string' }),
	lastLogin: timestamp("last_login", { precision: 3, mode: 'string' }),
	lastLogout: timestamp("last_logout", { precision: 3, mode: 'string' }),
	lastIp: text("last_ip"),
	lastBrowser: text("last_browser"),
	lastMachine: text("last_machine"),
	lastCountry: text("last_country"),
	agencyId: integer("agency_id"),
	isActive: boolean("is_active").notNull(),
	createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	uniqueIndex("users_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
	uniqueIndex("users_username_key").using("btree", table.username.asc().nullsLast().op("text_ops")),
	index("users_agency_id_idx").using("btree", table.agencyId.asc().nullsLast().op("int4_ops")),
	foreignKey({
		columns: [table.roleId],
		foreignColumns: [roles.id],
		name: "users_role_id_fkey"
	}).onUpdate("cascade").onDelete("restrict"),
	foreignKey({
		columns: [table.agencyId],
		foreignColumns: [agencies.id],
		name: "users_agency_id_fkey"
	}).onUpdate("cascade").onDelete("set null"),
]);

export const accounts = pgTable("accounts", {
	id: serial().primaryKey().notNull(),
	customerId: integer("customer_id").notNull(),
	accountNumber: text("account_number").notNull(),
	// Legacy field - kept for backward compatibility
	accountType: text("account_type").notNull(),
	// New standardized field
	accountTypeCode: text("account_type_code"),
	// CIF reference from customers table
	cif: varchar("cif", { length: 8 }),
	currency: text().default('CDF').notNull(),
	balanceCdf: numeric("balance_cdf", { precision: 15, scale: 2 }).default('0').notNull(),
	balanceUsd: numeric("balance_usd", { precision: 15, scale: 2 }).default('0').notNull(),
	status: text().default('ACTIVE').notNull(),
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
]);

// ❌ REMOVED: account_type_configurations table (never used in codebase)
// Use account_type_configs (Prisma) for fees and permissions
// Use account_types (Drizzle) for account type definitions

export const credits = pgTable("credits", {
	id: serial().primaryKey().notNull(),
	customerId: integer("customer_id").notNull(),
	cif: text(),
	creditType: text("credit_type").notNull(),
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
]);

export const transactions = pgTable("transactions", {
	id: serial().primaryKey().notNull(),
	accountId: integer("account_id"),
	creditId: integer("credit_id"),
	transactionType: text("transaction_type").notNull(),
	amountCdf: numeric("amount_cdf", { precision: 15, scale: 2 }).notNull(),
	amountUsd: numeric("amount_usd", { precision: 15, scale: 2 }),
	currency: text().default('CDF').notNull(),
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

export const agencies = pgTable("agencies", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	communeId: integer("commune_id"),
	active: boolean().default(true).notNull(),
	address: text(),
	phone: text(),
	createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("agencies_commune_id_idx").using("btree", table.communeId.asc().nullsLast().op("int4_ops")),
	uniqueIndex("agencies_name_key").using("btree", table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.communeId],
		foreignColumns: [communes.id],
		name: "agencies_commune_id_fkey"
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
	s04AccountId: integer("s04_account_id").notNull(), // Reference to S04 account
	currency: text().default('USD').notNull(), // 'CDF' or 'USD'
	totalAllocated: numeric("total_allocated", { precision: 15, scale: 2 }).default('0').notNull(), // Total dans allocation
	totalDebt: numeric("total_debt", { precision: 15, scale: 2 }).default('0').notNull(), // Dette actuelle
	availableBalance: numeric("available_balance", { precision: 15, scale: 2 }).default('0').notNull(), // Solde disponible
	commissionRate: numeric("commission_rate", { precision: 5, scale: 4 }).default('0.10').notNull(), // 10% par défaut
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
	requestNumber: text("request_number").notNull(), // Unique request number
	amountRequested: numeric("amount_requested", { precision: 15, scale: 2 }).notNull(),
	amountApproved: numeric("amount_approved", { precision: 15, scale: 2 }),
	commissionAmount: numeric("commission_amount", { precision: 15, scale: 2 }).default('0').notNull(),
	netAmount: numeric("net_amount", { precision: 15, scale: 2 }),
	currency: text().default('USD').notNull(),
	status: text().default('PENDING').notNull(), // PENDING, APPROVED, DISBURSED, REJECTED, CANCELLED
	requestedAt: timestamp("requested_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	approvedAt: timestamp("approved_at", { precision: 3, mode: 'string' }),
	disbursedAt: timestamp("disbursed_at", { precision: 3, mode: 'string' }),
	approvedBy: integer("approved_by"), // Admin user ID
	rejectionReason: text("rejection_reason"),
	dueDate: timestamp("due_date", { precision: 3, mode: 'string' }), // Date limite de remboursement
	repaymentStatus: text("repayment_status").default('UNPAID').notNull(), // UNPAID, PARTIAL, PAID, OVERPAID
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
	paymentMethod: text("payment_method"), // 'TRANSFER', 'CASH', 'AUTO_DEBIT'
	sourceAccountId: integer("source_account_id"), // Account used for repayment
	repaidAt: timestamp("repaid_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	processedBy: integer("processed_by"), // Admin user ID if manual
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
	eligibilityStatus: text("eligibility_status").default('NEUTRAL').notNull(), // WHITELISTED, BLACKLISTED, NEUTRAL
	creditScore: integer("credit_score").default(0).notNull(), // Score de crédit (0-100)
	maxCreditLimit: numeric("max_credit_limit", { precision: 15, scale: 2 }).default('0').notNull(),
	currentCreditUsed: numeric("current_credit_used", { precision: 15, scale: 2 }).default('0').notNull(),
	totalLoansCompleted: integer("total_loans_completed").default(0).notNull(),
	totalLoansDefaulted: integer("total_loans_defaulted").default(0).notNull(),
	onTimeRepaymentRate: numeric("on_time_repayment_rate", { precision: 5, scale: 2 }).default('0').notNull(), // Percentage
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
