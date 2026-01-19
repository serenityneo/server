#!/usr/bin/env node

/**
 * Terms Acceptance Migration Runner
 * 
 * This script safely adds terms acceptance tracking to the customers table.
 * Safe to run multiple times - checks before creating anything.
 * 
 * Usage:
 *   node run-migration.js
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// PostgreSQL client
const { Client } = require('pg');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

async function runMigration() {
  log('\n╔══════════════════════════════════════════════════════════════════╗', COLORS.cyan);
  log('║          Terms Acceptance Migration Runner                      ║', COLORS.cyan);
  log('║          Safe to run multiple times                             ║', COLORS.cyan);
  log('╚══════════════════════════════════════════════════════════════════╝\n', COLORS.cyan);

  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    log('❌ ERROR: DATABASE_URL environment variable not set', COLORS.red);
    log('\nPlease set DATABASE_URL in your .env.local file:', COLORS.yellow);
    log('DATABASE_URL=postgresql://user:password@host:port/database\n', COLORS.yellow);
    process.exit(1);
  }

  log('📊 Database URL: ' + process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'), COLORS.blue);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    log('\n🔌 Connecting to database...', COLORS.blue);
    await client.connect();
    log('✅ Connected successfully\n', COLORS.green);

    // Read the migration SQL file
    const sqlPath = path.join(__dirname, 'manual-migration-terms-acceptance.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    log('📄 Running migration SQL...', COLORS.blue);
    
    // Execute the migration
    const result = await client.query(sql);
    
    log('✅ Migration executed successfully!\n', COLORS.green);

    // Display verification results
    if (result && Array.isArray(result)) {
      const lastResult = result[result.length - 1];
      if (lastResult && lastResult.rows && lastResult.rows.length > 0) {
        log('📊 Migration Verification:', COLORS.cyan);
        log('─────────────────────────────────────────────────────────────────', COLORS.cyan);
        
        const row = lastResult.rows[0];
        log(`Status: ${row.status}`, COLORS.green);
        log(`Total Customers: ${row.total_customers}`, COLORS.blue);
        log(`Customers Who Accepted Terms: ${row.customers_accepted_terms}`, COLORS.blue);
        log('─────────────────────────────────────────────────────────────────\n', COLORS.cyan);
      }
    }

    // Verify columns exist
    log('🔍 Verifying columns...', COLORS.blue);
    const verifyQuery = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'customers'
        AND column_name IN ('terms_accepted', 'terms_accepted_at', 'terms_accepted_ip')
      ORDER BY column_name;
    `;

    const verifyResult = await client.query(verifyQuery);
    
    if (verifyResult.rows.length === 3) {
      log('✅ All 3 columns created successfully!\n', COLORS.green);
      
      log('Column Details:', COLORS.cyan);
      log('─────────────────────────────────────────────────────────────────', COLORS.cyan);
      verifyResult.rows.forEach(row => {
        log(`  ${row.column_name.padEnd(25)} | ${row.data_type.padEnd(20)} | Nullable: ${row.is_nullable} | Default: ${row.column_default || 'NULL'}`, COLORS.blue);
      });
      log('─────────────────────────────────────────────────────────────────\n', COLORS.cyan);
    } else {
      log(`⚠️  Warning: Expected 3 columns, found ${verifyResult.rows.length}`, COLORS.yellow);
    }

    // Check index
    log('🔍 Verifying index...', COLORS.blue);
    const indexQuery = `
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'customers' 
        AND indexname = 'idx_customers_terms_accepted';
    `;
    
    const indexResult = await client.query(indexQuery);
    
    if (indexResult.rows.length > 0) {
      log('✅ Index created successfully!\n', COLORS.green);
    } else {
      log('⚠️  Warning: Index not found\n', COLORS.yellow);
    }

    log('╔══════════════════════════════════════════════════════════════════╗', COLORS.green);
    log('║                  ✅ MIGRATION COMPLETE                           ║', COLORS.green);
    log('╚══════════════════════════════════════════════════════════════════╝\n', COLORS.green);

    log('Next Steps:', COLORS.cyan);
    log('1. Update Prisma client:', COLORS.blue);
    log('   cd ../ui && npx prisma generate\n', COLORS.yellow);
    log('2. Restart Fastify server:', COLORS.blue);
    log('   npm run dev\n', COLORS.yellow);
    log('3. Restart Next.js frontend:', COLORS.blue);
    log('   cd ../ui && npm run dev\n', COLORS.yellow);
    log('4. Test KYC Step 4:', COLORS.blue);
    log('   http://localhost:3000/dashboard/kyc/step4\n', COLORS.yellow);

  } catch (error) {
    log('\n❌ MIGRATION FAILED', COLORS.red);
    log('─────────────────────────────────────────────────────────────────', COLORS.red);
    log(`Error: ${error.message}\n`, COLORS.red);
    
    if (error.code) {
      log(`Error Code: ${error.code}`, COLORS.yellow);
    }
    
    if (error.detail) {
      log(`Details: ${error.detail}`, COLORS.yellow);
    }
    
    log('\nTroubleshooting:', COLORS.cyan);
    log('1. Check DATABASE_URL is correct', COLORS.blue);
    log('2. Ensure database user has CREATE and ALTER permissions', COLORS.blue);
    log('3. Verify you\'re connected to the correct database', COLORS.blue);
    log('4. Check if columns already exist (migration may have partially succeeded)\n', COLORS.blue);
    
    process.exit(1);
  } finally {
    await client.end();
    log('🔌 Database connection closed\n', COLORS.blue);
  }
}

// Run the migration
runMigration().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
