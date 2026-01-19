const postgres = require('postgres');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL);

async function runMigration() {
  try {
    console.log('🚀 Running roles migration (Caissier + KYC Validator)...');
    
    const migration = fs.readFileSync('./drizzle/0012_add_caissier_kyc_roles.sql', 'utf8');
    
    await sql.unsafe(migration);
    
    console.log('✅ Migration completed successfully!');
    console.log('✅ Added:');
    console.log('  - Caissier role');
    console.log('  - KYC Validator role');
    console.log('  - users.agency_id column');
    console.log('  - agencies.manager_id column');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
