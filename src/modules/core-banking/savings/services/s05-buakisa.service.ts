/**
 * S05 BUAKISA CARTE SERVICE
 * 
 * Gère l'épargne programmée avec périodicité flexible:
 * - Création compte S05
 * - Dépôts intelligents (allocation/balance)
 * - Tracking périodes
 * - Sortie anticipée avec pénalité 10% → S06
 */

import { db } from '../../../../db';
import { 
  s05SavingsAccounts,
  s05Deposits,
  s05PeriodTracking,
  s05Withdrawals 
} from '../../../../db/s05-savings-schema';
import { accounts } from '../../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';

export type Periodicity = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface CreateS05SavingsParams {
  customerId: number;
  periodicity: Periodicity;
  targetAmountCdf?: number;
  targetAmountUsd?: number;
  numberOfPeriods: number;
}

export class S05BuakisaService {
  /**
   * Créer un compte d'épargne S05
   */
  static async createSavingsAccount(params: CreateS05SavingsParams) {
    const {
      customerId,
      periodicity,
      targetAmountCdf = 0,
      targetAmountUsd = 0,
      numberOfPeriods,
    } = params;

    return await db.transaction(async (tx: any) => {
      // 1. Vérifier qu'un compte S05 existe pour le client
      const [s05Account] = await tx
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.customerId, customerId),
            eq(accounts.accountType, 'S05_BWAKISA_CARTE')
          )
        );

      if (!s05Account) {
        throw new Error('Compte S05 non trouvé. Créez d\'abord un compte S05.');
      }

      // 2. Calculer allocation percentage (1/N)
      const allocationPercentage = (100 / numberOfPeriods).toFixed(2);
      const allocationAmountCdf = (targetAmountCdf / numberOfPeriods).toFixed(2);
      const allocationAmountUsd = (targetAmountUsd / numberOfPeriods).toFixed(2);
      const balanceTargetCdf = (targetAmountCdf * (numberOfPeriods - 1) / numberOfPeriods).toFixed(2);
      const balanceTargetUsd = (targetAmountUsd * (numberOfPeriods - 1) / numberOfPeriods).toFixed(2);
      const amountPerPeriodCdf = allocationAmountCdf;
      const amountPerPeriodUsd = allocationAmountUsd;

      // 3. Calculer date de maturité
      const startDate = new Date().toISOString();
      const maturityDate = this.calculateMaturityDate(startDate, periodicity, numberOfPeriods);

      // 4. Créer compte épargne S05
      const [savings] = await tx.insert(s05SavingsAccounts).values({
        customerId,
        accountId: s05Account.id,
        periodicity,
        targetAmountCdf: targetAmountCdf.toString(),
        targetAmountUsd: targetAmountUsd.toString(),
        numberOfPeriods,
        allocationPercentage: allocationPercentage.toString(),
        allocationAmountCdf: allocationAmountCdf.toString(),
        allocationAmountUsd: allocationAmountUsd.toString(),
        balanceTargetCdf: balanceTargetCdf.toString(),
        balanceTargetUsd: balanceTargetUsd.toString(),
        amountPerPeriodCdf: amountPerPeriodCdf.toString(),
        amountPerPeriodUsd: amountPerPeriodUsd.toString(),
        startDate,
        maturityDate,
        status: 'ACTIVE',
      }).returning();

      // 5. Créer tracking pour toutes les périodes
      const periods = [];
      for (let i = 1; i <= numberOfPeriods; i++) {
        const periodStart = this.calculatePeriodStartDate(startDate, periodicity, i - 1);
        const periodEnd = this.calculatePeriodStartDate(startDate, periodicity, i);

        periods.push({
          savingsId: savings.id,
          periodNumber: i,
          targetAmountCdf: amountPerPeriodCdf.toString(),
          targetAmountUsd: amountPerPeriodUsd.toString(),
          periodStartDate: periodStart,
          periodEndDate: periodEnd,
        });
      }

      await tx.insert(s05PeriodTracking).values(periods);

      return {
        savings,
        message: `Compte S05 créé avec succès. Objectif: ${targetAmountCdf} CDF en ${numberOfPeriods} ${periodicity}`,
      };
    });
  }

  /**
   * Dépôt sur compte S05
   * LOGIQUE: Premier dépôt → Allocation, Suivants → Solde
   */
  static async depositToS05(params: {
    savingsId: number;
    customerId: number;
    amountCdf?: number;
    amountUsd?: number;
    currency: 'CDF' | 'USD';
    depositMethod?: string;
    referenceNumber?: string;
  }) {
    const { savingsId, customerId, amountCdf = 0, amountUsd = 0, currency, depositMethod, referenceNumber } = params;

    return await db.transaction(async (tx: any) => {
      // 1. Récupérer compte épargne
      const [savings] = await tx
        .select()
        .from(s05SavingsAccounts)
        .where(eq(s05SavingsAccounts.id, savingsId));

      if (!savings) {
        throw new Error('Compte épargne S05 non trouvé');
      }

      if (savings.status !== 'ACTIVE') {
        throw new Error(`Compte épargne ${savings.status}. Impossible de déposer.`);
      }

      // 2. Vérifier si c'est le PREMIER dépôt
      const isFirstDeposit = parseFloat(savings.totalDepositedCdf) === 0 && parseFloat(savings.totalDepositedUsd) === 0;

      let goesTo: 'ALLOCATION' | 'BALANCE';
      let periodNumber = savings.currentPeriod || 1;

      if (isFirstDeposit) {
        // Premier dépôt → ALLOCATION (système)
        goesTo = 'ALLOCATION';
        savings.s05AllocationCdf = (parseFloat(savings.s05AllocationCdf) + amountCdf).toString();
        savings.s05AllocationUsd = (parseFloat(savings.s05AllocationUsd) + amountUsd).toString();
        savings.currentPeriod = 1;
        periodNumber = 1;
      } else {
        // Dépôts suivants → BALANCE (client)
        goesTo = 'BALANCE';
        savings.s05BalanceCdf = (parseFloat(savings.s05BalanceCdf) + amountCdf).toString();
        savings.s05BalanceUsd = (parseFloat(savings.s05BalanceUsd) + amountUsd).toString();
        periodNumber = savings.currentPeriod;
      }

      // 3. Mettre à jour total déposé
      savings.totalDepositedCdf = (parseFloat(savings.totalDepositedCdf) + amountCdf).toString();
      savings.totalDepositedUsd = (parseFloat(savings.totalDepositedUsd) + amountUsd).toString();

      // 4. Mettre à jour tracking période
      const [currentPeriod] = await tx
        .select()
        .from(s05PeriodTracking)
        .where(
          and(
            eq(s05PeriodTracking.savingsId, savingsId),
            eq(s05PeriodTracking.periodNumber, periodNumber)
          )
        );

      if (currentPeriod) {
        const newDepositedCdf = parseFloat(currentPeriod.depositedAmountCdf) + amountCdf;
        const newDepositedUsd = parseFloat(currentPeriod.depositedAmountUsd) + amountUsd;
        const targetCdf = parseFloat(currentPeriod.targetAmountCdf);
        const targetUsd = parseFloat(currentPeriod.targetAmountUsd);

        const periodCompleted = (currency === 'CDF' && newDepositedCdf >= targetCdf) || 
                               (currency === 'USD' && newDepositedUsd >= targetUsd);

        await tx
          .update(s05PeriodTracking)
          .set({
            depositedAmountCdf: newDepositedCdf.toString(),
            depositedAmountUsd: newDepositedUsd.toString(),
            isCompleted: periodCompleted,
            completedAt: periodCompleted ? new Date().toISOString() : null,
          })
          .where(eq(s05PeriodTracking.id, currentPeriod.id));

        // Si période complète, passer à la suivante
        if (periodCompleted && !isFirstDeposit) {
          savings.currentPeriod = periodNumber + 1;
        }
      }

      // 5. Vérifier si objectif total atteint
      const totalTarget = currency === 'CDF' ? parseFloat(savings.targetAmountCdf) : parseFloat(savings.targetAmountUsd);
      const totalDeposited = currency === 'CDF' ? parseFloat(savings.totalDepositedCdf) : parseFloat(savings.totalDepositedUsd);

      if (totalDeposited >= totalTarget) {
        savings.status = 'COMPLETED';
        savings.completedAt = new Date().toISOString();
      }

      // 6. Enregistrer dépôt
      await tx.insert(s05Deposits).values({
        savingsId,
        customerId,
        amountCdf: amountCdf.toString(),
        amountUsd: amountUsd.toString(),
        currency,
        goesTo,
        periodNumber,
        periodCompleted: currentPeriod?.isCompleted || false,
        periodTargetMet: currentPeriod?.isCompleted || false,
        depositMethod,
        referenceNumber,
      });

      // 7. Mettre à jour compte épargne
      await tx
        .update(s05SavingsAccounts)
        .set({
          s05AllocationCdf: savings.s05AllocationCdf,
          s05AllocationUsd: savings.s05AllocationUsd,
          s05BalanceCdf: savings.s05BalanceCdf,
          s05BalanceUsd: savings.s05BalanceUsd,
          totalDepositedCdf: savings.totalDepositedCdf,
          totalDepositedUsd: savings.totalDepositedUsd,
          currentPeriod: savings.currentPeriod,
          status: savings.status,
          completedAt: savings.completedAt || null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(s05SavingsAccounts.id, savingsId));

      return {
        savings,
        goesTo,
        periodNumber,
        message: `Dépôt de ${amountCdf || amountUsd} ${currency} effectué → ${goesTo}`,
      };
    });
  }

  /**
   * Calculer date de maturité
   */
  private static calculateMaturityDate(startDate: string, periodicity: Periodicity, numberOfPeriods: number): string {
    const start = new Date(startDate);
    let maturity: Date;

    switch (periodicity) {
      case 'DAILY':
        maturity = new Date(start.setDate(start.getDate() + numberOfPeriods));
        break;
      case 'WEEKLY':
        maturity = new Date(start.setDate(start.getDate() + (numberOfPeriods * 7)));
        break;
      case 'MONTHLY':
        maturity = new Date(start.setMonth(start.getMonth() + numberOfPeriods));
        break;
      case 'YEARLY':
        maturity = new Date(start.setFullYear(start.getFullYear() + numberOfPeriods));
        break;
      default:
        maturity = start;
    }

    return maturity.toISOString();
  }

  /**
   * Calculer date de début d'une période
   */
  private static calculatePeriodStartDate(startDate: string, periodicity: Periodicity, periodIndex: number): string {
    const start = new Date(startDate);
    let periodStart: Date;

    switch (periodicity) {
      case 'DAILY':
        periodStart = new Date(start.setDate(start.getDate() + periodIndex));
        break;
      case 'WEEKLY':
        periodStart = new Date(start.setDate(start.getDate() + (periodIndex * 7)));
        break;
      case 'MONTHLY':
        periodStart = new Date(start.setMonth(start.getMonth() + periodIndex));
        break;
      case 'YEARLY':
        periodStart = new Date(start.setFullYear(start.getFullYear() + periodIndex));
        break;
      default:
        periodStart = start;
    }

    return periodStart.toISOString();
  }

  /**
   * Récupérer compte épargne S05
   */
  static async getSavingsAccount(savingsId: number) {
    const [savings] = await db
      .select()
      .from(s05SavingsAccounts)
      .where(eq(s05SavingsAccounts.id, savingsId));

    return savings;
  }

  /**
   * Récupérer tous les comptes S05 d'un client
   */
  static async getCustomerSavingsAccounts(customerId: number) {
    const savingsAccounts = await db
      .select()
      .from(s05SavingsAccounts)
      .where(eq(s05SavingsAccounts.customerId, customerId))
      .orderBy(sql`${s05SavingsAccounts.createdAt} DESC`);

    return savingsAccounts;
  }

  /**
   * Récupérer historique dépôts S05
   */
  static async getSavingsDeposits(savingsId: number) {
    const deposits = await db
      .select()
      .from(s05Deposits)
      .where(eq(s05Deposits.savingsId, savingsId))
      .orderBy(sql`${s05Deposits.depositDate} DESC`);

    return deposits;
  }

  /**
   * Récupérer tracking périodes
   */
  static async getPeriodTracking(savingsId: number) {
    const periods = await db
      .select()
      .from(s05PeriodTracking)
      .where(eq(s05PeriodTracking.savingsId, savingsId))
      .orderBy(sql`${s05PeriodTracking.periodNumber} ASC`);

    return periods;
  }
}
