/**
 * SEED: Account Type Conditions for S01-S06
 * 
 * This script seeds the account_type_conditions table with activation
 * and eligibility conditions for each account type.
 * 
 * IMPORTANT: Uses LONG codes (S01_STANDARD, S02_MANDATORY_SAVINGS, etc.)
 * to match the account_types table format.
 * 
 * Run with: npx tsx src/scripts/seed-account-type-conditions.ts
 */

import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

interface Condition {
  account_type_code: string;
  condition_type: 'ACTIVATION' | 'ELIGIBILITY' | 'REQUIREMENT' | 'RESTRICTION';
  condition_label: string;
  condition_description: string;
  display_order: number;
  is_active: boolean;
}

const CONDITIONS: Condition[] = [
  // ========== S01_STANDARD - Compte Standard ==========
  {
    account_type_code: 'S01_STANDARD',
    condition_type: 'ACTIVATION',
    condition_label: 'Activation automatique à l\'inscription',
    condition_description: 'Le compte S01 est créé et activé automatiquement lors de l\'inscription du client. Aucune action supplémentaire requise.',
    display_order: 1,
    is_active: true
  },
  {
    account_type_code: 'S01_STANDARD',
    condition_type: 'REQUIREMENT',
    condition_label: 'KYC niveau 1 minimum',
    condition_description: 'Le client doit avoir complété au minimum le niveau KYC1 pour utiliser le compte.',
    display_order: 2,
    is_active: true
  },
  {
    account_type_code: 'S01_STANDARD',
    condition_type: 'ELIGIBILITY',
    condition_label: 'Opérations gratuites',
    condition_description: 'Dépôts et retraits gratuits. Frais mensuels de tenue de compte: 1$ USD.',
    display_order: 3,
    is_active: true
  },

  // ========== S02_MANDATORY_SAVINGS - Épargne Obligatoire ==========
  {
    account_type_code: 'S02_MANDATORY_SAVINGS',
    condition_type: 'ACTIVATION',
    condition_label: 'Activation sur premier dépôt',
    condition_description: 'Le compte S02 est activé automatiquement lors du premier dépôt d\'épargne.',
    display_order: 1,
    is_active: true
  },
  {
    account_type_code: 'S02_MANDATORY_SAVINGS',
    condition_type: 'REQUIREMENT',
    condition_label: 'Dépôt minimum pour éligibilité crédit',
    condition_description: 'Un solde minimum est requis pour être éligible aux services de crédit (BOMBÉ, TELEMA, MOPAO).',
    display_order: 2,
    is_active: true
  },
  {
    account_type_code: 'S02_MANDATORY_SAVINGS',
    condition_type: 'RESTRICTION',
    condition_label: 'Pas de retrait direct',
    condition_description: 'Les retraits directs sont interdits. Transfert vers S01 obligatoire avec frais (0.2$).',
    display_order: 3,
    is_active: true
  },
  {
    account_type_code: 'S02_MANDATORY_SAVINGS',
    condition_type: 'ELIGIBILITY',
    condition_label: 'Condition pour services crédit',
    condition_description: 'Solde S02 ≥ 30% du montant demandé pour être éligible aux crédits.',
    display_order: 4,
    is_active: true
  },

  // ========== S03_CAUTION - Compte Caution ==========
  {
    account_type_code: 'S03_CAUTION',
    condition_type: 'ACTIVATION',
    condition_label: 'Activation lors d\'une demande de crédit',
    condition_description: 'Le compte S03 est activé automatiquement lors de l\'approbation d\'une demande de crédit nécessitant une caution.',
    display_order: 1,
    is_active: true
  },
  {
    account_type_code: 'S03_CAUTION',
    condition_type: 'REQUIREMENT',
    condition_label: 'Caution obligatoire pour crédit',
    condition_description: 'Un pourcentage du crédit doit être déposé en garantie (généralement 5-10%).',
    display_order: 2,
    is_active: true
  },
  {
    account_type_code: 'S03_CAUTION',
    condition_type: 'RESTRICTION',
    condition_label: 'Fonds bloqués',
    condition_description: 'Aucun retrait ni transfert possible. Libération uniquement après remboursement total du crédit.',
    display_order: 3,
    is_active: true
  },

  // ========== S04_CREDIT - Compte Crédit ==========
  {
    account_type_code: 'S04_CREDIT',
    condition_type: 'ACTIVATION',
    condition_label: 'Activation sur décaissement crédit',
    condition_description: 'Le compte S04 est activé lors du décaissement d\'un crédit approuvé.',
    display_order: 1,
    is_active: true
  },
  {
    account_type_code: 'S04_CREDIT',
    condition_type: 'REQUIREMENT',
    condition_label: 'Éligibilité crédit validée',
    condition_description: 'Le client doit avoir passé toutes les vérifications d\'éligibilité pour son type de crédit.',
    display_order: 2,
    is_active: true
  },
  {
    account_type_code: 'S04_CREDIT',
    condition_type: 'ELIGIBILITY',
    condition_label: 'Échéancier de remboursement',
    condition_description: 'Un échéancier automatique est créé avec les dates et montants des remboursements.',
    display_order: 3,
    is_active: true
  },

  // ========== S05_BWAKISA_CARTE - Bwakisa Carte ==========
  {
    account_type_code: 'S05_BWAKISA_CARTE',
    condition_type: 'ACTIVATION',
    condition_label: 'Activation sur configuration Bwakisa',
    condition_description: 'Le compte S05 est activé lorsque le client configure un objectif d\'épargne Bwakisa.',
    display_order: 1,
    is_active: true
  },
  {
    account_type_code: 'S05_BWAKISA_CARTE',
    condition_type: 'REQUIREMENT',
    condition_label: 'Objectif et durée définis',
    condition_description: 'Le client doit définir un objectif d\'épargne et une date de maturité.',
    display_order: 2,
    is_active: true
  },
  {
    account_type_code: 'S05_BWAKISA_CARTE',
    condition_type: 'ELIGIBILITY',
    condition_label: 'Épargne régulière',
    condition_description: 'Dépôts quotidiens/hebdomadaires recommandés pour atteindre l\'objectif.',
    display_order: 3,
    is_active: true
  },

  // ========== S06_FINES - Compte Amendes ==========
  {
    account_type_code: 'S06_FINES',
    condition_type: 'ACTIVATION',
    condition_label: 'Activation automatique sur pénalité',
    condition_description: 'Le compte S06 est activé automatiquement si un retard de paiement génère une pénalité.',
    display_order: 1,
    is_active: true
  },
  {
    account_type_code: 'S06_FINES',
    condition_type: 'REQUIREMENT',
    condition_label: 'Paiement prioritaire des amendes',
    condition_description: 'Les amendes doivent être payées avant tout nouveau décaissement de crédit.',
    display_order: 2,
    is_active: true
  },
  {
    account_type_code: 'S06_FINES',
    condition_type: 'RESTRICTION',
    condition_label: 'Pas de retrait possible',
    condition_description: 'Le solde des amendes ne peut être que crédité (par pénalités) et débité (par paiement).',
    display_order: 3,
    is_active: true
  }
];

async function seedConditions() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found!');
    process.exit(1);
  }

  const client = postgres(dbUrl, { prepare: false });
  console.log('🌱 Seeding Account Type Conditions...\n');

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const condition of CONDITIONS) {
    try {
      // Check if condition already exists
      const existing = await client`
        SELECT id FROM account_type_conditions 
        WHERE account_type_code = ${condition.account_type_code}
        AND condition_label = ${condition.condition_label}
        LIMIT 1
      `;

      if (existing.length > 0) {
        console.log(`  ⚠️  ${condition.account_type_code} - ${condition.condition_type}: Already exists`);
        skipped++;
        continue;
      }

      // Insert new condition
      await client`
        INSERT INTO account_type_conditions (
          account_type_code, 
          condition_type, 
          condition_label, 
          condition_description, 
          display_order, 
          is_active,
          created_at,
          updated_at
        ) VALUES (
          ${condition.account_type_code},
          ${condition.condition_type},
          ${condition.condition_label},
          ${condition.condition_description},
          ${condition.display_order},
          ${condition.is_active},
          NOW(),
          NOW()
        )
      `;

      console.log(`  ✅ ${condition.account_type_code} - ${condition.condition_type}: ${condition.condition_label}`);
      inserted++;
    } catch (error: any) {
      console.error(`  ❌ ${condition.account_type_code} - Error: ${error.message}`);
      errors++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`  • Inserted: ${inserted}`);
  console.log(`  • Skipped (already exists): ${skipped}`);
  console.log(`  • Errors: ${errors}`);
  console.log(`  • Total conditions: ${CONDITIONS.length}`);
  console.log('\n✅ Seed completed!');
  
  await client.end();
}

seedConditions()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
