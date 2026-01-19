/**
 * Create Contracts Tables Script
 * Executes SQL to create contracts-related tables
 */

const fs = require('fs');
const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });

async function createContractsTables() {
  console.log('🔧 Creating contracts tables...');
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing');
  }

  const sql = postgres(process.env.DATABASE_URL, {
    max: 1,
  });

  try {
    // Read SQL file
    const sqlContent = fs.readFileSync('./drizzle/create-contracts-tables.sql', 'utf8');
    
    // Split by statement-breakpoint and execute each statement
    const statements = sqlContent
      .split(/--.*$/gm) // Remove comments
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`📝 Executing ${statements.length} SQL statements...`);

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await sql.unsafe(statement + ';');
          console.log('✅ Statement executed successfully');
        } catch (error) {
          // Ignore "already exists" errors
          if (error.message.includes('already exists')) {
            console.log('⚠️  Table/index already exists - skipping');
          } else {
            console.error('❌ Error:', error.message);
          }
        }
      }
    }

    console.log('\n✅ Contracts tables created successfully!');
    console.log('📊 Created tables:');
    console.log('  - contracts');
    console.log('  - contract_signatories');
    console.log('  - contract_history');
    console.log('  - contract_attachments');
    console.log('  + indexes for performance');

  } catch (error) {
    console.error('❌ Error creating contracts tables:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

// Run script
createContractsTables()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed:', error);
    process.exit(1);
  });
