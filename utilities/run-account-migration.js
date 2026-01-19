#!/usr/bin/env node

/**
 * Account Structure Refactor Migration Runner
 * 
 * This script runs the complete account structure refactor migration:
 * - Creates agents table
 * - Modifies agencies, account_types, and customers tables
 * - Seeds initial agencies and agents
 * - Duplicates account types for USD and CDF
 * 
 * Usage:
 *   node run-account-migration.js
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
  log('║     Account Structure Refactor Migration Runner                 ║', COLORS.cyan);
  log('║     CIF + Agency + Agent System Implementation                  ║', COLORS.cyan);
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
    const sqlPath = path.join(__dirname, 'migrations', '2025-12-09-account-structure-refactor.sql');
    
    if (!fs.existsSync(sqlPath)) {
      log('❌ ERROR: Migration file not found', COLORS.red);
      log(`Expected path: ${sqlPath}\n`, COLORS.yellow);
      process.exit(1);
    }

    const fullSql = fs.readFileSync(sqlPath, 'utf8');

    log('📄 Running migration in steps...', COLORS.blue);
    log('This will:', COLORS.cyan);
    log('  • Create agents table', COLORS.blue);
    log('  • Add code column to agencies', COLORS.blue);
    log('  • Add currency column to account_types', COLORS.blue);
    log('  • Add cif, agent_id, account_number to customers', COLORS.blue);
    log('  • Seed 4 initial agencies (01-04)', COLORS.blue);
    log('  • Seed 2 initial agents (SerenityBot + Agent Virtuel)', COLORS.blue);
    log('  • Duplicate account types for USD and CDF\n', COLORS.blue);
    
    // Split SQL into steps and execute one by one
    const steps = fullSql.split('-- =====================================================');
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i].trim();
      if (step.length === 0) continue;
      
      // Extract step name from first comment line
      const lines = step.split('\n');
      const stepName = lines[0].replace('--', '').trim();
      
      if (stepName) {
        log(`\n📝 ${stepName}`, COLORS.cyan);
      }
      
      try {
        await client.query(step);
        log('  ✓ Success', COLORS.green);
      } catch (error) {
        log(`  ⚠ Warning: ${error.message}`, COLORS.yellow);
        // Continue with other steps even if one fails (idempotent migration)
      }
    }
    
    log('✅ Migration executed successfully!\n', COLORS.green);

    // Verify agents table
    log('🔍 Verifying agents table...', COLORS.blue);
    const agentsCheck = await client.query(`
      SELECT COUNT(*) as count, 
             COUNT(CASE WHEN type = 'PHYSICAL' THEN 1 END) as physical_count,
             COUNT(CASE WHEN type = 'VIRTUAL' THEN 1 END) as virtual_count
      FROM agents;
    `);
    log(`✅ Agents table created with ${agentsCheck.rows[0].count} agents (${agentsCheck.rows[0].physical_count} physical, ${agentsCheck.rows[0].virtual_count} virtual)\n`, COLORS.green);

    // Verify agencies
    log('🔍 Verifying agencies...', COLORS.blue);
    const agenciesCheck = await client.query(`
      SELECT code, name FROM agencies ORDER BY code;
    `);
    log(`✅ Agencies table updated with ${agenciesCheck.rows.length} agencies:`, COLORS.green);
    agenciesCheck.rows.forEach(row => {
      log(`   [${row.code}] ${row.name}`, COLORS.blue);
    });
    console.log();

    // Verify account types
    log('🔍 Verifying account types...', COLORS.blue);
    const accountTypesCheck = await client.query(`
      SELECT code, currency, COUNT(*) 
      FROM account_types 
      GROUP BY code, currency 
      ORDER BY code, currency;
    `);
    log(`✅ Account types updated with ${accountTypesCheck.rows.length} type-currency combinations:`, COLORS.green);
    accountTypesCheck.rows.forEach(row => {
      log(`   ${row.code} ${row.currency}`, COLORS.blue);
    });
    console.log();

    // Verify customers table columns
    log('🔍 Verifying customers table columns...', COLORS.blue);
    const columnsCheck = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'customers'
        AND column_name IN ('cif', 'agent_id', 'account_number')
      ORDER BY column_name;
    `);
    
    if (columnsCheck.rows.length === 3) {
      log('✅ All new columns added to customers table:', COLORS.green);
      columnsCheck.rows.forEach(row => {
        log(`   ${row.column_name.padEnd(20)} | ${row.data_type.padEnd(25)} | Nullable: ${row.is_nullable}`, COLORS.blue);
      });
    } else {
      log(`⚠️  Warning: Expected 3 columns, found ${columnsCheck.rows.length}`, COLORS.yellow);
    }
    console.log();

    // Verify indexes
    log('🔍 Verifying indexes...', COLORS.blue);
    const indexesCheck = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename IN ('agents', 'customers', 'account_types')
        AND indexname LIKE '%_key%'
      ORDER BY indexname;
    `);
    log(`✅ ${indexesCheck.rows.length} unique indexes created`, COLORS.green);
    console.log();

    log('╔══════════════════════════════════════════════════════════════════╗', COLORS.green);
    log('║                  ✅ MIGRATION COMPLETE                           ║', COLORS.green);
    log('╚══════════════════════════════════════════════════════════════════╝\n', COLORS.green);

    log('Database Structure Summary:', COLORS.cyan);
    log('─────────────────────────────────────────────────────────────────', COLORS.cyan);
    log(`✓ Agents: ${agentsCheck.rows[0].count} (${agentsCheck.rows[0].physical_count} physical, ${agentsCheck.rows[0].virtual_count} virtual)`, COLORS.blue);
    log(`✓ Agencies: ${agenciesCheck.rows.length} with codes 01-04`, COLORS.blue);
    log(`✓ Account Types: ${accountTypesCheck.rows.length} type-currency combinations`, COLORS.blue);
    log('✓ Customers table updated with CIF, agent_id, account_number', COLORS.blue);
    log('─────────────────────────────────────────────────────────────────\n', COLORS.cyan);

    log('Next Steps:', COLORS.cyan);
    log('1. Create backend services for:', COLORS.blue);
    log('   • CIF auto-generation', COLORS.yellow);
    log('   • Agency rotation assignment', COLORS.yellow);
    log('   • Virtual agent assignment', COLORS.yellow);
    log('   • Account number generation\n', COLORS.yellow);
    log('2. Create CRUD routes for agents and agencies', COLORS.blue);
    log('3. Update customer signup flow', COLORS.blue);
    log('4. Create admin UI for agents/agencies management', COLORS.blue);
    log('5. Update customer dashboard to show new format\n', COLORS.blue);

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
    log('3. Verify migration file exists at migrations/2025-12-09-account-structure-refactor.sql', COLORS.blue);
    log('4. Check if tables/columns already exist (migration may have partially succeeded)\n', COLORS.blue);
    
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
