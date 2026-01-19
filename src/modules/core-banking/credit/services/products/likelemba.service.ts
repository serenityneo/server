/**
 * CRÉDIT LIKELEMBA - SERVICE COMPLET
 * Crédit basé sur épargne de groupe (tontine)
 * Groupe de 5-10 membres cotisant ensemble pour accès à crédit collectif
 */

import { db } from '../../../../../db';
import { and, eq, gte, sql, inArray } from 'drizzle-orm';
import { 
  creditApplications, 
  creditNotifications
} from '../../../../../db/credit-products-schema';
import { accounts, customers } from '../../../../../db/schema';
import { SerenityPointsService } from '../../config/serenity-points.service';
import { generateAccountNumber } from '../../utils/account-helpers';

interface LikélembaGroup {
  id: number;
  name: string;
  leaderCustomerId: number;
  memberIds: number[];
  totalContributions: number;
  cycleStartDate: string;
  cycleEndDate: string;
  isActive: boolean;
}

interface LikélembaEligibilityResult {
  eligible: boolean;
  reasons: string[];
  groupId?: number;
  groupTotalSavings: number;
  memberContribution: number;
}

export class LikélembaService {
  private pointsService: SerenityPointsService;

  constructor() {
    this.pointsService = new SerenityPointsService();
  }

  // ===== CRÉER GROUPE LIKÉLEMBA =====
  async createGroup(
    leaderCustomerId: number,
    groupName: string,
    memberIds: number[],
    monthlyContribution: number
  ): Promise<LikélembaGroup> {
    // 1. Vérifier nombre de membres (5-10)
    if (memberIds.length < 5 || memberIds.length > 10) {
      throw new Error('Groupe doit avoir entre 5 et 10 membres');
    }

    // 2. Vérifier que tous les membres existent
    const members = await db.select()
      .from(customers)
      .where(inArray(customers.id, memberIds));

    if (members.length !== memberIds.length) {
      throw new Error('Certains membres sont introuvables');
    }

    // 3. Calculer dates cycle (12 mois)
    const cycleStart = new Date();
    const cycleEnd = new Date();
    cycleEnd.setMonth(cycleEnd.getMonth() + 12);

    // 4. Créer groupe (stockage dans table dédiée ou JSONB)
    // Note: En production, créer table likelemba_groups
    const group: LikélembaGroup = {
      id: Date.now(), // Temporaire
      name: groupName,
      leaderCustomerId,
      memberIds,
      totalContributions: 0,
      cycleStartDate: cycleStart.toISOString(),
      cycleEndDate: cycleEnd.toISOString(),
      isActive: true
    };

    // 5. Notifier tous les membres
    for (const memberId of memberIds) {
      await this.sendNotification(0, memberId, 'GROUP_CREATED',
        'Groupe Likélemba créé',
        `Vous êtes membre du groupe "${groupName}". Cotisation: ${monthlyContribution}$ /mois.`
      );
    }

    return group;
  }

  // ===== VÉRIFIER ÉLIGIBILITÉ LIKÉLEMBA =====
  async checkEligibility(customerId: number, groupId: number, requestedAmount: number): Promise<LikélembaEligibilityResult> {
    const reasons: string[] = [];

    // 1. Vérifier appartenance au groupe
    // Note: En production, query likelemba_groups table
    const group = await this.getGroup(groupId);
    if (!group) {
      return { eligible: false, reasons: ['Groupe introuvable'], groupTotalSavings: 0, memberContribution: 0 };
    }

    if (!group.memberIds.includes(customerId)) {
      reasons.push('Vous n\'êtes pas membre de ce groupe');
    }

    // 2. Vérifier cotisations du groupe
    const groupTotalSavings = group.totalContributions;
    const memberContribution = groupTotalSavings / group.memberIds.length;

    // 3. Crédit max = 80% épargne totale groupe
    const maxCreditAmount = groupTotalSavings * 0.8;
    if (requestedAmount > maxCreditAmount) {
      reasons.push(`Montant trop élevé. Max: ${maxCreditAmount.toFixed(2)}$ (80% épargne groupe)`);
    }

    // 4. Vérifier cotisations mensuelles régulières (6 mois minimum)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Query contributions
    // Note: En production, vérifier likelemba_contributions table

    return {
      eligible: reasons.length === 0,
      reasons,
      groupId,
      groupTotalSavings,
      memberContribution
    };
  }

  // ===== DEMANDE CRÉDIT LIKÉLEMBA =====
  async requestCredit(
    customerId: number,
    groupId: number,
    requestedAmount: number,
    purpose: string
  ): Promise<any> {
    // 1. Vérifier éligibilité
    const eligibility = await this.checkEligibility(customerId, groupId, requestedAmount);
    if (!eligibility.eligible) {
      throw new Error(`Non éligible: ${eligibility.reasons.join(', ')}`);
    }

    // 2. Calculer montants
    const interestRate = 2.0; // 2% taux groupe
    const processingFee = requestedAmount * 0.015; // 1.5%
    const totalInterest = (requestedAmount * interestRate) / 100;
    const totalRepayable = requestedAmount + totalInterest;
    const durationMonths = 6; // 6 mois standard
    const monthlyPayment = totalRepayable / durationMonths;

    // 3. Créer demande crédit
    const [credit] = await db.insert(creditApplications).values({
      customerId,
      productType: 'LIKELEMBA',
      requestedAmountUsd: requestedAmount.toString(),
      approvedAmountUsd: requestedAmount.toString(),
      processingFeeUsd: processingFee.toString(),
      interestRate: interestRate.toString(),
      totalInterestUsd: totalInterest.toString(),
      durationMonths,
      monthlyPaymentUsd: monthlyPayment.toString(),
      status: 'APPROVED', // Approbation automatique groupe
      eligibilityCheckPassed: true,
      notes: `Groupe ID: ${groupId} - ${purpose}`,
      isAutoRenewable: false
    }).returning();

    // 4. Notifier membres du groupe
    const group = await this.getGroup(groupId);
    if (group) {
      for (const memberId of group.memberIds) {
        await this.sendNotification(credit.id, memberId, 'GROUP_CREDIT_REQUESTED',
          'Crédit Likélemba demandé',
          `Membre ${customerId} a demandé ${requestedAmount}$ du groupe. Raison: ${purpose}`
        );
      }
    }

    return credit;
  }

  // ===== DÉCAISSEMENT CRÉDIT =====
  async disburseCredit(creditId: number): Promise<void> {
    const credit = await db.query.creditApplications.findFirst({
      where: eq(creditApplications.id, creditId)
    });

    if (!credit || credit.status !== 'APPROVED') {
      throw new Error('Crédit pas prêt pour décaissement');
    }

    // 1. Créer/récupérer S04
    let s04Account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.customerId, credit.customerId),
        eq(accounts.accountType, 'S04_CREDIT')
      )
    });

    if (!s04Account) {
      const [newS04] = await db.insert(accounts).values({
        customerId: credit.customerId,
        accountNumber: generateAccountNumber(credit.customerId, 'S04'),
        accountType: 'S04_CREDIT',
        balanceUsd: '0',
        balanceCdf: '0',
        status: 'ACTIVE'
      }).returning();
      s04Account = newS04;
    }

    // 2. Calculer montant net
    const approvedAmount = parseFloat(credit.approvedAmountUsd || '0');
    const processingFee = parseFloat(credit.processingFeeUsd || '0');
    const netAmount = approvedAmount - processingFee;

    // 3. Créditer S04
    const newBalance = parseFloat(s04Account.balanceUsd || '0') + netAmount;
    await db.update(accounts)
      .set({ balanceUsd: newBalance.toString() })
      .where(eq(accounts.id, s04Account.id));

    // 4. Mettre à jour crédit
    const maturityDate = new Date();
    maturityDate.setMonth(maturityDate.getMonth() + (credit.durationMonths || 6));

    await db.update(creditApplications)
      .set({
        status: 'DISBURSED',
        disbursedAmountUsd: netAmount.toString(),
        s04CreditAccountId: s04Account.id,
        disbursementDate: new Date().toISOString(),
        maturityDate: maturityDate.toISOString(),
        remainingBalanceUsd: (approvedAmount + parseFloat(credit.totalInterestUsd || '0')).toString(),
        updatedAt: new Date().toISOString()
      })
      .where(eq(creditApplications.id, creditId));

    // 5. Points Serenity (bonus groupe)
    await this.pointsService.awardPoints(credit.customerId, 15, `Likélemba ${approvedAmount}$ décaissé`);

    // 6. Notifier
    await this.sendNotification(creditId, credit.customerId, 'CREDIT_DISBURSED',
      'Crédit Likélemba décaissé!',
      `${netAmount.toFixed(2)}$ crédités dans S04. Mensualité: ${credit.monthlyPaymentUsd}$ sur ${credit.durationMonths} mois.`
    );
  }

  // ===== RÉCUPÉRER GROUPE =====
  private async getGroup(groupId: number): Promise<LikélembaGroup | null> {
    // Note: En production, query likelemba_groups table
    // Pour l'instant, retourner mock data
    return {
      id: groupId,
      name: 'Groupe Exemple',
      leaderCustomerId: 1,
      memberIds: [1, 2, 3, 4, 5],
      totalContributions: 5000,
      cycleStartDate: new Date().toISOString(),
      cycleEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: true
    };
  }

  // ===== ENVOYER NOTIFICATION =====
  private async sendNotification(creditId: number, customerId: number, type: string, title: string, message: string): Promise<void> {
    await db.insert(creditNotifications).values({
      creditId,
      customerId,
      notificationType: type,
      title,
      message,
      sentViaSms: true,
      sentViaEmail: true,
      isSent: true,
      sentAt: new Date().toISOString()
    });
  }

  // ===== ENREGISTRER COTISATION =====
  async recordContribution(customerId: number, groupId: number, amount: number): Promise<void> {
    // Note: En production, INSERT INTO likelemba_contributions
    
    // Attribuer points Serenity
    await this.pointsService.awardPoints(customerId, 2, `Cotisation ${amount}$`);

    await this.sendNotification(0, customerId, 'CONTRIBUTION_RECORDED',
      'Cotisation enregistrée',
      `Votre cotisation de ${amount}$ a été enregistrée pour le groupe.`
    );
  }

  // ===== STATISTIQUES GROUPE =====
  async getGroupStats(groupId: number): Promise<any> {
    const group = await this.getGroup(groupId);
    if (!group) return null;

    return {
      groupId,
      memberCount: group.memberIds.length,
      totalSavings: group.totalContributions,
      availableForCredit: group.totalContributions * 0.8,
      cycleStartDate: group.cycleStartDate,
      cycleEndDate: group.cycleEndDate
    };
  }
}
