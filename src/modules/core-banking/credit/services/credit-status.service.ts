/**
 * CREDIT STATUS SERVICE
 * 
 * Gère le Whitelist/Blacklist et le scoring crédit:
 * - Création/mise à jour statut crédit client
 * - Scoring automatique basé sur historique
 * - Blacklist automatique (non-remboursement)
 * - Auto-whitelist (conditions remplies)
 * - Historique changements de statut
 */

import { db } from '../../../../db';
import { 
  customerCreditStatus,
  creditStatusHistory,
  creditAllocations
} from '../../../../db/s04-allocation-schema';
import { eq, and, sql } from 'drizzle-orm';

export interface CreditStatusUpdate {
  customerId: number;
  newStatus: 'WHITELISTED' | 'BLACKLISTED' | 'PROBATION';
  reason: string;
  changedBy?: number;
  changedByName?: string;
  whitelistFeeAmountCdf?: number; // Frais pour sortir de blacklist (défini par admin)
  whitelistFeeAmountUsd?: number;
  whitelistFeePaid?: boolean; // Le client a-t-il payé le frais?
}

export class CreditStatusService {
  /**
   * Initialiser statut crédit d'un nouveau client
   */
  static async initializeCustomerStatus(customerId: number) {
    // Vérifier si existe déjà
    const [existing] = await db
      .select()
      .from(customerCreditStatus)
      .where(eq(customerCreditStatus.customerId, customerId));

    if (existing) {
      return existing;
    }

    // Créer nouveau statut (NEUTRAL par défaut - pas whitelisted automatiquement)
    const [status] = await db.insert(customerCreditStatus).values({
      customerId,
      creditStatus: 'WHITELISTED', // Premier client commence whitelisted
      creditScore: '100', // Score parfait au début
      whitelistedAt: new Date().toISOString(),
    }).returning();

    // Enregistrer dans historique
    await db.insert(creditStatusHistory).values({
      customerId,
      newStatus: 'WHITELISTED',
      newScore: '100',
      reason: 'Nouveau client - statut initial',
      createdAt: new Date().toISOString(),
    });

    return status;
  }

  /**
   * Mettre à jour statut crédit (whitelist/blacklist)
   * RÈGLE BANCAIRE:
   * - Blacklist: Client ne paie pas → blacklisté automatiquement
   * - Whitelist: Pour sortir de blacklist, le client DOIT:
   *   1. Rembourser TOUTES ses dettes
   *   2. Payer le frais de whitelist défini par l'admin
   *   3. L'admin valide manuellement le retour en whitelist
   */
  static async updateCreditStatus(params: CreditStatusUpdate) {
    const { 
      customerId, 
      newStatus, 
      reason, 
      changedBy, 
      changedByName,
      whitelistFeeAmountCdf,
      whitelistFeeAmountUsd,
      whitelistFeePaid 
    } = params;

    return await db.transaction(async (tx: any) => {
      // 1. Récupérer statut actuel
      const [currentStatus] = await tx
        .select()
        .from(customerCreditStatus)
        .where(eq(customerCreditStatus.customerId, customerId));

      if (!currentStatus) {
        throw new Error('Statut crédit introuvable');
      }

      const previousStatus = currentStatus.creditStatus;
      const previousScore = parseFloat(currentStatus.creditScore);

      // 2. RÈGLE BANCAIRE: Vérifications avant whitelist
      if (newStatus === 'WHITELISTED' && previousStatus === 'BLACKLISTED') {
        // Vérifier que TOUTES les dettes sont remboursées
        const allocations = await tx
          .select()
          .from(creditAllocations)
          .where(eq(creditAllocations.customerId, customerId));

        const hasUnpaidDebt = allocations.some(
          (a: typeof creditAllocations.$inferSelect) => parseFloat(a.remainingDebtCdf) > 0
        );

        if (hasUnpaidDebt) {
          throw new Error(
            'IMPOSSIBLE: Le client doit REMBOURSER toutes ses dettes avant d\'être whitelisté'
          );
        }

        // Vérifier que le frais de whitelist a été payé
        if (!whitelistFeePaid || (!whitelistFeeAmountCdf && !whitelistFeeAmountUsd)) {
          throw new Error(
            'IMPOSSIBLE: Le client doit PAYER le frais de whitelist défini par l\'admin avant d\'être whitelisté'
          );
        }
      }

      // 3. Calculer nouveau score selon règles bancaires
      let newScore = previousScore;
      if (newStatus === 'BLACKLISTED') {
        // Blacklist = score à zéro (client non fiable)
        newScore = 0;
      } else if (newStatus === 'WHITELISTED' && previousStatus === 'BLACKLISTED') {
        // Retour de blacklist = score de départ modeste (50/100)
        // Le client doit refaire ses preuves
        newScore = 50;
      } else if (newStatus === 'WHITELISTED') {
        // Whitelist normal = amélioration modeste
        newScore = Math.min(100, newScore + 10);
      }

      // 4. Mettre à jour statut
      const updateData: any = {
        creditStatus: newStatus,
        creditScore: newScore.toString(),
        updatedAt: new Date().toISOString(),
      };

      if (newStatus === 'BLACKLISTED') {
        updateData.blacklistedAt = new Date().toISOString();
        updateData.blacklistReason = reason;
        updateData.blacklistBy = changedBy;
        // Clear whitelist info
        updateData.whitelistedAt = null;
        updateData.whitelistBy = null;
      } else if (newStatus === 'WHITELISTED') {
        updateData.whitelistedAt = new Date().toISOString();
        updateData.whitelistBy = changedBy;
        // Clear blacklist info
        updateData.blacklistedAt = null;
        updateData.blacklistReason = null;
        updateData.blacklistBy = null;
      }

      await tx
        .update(customerCreditStatus)
        .set(updateData)
        .where(eq(customerCreditStatus.customerId, customerId));

      // 5. Enregistrer dans historique avec métadonnées
      const metadata: any = {};
      if (whitelistFeeAmountCdf) metadata.whitelistFeeAmountCdf = whitelistFeeAmountCdf;
      if (whitelistFeeAmountUsd) metadata.whitelistFeeAmountUsd = whitelistFeeAmountUsd;
      if (whitelistFeePaid !== undefined) metadata.whitelistFeePaid = whitelistFeePaid;

      await tx.insert(creditStatusHistory).values({
        customerId,
        previousStatus,
        newStatus,
        previousScore: previousScore.toString(),
        newScore: newScore.toString(),
        reason,
        changedBy,
        changedByName,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      });

      return {
        previousStatus,
        newStatus,
        previousScore,
        newScore,
        reason,
        whitelistFeeRequired: whitelistFeeAmountCdf || whitelistFeeAmountUsd,
      };
    });
  }

  /**
   * Blacklister automatiquement un client (non-remboursement)
   */
  static async autoBlacklist(customerId: number, reason: string) {
    return this.updateCreditStatus({
      customerId,
      newStatus: 'BLACKLISTED',
      reason: `AUTO: ${reason}`,
      changedByName: 'SYSTEM',
    });
  }

  /**
   * Vérifier si client peut obtenir crédit
   */
  static async checkCreditEligibility(customerId: number) {
    // 1. Récupérer statut
    const [status] = await db
      .select()
      .from(customerCreditStatus)
      .where(eq(customerCreditStatus.customerId, customerId));

    if (!status) {
      // Premier crédit → Créer statut et autoriser
      await this.initializeCustomerStatus(customerId);
      return {
        eligible: true,
        status: 'WHITELISTED',
        score: 100,
        message: 'Premier crédit - approuvé',
      };
    }

    // 2. Vérifier blacklist
    if (status.creditStatus === 'BLACKLISTED') {
      return {
        eligible: false,
        status: 'BLACKLISTED',
        score: parseFloat(status.creditScore),
        message: `Crédit bloqué: ${status.blacklistReason || 'Non-remboursement'}`,
        blacklistedAt: status.blacklistedAt,
      };
    }

    // 3. Vérifier score minimum
    const minScore = 60; // Score minimum requis
    const score = parseFloat(status.creditScore);

    if (score < minScore) {
      return {
        eligible: false,
        status: status.creditStatus,
        score,
        message: `Score crédit insuffisant (${score}/100). Minimum requis: ${minScore}`,
      };
    }

    // 4. Vérifier crédits actifs non remboursés
    const activeAllocations = await db
      .select()
      .from(creditAllocations)
      .where(
        and(
          eq(creditAllocations.customerId, customerId),
          eq(creditAllocations.status, 'ACTIVE')
        )
      );

    const hasUnpaidDebt = activeAllocations.some(
      (a: typeof creditAllocations.$inferSelect) => parseFloat(a.remainingDebtCdf || '0') > 0
    );

    if (hasUnpaidDebt) {
      return {
        eligible: false,
        status: status.creditStatus,
        score,
        message: 'Crédit actif non remboursé. Veuillez rembourser avant nouvelle demande.',
        unpaidDebts: activeAllocations.length,
      };
    }

    // 5. Éligible
    return {
      eligible: true,
      status: status.creditStatus,
      score,
      message: 'Éligible pour crédit',
      totalCreditsCompleted: status.totalCreditsCompleted,
      onTimeRepaymentPercentage: parseFloat(status.onTimeRepaymentPercentage || '0'),
    };
  }

  /**
   * Mettre à jour statistiques après remboursement
   */
  static async updateStatsAfterRepayment(
    customerId: number,
    isFullyRepaid: boolean,
    wasOnTime: boolean
  ) {
    const [status] = await db
      .select()
      .from(customerCreditStatus)
      .where(eq(customerCreditStatus.customerId, customerId));

    if (!status) return;

    const updates: any = {
      lastRepaymentDate: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isFullyRepaid) {
      // Crédit complété
      updates.totalCreditsCompleted = status.totalCreditsCompleted + 1;

      // Améliorer score si remboursement à temps
      if (wasOnTime) {
        const currentScore = parseFloat(status.creditScore);
        updates.creditScore = Math.min(100, currentScore + 5).toString(); // +5 points

        // Calculer % remboursement à temps
        const totalCompleted = status.totalCreditsCompleted + 1;
        const currentPercentage = status.onTimeRepaymentPercentage ?? '0';
        const currentOnTime = parseFloat(currentPercentage) * status.totalCreditsCompleted / 100;
        const newOnTimeCount = currentOnTime + (wasOnTime ? 1 : 0);
        updates.onTimeRepaymentPercentage = ((newOnTimeCount / totalCompleted) * 100).toString();
      }
    }

    await db
      .update(customerCreditStatus)
      .set(updates)
      .where(eq(customerCreditStatus.customerId, customerId));
  }

  /**
   * Mettre à jour statistiques après demande de crédit
   */
  static async updateStatsAfterApplication(
    customerId: number,
    isApproved: boolean
  ) {
    const [status] = await db
      .select()
      .from(customerCreditStatus)
      .where(eq(customerCreditStatus.customerId, customerId));

    if (!status) {
      await this.initializeCustomerStatus(customerId);
      return;
    }

    const updates: any = {
      totalCreditsRequested: status.totalCreditsRequested + 1,
      lastCreditApplicationDate: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isApproved) {
      updates.totalCreditsApproved = status.totalCreditsApproved + 1;
    }

    await db
      .update(customerCreditStatus)
      .set(updates)
      .where(eq(customerCreditStatus.customerId, customerId));
  }

  /**
   * Récupérer historique des changements de statut
   */
  static async getStatusHistory(customerId: number) {
    const history = await db
      .select()
      .from(creditStatusHistory)
      .where(eq(creditStatusHistory.customerId, customerId))
      .orderBy(sql`${creditStatusHistory.createdAt} DESC`)
      .limit(50);

    return history;
  }

  /**
   * Récupérer statut crédit d'un client
   */
  static async getCreditStatus(customerId: number) {
    const [status] = await db
      .select()
      .from(customerCreditStatus)
      .where(eq(customerCreditStatus.customerId, customerId));

    if (!status) {
      // Initialiser si n'existe pas
      return await this.initializeCustomerStatus(customerId);
    }

    return status;
  }

  /**
   * Obtenir tous les clients blacklistés
   */
  static async getBlacklistedCustomers() {
    const blacklisted = await db
      .select()
      .from(customerCreditStatus)
      .where(eq(customerCreditStatus.creditStatus, 'BLACKLISTED'))
      .orderBy(sql`${customerCreditStatus.blacklistedAt} DESC`);

    return blacklisted;
  }

  /**
   * Vérifier conditions auto-whitelist
   * (Client blacklisté qui a tout remboursé après X jours)
   */
  static async checkAutoWhitelistEligibility(customerId: number) {
    const [status] = await db
      .select()
      .from(customerCreditStatus)
      .where(eq(customerCreditStatus.customerId, customerId));

    if (!status || status.creditStatus !== 'BLACKLISTED') {
      return { eligible: false, reason: 'Pas blacklisté' };
    }

    // Vérifier si toutes les dettes sont remboursées
    const allocations = await db
      .select()
      .from(creditAllocations)
      .where(eq(creditAllocations.customerId, customerId));

    const hasUnpaidDebt = allocations.some(
      (a: typeof creditAllocations.$inferSelect) => parseFloat(a.remainingDebtCdf || '0') > 0
    );

    if (hasUnpaidDebt) {
      return { eligible: false, reason: 'Dettes non remboursées' };
    }

    // Vérifier délai (90 jours par défaut)
    const blacklistedDate = new Date(status.blacklistedAt!);
    const now = new Date();
    const daysSinceBlacklist = Math.floor(
      (now.getTime() - blacklistedDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const minDays = 90;
    if (daysSinceBlacklist < minDays) {
      return {
        eligible: false,
        reason: `Attendre ${minDays - daysSinceBlacklist} jours de plus`,
      };
    }

    // Éligible pour auto-whitelist
    return {
      eligible: true,
      reason: 'Toutes conditions remplies',
      daysSinceBlacklist,
    };
  }
}
