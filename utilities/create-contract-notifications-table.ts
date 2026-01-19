/**
 * Migration Script: Create Contract Notifications Table
 * 
 * This script creates the contract_notifications table for tracking
 * when contracts are made available to customers for signing.
 * 
 * Usage:
 *   npx tsx create-contract-notifications-table.ts
 */

import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function createContractNotificationsTable() {
  console.log('🚀 Starting contract notifications table creation...\n');

  try {
    // Create contract_notifications table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contract_notifications (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        
        -- Notification Status
        is_read BOOLEAN DEFAULT FALSE NOT NULL,
        is_signed BOOLEAN DEFAULT FALSE NOT NULL,
        
        -- Notification Details
        notification_type VARCHAR(50) DEFAULT 'NEW_CONTRACT' NOT NULL, -- 'NEW_CONTRACT', 'CONTRACT_UPDATED', 'CONTRACT_EXPIRING'
        message TEXT,
        priority VARCHAR(20) DEFAULT 'NORMAL', -- 'LOW', 'NORMAL', 'HIGH', 'URGENT'
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        read_at TIMESTAMP,
        signed_at TIMESTAMP,
        expires_at TIMESTAMP,
        
        -- Audit Trail
        ip_address VARCHAR(50),
        user_agent TEXT,
        
        -- Indexes for performance
        CONSTRAINT unique_contract_notification UNIQUE(contract_id, customer_id)
      );
    `);

    console.log('✅ Table contract_notifications créée');

    // Create indexes for faster queries
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_contract_notifications_customer_id 
      ON contract_notifications(customer_id);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_contract_notifications_is_read 
      ON contract_notifications(is_read) WHERE is_read = FALSE;
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_contract_notifications_created_at 
      ON contract_notifications(created_at DESC);
    `);

    console.log('✅ Indexes créés pour optimisation');

    // Insert trigger to auto-create notifications when contracts are created with PENDING status
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION notify_customer_new_contract()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only create notification if contract status is PENDING (ready for signature)
        IF NEW.status = 'PENDING' THEN
          INSERT INTO contract_notifications (
            contract_id,
            customer_id,
            notification_type,
            message,
            priority,
            expires_at
          ) VALUES (
            NEW.id,
            NEW.customer_id,
            'NEW_CONTRACT',
            'Vous avez un nouveau contrat à lire et signer: ' || NEW.title,
            CASE 
              WHEN NEW.category = 'CREDIT' THEN 'HIGH'
              WHEN NEW.category = 'BANKING' THEN 'NORMAL'
              ELSE 'NORMAL'
            END,
            CASE 
              WHEN NEW.end_date IS NOT NULL THEN NEW.end_date
              ELSE CURRENT_TIMESTAMP + INTERVAL '30 days'
            END
          )
          ON CONFLICT (contract_id, customer_id) 
          DO UPDATE SET
            is_read = FALSE,
            message = EXCLUDED.message,
            created_at = CURRENT_TIMESTAMP;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Fonction trigger créée');

    await db.execute(sql`
      DROP TRIGGER IF EXISTS trigger_notify_customer_new_contract ON contracts;
    `);

    await db.execute(sql`
      CREATE TRIGGER trigger_notify_customer_new_contract
      AFTER INSERT OR UPDATE OF status ON contracts
      FOR EACH ROW
      EXECUTE FUNCTION notify_customer_new_contract();
    `);

    console.log('✅ Trigger attaché à la table contracts');

    // Add notification fields to customers table if they don't exist
    await db.execute(sql`
      ALTER TABLE customers 
      ADD COLUMN IF NOT EXISTS unread_contracts_count INTEGER DEFAULT 0;
    `);

    console.log('✅ Colonne unread_contracts_count ajoutée à customers');

    // Create function to update customer's unread count
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION update_customer_unread_contracts()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Update the customer's unread contract count
        UPDATE customers
        SET unread_contracts_count = (
          SELECT COUNT(*)
          FROM contract_notifications
          WHERE customer_id = COALESCE(NEW.customer_id, OLD.customer_id)
          AND is_read = FALSE
          AND is_signed = FALSE
        )
        WHERE id = COALESCE(NEW.customer_id, OLD.customer_id);
        
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Fonction update_customer_unread_contracts créée');

    await db.execute(sql`
      DROP TRIGGER IF EXISTS trigger_update_customer_unread_contracts ON contract_notifications;
    `);

    await db.execute(sql`
      CREATE TRIGGER trigger_update_customer_unread_contracts
      AFTER INSERT OR UPDATE OR DELETE ON contract_notifications
      FOR EACH ROW
      EXECUTE FUNCTION update_customer_unread_contracts();
    `);

    console.log('✅ Trigger de mise à jour du compteur créé');

    console.log('\n📊 Summary:');
    console.log('   ✓ Table contract_notifications créée avec 14 champs');
    console.log('   ✓ 3 indexes pour performance');
    console.log('   ✓ Trigger auto-notification lors de création de contrat PENDING');
    console.log('   ✓ Compteur temps réel unread_contracts_count sur customers');
    console.log('   ✓ Contrainte unique empêchant les doublons');
    console.log('\n✅ Migration completed successfully!');

  } catch (error: any) {
    console.error('\n❌ Error during migration:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run migration
createContractNotificationsTable()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
