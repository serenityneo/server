/**
 * Loyalty System Tables Migration
 * Creates tables for point types, rewards catalog, and redemptions
 * Uses existing serenityPointsLedger for point tracking
 */

import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function createLoyaltyTables() {
  console.log('🎁 Creating Loyalty System Tables...\n');

  try {
    // 1. Loyalty Point Types Configuration (Dynamic point types)
    console.log('📊 Creating loyalty_point_types table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS loyalty_point_types (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        label VARCHAR(100) NOT NULL,
        label_en VARCHAR(100),
        description TEXT,
        customer_type VARCHAR(20) NOT NULL, -- 'MEMBER', 'PARTNER', 'BOTH'
        points INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        conditions JSONB, -- Business rules for awarding
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_loyalty_point_types_customer_type ON loyalty_point_types(customer_type);
      CREATE INDEX IF NOT EXISTS idx_loyalty_point_types_active ON loyalty_point_types(is_active);
    `);
    console.log('✅ loyalty_point_types created\n');

    // 2. Loyalty Rewards Catalog (Products customers can exchange points for)
    console.log('🎁 Creating loyalty_rewards table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS loyalty_rewards (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        title VARCHAR(200) NOT NULL,
        title_en VARCHAR(200),
        description TEXT,
        image_url TEXT,
        required_points INTEGER NOT NULL,
        category VARCHAR(50), -- 'ELECTRONICS', 'VEHICLES', 'REAL_ESTATE', 'TRAVEL', 'SERVICES'
        stock_quantity INTEGER DEFAULT 0,
        is_available BOOLEAN DEFAULT true,
        display_order INTEGER DEFAULT 0,
        features JSONB, -- Product features/specs
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_category ON loyalty_rewards(category);
      CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_available ON loyalty_rewards(is_available);
      CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_points ON loyalty_rewards(required_points);
      CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_display_order ON loyalty_rewards(display_order);
    `);
    console.log('✅ loyalty_rewards created\n');

    // 3. Loyalty Redemptions (History of point exchanges)
    console.log('📦 Creating loyalty_redemptions table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS loyalty_redemptions (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        reward_id INTEGER NOT NULL REFERENCES loyalty_rewards(id) ON DELETE RESTRICT,
        points_used INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'PROCESSING', 'DELIVERED', 'CANCELLED'
        delivery_address TEXT,
        delivery_notes TEXT,
        customer_notes TEXT,
        approved_by INTEGER REFERENCES users(id),
        approved_at TIMESTAMP,
        cancelled_reason TEXT,
        cancelled_at TIMESTAMP,
        delivered_at TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_customer ON loyalty_redemptions(customer_id);
      CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_status ON loyalty_redemptions(status);
      CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_created_at ON loyalty_redemptions(created_at DESC);
    `);
    console.log('✅ loyalty_redemptions created\n');

    // 4. Seed Initial Point Types
    console.log('🌱 Seeding initial loyalty point types...');
    
    const memberPointTypes = [
      {
        code: 'WELCOME',
        label: 'Bonus de Bienvenue',
        label_en: 'Welcome Bonus',
        description: 'Point accordé lors de la création du compte',
        customer_type: 'MEMBER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'ACCOUNT_CREATION', excludeVirtual: true })
      },
      {
        code: 'CREDIT_MILESTONE_50',
        label: 'Jalon Crédit 50$',
        label_en: 'Credit Milestone $50',
        description: 'Point accordé chaque fois que le solde crédit atteint 50$ USD',
        customer_type: 'MEMBER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'CREDIT_BALANCE', threshold: 50, currency: 'USD' })
      },
      {
        code: 'GOLD_UPGRADE',
        label: 'Passage Gold',
        label_en: 'Gold Upgrade',
        description: 'Point accordé lors du passage en catégorie Gold',
        customer_type: 'MEMBER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'CATEGORY_UPGRADE', targetCategory: 'GOLD' })
      },
      {
        code: 'CREDIT_SUBSCRIPTION',
        label: 'Souscription Crédit',
        label_en: 'Credit Subscription',
        description: 'Point accordé lors de la souscription à un crédit',
        customer_type: 'MEMBER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'CREDIT_SUBSCRIPTION' })
      },
      {
        code: 'CREDIT_REPAYMENT',
        label: 'Remboursement Crédit',
        label_en: 'Credit Repayment',
        description: 'Point accordé à chaque paiement de remboursement',
        customer_type: 'MEMBER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'CREDIT_REPAYMENT', perPayment: true })
      }
    ];

    const partnerPointTypes = [
      {
        code: 'PARTNER_CLIENT_CREATION',
        label: 'Création Client',
        label_en: 'Client Creation',
        description: 'Point accordé lorsque l\'agent crée un nouveau client',
        customer_type: 'PARTNER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'CLIENT_CREATION' })
      },
      {
        code: 'PARTNER_APP_INSTALL',
        label: 'Installation App Mobile',
        label_en: 'Mobile App Install',
        description: 'Point lorsque le client installe l\'app mobile',
        customer_type: 'PARTNER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'APP_INSTALL' })
      },
      {
        code: 'PARTNER_FIRST_DEPOSIT',
        label: 'Premier Dépôt Client',
        label_en: 'Client First Deposit',
        description: 'Point au premier dépôt du client créé',
        customer_type: 'PARTNER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'FIRST_DEPOSIT' })
      },
      {
        code: 'PARTNER_DEPOSIT',
        label: 'Dépôt Client',
        label_en: 'Client Deposit',
        description: 'Point à chaque dépôt effectué par un client',
        customer_type: 'PARTNER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'DEPOSIT', recurring: true })
      },
      {
        code: 'PARTNER_CARD_REQUEST',
        label: 'Demande Carte',
        label_en: 'Card Request',
        description: 'Point lorsqu\'un client demande une carte Bwakisa',
        customer_type: 'PARTNER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'CARD_REQUEST' })
      },
      {
        code: 'PARTNER_KYC_COMPLETION',
        label: 'KYC Complété',
        label_en: 'KYC Completed',
        description: 'Point lorsqu\'un client complète son KYC',
        customer_type: 'PARTNER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'KYC_COMPLETION' })
      },
      {
        code: 'PARTNER_CLIENT_PAYMENT',
        label: 'Paiement Client',
        label_en: 'Client Payment',
        description: 'Point à chaque paiement effectué par un client',
        customer_type: 'PARTNER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'PAYMENT', recurring: true })
      },
      {
        code: 'PARTNER_CREDIT_QUALIFIED',
        label: 'Client Qualifié Crédit',
        label_en: 'Credit Qualified',
        description: 'Point lorsqu\'un client est qualifié pour un crédit',
        customer_type: 'PARTNER',
        points: 1,
        conditions: JSON.stringify({ trigger: 'CREDIT_QUALIFIED' })
      }
    ];

    for (const pointType of [...memberPointTypes, ...partnerPointTypes]) {
      await db.execute(sql`
        INSERT INTO loyalty_point_types (code, label, label_en, description, customer_type, points, conditions, is_active)
        VALUES (
          ${pointType.code},
          ${pointType.label},
          ${pointType.label_en},
          ${pointType.description},
          ${pointType.customer_type},
          ${pointType.points},
          ${pointType.conditions}::jsonb,
          true
        )
        ON CONFLICT (code) DO NOTHING;
      `);
    }
    console.log(`✅ Seeded ${memberPointTypes.length + partnerPointTypes.length} point types\n`);

    // 5. Seed Sample Rewards
    console.log('🎁 Seeding sample loyalty rewards...');
    
    const sampleRewards = [
      {
        code: 'SMARTPHONE_BASIC',
        title: 'Smartphone Entrée de Gamme',
        title_en: 'Entry-Level Smartphone',
        description: 'Smartphone Android 4G avec écran 6.5"',
        category: 'ELECTRONICS',
        required_points: 500,
        display_order: 1
      },
      {
        code: 'MOTORCYCLE_125CC',
        title: 'Moto 125cc',
        title_en: '125cc Motorcycle',
        description: 'Moto neuve 125cc, idéale pour vos déplacements',
        category: 'VEHICLES',
        required_points: 5000,
        display_order: 2
      },
      {
        code: 'LAND_PLOT',
        title: 'Parcelle de Terrain',
        title_en: 'Land Plot',
        description: 'Parcelle de 300m² en zone urbaine',
        category: 'REAL_ESTATE',
        required_points: 50000,
        display_order: 3
      },
      {
        code: 'HOUSE_BASIC',
        title: 'Maison Moderne',
        title_en: 'Modern House',
        description: 'Maison de 3 chambres avec salon, cuisine équipée',
        category: 'REAL_ESTATE',
        required_points: 200000,
        display_order: 4
      },
      {
        code: 'LAPTOP',
        title: 'Ordinateur Portable',
        title_en: 'Laptop Computer',
        description: 'PC portable 15.6", 8GB RAM, SSD 256GB',
        category: 'ELECTRONICS',
        required_points: 1500,
        display_order: 5
      }
    ];

    for (const reward of sampleRewards) {
      await db.execute(sql`
        INSERT INTO loyalty_rewards (code, title, title_en, description, category, required_points, display_order, is_available, stock_quantity)
        VALUES (
          ${reward.code},
          ${reward.title},
          ${reward.title_en},
          ${reward.description},
          ${reward.category},
          ${reward.required_points},
          ${reward.display_order},
          true,
          10
        )
        ON CONFLICT (code) DO NOTHING;
      `);
    }
    console.log(`✅ Seeded ${sampleRewards.length} sample rewards\n`);

    // 6. Verify existing serenityPointsLedger table
    console.log('🔍 Verifying serenity_points_ledger table...');
    const tableCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'serenity_points_ledger'
      );
    `);
    
    if ((tableCheck as any)[0]?.exists) {
      console.log('✅ serenity_points_ledger table exists (will be used for point tracking)\n');
    } else {
      console.error('⚠️  WARNING: serenity_points_ledger table not found!\n');
    }

    // 7. Summary
    console.log('📊 Summary:');
    const pointTypesCount = await db.execute(sql`SELECT COUNT(*) FROM loyalty_point_types`);
    const rewardsCount = await db.execute(sql`SELECT COUNT(*) FROM loyalty_rewards`);
    
    console.log(`   ✅ Point Types: ${(pointTypesCount as any)[0].count}`);
    console.log(`   ✅ Rewards Catalog: ${(rewardsCount as any)[0].count}`);
    console.log(`   ✅ Using serenity_points_ledger for point tracking`);
    console.log('');
    console.log('🎉 Loyalty System Tables Created Successfully!');
    console.log('');
    console.log('📝 Next Steps:');
    console.log('   1. Create LoyaltyPointsService');
    console.log('   2. Implement notification system');
    console.log('   3. Add hooks to existing operations');
    
  } catch (error) {
    console.error('❌ Error creating loyalty tables:', error);
    throw error;
  }
}

// Run migration
createLoyaltyTables()
  .then(() => {
    console.log('✅ Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
