/**
 * CRÉDIT VIMBISA - SERVICE COMPLET
 * Crédit saisonnier en CDF uniquement (50k-200k FC)
 * Réservé aux clients avec 5+ cycles Bwakisa complétés + 3 mois ancienneté
 */

import { db } from '../../../../../db';
import { and, eq, gte, sql } from 'drizzle-orm';
import { 
  creditApplications, 
  creditNotifications
} from '../../../../../db/credit-products-schema';
import { accounts, bwakisaServices, customers } from '../../../../../db/schema';
import { SerenityPointsService } from '../../config/serenity-points.service';
import { generateAccountNumber } from '../../utils/account-helpers';

interface VimbisaEligibilityResult {
  eligible: boolean;
  reasons: string[];
  completedBwakisaCycles: number;
  s02BalanceCdf: number;
  accountAgeDays: number;
}

export class VimbisaService {
  private pointsService: SerenityPointsService;

  constructor() {
    this.pointsService = new SerenityPointsService();
  }

  // ===== MONTANTS AUTORISÉS VIMBISA =====
  private readonly ALLOWED_AMOUNTS_CDF = [50000, 100000, 150000, 200000];

  // ===== VÉRIFIER ÉLIGIBILITÉ VIMBISA =====
  async checkEligibility(customerId: number, requestedAmountCdf: number): Promise<VimbisaEligibilityResult> {
    const reasons: string[] = [];

    // 1. Vérifier montant autorisé
    if (!this.ALLOWED_AMOUNTS_CDF.includes(requestedAmountCdf)) {
      reasons.push('Montant doit être: 50.000, 100.000, 150.000 ou 200.000 FC');
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
        reasons: ['Compte S02 introuvable'],
        completedBwakisaCycles: 0,
        s02BalanceCdf: 0,
        accountAgeDays: 0
      };
    }

    const s02BalanceCdf = parseFloat(s02Account.balanceCdf || '0');

    // 3. Vérifier 30% balance CDF
    if (s02BalanceCdf < requestedAmountCdf * 0.3) {
      reasons.push(`S02 insuffisant. Requis: ${(requestedAmountCdf * 0.3).toLocaleString()} FC, Actuel: ${s02BalanceCdf.toLocaleString()} FC`);
    }

    // 4. Vérifier 5+ cycles Bwakisa complétés
    const completedCycles = await db.select({ count: sql<number>`count(*)` })
      .from(bwakisaServices)
      .where(and(
        eq(bwakisaServices.customerId, customerId),
        eq(bwakisaServices.status, 'COMPLETED')
      ));

    const cycleCount = Number(completedCycles[0].count);

    if (cycleCount < 5) {
      reasons.push(`Cycles Bwakisa insuffisants. Requis: 5, Actuel: ${cycleCount}`);
    }

    // 5. Vérifier 3 mois ancienneté
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId)
    });

    if (!customer) {
      return { eligible: false, reasons: ['Client introuvable'], completedBwakisaCycles: 0, s02BalanceCdf: 0, accountAgeDays: 0 };
    }

    const accountCreatedDate = new Date(customer.createdAt || new Date());
    const today = new Date();
    const accountAgeDays = Math.floor((today.getTime() - accountCreatedDate.getTime()) / (1000 * 60 * 60 * 24));
    const threeMonthsInDays = 90;

    if (accountAgeDays < threeMonthsInDays) {
      reasons.push(`Ancienneté insuffisante. Requis: 90 jours, Actuel: ${accountAgeDays} jours`);
    }

    return {
      eligible: reasons.length === 0,
      reasons,
      completedBwakisaCycles: cycleCount,
      s02BalanceCdf,
      accountAgeDays
    };
  }

  // ===== DEMANDE CRÉDIT VIMBISA =====
  async requestCredit(
    customerId: number,
    requestedAmountCdf: number,
    businessDocuments: any
  ): Promise<any> {
    // 1. Vérifier éligibilité
    const eligibility = await this.checkEligibility(customerId, requestedAmountCdf);
    if (!eligibility.eligible) {
      throw new Error(`Non éligible: ${eligibility.reasons.join(', ')}`);
    }

    // 2. Calculer montants (CDF uniquement)
    const processingFeeCdf = this.calculateProcessingFeeCdf(requestedAmountCdf);
    const interestRate = 3.0; // 3% fixe pour Vimbisa
    const totalInterestCdf = (requestedAmountCdf * interestRate) / 100;
    const totalRepayableCdf = requestedAmountCdf + totalInterestCdf;
    const cautionAmountCdf = requestedAmountCdf * 0.3; // 30%
    const netAmountCdf = requestedAmountCdf - processingFeeCdf;

    // 3. Créer demande crédit
    const [credit] = await db.insert(creditApplications).values({
      customerId,
      productType: 'VIMBISA',
      requestedAmountCdf: requestedAmountCdf.toString(),
      requestedAmountUsd: '0',
      approvedAmountCdf: requestedAmountCdf.toString(),
      processingFeeCdf: processingFeeCdf.toString(),
      interestRate: interestRate.toString(),
      totalInterestCdf: totalInterestCdf.toString(),
      cautionAmountCdf: cautionAmountCdf.toString(),
      cautionPercentage: '30.00',
      durationMonths: 3, // 3 mois saisonnier
      s02AccountId: (await db.query.accounts.findFirst({
        where: and(eq(accounts.customerId, customerId), eq(accounts.accountType, 'S02_MANDATORY_SAVINGS'))
      }))?.id,
      status: 'DOCUMENTS_PENDING',
      eligibilityCheckPassed: true,
      businessDocuments: businessDocuments,
      isAutoRenewable: false
    }).returning();

    // 4. Notifier client
    await this.sendNotification(credit.id, customerId, 'APPLICATION_RECEIVED',
      'Demande VIMBISA reçue',
      `Votre demande de crédit VIMBISA de ${requestedAmountCdf.toLocaleString()} FC a été reçue. Veuillez soumettre vos documents.`
    );

    return credit;
  }

  // ===== CALCUL FRAIS TRAITEMENT CDF =====
  private calculateProcessingFeeCdf(amountCdf: number): number {
    // Équivalent proportionnel aux frais USD
    if (amountCdf === 50000) return 5000;   // ~2%
    if (amountCdf === 100000) return 8000;  // ~2%
    if (amountCdf === 150000) return 10000; // ~1.7%
    if (amountCdf === 200000) return 12000; // ~1.5%
    return 5000;
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
        balanceCdf: '0',
        balanceUsd: '0',
        status: 'ACTIVE'
      }).returning();
      s04Account = newS04;
    }

    // 2. Calculer montant net CDF
    const approvedAmount = parseFloat(credit.approvedAmountCdf || '0');
    const processingFee = parseFloat(credit.processingFeeCdf || '0');
    const netAmount = approvedAmount - processingFee;

    // 3. Créditer S04
    const newBalance = parseFloat(s04Account.balanceCdf || '0') + netAmount;
    await db.update(accounts)
      .set({ balanceCdf: newBalance.toString() })
      .where(eq(accounts.id, s04Account.id));

    // 4. Mettre à jour crédit
    const maturityDate = new Date();
    maturityDate.setMonth(maturityDate.getMonth() + 3); // 3 mois

    await db.update(creditApplications)
      .set({
        status: 'DISBURSED',
        disbursedAmountCdf: netAmount.toString(),
        s04CreditAccountId: s04Account.id,
        disbursementDate: new Date().toISOString(),
        maturityDate: maturityDate.toISOString(),
        remainingBalanceCdf: (approvedAmount + parseFloat(credit.totalInterestCdf || '0')).toString(),
        updatedAt: new Date().toISOString()
      })
      .where(eq(creditApplications.id, creditId));

    // 5. Points Serenity
    await this.pointsService.awardPoints(credit.customerId, 8, `VIMBISA ${approvedAmount} FC décaissé`);

    // 6. Notifier
    await this.sendNotification(creditId, credit.customerId, 'CREDIT_DISBURSED',
      'Crédit VIMBISA décaissé!',
      `${netAmount.toLocaleString()} FC crédités dans votre compte S04. Remboursement sur 3 mois.`
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
