import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function createSerenityPointsTable() {
  console.log('🎯 Creating serenity_points_ledger table...\n');

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS serenity_points_ledger (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        points INTEGER NOT NULL,
        type VARCHAR(20) NOT NULL, -- 'EARNED', 'REDEEMED', 'EXPIRED', 'BONUS'
        operation_type VARCHAR(50), -- Reference to loyalty_point_types.code
        operation_id INTEGER, -- Reference to specific operation (credit_id, transaction_id, etc)
        description TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_serenity_points_customer ON serenity_points_ledger(customer_id);
      CREATE INDEX IF NOT EXISTS idx_serenity_points_type ON serenity_points_ledger(type);
      CREATE INDEX IF NOT EXISTS idx_serenity_points_operation ON serenity_points_ledger(operation_type);
      CREATE INDEX IF NOT EXISTS idx_serenity_points_created_at ON serenity_points_ledger(created_at DESC);
    `);

    console.log('✅ serenity_points_ledger table created successfully!\n');
    
    // Verify
    const count = await db.execute(sql`SELECT COUNT(*) FROM serenity_points_ledger`);
    console.log(`📊 Current points records: ${(count as any)[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

createSerenityPointsTable()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
