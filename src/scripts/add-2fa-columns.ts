import { db } from '../db';
import { sql } from 'drizzle-orm';

async function addTwoFactorColumns() {
  try {
    console.log('Adding 2FA columns to users table...');

    // Add mfa_enabled column
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('✓ Added mfa_enabled column');

    // Add mfa_secret column
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS mfa_secret TEXT
    `);
    console.log('✓ Added mfa_secret column');

    // Add mfa_backup_codes column
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS mfa_backup_codes JSONB
    `);
    console.log('✓ Added mfa_backup_codes column');

    // Add mfa_configured_at column
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS mfa_configured_at TIMESTAMP(3)
    `);
    console.log('✓ Added mfa_configured_at column');

    console.log('\n✅ All 2FA columns added successfully!');
  } catch (error) {
    console.error('❌ Error adding 2FA columns:', error);
    process.exit(1);
  }
}

// Run the migration
addTwoFactorColumns().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error during migration:', error);
  process.exit(1);
});
