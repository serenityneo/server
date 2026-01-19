/**
 * Create Contract Types Tables
 * Run with: npx tsx create-contract-types-tables.ts
 */

import { db } from './src/db';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

async function createContractTypesTables() {
  try {
    console.log('🔧 Starting contract types tables creation...');
    
    // 1. Create contract_types table
    console.log('📋 Creating contract_types table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contract_types (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) NOT NULL UNIQUE,
        label VARCHAR(200) NOT NULL,
        label_en VARCHAR(200),
        category VARCHAR(50) NOT NULL,
        description TEXT,
        requires_amount BOOLEAN DEFAULT false,
        requires_interest_rate BOOLEAN DEFAULT false,
        requires_end_date BOOLEAN DEFAULT false,
        allows_auto_renewal BOOLEAN DEFAULT true,
        default_currency VARCHAR(10) DEFAULT 'CDF',
        default_duration_days INTEGER,
        terms_template TEXT,
        display_order INTEGER DEFAULT 0,
        icon VARCHAR(50),
        color VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        created_by INTEGER,
        updated_by INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_contract_types_code ON contract_types(code);
      CREATE INDEX IF NOT EXISTS idx_contract_types_category ON contract_types(category);
      CREATE INDEX IF NOT EXISTS idx_contract_types_active ON contract_types(is_active);
    `);
    
    // 2. Create contract_type_fields table
    console.log('📋 Creating contract_type_fields table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contract_type_fields (
        id SERIAL PRIMARY KEY,
        contract_type_id INTEGER NOT NULL REFERENCES contract_types(id) ON DELETE CASCADE,
        field_name VARCHAR(100) NOT NULL,
        field_label VARCHAR(200) NOT NULL,
        field_type VARCHAR(50) NOT NULL,
        is_required BOOLEAN DEFAULT false,
        default_value TEXT,
        validation_rules TEXT,
        options TEXT,
        placeholder VARCHAR(200),
        help_text TEXT,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_contract_type_fields_type ON contract_type_fields(contract_type_id);
    `);
    
    // 3. Update contracts table to add index
    console.log('🔗 Adding index to contracts table...');
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_contracts_type ON contracts(type);
    `);
    
    // 4. Seed default contract types
    console.log('🌱 Seeding default contract types...');
    await db.execute(sql`
      INSERT INTO contract_types (code, label, label_en, category, description, requires_amount, requires_interest_rate, requires_end_date, allows_auto_renewal, default_currency, display_order, icon, color, is_active)
      VALUES
        ('ACCOUNT_OPENING', 'Ouverture de Compte', 'Account Opening', 'BANKING', 'Contrat d''ouverture de compte bancaire standard', false, false, false, false, 'CDF', 1, 'Landmark', '#8B4513', true),
        ('LOAN_AGREEMENT', 'Accord de Prêt', 'Loan Agreement', 'CREDIT', 'Contrat de prêt avec conditions de remboursement', true, true, true, false, 'USD', 2, 'DollarSign', '#D97706', true),
        ('SAVINGS_PLAN', 'Plan d''Épargne', 'Savings Plan', 'SAVINGS', 'Plan d''épargne Likelemba ou autre', true, true, true, true, 'CDF', 3, 'PiggyBank', '#059669', true),
        ('SERVICE_AGREEMENT', 'Accord de Service', 'Service Agreement', 'BANKING', 'Contrat de services bancaires additionnels', false, false, false, true, 'CDF', 4, 'FileText', '#2563EB', true),
        ('INVESTMENT_CONTRACT', 'Contrat d''Investissement', 'Investment Contract', 'INVESTMENT', 'Contrat pour produits d''investissement', true, true, true, true, 'USD', 5, 'TrendingUp', '#7C3AED', true),
        ('CARD_AGREEMENT', 'Accord de Carte Bancaire', 'Card Agreement', 'BANKING', 'Contrat pour émission de carte Bwakisa', false, false, true, true, 'CDF', 6, 'CreditCard', '#EC4899', true)
      ON CONFLICT (code) DO NOTHING;
    `);
    
    // 5. Fix currency in contracts table (remove EUR)
    console.log('💱 Updating contracts table to use only CDF/USD...');
    await db.execute(sql`
      UPDATE contracts 
      SET currency = CASE 
        WHEN currency = 'EUR' THEN 
          CASE 
            WHEN amount::numeric > 1000 THEN 'USD' 
            ELSE 'CDF' 
          END
        ELSE currency 
      END
      WHERE currency NOT IN ('CDF', 'USD');
    `);
    
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'contracts_currency_check'
        ) THEN
          ALTER TABLE contracts 
          ADD CONSTRAINT contracts_currency_check 
          CHECK (currency IN ('CDF', 'USD'));
        END IF;
      END $$;
    `);
    
    console.log('✅ Contract types tables created successfully!');
    console.log('');
    console.log('📊 Summary:');
    const typeCount = await db.execute(sql`SELECT COUNT(*) FROM contract_types`);
    console.log(`   - Contract types: ${(typeCount as any)[0].count}`);
    console.log('   - Currencies allowed: CDF, USD only');
    console.log('');
    console.log('✨ Ready to use! Contract types are now fully dynamic.');
    
  } catch (error) {
    console.error('❌ Error creating contract types tables:', error);
    throw error;
  }
}

// Run the migration
createContractTypesTables()
  .then(() => {
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
