import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function createLoyaltyNotificationsTable() {
  console.log('🔔 Creating loyalty_notifications table...\n');

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS loyalty_notifications (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        points INTEGER NOT NULL DEFAULT 0,
        point_type_code VARCHAR(50),
        message TEXT NOT NULL,
        animation_type VARCHAR(20) DEFAULT 'bounce', -- 'confetti', 'tada', 'pulse', 'bounce'
        is_read BOOLEAN DEFAULT false,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_loyalty_notif_customer ON loyalty_notifications(customer_id);
      CREATE INDEX IF NOT EXISTS idx_loyalty_notif_unread ON loyalty_notifications(customer_id, is_read);
      CREATE INDEX IF NOT EXISTS idx_loyalty_notif_created_at ON loyalty_notifications(created_at DESC);
    `);

    console.log('✅ loyalty_notifications table created successfully!\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

createLoyaltyNotificationsTable()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
