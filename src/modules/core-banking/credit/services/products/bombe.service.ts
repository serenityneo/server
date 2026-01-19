/**
 * CRÉDIT BOMBÉ - SERVICE COMPLET
 * Crédit découvert renouvelable quotidien 0% intérêt (10-100$)
 * Auto-renouvellement 4h00 si paiement avant 23h59
 */

import { db } from '../../../../../db';
import { and, eq, gte, sql, desc } from 'drizzle-orm';
import { accounts, transactions, customers } from '../../../../../db/schema';
import { 
  creditApplications, 
  creditRepayments, 
  bombeRenewalHistory, 
  creditNotifications,
  creditVirtualPrison,
  s02DepositTracking 
} from '../../../../../db/credit-products-schema';
import { EligibilityService } from '../../config/eligibility.service';
import { SerenityPointsService } from '../../config/serenity-points.service';
import { generateAccountNumber } from '../../utils/account-helpers';

interface BombeEligibilityResult {
  eligible: boolean;
  reasons: string[];
  s02Balance: number;
  s02AccountId?: number;
  consecutiveDepositDays: number;
}

interface BombeCredit {
  id: number;
  customerId: number;
  amount: number;
  processingFee: number;
  netAmount: number;
  cautionAmount: number;
  status: string;
}

export class BombeService {
  private eligibilityService: EligibilityService;
  private pointsService: SerenityPointsService;

  constructor() {
    this.eligibilityService = new EligibilityService();
    this.pointsService = new SerenityPointsService();
  }

  // ===== CALCUL FRAIS TRAITEMENT =====
  calculateProcessingFee(amount: number): number {
    if (amount >= 10 && amount <= 20) return 2;
    if (amount >= 21 && amount <= 50) return 4;
    if (amount >= 51 && amount <= 100) return 8;
    throw new Error('Montant invalide pour BOMBÉ (10-100$)');
  }

  // ===== ÉLIGIBILITÉ BOMBÉ (OPTIMISÉ) =====
  async checkEligibility(customerId: number, requestedAmount: number): Promise<BombeEligibilityResult> {
    const startTime = Date.now();
    
    // 1. Vérifier montant
    const reasons: string[] = [];
    if (requestedAmount < 10 || requestedAmount > 100) {
      reasons.push('Montant doit être entre 10$ et 100$');
    }

    // 2. Vérifier compte S02
    const s02Account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.customerId, customerId),
        eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')
      )
    });

    if (!s02Account) {
      return {
        eligible: false,
        reasons: ['Compte S02 épargne obligatoire introuvable'],
        s02Balance: 0,
        consecutiveDepositDays: 0
      };
    }

    const s02Balance = parseFloat(s02Account.balanceUsd || '0');

    // 3. Vérifier 50% balance
    if (s02Balance < requestedAmount * 0.5) {
      reasons.push(`Solde S02 insuffisant. Requis: ${(requestedAmount * 0.5).toFixed(2)}$, Actuel: ${s02Balance.toFixed(2)}$`);
    }

    // ✅ OPTIMISATION: Requêtes parallèles au lieu de séquentielles
    const thirtyFiveDaysAgo = new Date();
    thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [depositDays, hasDefaults, inPrison] = await Promise.all([
      // 4. Vérifier 26 jours dépôts consécutifs
      db.select({ 
        day: sql<string>`to_char(${transactions.createdAt}, 'YYYY-MM-DD')` 
      })
        .from(transactions)
        .where(and(
          eq(transactions.accountId, s02Account.id),
          eq(transactions.transactionType, 'DEPOSIT'),
          gte(transactions.createdAt, thirtyFiveDaysAgo.toISOString())
        ))
        .groupBy(sql`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`),

      // 5. Vérifier pas de défaut 6 mois
      db.select({ count: sql<number>`count(*)` })
        .from(creditApplications)
        .where(and(
          eq(creditApplications.customerId, customerId),
          eq(creditApplications.status, 'DEFAULTED'),
          gte(creditApplications.createdAt, sixMonthsAgo.toISOString())
        )),

      // 6. Vérifier pas déjà en prison virtuelle
      db.query.creditVirtualPrison.findFirst({
        where: and(
          eq(creditVirtualPrison.customerId, customerId),
          eq(creditVirtualPrison.isActive, true)
        )
      })
    ]);

    const consecutiveDays = depositDays.length;

    if (consecutiveDays < 26) {
      reasons.push(`Dépôts insuffisants. Requis: 26 jours, Actuel: ${consecutiveDays} jours`);
    }

    if (Number(hasDefaults[0].count) > 0) {
      reasons.push('Défaut de paiement dans les 6 derniers mois');
    }

    if (inPrison) {
      reasons.push('Client en prison virtuelle - crédit bloqué');
    }

    const duration = Date.now() - startTime;
    console.log(`[PERF] checkEligibility completed in ${duration}ms`);

    return {
      eligible: reasons.length === 0,
      reasons,
      s02Balance,
      s02AccountId: s02Account.id,
      consecutiveDepositDays: consecutiveDays
    };
  }

  // ===== DEMANDE CRÉDIT BOMBÉ =====
  async requestCredit(customerId: number, requestedAmount: number, businessDocuments: any): Promise<BombeCredit> {
    // 1. Vérifier éligibilité
    const eligibility = await this.checkEligibility(customerId, requestedAmount);
    if (!eligibility.eligible) {
      throw new Error(`Non éligible: ${eligibility.reasons.join(', ')}`);
    }

    // 2. Calculer frais et montants
    const processingFee = this.calculateProcessingFee(requestedAmount);
    const cautionAmount = requestedAmount * 0.3; // 30%
    const netAmount = requestedAmount - processingFee;

    // 3. Créer demande crédit
    const [credit] = await db.insert(creditApplications).values({
      customerId,
      productType: 'BOMBE',
      requestedAmountUsd: requestedAmount.toString(),
      approvedAmountUsd: requestedAmount.toString(),
      processingFeeUsd: processingFee.toString(),
      cautionAmountUsd: cautionAmount.toString(),
      cautionPercentage: '30.00',
      interestRate: '0.00', // 0% intérêt
      s02AccountId: eligibility.s02AccountId,
      status: 'DOCUMENTS_PENDING',
      eligibilityCheckPassed: true,
      businessDocuments: businessDocuments,
      isAutoRenewable: true,
      dailyPaymentUsd: requestedAmount.toString(), // Remboursement total quotidien
    }).returning();

    // 4. Notifier client
    await this.sendNotification(credit.id, customerId, 'APPLICATION_RECEIVED', 
      'Demande BOMBÉ reçue',
      `Votre demande de crédit BOMBÉ de ${requestedAmount}$ a été reçue. Veuillez soumettre vos documents commerciaux.`
    );

    return {
      id: credit.id,
      customerId,
      amount: requestedAmount,
      processingFee,
      netAmount,
      cautionAmount,
      status: credit.status
    };
  }

  // ===== VALIDATION DOCUMENTS ADMIN =====
  async validateDocuments(creditId: number, adminId: number, approved: boolean, comments?: string): Promise<void> {
    const credit = await db.query.creditApplications.findFirst({
      where: eq(creditApplications.id, creditId)
    });

    if (!credit) throw new Error('Crédit introuvable');

    if (approved) {
      // Documents approuvés → demander dépôt caution
      await db.update(creditApplications)
        .set({
          status: 'CAUTION_PENDING',
          documentsValidated: true,
          documentsValidatorId: adminId,
          documentsValidationDate: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .where(eq(creditApplications.id, creditId));

      await this.sendNotification(creditId, credit.customerId, 'DOCUMENTS_APPROVED',
        'Documents approuvés',
        `Documents validés. Veuillez déposer ${credit.cautionAmountUsd}$ dans votre compte S03 caution.`
      );
    } else {
      // Documents rejetés
      await db.update(creditApplications)
        .set({
          status: 'CANCELLED',
          notes: comments || 'Documents rejetés',
          updatedAt: new Date().toISOString()
        })
        .where(eq(creditApplications.id, creditId));

      await this.sendNotification(creditId, credit.customerId, 'DOCUMENTS_REJECTED',
        'Documents rejetés',
        comments || 'Vos documents ont été rejetés. Veuillez soumettre de nouveaux documents.'
      );
    }
  }

  // ===== DÉPÔT CAUTION 30% =====
  async depositCaution(creditId: number): Promise<void> {
    const credit = await db.query.creditApplications.findFirst({
      where: eq(creditApplications.id, creditId)
    });

    if (!credit) throw new Error('Crédit introuvable');
    if (credit.status !== 'CAUTION_PENDING') throw new Error('Statut invalide');

    // Vérifier que S03 existe et a le bon montant
    const s03Account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.customerId, credit.customerId),
        eq(accounts.accountType, 'S03_CAUTION')
      )
    });

    if (!s03Account) throw new Error('Compte S03 caution introuvable');

    const s03Balance = parseFloat(s03Account.balanceUsd || '0');
    const requiredCaution = parseFloat(credit.cautionAmountUsd || '0');

    if (s03Balance < requiredCaution) {
      throw new Error(`Caution insuffisante. Requis: ${requiredCaution}$, Actuel: ${s03Balance}$`);
    }

    // Marquer caution déposée → approuver crédit
    await db.update(creditApplications)
      .set({
        status: 'APPROVED',
        cautionDeposited: true,
        s03CautionAccountId: s03Account.id,
        approvalDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .where(eq(creditApplications.id, creditId));

    await this.sendNotification(creditId, credit.customerId, 'CREDIT_APPROVED',
      'Crédit BOMBÉ approuvé!',
      `Votre crédit de ${credit.approvedAmountUsd}$ a été approuvé. Décaissement imminent.`
    );
  }

  // ===== DÉCAISSEMENT CRÉDIT =====
  async disburseCredit(creditId: number): Promise<void> {
    const credit = await db.query.creditApplications.findFirst({
      where: eq(creditApplications.id, creditId)
    });

    if (!credit) throw new Error('Crédit introuvable');
    if (credit.status !== 'APPROVED') throw new Error('Crédit pas encore approuvé');

    // 1. Créer compte S04 si pas existant
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

    // 2. Calculer montant net (montant - frais)
    const approvedAmount = parseFloat(credit.approvedAmountUsd || '0');
    const processingFee = parseFloat(credit.processingFeeUsd || '0');
    const netAmount = approvedAmount - processingFee;

    // 3. Créditer S04
    const newS04Balance = parseFloat(s04Account.balanceUsd || '0') + netAmount;
    await db.update(accounts)
      .set({ balanceUsd: newS04Balance.toString() })
      .where(eq(accounts.id, s04Account.id));

    // 4. Créer transaction
    await db.insert(transactions).values({
      accountId: s04Account.id,
      transactionType: 'CREDIT_DISBURSEMENT',
      amountCdf: '0',
      amountUsd: netAmount.toString(),
      currency: 'USD',
      description: `Décaissement crédit BOMBÉ - Montant: ${approvedAmount}$ - Frais: ${processingFee}$`,
      status: 'COMPLETED',
      processedAt: new Date().toISOString()
    });

    // 5. Geler comptes S02 et S03 (empêcher retraits)
    // Note: Logique de gel dans account.service.ts

    // 6. Mettre à jour crédit
    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + 1); // 1 jour

    await db.update(creditApplications)
      .set({
        status: 'DISBURSED',
        disbursedAmountUsd: netAmount.toString(),
        s04CreditAccountId: s04Account.id,
        disbursementDate: new Date().toISOString(),
        maturityDate: maturityDate.toISOString(),
        remainingBalanceUsd: approvedAmount.toString(),
        nextRenewalDate: new Date(new Date().setHours(4, 0, 0, 0) + 86400000).toISOString(), // Demain 4h
        updatedAt: new Date().toISOString()
      })
      .where(eq(creditApplications.id, creditId));

    // 7. Attribuer points Serenity
    await this.pointsService.awardPoints(credit.customerId, 5, `Crédit BOMBÉ ${approvedAmount}$ décaissé`);

    // 8. Notifier client
    await this.sendNotification(creditId, credit.customerId, 'CREDIT_DISBURSED',
      'Crédit décaissé!',
      `${netAmount}$ ont été crédités dans votre compte S04. Remboursement avant 23h59 ce soir.`
    );

    // 9. Planifier rappels
    await this.scheduleReminders(creditId, credit.customerId);
  }

  // ===== PLANIFIER RAPPELS 13H & 17H =====
  private async scheduleReminders(creditId: number, customerId: number): Promise<void> {
    const today = new Date();
    const reminder13h = new Date(today.setHours(13, 0, 0, 0));
    const reminder17h = new Date(today.setHours(17, 0, 0, 0));

    await db.insert(creditNotifications).values([
      {
        creditId,
        customerId,
        notificationType: 'REMINDER_1PM',
        title: 'Rappel remboursement BOMBÉ',
        message: 'N\'oubliez pas de rembourser votre crédit BOMBÉ avant 23h59 ce soir.',
        scheduledFor: reminder13h.toISOString(),
        sentViaSms: true,
        sentViaEmail: true
      },
      {
        creditId,
        customerId,
        notificationType: 'REMINDER_5PM',
        title: 'Dernier rappel BOMBÉ',
        message: 'Dernier rappel: Veuillez rembourser votre crédit avant 23h59.',
        scheduledFor: reminder17h.toISOString(),
        sentViaSms: true,
        sentViaEmail: true
      }
    ]);
  }

  // ===== TRAITER NON-PAIEMENT (Cron 05h50) =====
  async processNonPayments(): Promise<void> {
    // Trouver tous les crédits BOMBÉ non payés avant minuit
    const unpaidCredits = await db.select()
      .from(creditApplications)
      .where(and(
        eq(creditApplications.productType, 'BOMBE'),
        eq(creditApplications.status, 'DISBURSED'),
        sql`${creditApplications.maturityDate} < CURRENT_TIMESTAMP`
      ));

    for (const credit of unpaidCredits) {
      const remainingBalance = parseFloat(credit.remainingBalanceUsd || '0');

      if (remainingBalance > 0) {
        await this.debitS02AndS03(credit.id, credit.customerId, remainingBalance);
      }
    }
  }

  // ===== DÉBITER S02 + S03 → S04 (05h50) =====
  private async debitS02AndS03(creditId: number, customerId: number, amountDue: number): Promise<void> {
    // 1. Récupérer comptes
    const [s02, s03, s04] = await Promise.all([
      db.query.accounts.findFirst({ where: and(eq(accounts.customerId, customerId), eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')) }),
      db.query.accounts.findFirst({ where: and(eq(accounts.customerId, customerId), eq(accounts.accountType, 'S03_CAUTION')) }),
      db.query.accounts.findFirst({ where: and(eq(accounts.customerId, customerId), eq(accounts.accountType, 'S04_CREDIT')) })
    ]);

    if (!s02 || !s03 || !s04) throw new Error('Comptes introuvables');

    const s02Balance = parseFloat(s02.balanceUsd || '0');
    const s03Balance = parseFloat(s03.balanceUsd || '0');
    const totalAvailable = s02Balance + s03Balance;

    // 2. Débiter S02 en premier
    let fromS02 = Math.min(s02Balance, amountDue);
    let fromS03 = Math.min(s03Balance, amountDue - fromS02);

    if (fromS02 > 0) {
      await db.update(accounts)
        .set({ balanceUsd: (s02Balance - fromS02).toString() })
        .where(eq(accounts.id, s02.id));

      await db.insert(transactions).values({
        accountId: s02.id,
        transactionType: 'DEBIT',
        amountCdf: '0',
        amountUsd: fromS02.toString(),
        currency: 'USD',
        description: `Débit auto S02 pour remboursement BOMBÉ`,
        status: 'COMPLETED',
        processedAt: new Date().toISOString()
      });
    }

    // 3. Débiter S03 si nécessaire
    if (fromS03 > 0) {
      await db.update(accounts)
        .set({ balanceUsd: (s03Balance - fromS03).toString() })
        .where(eq(accounts.id, s03.id));

      await db.insert(transactions).values({
        accountId: s03.id,
        transactionType: 'DEBIT',
        amountCdf: '0',
        amountUsd: fromS03.toString(),
        currency: 'USD',
        description: `Débit auto S03 pour remboursement BOMBÉ`,
        status: 'COMPLETED',
        processedAt: new Date().toISOString()
      });
    }

    // 4. Créditer S04
    const totalDebited = fromS02 + fromS03;
    const newS04Balance = parseFloat(s04.balanceUsd || '0') + totalDebited;
    await db.update(accounts)
      .set({ balanceUsd: newS04Balance.toString() })
      .where(eq(accounts.id, s04.id));

    // 5. Enregistrer remboursement
    await db.insert(creditRepayments).values({
      creditId,
      customerId,
      amountUsd: totalDebited.toString(),
      currency: 'USD',
      paymentType: 'DAILY',
      status: 'LATE',
      isOnTime: false,
      daysLate: 1,
      autoDebitedFromS02: fromS02 > 0,
      autoDebitedFromS03: fromS03 > 0
    });

    // 6. Mettre à jour solde crédit
    const creditData = await db.query.creditApplications.findFirst({ where: eq(creditApplications.id, creditId) });
    if (!creditData) return;
    
    const newRemaining = amountDue - totalDebited;
    await db.update(creditApplications)
      .set({
        totalPaidUsd: (parseFloat(creditData.totalPaidUsd || '0') + totalDebited).toString(),
        remainingBalanceUsd: newRemaining.toString(),
        updatedAt: new Date().toISOString()
      })
      .where(eq(creditApplications.id, creditId));

    // 7. Si solde restant après 07h → appliquer intérêt 5%
    if (newRemaining > 0) {
      await this.applyLateInterest(creditId, customerId);
    }
  }

  // ===== APPLIQUER INTÉRÊT RETARD 5%/JOUR =====
  private async applyLateInterest(creditId: number, customerId: number): Promise<void> {
    const credit = await db.query.creditApplications.findFirst({
      where: eq(creditApplications.id, creditId)
    });

    if (!credit) return;

    const remainingBalance = parseFloat(credit.remainingBalanceUsd || '0');
    const lateInterest = remainingBalance * 0.05; // 5%

    // 1. Ajouter intérêt au solde
    const newRemaining = remainingBalance + lateInterest;
    const totalLateInterest = parseFloat(credit.totalLateInterestUsd || '0') + lateInterest;

    await db.update(creditApplications)
      .set({
        remainingBalanceUsd: newRemaining.toString(),
        totalLateInterestUsd: totalLateInterest.toString(),
        lateInterestRate: '5.00',
        updatedAt: new Date().toISOString()
      })
      .where(eq(creditApplications.id, creditId));

    // 2. Créer amende = frais traitement → S06
    const processingFee = parseFloat(credit.processingFeeUsd || '0');
    const s06Account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.customerId, customerId),
        eq(accounts.accountType, 'S06_FINES')
      )
    });

    if (s06Account) {
      const newS06Balance = parseFloat(s06Account.balanceUsd || '0') + processingFee;
      await db.update(accounts)
        .set({ balanceUsd: newS06Balance.toString() })
        .where(eq(accounts.id, s06Account.id));

      await db.insert(transactions).values({
        accountId: s06Account.id,
        transactionType: 'FINE',
        amountCdf: '0',
        amountUsd: processingFee.toString(),
        currency: 'USD',
        description: 'Amende retard BOMBÉ',
        status: 'COMPLETED',
        processedAt: new Date().toISOString()
      });
    }

    // 3. Mettre en prison virtuelle (blocage 3 jours)
    await db.insert(creditVirtualPrison).values({
      customerId,
      creditId,
      blockedReason: 'NON_PAYMENT',
      outstandingPrincipalUsd: remainingBalance.toString(),
      outstandingInterestUsd: lateInterest.toString(),
      penaltyUsd: processingFee.toString(),
      isActive: true,
      daysBlocked: 0,
      releaseConditions: `Payer ${newRemaining + processingFee}$ (capital + intérêt + amende)`
    });

    // 4. Notifier client
    await this.sendNotification(creditId, customerId, 'LATE_PAYMENT',
      'Retard de paiement - Prison virtuelle',
      `Votre crédit est en retard. Intérêt de 5% appliqué (${lateInterest.toFixed(2)}$). Nouveau solde: ${newRemaining.toFixed(2)}$. Crédit bloqué 3 jours.`
    );
  }

  // ===== AUTO-RENOUVELLEMENT (Cron 04h00) =====
  async autoRenewCredits(): Promise<void> {
    // Trouver crédits payés à temps hier
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const eligibleForRenewal = await db.select()
      .from(creditApplications)
      .where(and(
        eq(creditApplications.productType, 'BOMBE'),
        eq(creditApplications.status, 'DISBURSED'),
        eq(creditApplications.isAutoRenewable, true),
        sql`${creditApplications.remainingBalanceUsd}::numeric = 0` // Payé complètement
      ));

    for (const credit of eligibleForRenewal) {
      try {
        await this.renewCredit(credit.id, credit.customerId, parseFloat(credit.approvedAmountUsd || '0'));
      } catch (error) {
        console.error(`Erreur renouvellement crédit ${credit.id}:`, error);
      }
    }
  }

  // ===== RENOUVELER CRÉDIT =====
  private async renewCredit(previousCreditId: number, customerId: number, amount: number): Promise<void> {
    // 1. Vérifier éligibilité
    const eligibility = await this.checkEligibility(customerId, amount);
    if (!eligibility.eligible) {
      await db.insert(bombeRenewalHistory).values({
        customerId,
        previousCreditId,
        newCreditId: previousCreditId,
        amountUsd: amount.toString(),
        autoRenewed: false,
        renewalBlocked: true,
        blockedReason: eligibility.reasons.join(', ')
      });
      return;
    }

    // 2. Clôturer ancien crédit
    await db.update(creditApplications)
      .set({
        status: 'COMPLETED',
        completionDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .where(eq(creditApplications.id, previousCreditId));

    // 3. Créer nouveau crédit identique
    const processingFee = this.calculateProcessingFee(amount);
    const [newCredit] = await db.insert(creditApplications).values({
      customerId,
      productType: 'BOMBE',
      requestedAmountUsd: amount.toString(),
      approvedAmountUsd: amount.toString(),
      processingFeeUsd: processingFee.toString(),
      cautionAmountUsd: (amount * 0.3).toString(),
      interestRate: '0.00',
      status: 'APPROVED',
      eligibilityCheckPassed: true,
      cautionDeposited: true,
      isAutoRenewable: true,
      s02AccountId: eligibility.s02AccountId
    }).returning();

    // 4. Décaisser immédiatement
    await this.disburseCredit(newCredit.id);

    // 5. Enregistrer historique
    await db.insert(bombeRenewalHistory).values({
      customerId,
      previousCreditId,
      newCreditId: newCredit.id,
      amountUsd: amount.toString(),
      autoRenewed: true
    });

    // 6. Notifier client
    await this.sendNotification(newCredit.id, customerId, 'AUTO_RENEWED',
      'Crédit BOMBÉ renouvelé!',
      `Votre crédit de ${amount}$ a été automatiquement renouvelé. Nouveau solde S04.`
    );
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

  // ===== RÉCUPÉRER CRÉDIT ACTIF =====
  async getActiveCredit(customerId: number): Promise<any> {
    return db.query.creditApplications.findFirst({
      where: and(
        eq(creditApplications.customerId, customerId),
        eq(creditApplications.productType, 'BOMBE'),
        sql`${creditApplications.status} IN ('DISBURSED', 'ACTIVE')`
      ),
      orderBy: [desc(creditApplications.disbursementDate)]
    });
  }

  // ===== STATISTIQUES BOMBÉ =====
  async getBombeStats(customerId: number): Promise<any> {
    const [totalCredits, renewalHistory] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(creditApplications)
        .where(and(
          eq(creditApplications.customerId, customerId),
          eq(creditApplications.productType, 'BOMBE')
        )),
      db.select()
        .from(bombeRenewalHistory)
        .where(eq(bombeRenewalHistory.customerId, customerId))
        .orderBy(desc(bombeRenewalHistory.renewalDate))
        .limit(10)
    ]);

    return {
      totalCredits: Number(totalCredits[0].count),
      renewalCount: renewalHistory.filter(r => r.autoRenewed).length,
      recentRenewals: renewalHistory
    };
  }
}
