/**
 * CRÉDIT TELEMA - SERVICE COMPLET
 * Crédit individuel 6/9/12 mois (200-1500$)
 * Taux d'intérêt: 4.5-5.5% selon durée et montant
 */

import { db } from '../../../../../db';
import { and, eq, gte, sql, desc } from 'drizzle-orm';
import { 
  creditApplications, 
  creditRepayments, 
  creditNotifications,
  creditVirtualPrison
} from '../../../../../db/credit-products-schema';
import { accounts, transactions } from '../../../../../db/schema';
import { SerenityPointsService } from '../../config/serenity-points.service';
import { generateAccountNumber } from '../../utils/account-helpers';

interface TelemaEligibilityResult {
  eligible: boolean;
  reasons: string[];
  s02Balance: number;
  s02AccountId?: number;
}

interface TelemaMaturityOption {
  months: 6 | 9 | 12;
  interestRate: number;
  monthlyPayment: number;
  totalInterest: number;
  totalRepayable: number;
}

export class TelemaService {
  private pointsService: SerenityPointsService;

  constructor() {
    this.pointsService = new SerenityPointsService();
  }

  // ===== CALCUL TAUX INTÉRÊT TELEMA =====
  calculateInterestRate(amount: number, months: 6 | 9 | 12): number {
    if (months === 12) {
      if (amount >= 200 && amount <= 500) return 5.50;
      if (amount >= 501 && amount <= 1500) return 5.00;
    }
    if (months === 9) {
      if (amount >= 200 && amount <= 500) return 5.30;
      if (amount >= 501 && amount <= 1500) return 4.80;
    }
    if (months === 6) {
      if (amount >= 200 && amount <= 500) return 5.00;
      if (amount >= 501 && amount <= 1500) return 4.50;
    }
    return 5.00; // Default
  }

  // ===== CALCUL FRAIS TRAITEMENT TELEMA =====
  calculateProcessingFee(amount: number): number {
    if (amount >= 200 && amount <= 300) return 20;
    if (amount >= 301 && amount <= 400) return 25;
    if (amount >= 401 && amount <= 500) return 30;
    if (amount >= 501 && amount <= 600) return 35;
    if (amount >= 601 && amount <= 700) return 40;
    if (amount >= 701 && amount <= 800) return 45;
    if (amount >= 801 && amount <= 900) return 50;
    if (amount >= 901 && amount <= 1000) return 55;
    if (amount >= 1001 && amount <= 1100) return 60;
    if (amount >= 1101 && amount <= 1200) return 65;
    if (amount >= 1201 && amount <= 1300) return 70;
    if (amount >= 1301 && amount <= 1400) return 75;
    if (amount >= 1401 && amount <= 1500) return 80;
    return 20; // Default
  }

  // ===== CALCULER OPTIONS MATURITÉ =====
  calculateMaturityOptions(amount: number): TelemaMaturityOption[] {
    const options: TelemaMaturityOption[] = [];
    const durations: (6 | 9 | 12)[] = [6, 9, 12];

    for (const months of durations) {
      const interestRate = this.calculateInterestRate(amount, months);
      const totalInterest = (amount * interestRate) / 100;
      const totalRepayable = amount + totalInterest;
      const monthlyPayment = totalRepayable / months;

      options.push({
        months,
        interestRate,
        monthlyPayment,
        totalInterest,
        totalRepayable
      });
    }

    return options;
  }

  // ===== ÉLIGIBILITÉ TELEMA =====
  async checkEligibility(customerId: number, requestedAmount: number): Promise<TelemaEligibilityResult> {
    const reasons: string[] = [];

    // 1. Vérifier montant
    if (requestedAmount < 200 || requestedAmount > 1500) {
      reasons.push('Montant doit être entre 200$ et 1500$');
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
        s02Balance: 0
      };
    }

    const s02Balance = parseFloat(s02Account.balanceUsd || '0');

    // 3. Vérifier 30% balance
    if (s02Balance < requestedAmount * 0.3) {
      reasons.push(`Solde S02 insuffisant. Requis: ${(requestedAmount * 0.3).toFixed(2)}$, Actuel: ${s02Balance.toFixed(2)}$`);
    }

    // 4. Vérifier 6 semaines dépôts consécutifs
    const sixWeeksAgo = new Date();
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 45); // 6 semaines

    const weeklyDeposits = await db.select({ 
      week: sql<string>`to_char(${transactions.createdAt}, 'IYYY-IW')` 
    })
      .from(transactions)
      .where(and(
        eq(transactions.accountId, s02Account.id),
        eq(transactions.transactionType, 'DEPOSIT'),
        gte(transactions.createdAt, sixWeeksAgo.toISOString())
      ))
      .groupBy(sql`to_char(${transactions.createdAt}, 'IYYY-IW')`);

    if (weeklyDeposits.length < 6) {
      reasons.push(`Dépôts hebdomadaires insuffisants. Requis: 6 semaines, Actuel: ${weeklyDeposits.length} semaines`);
    }

    // 5. Vérifier pas de défaut 6 mois
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const hasDefaults = await db.select({ count: sql<number>`count(*)` })
      .from(creditApplications)
      .where(and(
        eq(creditApplications.customerId, customerId),
        eq(creditApplications.status, 'DEFAULTED'),
        gte(creditApplications.createdAt, sixMonthsAgo.toISOString())
      ));

    if (Number(hasDefaults[0].count) > 0) {
      reasons.push('Défaut de paiement dans les 6 derniers mois');
    }

    // 6. Vérifier pas en prison virtuelle
    const inPrison = await db.query.creditVirtualPrison.findFirst({
      where: and(
        eq(creditVirtualPrison.customerId, customerId),
        eq(creditVirtualPrison.isActive, true)
      )
    });

    if (inPrison) {
      reasons.push('Client en prison virtuelle - crédit bloqué');
    }

    return {
      eligible: reasons.length === 0,
      reasons,
      s02Balance,
      s02AccountId: s02Account.id
    };
  }

  // ===== DEMANDE CRÉDIT TELEMA =====
  async requestCredit(
    customerId: number, 
    requestedAmount: number, 
    selectedDuration: 6 | 9 | 12,
    businessDocuments: any
  ): Promise<any> {
    // 1. Vérifier éligibilité
    const eligibility = await this.checkEligibility(customerId, requestedAmount);
    if (!eligibility.eligible) {
      throw new Error(`Non éligible: ${eligibility.reasons.join(', ')}`);
    }

    // 2. Calculer montants
    const processingFee = this.calculateProcessingFee(requestedAmount);
    const interestRate = this.calculateInterestRate(requestedAmount, selectedDuration);
    const totalInterest = (requestedAmount * interestRate) / 100;
    const totalRepayable = requestedAmount + totalInterest;
    const monthlyPayment = totalRepayable / selectedDuration;
    const cautionAmount = requestedAmount * 0.3; // 30%
    const netAmount = requestedAmount - processingFee;

    // 3. Créer demande crédit
    const [credit] = await db.insert(creditApplications).values({
      customerId,
      productType: 'TELEMA',
      requestedAmountUsd: requestedAmount.toString(),
      approvedAmountUsd: requestedAmount.toString(),
      processingFeeUsd: processingFee.toString(),
      interestRate: interestRate.toString(),
      totalInterestUsd: totalInterest.toString(),
      cautionAmountUsd: cautionAmount.toString(),
      cautionPercentage: '30.00',
      durationMonths: selectedDuration,
      monthlyPaymentUsd: monthlyPayment.toString(),
      s02AccountId: eligibility.s02AccountId,
      status: 'DOCUMENTS_PENDING',
      eligibilityCheckPassed: true,
      businessDocuments: businessDocuments,
      isAutoRenewable: false
    }).returning();

    // 4. Notifier client
    await this.sendNotification(credit.id, customerId, 'APPLICATION_RECEIVED',
      'Demande TELEMA reçue',
      `Votre demande de crédit TELEMA de ${requestedAmount}$ sur ${selectedDuration} mois a été reçue.`
    );

    return credit;
  }

  // ===== VALIDATION DOCUMENTS =====
  async validateDocuments(creditId: number, adminId: number, approved: boolean, comments?: string): Promise<void> {
    const credit = await db.query.creditApplications.findFirst({
      where: eq(creditApplications.id, creditId)
    });

    if (!credit) throw new Error('Crédit introuvable');

    if (approved) {
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
        `Veuillez déposer ${credit.cautionAmountUsd}$ dans S03 caution.`
      );
    } else {
      await db.update(creditApplications)
        .set({
          status: 'CANCELLED',
          notes: comments || 'Documents rejetés',
          updatedAt: new Date().toISOString()
        })
        .where(eq(creditApplications.id, creditId));
    }
  }

  // ===== DÉCAISSEMENT =====
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

    // 4. Calculer date échéance
    const maturityDate = new Date();
    maturityDate.setMonth(maturityDate.getMonth() + (credit.durationMonths || 6));

    // 5. Mettre à jour crédit
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

    // 6. Points Serenity
    await this.pointsService.awardPoints(credit.customerId, 10, `TELEMA ${approvedAmount}$ décaissé`);

    // 7. Notifier
    await this.sendNotification(creditId, credit.customerId, 'CREDIT_DISBURSED',
      'Crédit décaissé!',
      `${netAmount}$ crédités dans S04. Mensualité: ${credit.monthlyPaymentUsd}$ sur ${credit.durationMonths} mois.`
    );
  }

  // ===== RAPPELS HEBDOMADAIRES (Mercredi & Vendredi) =====
  async sendWeeklyReminders(): Promise<void> {
    const activeCredits = await db.select()
      .from(creditApplications)
      .where(and(
        eq(creditApplications.productType, 'TELEMA'),
        eq(creditApplications.status, 'DISBURSED')
      ));

    for (const credit of activeCredits) {
      await this.sendNotification(credit.id, credit.customerId, 'WEEKLY_REMINDER',
        'Rappel mensualité TELEMA',
        `N'oubliez pas votre mensualité de ${credit.monthlyPaymentUsd}$. Vous pouvez payer progressivement chaque semaine.`
      );

      // Award 1 point for weekly payment
      await this.pointsService.awardPoints(credit.customerId, 1, 'Rappel TELEMA');
    }
  }

  // ===== TRAITER NON-PAIEMENTS (3 jours après échéance) =====
  async processLatePayments(): Promise<void> {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const lateCredits = await db.select()
      .from(creditApplications)
      .where(and(
        eq(creditApplications.productType, 'TELEMA'),
        eq(creditApplications.status, 'DISBURSED'),
        sql`${creditApplications.maturityDate} < ${threeDaysAgo.toISOString()}`
      ));

    for (const credit of lateCredits) {
      await this.debitS02AndS03(credit);
    }
  }

  // ===== DÉBITER S02 + S03 =====
  private async debitS02AndS03(credit: any): Promise<void> {
    const [s02, s03] = await Promise.all([
      db.query.accounts.findFirst({ where: and(eq(accounts.customerId, credit.customerId), eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')) }),
      db.query.accounts.findFirst({ where: and(eq(accounts.customerId, credit.customerId), eq(accounts.accountType, 'S03_CAUTION')) })
    ]);

    if (!s02 || !s03) return;

    const remainingBalance = parseFloat(credit.remainingBalanceUsd || '0');
    const s02Balance = parseFloat(s02.balanceUsd || '0');
    const s03Balance = parseFloat(s03.balanceUsd || '0');

    let fromS02 = Math.min(s02Balance, remainingBalance);
    let fromS03 = Math.min(s03Balance, remainingBalance - fromS02);

    // Débiter
    if (fromS02 > 0) {
      await db.update(accounts)
        .set({ balanceUsd: (s02Balance - fromS02).toString() })
        .where(eq(accounts.id, s02.id));
    }

    if (fromS03 > 0) {
      await db.update(accounts)
        .set({ balanceUsd: (s03Balance - fromS03).toString() })
        .where(eq(accounts.id, s03.id));
    }

    // Appliquer intérêt retard 2%/mois
    const lateInterest = remainingBalance * 0.02;
    const newRemaining = remainingBalance - (fromS02 + fromS03) + lateInterest;

    await db.update(creditApplications)
      .set({
        totalPaidUsd: (parseFloat(credit.totalPaidUsd || '0') + fromS02 + fromS03).toString(),
        remainingBalanceUsd: newRemaining.toString(),
        totalLateInterestUsd: (parseFloat(credit.totalLateInterestUsd || '0') + lateInterest).toString(),
        status: 'VIRTUAL_PRISON',
        updatedAt: new Date().toISOString()
      })
      .where(eq(creditApplications.id, credit.id));

    // Prison virtuelle
    await db.insert(creditVirtualPrison).values({
      customerId: credit.customerId,
      creditId: credit.id,
      blockedReason: 'NON_PAYMENT',
      outstandingPrincipalUsd: newRemaining.toString(),
      penaltyUsd: credit.processingFeeUsd,
      isActive: true
    });

    await this.sendNotification(credit.id, credit.customerId, 'LATE_PAYMENT',
      'Retard paiement - Prison virtuelle',
      `Intérêt 2%/mois appliqué. Nouveau solde: ${newRemaining.toFixed(2)}$`
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
}
