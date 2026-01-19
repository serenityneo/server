/**
 * CREDIT MODULE - Type Definitions
 * 
 * Définit tous les types pour:
 * - 6 Types de comptes (S01-S06)
 * - Produits crédit (VIMBISA, BOMBE, TELEMA, MOPAO, LIKELEMBA)
 */

// ===== TYPES DE COMPTES =====

export enum AccountTypeCode {
  S01_STANDARD = 'S01',
  S02_MANDATORY_SAVINGS = 'S02',
  S03_CAUTION = 'S03',
  S04_CREDIT = 'S04',
  S05_BWAKISA_CARTE = 'S05',
  S06_FINES = 'S06'
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED'
}

export enum Currency {
  USD = 'USD',
  CDF = 'CDF'
}

export interface AccountConfig {
  id: number;
  account_type_code: AccountTypeCode;
  account_type_name: string;
  description: string | null;
  
  // Frais
  monthly_fee_usd: number;
  monthly_fee_cdf: number;
  withdrawal_fee_usd: number;
  withdrawal_fee_cdf: number;
  deposit_fee_usd: number;
  deposit_fee_cdf: number;
  transfer_fee_usd: number;
  transfer_fee_cdf: number;
  
  // Permissions
  allow_withdrawal: boolean;
  allow_deposit: boolean;
  allow_transfer_in: boolean;
  allow_transfer_out: boolean;
  
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Account {
  id: number;
  customer_id: number;
  account_number: string;
  account_type: AccountTypeCode;
  currency: Currency;
  balance_cdf: number;
  balance_usd: number;
  status: AccountStatus;
  opened_date: Date;
  closed_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ===== PRODUITS CRÉDIT =====

export enum CreditProductType {
  VIMBISA = 'VIMBISA',
  BOMBE = 'BOMBE',
  TELEMA = 'TELEMA',
  MOPAO = 'MOPAO',
  LIKELEMBA = 'LIKELEMBA'
}

export enum CreditStatus {
  PENDING = 'PENDING',
  DOCUMENT_REVIEW = 'DOCUMENT_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  DISBURSED = 'DISBURSED',
  ACTIVE = 'ACTIVE',
  REPAYING = 'REPAYING',
  PAID_OFF = 'PAID_OFF',
  OVERDUE = 'OVERDUE',
  DEFAULTED = 'DEFAULTED',
  CANCELLED = 'CANCELLED'
}

export enum RepaymentFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  ON_DEMAND = 'ON_DEMAND'
}

export interface CreditProduct {
  id: number;
  product_code: CreditProductType;
  product_name: string;
  description: string | null;
  
  // Configuration
  min_amount_usd: number;
  max_amount_usd: number;
  interest_rate: number;
  processing_fee_rate: number;
  
  // Conditions
  min_credit_score?: number;
  min_activity_months?: number;
  required_account_types?: AccountTypeCode[];
  
  // Remboursement
  repayment_frequency: RepaymentFrequency;
  min_installments: number;
  max_installments: number;
  
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreditApplication {
  id: number;
  customer_id: number;
  product_type: CreditProductType;
  
  // Montants
  requested_amount_usd: number;
  requested_amount_cdf: number;
  approved_amount_usd?: number;
  approved_amount_cdf?: number;
  
  // Frais et intérêts
  interest_rate: number;
  processing_fee_usd: number;
  processing_fee_cdf: number;
  total_to_repay_usd: number;
  total_to_repay_cdf: number;
  
  // Remboursement
  repayment_frequency: RepaymentFrequency;
  installment_amount_usd: number;
  installment_amount_cdf: number;
  number_of_installments: number;
  
  // Dates
  application_date: Date;
  approval_date?: Date;
  disbursement_date?: Date;
  first_payment_date?: Date;
  final_payment_date?: Date;
  
  // Statut
  status: CreditStatus;
  rejection_reason?: string;
  approved_by?: string;
  
  // Documents
  document_url?: string;
  document_filename?: string;
  
  // Métadonnées
  product_config?: any;
  eligibility_snapshot?: any;
  repayment_schedule?: any;
  
  created_at: Date;
  updated_at: Date;
}

// ===== VALIDATION & RÈGLES =====

export interface TransactionValidation {
  allowed: boolean;
  reason?: string;
  fee_usd?: number;
  fee_cdf?: number;
  balance?: number;
  total_required?: number;
}

export interface EligibilityCheck {
  eligible: boolean;
  reasons?: string[];
  max_amount?: number;
  recommended_product?: CreditProductType;
}

// ===== API REQUEST/RESPONSE =====

export interface CreateCreditApplicationRequest {
  customer_id: number;
  product_type: CreditProductType;
  requested_amount: number;
  currency: Currency;
  repayment_frequency: RepaymentFrequency;
  number_of_installments: number;
  documents?: File[];
}

export interface CreditDashboardStats {
  total_applications: number;
  pending_applications: number;
  approved_applications: number;
  active_credits: number;
  total_disbursed_usd: number;
  total_outstanding_usd: number;
  overdue_count: number;
}
