/**
 * Add performance indexes for dashboard queries
 */

const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

async function createDashboardIndexes() {
  console.log('🔧 Creating performance indexes for dashboard...\n');
  
  try {
    // Index on customers.created_at for date range queries
    console.log('Creating index on customers.created_at...');
    await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_created_at ON customers(created_at)`;
    console.log('✅ Index idx_customers_created_at created');
    
    // Index on customers.kyc_status for filtering
    console.log('Creating index on customers.kyc_status...');
    await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_kyc_status ON customers(kyc_status)`;
    console.log('✅ Index idx_customers_kyc_status created');
    
    // Index on customers.status for filtering
    console.log('Creating index on customers.status...');
    await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_status ON customers(status)`;
    console.log('✅ Index idx_customers_status created');
    
    // Composite index for growth queries (created_at + kyc_status)
    console.log('Creating composite index on customers(created_at, kyc_status)...');
    await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_created_at_kyc_status ON customers(created_at, kyc_status)`;
    console.log('✅ Index idx_customers_created_at_kyc_status created');
    
    // Index on users.created_at for date range queries
    console.log('Creating index on users.created_at...');
    await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at ON users(created_at)`;
    console.log('✅ Index idx_users_created_at created');
    
    // Index on users.is_active for filtering
    console.log('Creating index on users.is_active...');
    await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_is_active ON users(is_active)`;
    console.log('✅ Index idx_users_is_active created');
    
    // Index on users.mfa_enabled for filtering
    console.log('Creating index on users.mfa_enabled...');
    await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled)`;
    console.log('✅ Index idx_users_mfa_enabled created');
    
    // Index on customers.mfa_enabled for filtering
    console.log('Creating index on customers.mfa_enabled...');
    await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_mfa_enabled ON customers(mfa_enabled)`;
    console.log('✅ Index idx_customers_mfa_enabled created');
    
    console.log('\n🎉 All indexes created successfully!');
    console.log('\n📊 Run test-dashboard-performance.js again to see the improvements');
    
  } catch (error) {
    console.error('\n❌ Error creating indexes:', error.message);
    throw error;
  } finally {
    await sql.end();
  }
}

createDashboardIndexes();
