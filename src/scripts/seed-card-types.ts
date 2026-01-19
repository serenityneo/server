/**
 * Seed Script: Card Types
 * Creates initial card types catalog
 * 
 * Usage: npx tsx src/scripts/seed-card-types.ts
 */

import { db } from '../db';
import { cardTypes } from '../db/card-schema';

async function seedCardTypes() {
  console.log('🌱 Seeding card types...');

  const types = [
    {
      code: 'STANDARD',
      name: 'Carte Standard',
      description: 'Carte de membre Serenity Bank standard. Accès aux services de base.',
      priceUsd: '5.00',
      priceCdf: '12500.00',
      cardColor: '#5C4033',
      features: JSON.stringify([
        'Identification membre',
        'Accès aux agences',
        'Transactions de base'
      ]),
      isActive: true,
      displayOrder: 1
    },
    {
      code: 'PREMIUM',
      name: 'Carte Premium',
      description: 'Carte premium avec avantages supplémentaires et design exclusif.',
      priceUsd: '15.00',
      priceCdf: '37500.00',
      cardColor: '#C1A285',
      features: JSON.stringify([
        'Identification membre',
        'Accès prioritaire aux agences',
        'Design premium exclusif',
        'Limites de transaction élevées',
        'Support prioritaire'
      ]),
      isActive: true,
      displayOrder: 2
    },
    {
      code: 'GOLD',
      name: 'Carte Gold',
      description: 'Carte exclusive pour les membres GOLD avec tous les avantages.',
      priceUsd: '25.00',
      priceCdf: '62500.00',
      cardColor: '#FFD700',
      features: JSON.stringify([
        'Identification membre GOLD',
        'Accès VIP aux agences',
        'Design Gold exclusif',
        'Limites de transaction maximales',
        'Support VIP 24/7',
        'Frais réduits sur transactions',
        'Avantages partenaires'
      ]),
      isActive: true,
      displayOrder: 3
    }
  ];

  for (const type of types) {
    try {
      // Upsert - update if exists, insert if not
      await db.insert(cardTypes).values(type).onConflictDoUpdate({
        target: cardTypes.code,
        set: {
          name: type.name,
          description: type.description,
          priceUsd: type.priceUsd,
          priceCdf: type.priceCdf,
          cardColor: type.cardColor,
          features: type.features,
          isActive: type.isActive,
          displayOrder: type.displayOrder
        }
      });
      console.log(`✅ ${type.code} - ${type.name} (${type.priceUsd} USD)`);
    } catch (error) {
      console.error(`❌ Error seeding ${type.code}:`, error);
    }
  }

  console.log('\n✨ Card types seeding completed!');
  console.log('\n📊 Summary:');
  console.log('- STANDARD: 5 USD - Basic member card');
  console.log('- PREMIUM: 15 USD - Premium card with benefits');
  console.log('- GOLD: 25 USD - Exclusive Gold member card');
}

seedCardTypes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
