import { db } from '../db';
import { accountTypeConditions } from '../db/schema';

/**
 * Script de seed pour les conditions d'activation des types de comptes
 * À exécuter après seed-account-types.ts
 * 
 * Usage: npx tsx src/scripts/seed-account-conditions.ts
 */

async function seedAccountConditions() {
  console.log('🌱 Seeding account type conditions...');

  const conditions = [
    // ========== S01: COMPTE STANDARD ==========
    {
      accountTypeCode: 'S01',
      conditionType: 'ACTIVATION',
      conditionKey: 'auto_on_registration',
      conditionLabel: 'Activation automatique à l\'inscription',
      conditionDescription: 'Le compte S01 est créé et activé automatiquement lors de l\'inscription du client. Aucune action supplémentaire requise.',
      requiredValue: { auto: true },
      validationRule: 'customer.status === "ACTIVE"',
      displayOrder: 1
    },
    {
      accountTypeCode: 'S01',
      conditionType: 'REQUIREMENT',
      conditionKey: 'kyc_level',
      conditionLabel: 'Niveau KYC minimum: KYC1',
      conditionDescription: 'Le client doit avoir complété au minimum le niveau KYC1 pour utiliser le compte.',
      requiredValue: { min_level: 'KYC1_COMPLETED' },
      validationRule: 'customer.kycStatus >= "KYC1_COMPLETED"',
      displayOrder: 2
    },

    // ========== S02: ÉPARGNE OBLIGATOIRE ==========
    {
      accountTypeCode: 'S02',
      conditionType: 'ACTIVATION',
      conditionKey: 'first_deposit',
      conditionLabel: 'Premier dépôt effectué',
      conditionDescription: 'Le compte S02 s\'active automatiquement dès le premier dépôt, quel que soit le montant. Ce compte est obligatoire pour accéder aux services de crédit.',
      requiredValue: { min_amount: 1, currency: 'any' },
      validationRule: 'account.balance > 0',
      displayOrder: 1
    },
    {
      accountTypeCode: 'S02',
      conditionType: 'ELIGIBILITY',
      conditionKey: 'credit_eligibility',
      conditionLabel: 'Solde minimum pour éligibilité crédit',
      conditionDescription: 'Pour être éligible aux crédits, le solde S02 doit atteindre au moins 25 USD (ou équivalent CDF selon le taux de change).',
      requiredValue: { min_amount: 25, currency: 'USD', convertible: true },
      validationRule: 'account.balanceUSD >= 25',
      displayOrder: 2
    },
    {
      accountTypeCode: 'S02',
      conditionType: 'REQUIREMENT',
      conditionKey: 'deposit_duration',
      conditionLabel: 'Ancienneté des dépôts',
      conditionDescription: 'Les fonds doivent avoir été déposés depuis au moins 26 jours pour maximiser l\'éligibilité aux crédits.',
      requiredValue: { min_days: 26 },
      validationRule: 'daysSinceFirstDeposit >= 26',
      displayOrder: 3
    },

    // ========== S03: CAUTION ==========
    {
      accountTypeCode: 'S03',
      conditionType: 'ACTIVATION',
      conditionKey: 'credit_request_caution',
      conditionLabel: 'Création automatique lors de demande de crédit',
      conditionDescription: 'Le compte S03 est créé et activé automatiquement lorsqu\'un client demande un crédit. La caution est bloquée jusqu\'au remboursement complet.',
      requiredValue: { trigger: 'credit_application', status: 'blocked' },
      validationRule: 'creditApplication.status IN ("APPROVED", "DISBURSED")',
      displayOrder: 1
    },
    {
      accountTypeCode: 'S03',
      conditionType: 'REQUIREMENT',
      conditionKey: 'caution_percentage',
      conditionLabel: 'Montant de caution requis',
      conditionDescription: 'La caution représente généralement 10% du montant du crédit demandé. Ce montant est prélevé du compte S02 et bloqué dans le S03.',
      requiredValue: { percentage: 10, min_percentage: 5, max_percentage: 20 },
      validationRule: 'cautionAmount >= creditAmount * 0.10',
      displayOrder: 2
    },

    // ========== S04: CRÉDIT ==========
    {
      accountTypeCode: 'S04',
      conditionType: 'ACTIVATION',
      conditionKey: 'credit_disbursement',
      conditionLabel: 'Activation lors du décaissement du crédit',
      conditionDescription: 'Le compte S04 est créé et activé automatiquement lors du décaissement effectif du crédit. Le montant du crédit y est crédité.',
      requiredValue: { trigger: 'credit_disbursement' },
      validationRule: 'creditApplication.status === "DISBURSED"',
      displayOrder: 1
    },
    {
      accountTypeCode: 'S04',
      conditionType: 'REQUIREMENT',
      conditionKey: 'repayment_schedule',
      conditionLabel: 'Échéancier de remboursement',
      conditionDescription: 'Le crédit doit être remboursé selon l\'échéancier convenu (quotidien ou mensuel selon le produit). Les remboursements sont débités de ce compte.',
      requiredValue: { schedule_type: ['daily', 'monthly'] },
      validationRule: 'repaymentSchedule.isActive === true',
      displayOrder: 2
    },

    // ========== S05: BWAKISA CARTE ==========
    {
      accountTypeCode: 'S05',
      conditionType: 'ACTIVATION',
      conditionKey: 'manual_configuration',
      conditionLabel: 'Configuration manuelle requise',
      conditionDescription: 'Le compte S05 nécessite une configuration manuelle par le client : périodicité d\'épargne (quotidien/hebdomadaire/mensuel) et montant cible à atteindre.',
      requiredValue: { manual_setup: true, requires: ['periodicity', 'target_amount'] },
      validationRule: 'savingsConfig.periodicity !== null AND savingsConfig.targetAmount > 0',
      displayOrder: 1
    },
    {
      accountTypeCode: 'S05',
      conditionType: 'REQUIREMENT',
      conditionKey: 'savings_goal',
      conditionLabel: 'Objectif d\'épargne défini',
      conditionDescription: 'Le client doit définir un objectif d\'épargne (montant cible) et une périodicité de versement pour activer le service d\'assistance.',
      requiredValue: { min_target: 10, periodicity_options: ['daily', 'weekly', 'monthly'] },
      validationRule: 'savingsConfig.targetAmount >= 10',
      displayOrder: 2
    },

    // ========== S06: AMENDES ==========
    {
      accountTypeCode: 'S06',
      conditionType: 'ACTIVATION',
      conditionKey: 'payment_delay',
      conditionLabel: 'Activation en cas de retard de paiement',
      conditionDescription: 'Le compte S06 est créé et activé automatiquement si un retard de paiement est constaté sur un crédit actif. Les pénalités y sont enregistrées.',
      requiredValue: { trigger: 'payment_delay', delay_days: 1 },
      validationRule: 'creditPayment.daysLate > 0',
      displayOrder: 1
    },
    {
      accountTypeCode: 'S06',
      conditionType: 'REQUIREMENT',
      conditionKey: 'fine_payment',
      conditionLabel: 'Paiement des amendes obligatoire',
      conditionDescription: 'Les amendes accumulées doivent être payées en priorité avant tout autre remboursement. Le montant inclut les intérêts de retard et les pénalités.',
      requiredValue: { priority: 'high', auto_debit: true },
      validationRule: 'fineBalance === 0 OR paymentSchedule.includesFines === true',
      displayOrder: 2
    },
  ];

  let inserted = 0;
  let skipped = 0;

  for (const condition of conditions) {
    try {
      await db.insert(accountTypeConditions).values({
        accountTypeCode: condition.accountTypeCode,
        conditionType: condition.conditionType,
        conditionKey: condition.conditionKey,
        conditionLabel: condition.conditionLabel,
        conditionDescription: condition.conditionDescription,
        requiredValue: condition.requiredValue as any,
        validationRule: condition.validationRule,
        displayOrder: condition.displayOrder,
        isActive: true,
      });
      
      inserted++;
      console.log(`  ✅ ${condition.accountTypeCode} - ${condition.conditionKey}: ${condition.conditionLabel}`);
    } catch (err) {
      skipped++;
      console.log(`  ⚠️  ${condition.accountTypeCode} - ${condition.conditionKey}: Already exists or error`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  • Inserted: ${inserted}`);
  console.log(`  • Skipped: ${skipped}`);
  console.log(`  • Total: ${inserted + skipped}`);
  console.log('\n✅ Seed completed!');
}

// Execute
seedAccountConditions()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
