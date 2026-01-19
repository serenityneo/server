/**
 * CRON JOBS - SYSTÈME CRÉDIT COMPLET
 * Automatisation des processus critiques:
 * - 04:00 Auto-renouvellement BOMBÉ
 * - 05:50 Débit S02+S03 pour non-paiement
 * - 07:00 Application intérêts retard
 * - 13:00 Rappels remboursement (1er)
 * - 17:00 Rappels remboursement (2ème)
 * - 23:59 Vérification deadline paiement
 */

import cron from 'node-cron';
import { BombeService } from '../modules/core-banking/credit/services/products/bombe.service';
import { TelemaService } from '../modules/core-banking/credit/services/products/telema.service';
import { db } from '../db';
import { creditApplications, creditNotifications } from '../db/credit-products-schema';
import { customers } from '../db/schema';
import { and, eq, sql } from 'drizzle-orm';

export class CreditCronJobs {
  private bombeService: BombeService;
  private telemaService: TelemaService;

  constructor() {
    this.bombeService = new BombeService();
    this.telemaService = new TelemaService();
  }

  // ===== INITIALISER TOUS LES CRON JOBS =====
  initializeAll(): void {
    console.log('🚀 Initialisation des cron jobs crédit...');

    this.setupBombeAutoRenewal();
    this.setupNonPaymentProcessing();
    this.setupLateInterestApplication();
    this.setup1pmReminders();
    this.setup5pmReminders();
    this.setupPaymentDeadlineCheck();
    this.setupWeeklyReminders();
    this.setupServiceEligibilityCheck(); // NEW: Auto-activation checker

    console.log('✅ Tous les cron jobs crédit sont actifs');
  }

  // ===== 04:00 - AUTO-RENOUVELLEMENT BOMBÉ =====
  private setupBombeAutoRenewal(): void {
    cron.schedule('0 4 * * *', async () => {
      console.log('⏰ [04:00] Début auto-renouvellement crédits BOMBÉ...');

      try {
        await this.bombeService.autoRenewCredits();
        console.log('✅ [04:00] Auto-renouvellement BOMBÉ terminé');
      } catch (error) {
        console.error('❌ [04:00] Erreur auto-renouvellement:', error);
      }
    }, {
      timezone: 'Africa/Kinshasa'
    });

    console.log('✓ Cron job: Auto-renouvellement BOMBÉ (04:00) activé');
  }

  // ===== 05:50 - DÉBIT S02+S03 POUR NON-PAIEMENT =====
  private setupNonPaymentProcessing(): void {
    cron.schedule('50 5 * * *', async () => {
      console.log('⏰ [05:50] Traitement des non-paiements...');

      try {
        await this.bombeService.processNonPayments();
        console.log('✅ [05:50] Non-paiements traités');
      } catch (error) {
        console.error('❌ [05:50] Erreur traitement non-paiements:', error);
      }
    }, {
      timezone: 'Africa/Kinshasa'
    });

    console.log('✓ Cron job: Traitement non-paiements (05:50) activé');
  }

  // ===== 07:00 - APPLICATION INTÉRÊTS RETARD =====
  private setupLateInterestApplication(): void {
    cron.schedule('0 7 * * *', async () => {
      console.log('⏰ [07:00] Application intérêts de retard...');

      try {
        // Trouver tous les crédits en retard avec solde > 0
        const lateCredits = await db.select()
          .from(creditApplications)
          .where(and(
            eq(creditApplications.productType, 'BOMBE'),
            eq(creditApplications.status, 'DISBURSED'),
            sql`${creditApplications.remainingBalanceUsd}::numeric > 0`
          ));

        for (const credit of lateCredits) {
          const remainingBalance = parseFloat(credit.remainingBalanceUsd || '0');
          const lateInterest = remainingBalance * 0.05; // 5%

          await db.update(creditApplications)
            .set({
              remainingBalanceUsd: (remainingBalance + lateInterest).toString(),
              totalLateInterestUsd: (parseFloat(credit.totalLateInterestUsd || '0') + lateInterest).toString(),
              updatedAt: new Date().toISOString()
            })
            .where(eq(creditApplications.id, credit.id));

          console.log(`  - Crédit ${credit.id}: +${lateInterest.toFixed(2)}$ intérêt retard`);
        }

        console.log(`✅ [07:00] Intérêts appliqués sur ${lateCredits.length} crédits`);
      } catch (error) {
        console.error('❌ [07:00] Erreur application intérêts:', error);
      }
    }, {
      timezone: 'Africa/Kinshasa'
    });

    console.log('✓ Cron job: Application intérêts retard (07:00) activé');
  }

  // ===== 13:00 - RAPPELS REMBOURSEMENT (1ER) =====
  private setup1pmReminders(): void {
    cron.schedule('0 13 * * *', async () => {
      console.log('⏰ [13:00] Envoi rappels remboursement...');

      try {
        // Trouver notifications programmées pour 13h
        const notifications = await db.select()
          .from(creditNotifications)
          .where(and(
            eq(creditNotifications.notificationType, 'REMINDER_1PM'),
            eq(creditNotifications.isSent, false),
            sql`DATE(${creditNotifications.scheduledFor}) = CURRENT_DATE`
          ));

        for (const notif of notifications) {
          // Envoyer SMS/Email (integration externe)
          await this.sendSMS(notif.customerId, notif.message);
          await this.sendEmail(notif.customerId, notif.title, notif.message);

          // Marquer comme envoyé
          await db.update(creditNotifications)
            .set({
              isSent: true,
              sentAt: new Date().toISOString()
            })
            .where(eq(creditNotifications.id, notif.id));
        }

        console.log(`✅ [13:00] ${notifications.length} rappels envoyés`);
      } catch (error) {
        console.error('❌ [13:00] Erreur envoi rappels:', error);
      }
    }, {
      timezone: 'Africa/Kinshasa'
    });

    console.log('✓ Cron job: Rappels 13h (1PM) activé');
  }

  // ===== 17:00 - RAPPELS REMBOURSEMENT (2ÈME) =====
  private setup5pmReminders(): void {
    cron.schedule('0 17 * * *', async () => {
      console.log('⏰ [17:00] Envoi derniers rappels...');

      try {
        const notifications = await db.select()
          .from(creditNotifications)
          .where(and(
            eq(creditNotifications.notificationType, 'REMINDER_5PM'),
            eq(creditNotifications.isSent, false),
            sql`DATE(${creditNotifications.scheduledFor}) = CURRENT_DATE`
          ));

        for (const notif of notifications) {
          await this.sendSMS(notif.customerId, notif.message);
          await this.sendEmail(notif.customerId, notif.title, notif.message);

          await db.update(creditNotifications)
            .set({
              isSent: true,
              sentAt: new Date().toISOString()
            })
            .where(eq(creditNotifications.id, notif.id));
        }

        console.log(`✅ [17:00] ${notifications.length} rappels envoyés`);
      } catch (error) {
        console.error('❌ [17:00] Erreur envoi rappels:', error);
      }
    }, {
      timezone: 'Africa/Kinshasa'
    });

    console.log('✓ Cron job: Rappels 17h (5PM) activé');
  }

  // ===== 23:59 - VÉRIFICATION DEADLINE PAIEMENT =====
  private setupPaymentDeadlineCheck(): void {
    cron.schedule('59 23 * * *', async () => {
      console.log('⏰ [23:59] Vérification deadline paiements...');

      try {
        // Vérifier tous les crédits BOMBÉ actifs
        const activeCredits = await db.select()
          .from(creditApplications)
          .where(and(
            eq(creditApplications.productType, 'BOMBE'),
            eq(creditApplications.status, 'DISBURSED'),
            sql`${creditApplications.remainingBalanceUsd}::numeric > 0`
          ));

        console.log(`  - ${activeCredits.length} crédits BOMBÉ en retard détectés`);

        // Les non-paiements seront traités à 05:50 demain matin

        console.log('✅ [23:59] Vérification deadline terminée');
      } catch (error) {
        console.error('❌ [23:59] Erreur vérification deadline:', error);
      }
    }, {
      timezone: 'Africa/Kinshasa'
    });

    console.log('✓ Cron job: Vérification deadline (23:59) activé');
  }

  // ===== MERCREDI & VENDREDI - RAPPELS HEBDOMADAIRES TELEMA =====
  private setupWeeklyReminders(): void {
    // Mercredi (jour 3)
    cron.schedule('0 10 * * 3', async () => {
      console.log('⏰ [Mercredi 10h] Rappels hebdomadaires TELEMA...');
      try {
        await this.telemaService.sendWeeklyReminders();
        console.log('✅ Rappels TELEMA mercredi envoyés');
      } catch (error) {
        console.error('❌ Erreur rappels mercredi:', error);
      }
    }, {
      timezone: 'Africa/Kinshasa'
    });

    // Vendredi (jour 5)
    cron.schedule('0 10 * * 5', async () => {
      console.log('⏰ [Vendredi 10h] Rappels hebdomadaires TELEMA...');
      try {
        await this.telemaService.sendWeeklyReminders();
        console.log('✅ Rappels TELEMA vendredi envoyés');
      } catch (error) {
        console.error('❌ Erreur rappels vendredi:', error);
      }
    }, {
      timezone: 'Africa/Kinshasa'
    });

    console.log('✓ Cron job: Rappels hebdomadaires TELEMA (Mercredi & Vendredi) activé');
  }

  // ===== 02:00 - VÉRIFICATION ÉLIGIBILITÉ SERVICES (AUTO-ACTIVATION) =====
  private setupServiceEligibilityCheck(): void {
    // Vérifier chaque jour à 2h du matin pour mettre à jour les statuts d'éligibilité
    cron.schedule('0 2 * * *', async () => {
      console.log('⏰ [02:00] Vérification éligibilité services pour tous les clients...');

      try {
        // Récupérer tous les clients actifs
        const customers = await db.query.customers.findMany({
          where: sql`status = 'ACTIVE'`
        });

        let eligibilityUpdates = 0;
        let newlyEligible = 0;

        for (const customer of customers) {
          try {
            // Vérifier éligibilité pour chaque service
            const [bombeElig, telemaElig, mopaoElig, vimbisaElig] = await Promise.all([
              this.bombeService.checkEligibility(customer.id, 50).catch(() => ({ eligible: false, reasons: [] })),
              this.telemaService.checkEligibility(customer.id, 500).catch(() => ({ eligible: false, reasons: [] })),
              // Note: MOPAO et VIMBISA nécessitent des services supplémentaires
              Promise.resolve({ eligible: false, reasons: ['Service non implémenté'] }),
              Promise.resolve({ eligible: false, reasons: ['Service non implémenté'] })
            ]);

            // Compter les nouveaux éligibles (logique simplifiée)
            if (bombeElig.eligible || telemaElig.eligible || mopaoElig.eligible || vimbisaElig.eligible) {
              newlyEligible++;
            }

            eligibilityUpdates++;

            // Optionnel: Stocker l'état d'éligibilité en cache ou en base
            // Pour notifier les clients quand ils deviennent éligibles
            
          } catch (customerError) {
            console.error(`  ❌ Erreur vérification client ${customer.id}:`, customerError);
          }
        }

        console.log(`✅ [02:00] Éligibilité vérifiée pour ${eligibilityUpdates} clients`);
        console.log(`  🎉 ${newlyEligible} clients éligibles à au moins un service`);
      } catch (error) {
        console.error('❌ [02:00] Erreur vérification éligibilité:', error);
      }
    }, {
      timezone: 'Africa/Kinshasa'
    });

    console.log('✓ Cron job: Vérification éligibilité services (02:00) activé');
  }

  // ===== HELPERS: INTÉGRATIONS EXTERNES =====
  private async sendSMS(customerId: number, message: string): Promise<void> {
    // TODO: Intégration Africa's Talking ou autre service SMS
    console.log(`📱 SMS → Client ${customerId}: ${message.substring(0, 50)}...`);
  }

  private async sendEmail(customerId: number, subject: string, body: string): Promise<void> {
    // TODO: Intégration service email (déjà implémenté dans email.service.ts)
    console.log(`📧 Email → Client ${customerId}: ${subject}`);
  }
}

// Export instance singleton
export const creditCronJobs = new CreditCronJobs();
