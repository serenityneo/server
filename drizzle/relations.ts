import { relations } from "drizzle-orm/relations";
import { customers, contactChangeLogs, kycDrafts, otp, otpEvents, users, agencies, quartiers, postalCodes, roles, accounts, credits, transactions, auditLogs, userSessions, deviceFingerprints, communes, customerSecurityQuestions, customerLoginHistory, fraudAlerts, customerBehaviorProfiles, securityEvents, partnerActions, partnerSecurityLimits, partnerSupervisorRelations, countries, cities } from "./schema";

export const contactChangeLogsRelations = relations(contactChangeLogs, ({one}) => ({
	customer: one(customers, {
		fields: [contactChangeLogs.customerId],
		references: [customers.id]
	}),
}));

export const customersRelations = relations(customers, ({one, many}) => ({
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
}));

export const kycDraftsRelations = relations(kycDrafts, ({one}) => ({
	customer: one(customers, {
		fields: [kycDrafts.customerId],
		references: [customers.id]
	}),
}));

export const otpEventsRelations = relations(otpEvents, ({one}) => ({
	otp: one(otp, {
		fields: [otpEvents.otpId],
		references: [otp.id]
	}),
	customer: one(customers, {
		fields: [otpEvents.customerId],
		references: [customers.id]
	}),
}));

export const otpRelations = relations(otp, ({one, many}) => ({
	otpEvents: many(otpEvents),
	customer: one(customers, {
		fields: [otp.customerId],
		references: [customers.id]
	}),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	customers: many(customers),
	role: one(roles, {
		fields: [users.roleId],
		references: [roles.id]
	}),
	auditLogs: many(auditLogs),
	userSessions: many(userSessions),
	fraudAlerts: many(fraudAlerts),
	partnerActions: many(partnerActions),
}));

export const agenciesRelations = relations(agencies, ({one, many}) => ({
	customers: many(customers),
	commune: one(communes, {
		fields: [agencies.communeId],
		references: [communes.id]
	}),
}));

export const quartiersRelations = relations(quartiers, ({one, many}) => ({
	customers: many(customers),
	commune: one(communes, {
		fields: [quartiers.communeId],
		references: [communes.id]
	}),
	postalCodes: many(postalCodes),
}));

export const postalCodesRelations = relations(postalCodes, ({one, many}) => ({
	customers: many(customers),
	quartier: one(quartiers, {
		fields: [postalCodes.quartierId],
		references: [quartiers.id]
	}),
}));

export const rolesRelations = relations(roles, ({many}) => ({
	users: many(users),
}));

export const accountsRelations = relations(accounts, ({one, many}) => ({
	customer: one(customers, {
		fields: [accounts.customerId],
		references: [customers.id]
	}),
	transactions: many(transactions),
}));

export const creditsRelations = relations(credits, ({one, many}) => ({
	customer: one(customers, {
		fields: [credits.customerId],
		references: [customers.id]
	}),
	transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({one}) => ({
	account: one(accounts, {
		fields: [transactions.accountId],
		references: [accounts.id]
	}),
	credit: one(credits, {
		fields: [transactions.creditId],
		references: [credits.id]
	}),
}));

export const auditLogsRelations = relations(auditLogs, ({one}) => ({
	user: one(users, {
		fields: [auditLogs.userId],
		references: [users.id]
	}),
}));

export const userSessionsRelations = relations(userSessions, ({one}) => ({
	user: one(users, {
		fields: [userSessions.userId],
		references: [users.id]
	}),
	deviceFingerprint: one(deviceFingerprints, {
		fields: [userSessions.deviceFingerprintId],
		references: [deviceFingerprints.id]
	}),
}));

export const deviceFingerprintsRelations = relations(deviceFingerprints, ({one, many}) => ({
	userSessions: many(userSessions),
	customer: one(customers, {
		fields: [deviceFingerprints.customerId],
		references: [customers.id]
	}),
	customerLoginHistories: many(customerLoginHistory),
	fraudAlerts: many(fraudAlerts),
}));

export const communesRelations = relations(communes, ({one, many}) => ({
	agencies: many(agencies),
	quartiers: many(quartiers),
	city: one(cities, {
		fields: [communes.cityId],
		references: [cities.id]
	}),
}));

export const customerSecurityQuestionsRelations = relations(customerSecurityQuestions, ({one}) => ({
	customer: one(customers, {
		fields: [customerSecurityQuestions.customerId],
		references: [customers.id]
	}),
}));

export const customerLoginHistoryRelations = relations(customerLoginHistory, ({one}) => ({
	customer: one(customers, {
		fields: [customerLoginHistory.customerId],
		references: [customers.id]
	}),
	deviceFingerprint: one(deviceFingerprints, {
		fields: [customerLoginHistory.deviceFingerprintId],
		references: [deviceFingerprints.id]
	}),
}));

export const fraudAlertsRelations = relations(fraudAlerts, ({one}) => ({
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

export const customerBehaviorProfilesRelations = relations(customerBehaviorProfiles, ({one}) => ({
	customer: one(customers, {
		fields: [customerBehaviorProfiles.customerId],
		references: [customers.id]
	}),
}));

export const securityEventsRelations = relations(securityEvents, ({one}) => ({
	customer: one(customers, {
		fields: [securityEvents.customerId],
		references: [customers.id]
	}),
}));

export const partnerActionsRelations = relations(partnerActions, ({one}) => ({
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

export const partnerSecurityLimitsRelations = relations(partnerSecurityLimits, ({one}) => ({
	customer: one(customers, {
		fields: [partnerSecurityLimits.partnerId],
		references: [customers.id]
	}),
}));

export const partnerSupervisorRelationsRelations = relations(partnerSupervisorRelations, ({one}) => ({
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

export const citiesRelations = relations(cities, ({one, many}) => ({
	country: one(countries, {
		fields: [cities.countryId],
		references: [countries.id]
	}),
	communes: many(communes),
}));

export const countriesRelations = relations(countries, ({many}) => ({
	cities: many(cities),
}));