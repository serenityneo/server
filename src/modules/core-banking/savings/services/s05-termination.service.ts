/**
 * S05 EARLY TERMINATION SERVICE
 * 
 * Gère la sortie anticipée avec pénalité 10% → S06
 */

import { db } from '../../../../db';
import { 
  s05SavingsAccounts,
  s05Withdrawals 
} from '../../../../db/s05-savings-schema';
import { accounts, transactions } from '../../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';

export class S05TerminationService {
  /**
   * Sortie anticipée avec pénalité 10%
   * Pénalité → S06 (Amendes)
   * Reste → Compte principal client
   */
  static async earlyTermination(params: {
    savingsId: number;
    customerId: number;
    reason?: string;
    approvedBy?: number;
  }) {
    const { savingsId, customerId, reason, approvedBy } = params;

    return await db.transaction(async (tx: any) => {
      // 1. Récupérer compte épargne S05
      const [savings] = await tx
        .select()
        .from(s05SavingsAccounts)
        .where(
          and(
            eq(s05SavingsAccounts.id, savingsId),
            eq(s05SavingsAccounts.customerId, customerId)
          )
        );

      if (!savings) {
        throw new Error('Compte épargne S05 non trouvé');
      }

      if (savings.status === 'COMPLETED') {
        throw new Error('Épargne déjà complétée. Pas de pénalité.');
      }

      if (savings.status === 'TERMINATED_EARLY') {
        throw new Error('Épargne déjà terminée');
      }

      // 2. Calculer pénalité 10%
      const totalSavedCdf = parseFloat(savings.totalDepositedCdf);
      const totalSavedUsd = parseFloat(savings.totalDepositedUsd);
      const penaltyCdf = totalSavedCdf * 0.10;
      const penaltyUsd = totalSavedUsd * 0.10;
      const amountReturnedCdf = totalSavedCdf - penaltyCdf;
      const amountReturnedUsd = totalSavedUsd - penaltyUsd;

      // 3. Récupérer compte S06 (Amendes) du client
      const [s06Account] = await tx
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.customerId, customerId),
            eq(accounts.accountType, 'S06_FINES')
          )
        );

      if (!s06Account) {
        throw new Error('Compte S06 (Amendes) non trouvé');
      }

      // 4. Récupérer compte principal du client (S01)
      const [mainAccount] = await tx
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.customerId, customerId),
            eq(accounts.accountType, 'S01_STANDARD')
          )
        );

      if (!mainAccount) {
        throw new Error('Compte principal (S01) non trouvé');
      }

      // 5. Transférer pénalité vers S06
      if (penaltyCdf > 0) {
        await tx.insert(transactions).values({
          accountId: s06Account.id,
          customerId,
          type: 'PENALTY',
          amountCdf: penaltyCdf.toString(),
          amountUsd: penaltyUsd.toString(),
          currency: 'CDF',
          description: `Pénalité sortie anticipée S05 (10%) - Épargne #${savingsId}`,
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        });

        // Mettre à jour solde S06
        await tx
          .update(accounts)
          .set({
            balanceCdf: sql`${accounts.balanceCdf} + ${penaltyCdf}`,
            balanceUsd: sql`${accounts.balanceUsd} + ${penaltyUsd}`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(accounts.id, s06Account.id));
      }

      // 6. Retourner le reste au compte principal
      if (amountReturnedCdf > 0) {
        await tx.insert(transactions).values({
          accountId: mainAccount.id,
          customerId,
          type: 'CREDIT',
          amountCdf: amountReturnedCdf.toString(),
          amountUsd: amountReturnedUsd.toString(),
          currency: 'CDF',
          description: `Retour épargne S05 après sortie anticipée - Épargne #${savingsId}`,
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        });

        // Mettre à jour solde S01
        await tx
          .update(accounts)
          .set({
            balanceCdf: sql`${accounts.balanceCdf} + ${amountReturnedCdf}`,
            balanceUsd: sql`${accounts.balanceUsd} + ${amountReturnedUsd}`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(accounts.id, mainAccount.id));
      }

      // 7. Mettre à jour compte épargne S05
      await tx
        .update(s05SavingsAccounts)
        .set({
          status: 'TERMINATED_EARLY',
          earlyTerminationPenaltyCdf: penaltyCdf.toString(),
          earlyTerminationPenaltyUsd: penaltyUsd.toString(),
          earlyTerminationReason: reason,
          terminatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(s05SavingsAccounts.id, savingsId));

      // 8. Enregistrer dans historique
      await tx.insert(s05Withdrawals).values({
        savingsId,
        customerId,
        withdrawalType: 'EARLY_TERMINATION',
        totalSavedCdf: totalSavedCdf.toString(),
        totalSavedUsd: totalSavedUsd.toString(),
        penaltyAmountCdf: penaltyCdf.toString(),
        penaltyAmountUsd: penaltyUsd.toString(),
        amountReturnedCdf: amountReturnedCdf.toString(),
        amountReturnedUsd: amountReturnedUsd.toString(),
        reason,
        approvedBy,
      });

      return {
        totalSavedCdf,
        totalSavedUsd,
        penaltyCdf,
        penaltyUsd,
        amountReturnedCdf,
        amountReturnedUsd,
        message: `Sortie anticipée effectuée. Pénalité 10% (${penaltyCdf} CDF) → S06. Retour: ${amountReturnedCdf} CDF → S01`,
      };
    });
  }

  /**
   * Retrait à maturité (SANS pénalité)
   */
  static async withdrawAtMaturity(params: {
    savingsId: number;
    customerId: number;
  }) {
    const { savingsId, customerId } = params;

    return await db.transaction(async (tx: any) => {
      // 1. Récupérer compte épargne S05
      const [savings] = await tx
        .select()
        .from(s05SavingsAccounts)
        .where(
          and(
            eq(s05SavingsAccounts.id, savingsId),
            eq(s05SavingsAccounts.customerId, customerId)
          )
        );

      if (!savings) {
        throw new Error('Compte épargne S05 non trouvé');
      }

      if (savings.status !== 'COMPLETED') {
        throw new Error('Épargne non complétée. Utilisez sortie anticipée (avec pénalité).');
      }

      const totalSavedCdf = parseFloat(savings.totalDepositedCdf);
      const totalSavedUsd = parseFloat(savings.totalDepositedUsd);

      // 2. Récupérer compte principal
      const [mainAccount] = await tx
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.customerId, customerId),
            eq(accounts.accountType, 'S01_STANDARD')
          )
        );

      if (!mainAccount) {
        throw new Error('Compte principal (S01) non trouvé');
      }

      // 3. Transférer TOUT vers compte principal (SANS pénalité)
      if (totalSavedCdf > 0) {
        await tx.insert(transactions).values({
          accountId: mainAccount.id,
          customerId,
          type: 'CREDIT',
          amountCdf: totalSavedCdf.toString(),
          amountUsd: totalSavedUsd.toString(),
          currency: 'CDF',
          description: `Retrait épargne S05 à maturité - Épargne #${savingsId}`,
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        });

        await tx
          .update(accounts)
          .set({
            balanceCdf: sql`${accounts.balanceCdf} + ${totalSavedCdf}`,
            balanceUsd: sql`${accounts.balanceUsd} + ${totalSavedUsd}`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(accounts.id, mainAccount.id));
      }

      // 4. Enregistrer retrait
      await tx.insert(s05Withdrawals).values({
        savingsId,
        customerId,
        withdrawalType: 'MATURITY',
        totalSavedCdf: totalSavedCdf.toString(),
        totalSavedUsd: totalSavedUsd.toString(),
        penaltyAmountCdf: '0',
        penaltyAmountUsd: '0',
        amountReturnedCdf: totalSavedCdf.toString(),
        amountReturnedUsd: totalSavedUsd.toString(),
        reason: 'Retrait à maturité',
      });

      return {
        totalSavedCdf,
        totalSavedUsd,
        penalty: 0,
        message: `Retrait à maturité effectué. Montant total: ${totalSavedCdf} CDF → S01 (SANS pénalité)`,
      };
    });
  }
}
