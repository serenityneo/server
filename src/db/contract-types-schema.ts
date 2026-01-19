/**
 * Contract Types Schema
 * Dynamic contract type management system
 * 
 * Business Context:
 * Contract types define the various categories of legal agreements that can be created
 * in the system. This allows administrators to dynamically manage available contract types
 * without requiring code changes.
 */

import { pgTable, serial, varchar, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { contracts } from './contracts-schema';

/**
 * Contract Types Table
 * Stores all available contract type definitions
 */
export const contractTypes = pgTable('contract_types', {
  // Primary Key
  id: serial('id').primaryKey(),
  
  // Type Identification
  code: varchar('code', { length: 100 }).notNull().unique(), // 'ACCOUNT_OPENING', 'LOAN_AGREEMENT', etc.
  label: varchar('label', { length: 200 }).notNull(), // Display name in French
  labelEn: varchar('label_en', { length: 200 }), // Optional English label
  
  // Type Classification
  category: varchar('category', { length: 50 }).notNull(), // 'BANKING', 'CREDIT', 'SAVINGS', 'INVESTMENT'
  
  // Type Configuration
  description: text('description'), // Detailed description of what this contract type is for
  requiresAmount: boolean('requires_amount').default(false), // Whether monetary amount is mandatory
  requiresInterestRate: boolean('requires_interest_rate').default(false), // Whether interest rate is needed
  requiresEndDate: boolean('requires_end_date').default(false), // Whether end date is mandatory
  allowsAutoRenewal: boolean('allows_auto_renewal').default(true), // Whether auto-renewal is possible
  
  // Default Values
  defaultCurrency: varchar('default_currency', { length: 10 }).default('CDF'), // CDF or USD
  defaultDurationDays: integer('default_duration_days'), // Default contract duration (optional)
  
  // Template Configuration
  termsTemplate: text('terms_template'), // Default terms & conditions template (can use placeholders)
  
  // Display & Ordering
  displayOrder: integer('display_order').default(0), // Order in selection dropdown
  icon: varchar('icon', { length: 50 }), // Lucide icon name (e.g., 'FileText', 'Landmark')
  color: varchar('color', { length: 20 }), // Color code for UI display
  
  // Status
  isActive: boolean('is_active').default(true), // Whether this type is currently available
  
  // Audit Trail
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: integer('created_by'), // Admin user who created this type
  updatedBy: integer('updated_by'), // Admin user who last updated
});

/**
 * Contract Type Fields Table
 * Defines additional custom fields specific to each contract type
 */
export const contractTypeFields = pgTable('contract_type_fields', {
  id: serial('id').primaryKey(),
  contractTypeId: integer('contract_type_id').notNull(), // References contract_types.id
  
  // Field Definition
  fieldName: varchar('field_name', { length: 100 }).notNull(), // Technical field name
  fieldLabel: varchar('field_label', { length: 200 }).notNull(), // Display label
  fieldType: varchar('field_type', { length: 50 }).notNull(), // 'text', 'number', 'date', 'select', 'textarea'
  
  // Field Configuration
  isRequired: boolean('is_required').default(false),
  defaultValue: text('default_value'),
  validationRules: text('validation_rules'), // JSON string with validation rules
  options: text('options'), // JSON array for select field options
  placeholder: varchar('placeholder', { length: 200 }),
  helpText: text('help_text'),
  
  // Display
  displayOrder: integer('display_order').default(0),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const contractTypesRelations = relations(contractTypes, ({ many }) => ({
  customFields: many(contractTypeFields),
}));

export const contractTypeFieldsRelations = relations(contractTypeFields, ({ one }) => ({
  contractType: one(contractTypes, {
    fields: [contractTypeFields.contractTypeId],
    references: [contractTypes.id],
  }),
}));
