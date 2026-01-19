import { db } from '../db';
import { sql } from 'drizzle-orm';

async function addTwoFactorFailureTracking() {
  try {
    console.log('Adding 2FA failure tracking columns to users table...');

    // Add mfa_failed_attempts column
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS mfa_failed_attempts INTEGER NOT NULL DEFAULT 0
    `);
    console.log('✓ Added mfa_failed_attempts column');

    // Add mfa_last_failed_at column
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS mfa_last_failed_at TIMESTAMP(3)
    `);
    console.log('✓ Added mfa_last_failed_at column');

    // Add mfa_failure_log column
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS mfa_failure_log JSONB
    `);
    console.log('✓ Added mfa_failure_log column');

    console.log('\n✅ All 2FA failure tracking columns added successfully!');
  } catch (error) {
    console.error('❌ Error adding 2FA failure tracking columns:', error);
    process.exit(1);
  }
}

// Run the migration
addTwoFactorFailureTracking().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error during migration:', error);
  process.exit(1);
});
