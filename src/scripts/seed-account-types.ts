import { db } from '../db';
import { accountTypes } from '../db/schema';

/**
 * Script de seed pour les types de comptes
 * À exécuter UNE SEULE FOIS lors de l'initialisation du système
 * 
 * Usage: npx tsx src/scripts/seed-account-types.ts
 */

async function seedAccountTypes() {
  console.log('🌱 Seeding account types...');

  const entries = [
    { 
      code: 'S01', 
      label: 'Compte Standard', 
      description: 'Compte courant pour dépôts et retraits réguliers', 
      currencies: ['CDF', 'USD'], 
      defaultStatus: 'ACTIVE' 
    },
    { 
      code: 'S02', 
      label: 'Épargne Obligatoire', 
      description: "Compte d'épargne conditionnant l'éligibilité aux crédits", 
      currencies: ['CDF', 'USD'], 
      defaultStatus: 'INACTIVE' 
    },
    { 
      code: 'S03', 
      label: 'Caution', 
      description: 'Garantie financière associée aux crédits', 
      currencies: ['CDF', 'USD'], 
      defaultStatus: 'INACTIVE' 
    },
    { 
      code: 'S04', 
      label: 'Crédit', 
      description: 'Compte crédité à l\'octroi et débité aux remboursements', 
      currencies: ['CDF', 'USD'], 
      defaultStatus: 'INACTIVE' 
    },
    { 
      code: 'S05', 
      label: 'Bwakisa Carte', 
      description: 'Service d\'assistance pour épargne régulière (objectif/maturité)', 
      currencies: ['CDF', 'USD'], 
      defaultStatus: 'INACTIVE' 
    },
    { 
      code: 'S06', 
      label: 'Amendes', 
      description: 'Paiement des amendes liées aux engagements de crédit', 
      currencies: ['CDF', 'USD'], 
      defaultStatus: 'INACTIVE' 
    },
  ];

  let inserted = 0;
  let skipped = 0;

  for (const entry of entries) {
    for (const curr of entry.currencies as ('CDF' | 'USD')[]) {
      try {
        await db.insert(accountTypes).values({
          code: entry.code,
          label: entry.label,
          description: entry.description,
          currency: curr,
          defaultStatus: entry.defaultStatus as any,
          allowedCurrencies: entry.currencies as any,
        }).onConflictDoNothing();
        
        inserted++;
        console.log(`  ✅ ${entry.code}-${curr}: ${entry.label}`);
      } catch (err) {
        skipped++;
        console.log(`  ⚠️  ${entry.code}-${curr}: Already exists`);
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  • Inserted: ${inserted}`);
  console.log(`  • Skipped: ${skipped}`);
  console.log(`  • Total: ${inserted + skipped}`);
  console.log('\n✅ Seed completed!');
}

// Execute
seedAccountTypes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
