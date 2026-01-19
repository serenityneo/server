/**
 * SEED: Account Types (S01-S06) with LONG codes
 * 
 * This script seeds the account_types table with the 6 standard account types.
 * Uses LONG codes (S01_STANDARD, S02_MANDATORY_SAVINGS, etc.) to match
 * the application ENUM format.
 * 
 * Run with: npx tsx src/scripts/seed-account-types-long.ts
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

interface AccountType {
  code: string;
  name: string;
  description: string;
}

const ACCOUNT_TYPES: AccountType[] = [
  {
    code: 'S01_STANDARD',
    name: 'Compte Standard',
    description: 'Compte courant pour dépôts et retraits réguliers'
  },
  {
    code: 'S02_MANDATORY_SAVINGS',
    name: 'Épargne Obligatoire',
    description: 'Compte d\'épargne conditionnant l\'éligibilité aux crédits'
  },
  {
    code: 'S03_CAUTION',
    name: 'Caution',
    description: 'Garantie financière associée aux crédits'
  },
  {
    code: 'S04_CREDIT',
    name: 'Crédit',
    description: 'Compte crédité à l\'octroi et débité aux remboursements'
  },
  {
    code: 'S05_BWAKISA_CARTE',
    name: 'Bwakisa Carte',
    description: 'Service d\'assistance pour épargne régulière (objectif/maturité)'
  },
  {
    code: 'S06_FINES',
    name: 'Amendes',
    description: 'Compte pour pénalités et amendes liées aux crédits'
  }
];

async function seedAccountTypes() {
  console.log('🌱 Seeding Account Types (Long Codes)...\n');

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const accountType of ACCOUNT_TYPES) {
    try {
      // Check if already exists
      const existing = await db.execute(sql`
        SELECT id FROM account_types 
        WHERE code = ${accountType.code}
        LIMIT 1
      `);

      if ((existing as any).rows?.length > 0) {
        console.log(`  ⚠️  ${accountType.code}: Already exists`);
        skipped++;
        continue;
      }

      // Insert
      await db.execute(sql`
        INSERT INTO account_types (
          code, 
          name, 
          description,
          is_system,
          is_active,
          min_balance_cdf,
          min_balance_usd,
          created_at
        ) VALUES (
          ${accountType.code},
          ${accountType.name},
          ${accountType.description},
          true,
          true,
          0,
          0,
          NOW()
        )
      `);

      console.log(`  ✅ ${accountType.code}: ${accountType.name}`);
      inserted++;
    } catch (error: any) {
      console.error(`  ❌ ${accountType.code} - Error: ${error.message}`);
      errors++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`  • Inserted: ${inserted}`);
  console.log(`  • Skipped (already exists): ${skipped}`);
  console.log(`  • Errors: ${errors}`);
  console.log('\n✅ Account Types seed completed!');
}

seedAccountTypes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
