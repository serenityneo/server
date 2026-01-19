/**
 * CREDIT MODULE - Account Service
 * 
 * Gestion des comptes S01-S06:
 * - Validation des opérations selon le type de compte
 * - Calcul des frais
 * - Vérification des permissions
 */

import { FastifyRequest } from 'fastify';
import { 
  AccountTypeCode, 
  Currency, 
  TransactionValidation,
  AccountConfig 
} from '../../types';

export class CreditAccountService {
  /**
   * Récupérer la configuration d'un type de compte
   */
  static async getAccountConfig(accountTypeCode: AccountTypeCode): Promise<AccountConfig | null> {
    // TODO: Intégration avec Prisma/Drizzle
    // Pour l'instant, retourne la configuration hardcodée
    const configs: Record<AccountTypeCode, Partial<AccountConfig>> = {
      [AccountTypeCode.S01_STANDARD]: {
        account_type_code: AccountTypeCode.S01_STANDARD,
        account_type_name: 'Compte Standard',
        description: 'Compte principal pour toutes opérations',
        monthly_fee_usd: 1.00,
        monthly_fee_cdf: 2500.00,
        allow_withdrawal: true,
        allow_deposit: true,
        allow_transfer_in: true,
        allow_transfer_out: true,
        withdrawal_fee_usd: 0,
        deposit_fee_usd: 0,
        transfer_fee_usd: 0,
      },
      [AccountTypeCode.S02_MANDATORY_SAVINGS]: {
        account_type_code: AccountTypeCode.S02_MANDATORY_SAVINGS,
        account_type_name: 'Épargne Obligatoire',
        description: 'Pas de retrait direct. Transfert vers S01 requis.',
        monthly_fee_usd: 1.00,
        allow_withdrawal: false,
        allow_deposit: true,
        allow_transfer_in: true,
        allow_transfer_out: true,
        transfer_fee_usd: 0.20,
      },
      [AccountTypeCode.S03_CAUTION]: {
        account_type_code: AccountTypeCode.S03_CAUTION,
        account_type_name: 'Caution',
        description: 'Dépôt uniquement. Pas de retrait ni transfert.',
        monthly_fee_usd: 1.00,
        allow_withdrawal: false,
        allow_deposit: true,
        allow_transfer_in: false,  // 🔧 FIX: Pas de transfert entrant (dépôt uniquement)
        allow_transfer_out: false,
      },
      [AccountTypeCode.S04_CREDIT]: {
        account_type_code: AccountTypeCode.S04_CREDIT,
        account_type_name: 'Compte Crédit',
        description: 'Transfert entrant système uniquement. Pas de retrait ni transfert sortant.',
        monthly_fee_usd: 0,
        allow_withdrawal: false,   // 🔧 FIX: Pas de retrait direct
        allow_deposit: true,        // Remboursements autorisés
        allow_transfer_in: true,    // Transfert entrant (système uniquement - validation requise)
        allow_transfer_out: false,  // 🔧 FIX: Pas de transfert sortant
      },
      [AccountTypeCode.S05_BWAKISA_CARTE]: {
        account_type_code: AccountTypeCode.S05_BWAKISA_CARTE,
        account_type_name: 'Bwakisa Carte',
        description: 'Compte pour carte Bwakisa',
        monthly_fee_usd: 0,
        allow_withdrawal: true,
        allow_deposit: true,
        allow_transfer_in: true,
        allow_transfer_out: true,
      },
      [AccountTypeCode.S06_FINES]: {
        account_type_code: AccountTypeCode.S06_FINES,
        account_type_name: 'Amendes',
        description: 'Compte pour amendes et pénalités',
        monthly_fee_usd: 0,
        allow_withdrawal: false,
        allow_deposit: true,
        allow_transfer_in: true,
        allow_transfer_out: false,
      },
    };

    return configs[accountTypeCode] as AccountConfig;
  }

  /**
   * Valider un retrait
   */
  static async validateWithdrawal(
    accountTypeCode: AccountTypeCode,
    amount: number,
    currency: Currency,
    currentBalance: number
  ): Promise<TransactionValidation> {
    const config = await this.getAccountConfig(accountTypeCode);
    
    if (!config) {
      return {
        allowed: false,
        reason: 'Configuration du compte introuvable',
      };
    }

    // Vérifier permission
    if (!config.allow_withdrawal) {
      let reason = 'Retraits non autorisés sur ce compte';
      
      if (accountTypeCode === AccountTypeCode.S02_MANDATORY_SAVINGS) {
        reason = 'Les retraits directs ne sont pas autorisés sur le compte Épargne Obligatoire (S02). Veuillez transférer vers votre compte S01 d\'abord.';
      } else if (accountTypeCode === AccountTypeCode.S03_CAUTION) {
        reason = 'Les retraits ne sont pas autorisés sur le compte Caution (S03). Ce compte est réservé aux dépôts de garantie.';
      }
      
      return { allowed: false, reason };
    }

    // Calculer les frais
    const fee = currency === Currency.USD 
      ? config.withdrawal_fee_usd 
      : config.withdrawal_fee_cdf;

    const totalRequired = amount + fee;

    // Vérifier solde
    if (currentBalance < totalRequired) {
      return {
        allowed: false,
        reason: `Solde insuffisant. Requis: ${totalRequired} ${currency} (montant: ${amount} + frais: ${fee})`,
        balance: currentBalance,
        total_required: totalRequired,
      };
    }

    return {
      allowed: true,
      fee_usd: currency === Currency.USD ? fee : 0,
      fee_cdf: currency === Currency.CDF ? fee : 0,
    };
  }

  /**
   * Valider un dépôt
   */
  static async validateDeposit(
    accountTypeCode: AccountTypeCode,
    amount: number,
    currency: Currency
  ): Promise<TransactionValidation> {
    const config = await this.getAccountConfig(accountTypeCode);
    
    if (!config) {
      return {
        allowed: false,
        reason: 'Configuration du compte introuvable',
      };
    }

    if (!config.allow_deposit) {
      return {
        allowed: false,
        reason: 'Dépôts non autorisés sur ce compte',
      };
    }

    const fee = currency === Currency.USD 
      ? config.deposit_fee_usd 
      : config.deposit_fee_cdf;

    return {
      allowed: true,
      fee_usd: currency === Currency.USD ? fee : 0,
      fee_cdf: currency === Currency.CDF ? fee : 0,
    };
  }

  /**
   * Valider un transfert sortant
   */
  static async validateTransferOut(
    fromAccountType: AccountTypeCode,
    toAccountType: AccountTypeCode,
    amount: number,
    currency: Currency,
    currentBalance: number
  ): Promise<TransactionValidation> {
    const fromConfig = await this.getAccountConfig(fromAccountType);
    const toConfig = await this.getAccountConfig(toAccountType);
    
    if (!fromConfig || !toConfig) {
      return {
        allowed: false,
        reason: 'Configuration du compte introuvable',
      };
    }

    // Vérifier permission de transfert sortant
    if (!fromConfig.allow_transfer_out) {
      return {
        allowed: false,
        reason: `Les transferts sortants ne sont pas autorisés sur le compte ${fromAccountType}`,
      };
    }

    // Vérifier permission de transfert entrant
    if (!toConfig.allow_transfer_in) {
      return {
        allowed: false,
        reason: `Le compte ${toAccountType} n'accepte pas les transferts entrants`,
      };
    }

    // Calculer les frais
    const fee = currency === Currency.USD 
      ? fromConfig.transfer_fee_usd 
      : fromConfig.transfer_fee_cdf;

    const totalRequired = amount + fee;

    // Vérifier solde
    if (currentBalance < totalRequired) {
      return {
        allowed: false,
        reason: `Solde insuffisant. Requis: ${totalRequired} ${currency} (montant: ${amount} + frais: ${fee})`,
        balance: currentBalance,
        total_required: totalRequired,
      };
    }

    return {
      allowed: true,
      fee_usd: currency === Currency.USD ? fee : 0,
      fee_cdf: currency === Currency.CDF ? fee : 0,
    };
  }

  /**
   * Récupérer tous les comptes d'un client
   */
  static async getCustomerAccounts(customerId: number) {
    // TODO: Intégration avec base de données
    // Cette méthode sera appelée depuis les routes
    throw new Error('Not implemented - to be connected to database');
  }

  /**
   * Créer un nouveau compte
   */
  static async createAccount(
    customerId: number,
    accountType: AccountTypeCode,
    currency: Currency
  ) {
    // TODO: Intégration avec base de données
    throw new Error('Not implemented - to be connected to database');
  }

  /**
   * Suspendre un compte
   */
  static async suspendAccount(accountId: number, reason: string) {
    // TODO: Intégration avec base de données
    throw new Error('Not implemented - to be connected to database');
  }

  /**
   * Réactiver un compte
   */
  static async reactivateAccount(accountId: number) {
    // TODO: Intégration avec base de données
    throw new Error('Not implemented - to be connected to database');
  }
}
