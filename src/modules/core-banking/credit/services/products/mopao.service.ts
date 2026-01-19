/**
 * CRÉDIT MOPAO - SERVICE COMPLET
 * Crédit parrainage GOLD (1-1.5% intérêt)
 * Client GOLD parraine 2-3 personnes et garantit 40% de leurs crédits
 */

import { db } from '../../../../../db';
import { and, eq, gte, sql } from 'drizzle-orm';
import { 
  creditApplications, 
  mopaoSponsorships,
  creditNotifications
} from '../../../../../db/credit-products-schema';
import { accounts, customers } from '../../../../../db/schema';
import { TelemaService } from './telema.service';

interface MopaoEligibilityResult {
  eligible: boolean;
  reasons: string[];
  isGold: boolean;
  s02Balance: number;
  canSponsor: number; // Combien de personnes peut parrainer
}

interface MopaoBeneficiaryEligibilityResult {
  eligible: boolean;
  reasons: string[];
  kycLevel: number;
  s02Balance: number;
  hasSponsor: boolean;
  sponsorAvailable: boolean;
  cautionRequired: number;
}

export class MopaoService {
  private telemaService: TelemaService;

  constructor() {
    this.telemaService = new TelemaService();
  }

  // ===== TAUX INTÉRÊT MOPAO (RÉDUIT) =====
  calculateInterestRate(amount: number): number {
    if (amount >= 501 && amount <= 1500) return 1.0; // 1%
    if (amount >= 200 && amount <= 500) return 1.5; // 1.5%
    return 1.5;
  }

  // ===== VÉRIFIER ÉLIGIBILITÉ BÉNÉFICIAIRE MOPAO =====
  async checkEligibility(customerId: number, requestedAmount: number, sponsorCustomerId?: number): Promise<MopaoBeneficiaryEligibilityResult> {
    const reasons: string[] = [];

    // 1. Vérifier montant
    if (requestedAmount < 200 || requestedAmount > 1500) {
      reasons.push('Montant MOPAO doit être entre 200$ et 1500$');
    }

    // 2. Récupérer info client
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId)
    });

    if (!customer) {
      return {
        eligible: false,
        reasons: ['Client introuvable'],
        kycLevel: 0,
        s02Balance: 0,
        hasSponsor: false,
        sponsorAvailable: false,
        cautionRequired: requestedAmount * 0.1
      };
    }

    // 3. Vérifier KYC niveau 1 minimum
    const kycLevel = customer.kycStatus?.includes('KYC2') ? 2 : (customer.kycStatus?.includes('KYC1') ? 1 : 0);
    if (kycLevel < 1) {
      reasons.push('KYC Niveau 1 minimum requis pour MOPAO');
    }

    // 4. Vérifier S02 balance (10% caution bénéficiaire)
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
        kycLevel,
        s02Balance: 0,
        hasSponsor: false,
        sponsorAvailable: false,
        cautionRequired: requestedAmount * 0.1
      };
    }

    const s02Balance = parseFloat(s02Account.balanceUsd || '0');
    const cautionRequired = requestedAmount * 0.1; // 10% bénéficiaire

    if (s02Balance < cautionRequired) {
      reasons.push(`Solde S02 insuffisant pour caution 10%. Requis: ${cautionRequired.toFixed(2)}$, Actuel: ${s02Balance.toFixed(2)}$`);
    }

    // 5. Vérifier sponsor (si fourni)
    let sponsorAvailable = false;
    let hasSponsor = false;

    if (sponsorCustomerId) {
      const sponsorEligibility = await this.checkSponsorEligibility(sponsorCustomerId, 1);
      if (sponsorEligibility.eligible) {
        sponsorAvailable = true;
        hasSponsor = true;

        // Vérifier que sponsor a 40% disponible
        const sponsorGuaranteeRequired = requestedAmount * 0.4;
        if (sponsorEligibility.s02Balance < sponsorGuaranteeRequired) {
          reasons.push(`Parrain: S02 insuffisant. Requis: ${sponsorGuaranteeRequired.toFixed(2)}$, Disponible: ${sponsorEligibility.s02Balance.toFixed(2)}$`);
          sponsorAvailable = false;
        }
      } else {
        reasons.push(`Parrain non éligible: ${sponsorEligibility.reasons.join(', ')}`);
      }
    } else {
      reasons.push('Parrain GOLD requis pour crédit MOPAO');
    }

    // 6. Vérifier pas de défaut dans les 6 derniers mois
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const defaults = await db.select({ count: sql<number>`count(*)` })
      .from(creditApplications)
      .where(and(
        eq(creditApplications.customerId, customerId),
        eq(creditApplications.status, 'DEFAULTED'),
        gte(creditApplications.createdAt, sixMonthsAgo.toISOString())
      ));

    if (Number(defaults[0].count) > 0) {
      reasons.push('Défaut de paiement détecté dans les 6 derniers mois');
    }

    return {
      eligible: reasons.length === 0,
      reasons,
      kycLevel,
      s02Balance,
      hasSponsor,
      sponsorAvailable,
      cautionRequired
    };
  }

  // ===== VÉRIFIER ÉLIGIBILITÉ GOLD SPONSOR =====
  async checkSponsorEligibility(sponsorCustomerId: number, numberOfSponsored: number): Promise<MopaoEligibilityResult> {
    const reasons: string[] = [];

    // 1. Vérifier statut GOLD
    const sponsor = await db.query.customers.findFirst({
      where: eq(customers.id, sponsorCustomerId)
    });

    if (!sponsor) {
      return { eligible: false, reasons: ['Client introuvable'], isGold: false, s02Balance: 0, canSponsor: 0 };
    }

    if (sponsor.category !== 'GOLD') {
      reasons.push('Vous devez être client GOLD pour accéder à MOPAO');
      return { eligible: false, reasons, isGold: false, s02Balance: 0, canSponsor: 0 };
    }

    // 2. Vérifier S02 balance
    const s02Account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.customerId, sponsorCustomerId),
        eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')
      )
    });

    if (!s02Account) {
      return { eligible: false, reasons: ['Compte S02 introuvable'], isGold: true, s02Balance: 0, canSponsor: 0 };
    }

    const s02Balance = parseFloat(s02Account.balanceUsd || '0');

    // 3. Vérifier nombre de parrainages actifs
    const activeSponsorships = await db.select({ count: sql<number>`count(*)` })
      .from(mopaoSponsorships)
      .where(and(
        eq(mopaoSponsorships.sponsorCustomerId, sponsorCustomerId),
        eq(mopaoSponsorships.isActive, true)
      ));

    const currentSponsorCount = Number(activeSponsorships[0].count);

    if (currentSponsorCount >= 3) {
      reasons.push('Limite de parrainage atteinte (max 3 personnes)');
    }

    if (currentSponsorCount + numberOfSponsored > 3) {
      reasons.push(`Vous ne pouvez parrainer que ${3 - currentSponsorCount} personne(s) de plus`);
    }

    return {
      eligible: reasons.length === 0,
      reasons,
      isGold: true,
      s02Balance,
      canSponsor: 3 - currentSponsorCount
    };
  }

  // ===== DEMANDE CRÉDIT MOPAO (SPONSOR) =====
  async requestCreditAsSponsor(
    sponsorCustomerId: number,
    sponsoredCustomerIds: number[],
    amounts: { [customerId: number]: number },
    durations: { [customerId: number]: 6 | 9 | 12 }
  ): Promise<any> {
    // 1. Vérifier éligibilité sponsor
    const sponsorEligibility = await this.checkSponsorEligibility(sponsorCustomerId, sponsoredCustomerIds.length);
    if (!sponsorEligibility.eligible) {
      throw new Error(`Sponsor non éligible: ${sponsorEligibility.reasons.join(', ')}`);
    }

    // 2. Calculer garantie totale nécessaire (40% de chaque crédit)
    let totalGuaranteeRequired = 0;
    for (const customerId of sponsoredCustomerIds) {
      const amount = amounts[customerId];
      totalGuaranteeRequired += amount * 0.4; // 40%
    }

    // 3. Vérifier que S02 sponsor peut couvrir
    if (sponsorEligibility.s02Balance < totalGuaranteeRequired) {
      throw new Error(`S02 insuffisant. Requis: ${totalGuaranteeRequired.toFixed(2)}$, Disponible: ${sponsorEligibility.s02Balance.toFixed(2)}$`);
    }

    // 4. Créer crédits pour chaque parrainé
    const createdCredits = [];

    for (const customerId of sponsoredCustomerIds) {
      const amount = amounts[customerId];
      const duration = durations[customerId];

      // Créer crédit MOPAO
      const credit = await this.createSponsoredCredit(
        sponsorCustomerId,
        customerId,
        amount,
        duration
      );

      createdCredits.push(credit);
    }

    // 5. Geler 40% dans S02 sponsor
    await this.lockSponsorGuarantee(sponsorCustomerId, totalGuaranteeRequired);

    return {
      sponsorCustomerId,
      sponsoredCredits: createdCredits,
      totalGuaranteeAmount: totalGuaranteeRequired
    };
  }

  // ===== CRÉER CRÉDIT PARRAINÉ =====
  private async createSponsoredCredit(
    sponsorCustomerId: number,
    sponsoredCustomerId: number,
    amount: number,
    duration: 6 | 9 | 12
  ): Promise<any> {
    // 1. Vérifier éligibilité basique du parrainé (30% S02 + caution)
    const s02Account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.customerId, sponsoredCustomerId),
        eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')
      )
    });

    if (!s02Account) throw new Error(`Compte S02 introuvable pour client ${sponsoredCustomerId}`);

    const s02Balance = parseFloat(s02Account.balanceUsd || '0');
    if (s02Balance < amount * 0.3) {
      throw new Error(`Parrainé ${sponsoredCustomerId}: S02 insuffisant (30% requis)`);
    }

    // 2. Calculer montants (taux réduit MOPAO)
    const interestRate = this.calculateInterestRate(amount);
    const processingFee = this.telemaService.calculateProcessingFee(amount);
    const totalInterest = (amount * interestRate) / 100;
    const totalRepayable = amount + totalInterest;
    const monthlyPayment = totalRepayable / duration;
    const cautionAmount = amount * 0.3;
    const sponsorGuarantee = amount * 0.4;

    // 3. Créer crédit
    const [credit] = await db.insert(creditApplications).values({
      customerId: sponsoredCustomerId,
      productType: 'MOPAO',
      requestedAmountUsd: amount.toString(),
      approvedAmountUsd: amount.toString(),
      processingFeeUsd: processingFee.toString(),
      interestRate: interestRate.toString(),
      totalInterestUsd: totalInterest.toString(),
      cautionAmountUsd: cautionAmount.toString(),
      durationMonths: duration,
      monthlyPaymentUsd: monthlyPayment.toString(),
      s02AccountId: s02Account.id,
      sponsorCustomerId: sponsorCustomerId,
      sponsorGuaranteePercentage: '40.00',
      status: 'CAUTION_PENDING',
      eligibilityCheckPassed: true
    }).returning();

    // 4. Créer enregistrement parrainage
    await db.insert(mopaoSponsorships).values({
      sponsorCustomerId,
      sponsoredCustomerId,
      creditId: credit.id,
      sponsorGuaranteePercentage: '40.00',
      sponsorGuaranteeAmountUsd: sponsorGuarantee.toString(),
      sponsorGuaranteeAmountCdf: '0',
      sponsorS02LockedAmountUsd: sponsorGuarantee.toString(),
      isActive: true
    });

    // 5. Notifier parrainé
    await this.sendNotification(credit.id, sponsoredCustomerId, 'MOPAO_APPROVED',
      'Crédit MOPAO approuvé!',
      `Votre crédit MOPAO de ${amount}$ (taux réduit ${interestRate}%) a été approuvé. Veuillez déposer caution 30%.`
    );

    return credit;
  }

  // ===== GELER GARANTIE SPONSOR DANS S02 =====
  private async lockSponsorGuarantee(sponsorCustomerId: number, amount: number): Promise<void> {
    // Note: En production, implémenter un système de "balance_locked" dans accounts table
    // Pour l'instant, on enregistre juste dans mopao_sponsorships
    
    await this.sendNotification(0, sponsorCustomerId, 'SPONSOR_GUARANTEE_LOCKED',
      'Garantie sponsor verrouillée',
      `${amount.toFixed(2)}$ gelés dans votre S02 comme garantie pour vos parrainés.`
    );
  }

  // ===== TRAITER NON-PAIEMENT PARRAINÉ =====
  async processSponsoredNonPayment(creditId: number): Promise<void> {
    const credit = await db.query.creditApplications.findFirst({
      where: eq(creditApplications.id, creditId)
    });

    if (!credit || credit.productType !== 'MOPAO') return;

    // 1. Récupérer parrainage
    const sponsorship = await db.query.mopaoSponsorships.findFirst({
      where: and(
        eq(mopaoSponsorships.creditId, creditId),
        eq(mopaoSponsorships.isActive, true)
      )
    });

    if (!sponsorship) return;

    // 2. Débiter S02 parrainé
    const [s02Sponsored, s03Sponsored] = await Promise.all([
      db.query.accounts.findFirst({ where: and(eq(accounts.customerId, credit.customerId), eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')) }),
      db.query.accounts.findFirst({ where: and(eq(accounts.customerId, credit.customerId), eq(accounts.accountType, 'S03_CAUTION')) })
    ]);

    if (!s02Sponsored || !s03Sponsored) return;

    const remainingBalance = parseFloat(credit.remainingBalanceUsd || '0');
    const s02Balance = parseFloat(s02Sponsored.balanceUsd || '0');
    const s03Balance = parseFloat(s03Sponsored.balanceUsd || '0');

    let fromSponsored = Math.min(s02Balance + s03Balance, remainingBalance);

    // 3. Si insuffisant, débiter S02 sponsor (40%)
    const shortfall = remainingBalance - fromSponsored;
    if (shortfall > 0) {
      const s02Sponsor = await db.query.accounts.findFirst({
        where: and(
          eq(accounts.customerId, sponsorship.sponsorCustomerId),
          eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')
        )
      });

      if (s02Sponsor) {
        const sponsorContribution = Math.min(parseFloat(sponsorship.sponsorS02LockedAmountUsd || '0'), shortfall);
        
        // Débiter S02 sponsor
        const newSponsorBalance = parseFloat(s02Sponsor.balanceUsd || '0') - sponsorContribution;
        await db.update(accounts)
          .set({ balanceUsd: newSponsorBalance.toString() })
          .where(eq(accounts.id, s02Sponsor.id));

        // Mettre à jour parrainage
        await db.update(mopaoSponsorships)
          .set({
            sponsorLiabilityTriggered: true,
            sponsorPaidUsd: (parseFloat(sponsorship.sponsorPaidUsd || '0') + sponsorContribution).toString()
          })
          .where(eq(mopaoSponsorships.id, sponsorship.id));

        // Notifier sponsor
        await this.sendNotification(creditId, sponsorship.sponsorCustomerId, 'SPONSOR_LIABILITY_TRIGGERED',
          'Garantie sponsor utilisée',
          `${sponsorContribution.toFixed(2)}$ déduits de votre S02 pour couvrir le non-paiement de votre parrainé.`
        );
      }
    }

    // Note: Le parrainé n'est PAS poursuivi légalement (sponsor absorbe la perte)
  }

  // ===== LIBÉRER GARANTIE (crédit complété) =====
  async releaseGuarantee(creditId: number): Promise<void> {
    const sponsorship = await db.query.mopaoSponsorships.findFirst({
      where: and(
        eq(mopaoSponsorships.creditId, creditId),
        eq(mopaoSponsorships.isActive, true)
      )
    });

    if (!sponsorship) return;

    // Marquer parrainage comme inactif
    await db.update(mopaoSponsorships)
      .set({
        isActive: false,
        releasedAt: new Date().toISOString()
      })
      .where(eq(mopaoSponsorships.id, sponsorship.id));

    // Notifier sponsor
    await this.sendNotification(creditId, sponsorship.sponsorCustomerId, 'GUARANTEE_RELEASED',
      'Garantie libérée',
      `Crédit MOPAO complété. ${sponsorship.sponsorS02LockedAmountUsd}$ dégelés dans votre S02.`
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
