const postgres = require('postgres');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL);

async function runMigration() {
  try {
    console.log('🚀 Running approval system migration...');
    
    const migration = fs.readFileSync('./drizzle/0011_migration_approval_system.sql', 'utf8');
    
    await sql.unsafe(migration);
    
    console.log('✅ Migration completed successfully!');
    console.log('✅ Created tables:');
    console.log('  - approval_requests');
    console.log('  - migration_requests');
    console.log('  - service_activation_requests');
    console.log('  - customer_services');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
