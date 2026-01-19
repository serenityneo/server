/**
 * Seed Script for Service Conditions
 * Populates service_conditions table with conditions for all 5 credit services:
 * - BOMBE: Crédit Découvert Quotidien
 * - TELEMA: Crédit Individuel Mensuel
 * - MOPAO: Crédit Parrainage GOLD
 * - VIMBISA: Crédit Saisonnier CDF
 * - LIKELEMBA: Crédit Épargne de Groupe
 * 
 * Based on CREDIT_SYSTEM_USER_GUIDE.md specifications
 * 
 * Usage: npx ts-node src/scripts/seed-service-conditions.ts
 */

import { db } from '../db';
import { serviceConditions } from '../db/schema';

// Service condition definitions from CREDIT_SYSTEM_USER_GUIDE.md
const conditions = [
  // ========== BOMBE: Crédit Découvert Quotidien ==========
  {
    serviceCode: 'BOMBE',
    conditionType: 'ELIGIBILITY',
    conditionKey: 's02_min_balance',
    conditionLabel: 'Solde S02 minimum 50%',
    conditionDescription: 'Le solde du compte Épargne Obligatoire (S02) doit être au minimum 50% du montant de crédit demandé.',
    operator: 'GREATER_THAN_OR_EQUAL',
    requiredValue: { percentage: 50, of: 'requested_amount', account: 'S02' },
    weight: 25,
    displayOrder: 1,
    isMandatory: true
  },
  {
    serviceCode: 'BOMBE',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'deposit_days',
    conditionLabel: '26 jours de dépôts consécutifs',
    conditionDescription: 'Vous devez avoir effectué des dépôts dans votre compte S02 pendant au moins 26 jours consécutifs.',
    operator: 'GREATER_THAN_OR_EQUAL',
    requiredValue: { days: 26, account: 'S02', type: 'consecutive_deposits' },
    weight: 25,
    displayOrder: 2,
    isMandatory: true
  },
  {
    serviceCode: 'BOMBE',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'no_default',
    conditionLabel: 'Aucun défaut récent',
    conditionDescription: 'Aucun défaut de paiement au cours des 6 derniers mois.',
    operator: 'EQUALS',
    requiredValue: { count: 0, period_months: 6 },
    weight: 25,
    displayOrder: 3,
    isMandatory: true
  },
  {
    serviceCode: 'BOMBE',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'not_in_prison',
    conditionLabel: 'Pas en prison virtuelle',
    conditionDescription: 'Le client ne doit pas être actuellement en prison virtuelle (blocage suite à défaut).',
    operator: 'EQUALS',
    requiredValue: { in_virtual_prison: false },
    weight: 25,
    displayOrder: 4,
    isMandatory: true
  },
  {
    serviceCode: 'BOMBE',
    conditionType: 'AMOUNT_RANGE',
    conditionKey: 'amount_range',
    conditionLabel: 'Montant: 10$ à 100$',
    conditionDescription: 'Le montant du crédit BOMBÉ doit être compris entre 10$ et 100$.',
    operator: 'BETWEEN',
    requiredValue: { min: 10, max: 100, currency: 'USD' },
    weight: 0,
    displayOrder: 5,
    isMandatory: true
  },
  {
    serviceCode: 'BOMBE',
    conditionType: 'REQUIREMENT',
    conditionKey: 'caution_30',
    conditionLabel: 'Caution 30% bloquée',
    conditionDescription: '30% du montant du crédit sera bloqué en caution dans votre compte S03 jusqu\'au remboursement complet.',
    operator: 'EQUALS',
    requiredValue: { percentage: 30, destination: 'S03', status: 'blocked' },
    weight: 0,
    displayOrder: 6,
    isMandatory: true
  },
  {
    serviceCode: 'BOMBE',
    conditionType: 'FEES',
    conditionKey: 'processing_fee',
    conditionLabel: 'Frais de traitement',
    conditionDescription: 'Frais de traitement: 2$ (10-20$), 4$ (21-50$), 8$ (51-100$)',
    operator: 'IN',
    requiredValue: { tiers: [{min: 10, max: 20, fee: 2}, {min: 21, max: 50, fee: 4}, {min: 51, max: 100, fee: 8}], currency: 'USD' },
    weight: 0,
    displayOrder: 7,
    isMandatory: true
  },
  {
    serviceCode: 'BOMBE',
    conditionType: 'DURATION',
    conditionKey: 'duration',
    conditionLabel: 'Durée: 1 jour',
    conditionDescription: 'Le crédit BOMBÉ est un découvert quotidien. Remboursement avant 23h59 le jour même.',
    operator: 'EQUALS',
    requiredValue: { days: 1, deadline_hour: 23, deadline_minute: 59 },
    weight: 0,
    displayOrder: 8,
    isMandatory: true
  },

  // ========== TELEMA: Crédit Individuel Mensuel ==========
  {
    serviceCode: 'TELEMA',
    conditionType: 'ELIGIBILITY',
    conditionKey: 's02_min_balance',
    conditionLabel: 'Solde S02 minimum 30%',
    conditionDescription: 'Le solde du compte Épargne Obligatoire (S02) doit être au minimum 30% du montant demandé.',
    operator: 'GREATER_THAN_OR_EQUAL',
    requiredValue: { percentage: 30, of: 'requested_amount', account: 'S02' },
    weight: 20,
    displayOrder: 1,
    isMandatory: true
  },
  {
    serviceCode: 'TELEMA',
    conditionType: 'ELIGIBILITY',
    conditionKey: 's02_history',
    conditionLabel: 'Historique S02 de 3 mois',
    conditionDescription: 'Historique de dépôts dans le compte S02 depuis au moins 3 mois.',
    operator: 'GREATER_THAN_OR_EQUAL',
    requiredValue: { months: 3, account: 'S02', type: 'deposit_history' },
    weight: 20,
    displayOrder: 2,
    isMandatory: true
  },
  {
    serviceCode: 'TELEMA',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'kyc_level',
    conditionLabel: 'KYC Niveau 2 validé',
    conditionDescription: 'Le client doit avoir complété et validé le niveau KYC 2.',
    operator: 'IN',
    requiredValue: { values: ['KYC2_VERIFIED', 'KYC2_UNDER_REVIEW'] },
    weight: 20,
    displayOrder: 3,
    isMandatory: true
  },
  {
    serviceCode: 'TELEMA',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'credit_score',
    conditionLabel: 'Score crédit ≥ 70%',
    conditionDescription: 'Le score de crédit du client doit être d\'au moins 70%.',
    operator: 'GREATER_THAN_OR_EQUAL',
    requiredValue: { score: 70 },
    weight: 20,
    displayOrder: 4,
    isMandatory: true
  },
  {
    serviceCode: 'TELEMA',
    conditionType: 'REQUIREMENT',
    conditionKey: 'caution_20',
    conditionLabel: 'Caution 20% bloquée',
    conditionDescription: '20% du montant sera bloqué en caution dans le compte S03.',
    operator: 'EQUALS',
    requiredValue: { percentage: 20, destination: 'S03', status: 'blocked' },
    weight: 20,
    displayOrder: 5,
    isMandatory: true
  },
  {
    serviceCode: 'TELEMA',
    conditionType: 'AMOUNT_RANGE',
    conditionKey: 'amount_range',
    conditionLabel: 'Montant: 200$ à 1,500$',
    conditionDescription: 'Le montant du crédit TELEMA doit être compris entre 200$ et 1,500$.',
    operator: 'BETWEEN',
    requiredValue: { min: 200, max: 1500, currency: 'USD' },
    weight: 0,
    displayOrder: 6,
    isMandatory: true
  },
  {
    serviceCode: 'TELEMA',
    conditionType: 'DURATION',
    conditionKey: 'duration',
    conditionLabel: 'Durée: 6, 9 ou 12 mois',
    conditionDescription: 'Choisissez une durée de remboursement parmi les options disponibles.',
    operator: 'IN',
    requiredValue: { values: [6, 9, 12], unit: 'months' },
    weight: 0,
    displayOrder: 7,
    isMandatory: true
  },
  {
    serviceCode: 'TELEMA',
    conditionType: 'INTEREST',
    conditionKey: 'interest_rate',
    conditionLabel: 'Intérêt mensuel',
    conditionDescription: 'Taux d\'intérêt: 1.5%/mois (6 mois), 1.3%/mois (9 mois), 1.2%/mois (12 mois)',
    operator: 'IN',
    requiredValue: { rates: [{months: 6, rate: 1.5}, {months: 9, rate: 1.3}, {months: 12, rate: 1.2}] },
    weight: 0,
    displayOrder: 8,
    isMandatory: true
  },

  // ========== MOPAO: Crédit Parrainage GOLD ==========
  {
    serviceCode: 'MOPAO',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'beneficiary_kyc',
    conditionLabel: 'Bénéficiaire: KYC Niveau 1 minimum',
    conditionDescription: 'Le bénéficiaire doit avoir au minimum le niveau KYC 1 complété.',
    operator: 'IN',
    requiredValue: { values: ['KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED'] },
    weight: 20,
    displayOrder: 1,
    isMandatory: true
  },
  {
    serviceCode: 'MOPAO',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'sponsor_category',
    conditionLabel: 'Parrain: Catégorie GOLD',
    conditionDescription: 'Le parrain doit être un client de catégorie GOLD.',
    operator: 'EQUALS',
    requiredValue: { category: 'GOLD', role: 'sponsor' },
    weight: 25,
    displayOrder: 2,
    isMandatory: true
  },
  {
    serviceCode: 'MOPAO',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'sponsor_s02_balance',
    conditionLabel: 'Parrain: Solde S02 ≥ 40% du montant',
    conditionDescription: 'Le parrain doit avoir un solde S02 d\'au moins 40% du montant demandé.',
    operator: 'GREATER_THAN_OR_EQUAL',
    requiredValue: { percentage: 40, of: 'requested_amount', account: 'S02', role: 'sponsor' },
    weight: 25,
    displayOrder: 3,
    isMandatory: true
  },
  {
    serviceCode: 'MOPAO',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'sponsor_no_default',
    conditionLabel: 'Parrain: Aucun défaut historique',
    conditionDescription: 'Le parrain ne doit avoir aucun défaut de paiement dans son historique.',
    operator: 'EQUALS',
    requiredValue: { count: 0, period: 'all_time', role: 'sponsor' },
    weight: 20,
    displayOrder: 4,
    isMandatory: true
  },
  {
    serviceCode: 'MOPAO',
    conditionType: 'REQUIREMENT',
    conditionKey: 'beneficiary_caution',
    conditionLabel: 'Caution bénéficiaire: 10%',
    conditionDescription: '10% du montant sera bloqué en caution sur le compte S03 du bénéficiaire.',
    operator: 'EQUALS',
    requiredValue: { percentage: 10, destination: 'S03', role: 'beneficiary' },
    weight: 10,
    displayOrder: 5,
    isMandatory: true
  },
  {
    serviceCode: 'MOPAO',
    conditionType: 'REQUIREMENT',
    conditionKey: 'sponsor_guarantee',
    conditionLabel: 'Garantie parrain: 40% bloqué',
    conditionDescription: '40% du montant sera bloqué dans le compte S02 du parrain comme garantie.',
    operator: 'EQUALS',
    requiredValue: { percentage: 40, destination: 'S02', role: 'sponsor', status: 'blocked' },
    weight: 0,
    displayOrder: 6,
    isMandatory: true
  },
  {
    serviceCode: 'MOPAO',
    conditionType: 'AMOUNT_RANGE',
    conditionKey: 'amount_range',
    conditionLabel: 'Montant: 200$ à 1,500$',
    conditionDescription: 'Le montant du crédit MOPAO doit être compris entre 200$ et 1,500$.',
    operator: 'BETWEEN',
    requiredValue: { min: 200, max: 1500, currency: 'USD' },
    weight: 0,
    displayOrder: 7,
    isMandatory: true
  },
  {
    serviceCode: 'MOPAO',
    conditionType: 'DURATION',
    conditionKey: 'duration',
    conditionLabel: 'Durée: 3 à 12 mois',
    conditionDescription: 'Durée de remboursement entre 3 et 12 mois.',
    operator: 'BETWEEN',
    requiredValue: { min: 3, max: 12, unit: 'months' },
    weight: 0,
    displayOrder: 8,
    isMandatory: true
  },

  // ========== VIMBISA: Crédit Saisonnier CDF ==========
  {
    serviceCode: 'VIMBISA',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'agricultural_activity',
    conditionLabel: 'Activité agricole prouvée',
    conditionDescription: 'Le client doit prouver une activité agricole (documents ou visite terrain).',
    operator: 'EQUALS',
    requiredValue: { verified: true, type: 'agricultural' },
    weight: 30,
    displayOrder: 1,
    isMandatory: true
  },
  {
    serviceCode: 'VIMBISA',
    conditionType: 'ELIGIBILITY',
    conditionKey: 's02_cdf_balance',
    conditionLabel: 'Solde S02 CDF ≥ 30% du montant',
    conditionDescription: 'Le solde S02 en CDF doit être au minimum 30% du montant demandé.',
    operator: 'GREATER_THAN_OR_EQUAL',
    requiredValue: { percentage: 30, of: 'requested_amount', account: 'S02', currency: 'CDF' },
    weight: 25,
    displayOrder: 2,
    isMandatory: true
  },
  {
    serviceCode: 'VIMBISA',
    conditionType: 'REQUIREMENT',
    conditionKey: 'caution_25',
    conditionLabel: 'Caution 25% bloquée',
    conditionDescription: '25% du montant sera bloqué en caution dans le compte S03.',
    operator: 'EQUALS',
    requiredValue: { percentage: 25, destination: 'S03', currency: 'CDF' },
    weight: 25,
    displayOrder: 3,
    isMandatory: true
  },
  {
    serviceCode: 'VIMBISA',
    conditionType: 'REQUIREMENT',
    conditionKey: 'harvest_guarantee',
    conditionLabel: 'Garantie récolte',
    conditionDescription: 'Une garantie sur la récolte future doit être fournie.',
    operator: 'EQUALS',
    requiredValue: { type: 'harvest_guarantee', required: true },
    weight: 20,
    displayOrder: 4,
    isMandatory: true
  },
  {
    serviceCode: 'VIMBISA',
    conditionType: 'AMOUNT_RANGE',
    conditionKey: 'amount_range',
    conditionLabel: 'Montant: 50,000 FC à 200,000 FC',
    conditionDescription: 'Le montant du crédit VIMBISA doit être compris entre 50,000 FC et 200,000 FC.',
    operator: 'BETWEEN',
    requiredValue: { min: 50000, max: 200000, currency: 'CDF' },
    weight: 0,
    displayOrder: 5,
    isMandatory: true
  },
  {
    serviceCode: 'VIMBISA',
    conditionType: 'DURATION',
    conditionKey: 'duration',
    conditionLabel: 'Durée: 10 semaines',
    conditionDescription: 'Le crédit est remboursé sur une saison agricole de 10 semaines.',
    operator: 'EQUALS',
    requiredValue: { weeks: 10, frequency: 'weekly' },
    weight: 0,
    displayOrder: 6,
    isMandatory: true
  },
  {
    serviceCode: 'VIMBISA',
    conditionType: 'INTEREST',
    conditionKey: 'interest_rate',
    conditionLabel: 'Intérêt: 0% (frais fixes)',
    conditionDescription: 'Pas d\'intérêt, mais frais fixes selon le montant.',
    operator: 'EQUALS',
    requiredValue: { rate: 0, fees: [{amount: 50000, fee: 5000}, {amount: 100000, fee: 8000}, {amount: 150000, fee: 10000}, {amount: 200000, fee: 12000}] },
    weight: 0,
    displayOrder: 7,
    isMandatory: true
  },

  // ========== LIKELEMBA: Crédit Épargne de Groupe ==========
  {
    serviceCode: 'LIKELEMBA',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'group_membership',
    conditionLabel: 'Membre d\'un groupe constitué',
    conditionDescription: 'Le client doit être membre d\'un groupe Likélemba constitué (5-20 membres).',
    operator: 'BETWEEN',
    requiredValue: { min_members: 5, max_members: 20, type: 'group' },
    weight: 30,
    displayOrder: 1,
    isMandatory: true
  },
  {
    serviceCode: 'LIKELEMBA',
    conditionType: 'ELIGIBILITY',
    conditionKey: 's05_configured',
    conditionLabel: 'Compte S05 configuré',
    conditionDescription: 'Le compte Épargne Programmée (S05) doit être configuré avec une cotisation mensuelle.',
    operator: 'EQUALS',
    requiredValue: { account: 'S05', configured: true, periodicity: ['DAILY', 'WEEKLY', 'MONTHLY'] },
    weight: 25,
    displayOrder: 2,
    isMandatory: true
  },
  {
    serviceCode: 'LIKELEMBA',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'regular_contribution',
    conditionLabel: 'Cotisation mensuelle régulière',
    conditionDescription: 'Le membre doit avoir effectué ses cotisations régulièrement.',
    operator: 'EQUALS',
    requiredValue: { regular: true, min_contributions: 2 },
    weight: 25,
    displayOrder: 3,
    isMandatory: true
  },
  {
    serviceCode: 'LIKELEMBA',
    conditionType: 'ELIGIBILITY',
    conditionKey: 'group_vote',
    conditionLabel: 'Ordre de rotation voté',
    conditionDescription: 'L\'ordre de rotation du pot doit être établi par vote collectif ou tirage au sort.',
    operator: 'EQUALS',
    requiredValue: { rotation_defined: true, method: ['vote', 'random'] },
    weight: 20,
    displayOrder: 4,
    isMandatory: true
  },
  {
    serviceCode: 'LIKELEMBA',
    conditionType: 'DURATION',
    conditionKey: 'duration',
    conditionLabel: 'Durée: 12 mois (cycles)',
    conditionDescription: 'Le cycle Likélemba dure 12 mois avec rotation mensuelle du pot.',
    operator: 'EQUALS',
    requiredValue: { months: 12, cycle: 'monthly' },
    weight: 0,
    displayOrder: 5,
    isMandatory: true
  },
  {
    serviceCode: 'LIKELEMBA',
    conditionType: 'INTEREST',
    conditionKey: 'interest_rate',
    conditionLabel: 'Intérêt: 0.5%/mois',
    conditionDescription: 'Le taux d\'intérêt le plus bas de tous les produits de crédit.',
    operator: 'EQUALS',
    requiredValue: { rate: 0.5, period: 'monthly' },
    weight: 0,
    displayOrder: 6,
    isMandatory: true
  }
];

async function seedServiceConditions() {
  console.log('🌱 Seeding service conditions...\n');
  
  let inserted = 0;
  let skipped = 0;
  
  for (const condition of conditions) {
    try {
      await db.insert(serviceConditions).values({
        serviceCode: condition.serviceCode,
        conditionType: condition.conditionType,
        conditionKey: condition.conditionKey,
        conditionLabel: condition.conditionLabel,
        conditionDescription: condition.conditionDescription,
        operator: condition.operator as any,
        requiredValue: condition.requiredValue as any,
        weight: condition.weight,
        displayOrder: condition.displayOrder,
        isMandatory: condition.isMandatory,
        isActive: true
      });
      
      inserted++;
      console.log(`  ✅ ${condition.serviceCode} - ${condition.conditionKey}`);
    } catch (err: any) {
      if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
        skipped++;
        console.log(`  ⏭️  ${condition.serviceCode} - ${condition.conditionKey}: Already exists`);
      } else {
        console.error(`  ❌ ${condition.serviceCode} - ${condition.conditionKey}: ${err.message}`);
        skipped++;
      }
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  • Inserted: ${inserted}`);
  console.log(`  • Skipped: ${skipped}`);
  console.log(`  • Total: ${conditions.length}`);
  console.log('\n✅ Seed completed!');
  console.log('\n📋 Services configured:');
  console.log('   • BOMBE (8 conditions) - Crédit Découvert Quotidien');
  console.log('   • TELEMA (8 conditions) - Crédit Individuel Mensuel');
  console.log('   • MOPAO (8 conditions) - Crédit Parrainage GOLD');
  console.log('   • VIMBISA (7 conditions) - Crédit Saisonnier CDF');
  console.log('   • LIKELEMBA (6 conditions) - Crédit Épargne de Groupe');
}

// Execute
seedServiceConditions()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
