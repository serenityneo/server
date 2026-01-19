/**
 * CREDIT MODULE - Product Service Base
 * 
 * Classe de base pour tous les produits crédit:
 * - VIMBISA
 * - BOMBE
 * - TELEMA
 * - MOPAO
 * - LIKELEMBA
 */

import { 
  CreditProductType, 
  CreditProduct, 
  CreditApplication,
  EligibilityCheck,
  RepaymentFrequency,
  Currency
} from '../../types';

export abstract class BaseCreditProductService {
  protected productType: CreditProductType;
  protected productConfig: Partial<CreditProduct>;

  constructor(productType: CreditProductType) {
    this.productType = productType;
    this.productConfig = {};
  }

  /**
   * Récupérer la configuration du produit
   */
  async getProductConfig(): Promise<CreditProduct | null> {
    // TODO: Intégration avec base de données
    throw new Error('Not implemented - to be connected to database');
  }

  /**
   * Vérifier l'éligibilité d'un client pour ce produit
   */
  async checkEligibility(customerId: number): Promise<EligibilityCheck> {
    // TODO: Logique d'éligibilité spécifique à chaque produit
    // - Vérifier historique client
    // - Vérifier score crédit
    // - Vérifier types de comptes
    // - Vérifier ancienneté
    throw new Error('Not implemented - to be overridden by product service');
  }

  /**
   * Calculer les intérêts et frais
   */
  calculateLoanDetails(
    requestedAmount: number,
    numberOfInstallments: number,
    interestRate: number,
    processingFeeRate: number
  ) {
    const interestAmount = (requestedAmount * interestRate * numberOfInstallments) / 100;
    const processingFee = (requestedAmount * processingFeeRate) / 100;
    const totalToRepay = requestedAmount + interestAmount + processingFee;
    const installmentAmount = totalToRepay / numberOfInstallments;

    return {
      principal: requestedAmount,
      interest_amount: interestAmount,
      processing_fee: processingFee,
      total_to_repay: totalToRepay,
      installment_amount: installmentAmount,
      number_of_installments: numberOfInstallments,
    };
  }

  /**
   * Créer une demande de crédit
   */
  async createApplication(data: {
    customer_id: number;
    requested_amount: number;
    currency: Currency;
    repayment_frequency: RepaymentFrequency;
    number_of_installments: number;
  }): Promise<CreditApplication> {
    // TODO: Intégration avec base de données
    // 1. Vérifier éligibilité
    // 2. Calculer montants
    // 3. Créer la demande
    // 4. Déclencher workflow d'approbation
    throw new Error('Not implemented - to be connected to database');
  }

  /**
   * Approuver une demande
   */
  async approveApplication(
    applicationId: number,
    approvedBy: string,
    approvedAmount?: number
  ): Promise<CreditApplication> {
    // TODO: Intégration avec base de données
    throw new Error('Not implemented - to be connected to database');
  }

  /**
   * Rejeter une demande
   */
  async rejectApplication(
    applicationId: number,
    rejectedBy: string,
    reason: string
  ): Promise<CreditApplication> {
    // TODO: Intégration avec base de données
    throw new Error('Not implemented - to be connected to database');
  }

  /**
   * Débloquer les fonds (disbursement)
   */
  async disburseCredit(applicationId: number): Promise<CreditApplication> {
    // TODO: Intégration avec base de données
    // 1. Vérifier statut = APPROVED
    // 2. Créditer le compte client
    // 3. Créer le calendrier de remboursement
    // 4. Mettre à jour statut = DISBURSED
    throw new Error('Not implemented - to be connected to database');
  }

  /**
   * Enregistrer un paiement
   */
  async recordPayment(
    applicationId: number,
    amount: number,
    currency: Currency,
    paymentDate: Date
  ) {
    // TODO: Intégration avec base de données
    throw new Error('Not implemented - to be connected to database');
  }

  /**
   * Récupérer le calendrier de remboursement
   */
  async getRepaymentSchedule(applicationId: number) {
    // TODO: Intégration avec base de données
    throw new Error('Not implemented - to be connected to database');
  }
}
