/**
 * CUSTOMER CATEGORY UPGRADE SERVICE
 * Automation: CATEGORY_1 → CATEGORY_2 → GOLD
 * 
 * CATEGORY_1 (défaut):
 * - KYC1 uniquement
 * - Retrait max: 50$/150k CDF/mois
 * 
 * CATEGORY_2 (upgrade):
 * - KYC2 validé
 * - Accès complet sauf fonctionnalités GOLD
 * 
 * GOLD (upgrade):
 * - 3+ mois ancienneté
 * - 1000$+ épargne S02
 * - 1 dépôt/semaine régulier
 * - Pas de défaut paiement
 */

import { db } from '../db';
import { customers, accounts, transactions } from '../db/schema';
import { creditApplications } from '../db/credit-products-schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import cron from 'node-cron';
import { loyaltyPointsService } from '../modules/loyalty/loyalty-points.service';

export class CategoryUpgradeService {
  
  // ===== VÉRIFIER ÉLIGIBILITÉ CATEGORY_2 =====
  async checkCategory2Eligibility(customerId: number): Promise<{eligible: boolean; reasons: string[]}> {
    const reasons: string[] = [];

    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId)
    });

    if (!customer) {
      return { eligible: false, reasons: ['Client introuvable'] };
    }

    // Déjà CATEGORY_2 ou GOLD
    if (customer.category === 'CATEGORY_2' || customer.category === 'GOLD') {
      return { eligible: false, reasons: ['Déjà CATEGORY_2 ou GOLD'] };
    }

    // KYC2 validé ?
    if (!customer.kyc2ValidationDate) {
      reasons.push('KYC2 non validé');
    }

    return { eligible: reasons.length === 0, reasons };
  }

  // ===== UPGRADE → CATEGORY_2 =====
  async upgradeToCategory2(customerId: number): Promise<void> {
    const eligibility = await this.checkCategory2Eligibility(customerId);

    if (!eligibility.eligible) {
      throw new Error(`Non éligible CATEGORY_2: ${eligibility.reasons.join(', ')}`);
    }

    await db.update(customers)
      .set({ 
        category: 'CATEGORY_2',
        updatedAt: new Date().toISOString()
      })
      .where(eq(customers.id, customerId));

    console.log(`✅ Client ${customerId} upgradé → CATEGORY_2`);
  }

  // ===== VÉRIFIER ÉLIGIBILITÉ GOLD =====
  async checkGoldEligibility(customerId: number): Promise<{eligible: boolean; reasons: string[]}> {
    const reasons: string[] = [];

    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId)
    });

    if (!customer) {
      return { eligible: false, reasons: ['Client introuvable'] };
    }

    // Déjà GOLD
    if (customer.category === 'GOLD') {
      return { eligible: false, reasons: ['Déjà GOLD'] };
    }

    // 1. Vérifier KYC2 validé
    if (!customer.kyc2ValidationDate) {
      reasons.push('KYC2 non validé');
    }

    // 2. Vérifier 3 mois ancienneté
    const createdAt = customer.createdAt;
    if (!createdAt) {
      reasons.push('Date de création du compte manquante');
    } else {
      const accountCreatedDate = new Date(createdAt!);
      const today = new Date();
      const accountAgeDays = Math.floor((today.getTime() - accountCreatedDate.getTime()) / (1000 * 60 * 60 * 24));
      const threeMonthsInDays = 90;

      if (accountAgeDays < threeMonthsInDays) {
        reasons.push(`Ancienneté insuffisante (${accountAgeDays}/90 jours)`);
      }
    }

    // 3. Vérifier 1000$+ épargne S02
    const s02Account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.customerId, customerId),
        eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')
      )
    });

    if (!s02Account) {
      reasons.push('Compte S02 introuvable');
    } else {
      const s02Balance = parseFloat(s02Account.balanceUsd || '0');
      if (s02Balance < 1000) {
        reasons.push(`Épargne S02 insuffisante (${s02Balance}/1000$)`);
      }
    }

    // 4. Vérifier 1 dépôt/semaine régulier (12 semaines = 3 mois)
    if (s02Account) {
      const twelveWeeksAgo = new Date();
      twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84); // 12 semaines

      const weeklyDeposits = await db.select({
        week: sql<string>`to_char(${transactions.createdAt}, 'IYYY-IW')`
      })
        .from(transactions)
        .where(and(
          eq(transactions.accountId, s02Account.id),
          eq(transactions.transactionType, 'DEPOSIT'),
          gte(transactions.createdAt, twelveWeeksAgo.toISOString())
        ))
        .groupBy(sql`to_char(${transactions.createdAt}, 'IYYY-IW')`);

      if (weeklyDeposits.length < 12) {
        reasons.push(`Dépôts hebdomadaires insuffisants (${weeklyDeposits.length}/12 semaines)`);
      }
    }

    // 5. Vérifier pas de défaut paiement 6 mois
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
      reasons.push('Défaut de paiement détecté dans les 6 derniers mois');
    }

    return { eligible: reasons.length === 0, reasons };
  }

  // ===== UPGRADE → GOLD =====
  async upgradeToGold(customerId: number): Promise<void> {
    const eligibility = await this.checkGoldEligibility(customerId);

    if (!eligibility.eligible) {
      throw new Error(`Non éligible GOLD: ${eligibility.reasons.join(', ')}`);
    }

    // Get customer info before upgrade
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId)
    });

    await db.update(customers)
      .set({ 
        category: 'GOLD',
        goldEligibleDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .where(eq(customers.id, customerId));

    console.log(`✅ Client ${customerId} upgradé → GOLD 🌟`);

    // AWARD GOLD UPGRADE POINT
    try {
      await loyaltyPointsService.awardPoints({
        customerId,
        pointTypeCode: 'GOLD_UPGRADE',
        operationId: customerId,
        metadata: {
          previousCategory: customer?.category,
          upgradeDate: new Date().toISOString()
        }
      });
      console.log(`🎉 Gold upgrade point awarded to customer: ${customerId}`);
    } catch (error) {
      console.error(`⚠️  Failed to award gold upgrade point:`, error);
    }
  }

  // ===== CRON JOB: UPGRADE AUTOMATIQUE QUOTIDIEN =====
  setupDailyUpgradeCheck(): void {
    // Tous les jours à 02:00 (avant crons crédit)
    cron.schedule('0 2 * * *', async () => {
      console.log('⏰ [02:00] Vérification upgrades catégories clients...');

      try {
        // 1. Upgrade CATEGORY_1 → CATEGORY_2 (KYC2 validés)
        const cat1Customers = await db.select()
          .from(customers)
          .where(and(
            eq(customers.category, 'CATEGORY_1'),
            sql`${customers.kyc2ValidationDate} IS NOT NULL`
          ));

        for (const customer of cat1Customers) {
          try {
            await this.upgradeToCategory2(customer.id);
          } catch (error) {
            console.log(`  - Client ${customer.id}: Non éligible CAT2`);
          }
        }

        // 2. Upgrade CATEGORY_2 → GOLD
        const cat2Customers = await db.select()
          .from(customers)
          .where(eq(customers.category, 'CATEGORY_2'));

        let goldUpgradeCount = 0;

        for (const customer of cat2Customers) {
          const eligibility = await this.checkGoldEligibility(customer.id);
          if (eligibility.eligible) {
            await this.upgradeToGold(customer.id);
            goldUpgradeCount++;
          }
        }

        console.log(`✅ [02:00] Upgrades terminés: ${cat1Customers.length} → CAT2, ${goldUpgradeCount} → GOLD`);
      } catch (error) {
        console.error('❌ [02:00] Erreur upgrades catégories:', error);
      }
    }, {
      timezone: 'Africa/Kinshasa'
    });

    console.log('✓ Cron job: Upgrade catégories clients (02:00) activé');
  }

  // ===== DÉGRADER GOLD (si conditions non respectées) =====
  async checkGoldDowngrade(customerId: number): Promise<void> {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId)
    });

    if (!customer || customer.category !== 'GOLD') return;

    // Vérifier si toujours éligible GOLD
    const eligibility = await this.checkGoldEligibility(customerId);

    if (!eligibility.eligible) {
      // Dégrader → CATEGORY_2
      await db.update(customers)
        .set({
          category: 'CATEGORY_2',
          goldEligibleDate: null,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, customerId));

      console.log(`⚠️  Client ${customerId} dégradé GOLD → CATEGORY_2: ${eligibility.reasons.join(', ')}`);
    }
  }

  // ===== STATISTIQUES CATÉGORIES =====
  async getCategoryStats(): Promise<any> {
    const stats = await db.select({
      category: customers.category,
      count: sql<number>`count(*)`
    })
      .from(customers)
      .groupBy(customers.category);

    return stats;
  }

  // ===== OBTENIR PROGRESSION GOLD =====
  async getGoldProgress(customerId: number): Promise<any> {
    const eligibility = await this.checkGoldEligibility(customerId);

    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId)
    });

    if (!customer) return null;

    // Calculer progression
    const createdAt = customer.createdAt;
    const accountAgeDays = createdAt
      ? Math.floor((new Date().getTime() - new Date(createdAt!).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const s02Account = await db.query.accounts.findFirst({
      where: and(eq(accounts.customerId, customerId), eq(accounts.accountType, 'S02_MANDATORY_SAVINGS'))
    });
    const s02Balance = parseFloat(s02Account?.balanceUsd || '0');

    return {
      currentCategory: customer.category,
      goldEligible: eligibility.eligible,
      progress: {
        accountAge: {
          current: accountAgeDays,
          required: 90,
          percentage: Math.min((accountAgeDays / 90) * 100, 100)
        },
        savings: {
          current: s02Balance,
          required: 1000,
          percentage: Math.min((s02Balance / 1000) * 100, 100)
        },
        weeklyDeposits: {
          // Calculé dans checkGoldEligibility
          status: eligibility.reasons.some(r => r.includes('hebdomadaires')) ? 'incomplete' : 'complete'
        },
        kyc2: {
          status: customer.kyc2ValidationDate ? 'complete' : 'incomplete'
        }
      },
      missingRequirements: eligibility.reasons
    };
  }
}

// Export instance singleton
export const categoryUpgradeService = new CategoryUpgradeService();
