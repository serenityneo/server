import { config } from 'dotenv';
import { Client } from 'pg';
import { resolve } from 'path';

// Load .env.local explicitly
config({ path: resolve(__dirname, '.env.local') });

async function checkDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not found in environment!');
    console.error('Available env keys:', Object.keys(process.env).filter(k => k.includes('DATABASE')));
    process.exit(1);
  }

  // Use direct connection (remove pooler for queries)
  const directUrl = dbUrl.replace('-pooler.', '.').replace('pgbouncer=true', '');
  
  console.log('🔍 Testing Neon database connection...\n');
  console.log('Database host:', directUrl.match(/@([^/]+)\//)?.[1] || 'unknown');
  console.log('');

  const client = new Client({ connectionString: directUrl });

  try {
    await client.connect();
    console.log('✅ Connected successfully!\n');

    // Check tables
    const tablesResult = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    
    console.log(`=== Found ${tablesResult.rows.length} tables in database ===`);
    tablesResult.rows.slice(0, 20).forEach((row: any) => {
      console.log(`  - ${row.tablename}`);
    });
    if (tablesResult.rows.length > 20) {
      console.log(`  ... and ${tablesResult.rows.length - 20} more`);
    }

    // Check if account_types exists
    const accountTypesCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'account_types'
      )
    `);
    console.log('\n=== account_types table ===');
    console.log('Exists:', accountTypesCheck.rows[0].exists);

    if (accountTypesCheck.rows[0].exists) {
      // Get schema
      const schemaResult = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'account_types'
        ORDER BY ordinal_position
      `);
      console.log('\nColumns:');
      schemaResult.rows.forEach((row: any) => {
        console.log(`  - ${row.column_name}: ${row.data_type}`);
      });

      // Get count and sample
      const countResult = await client.query(`SELECT COUNT(*) FROM account_types`);
      console.log('\nTotal rows:', countResult.rows[0].count);

      const dataResult = await client.query(`SELECT * FROM account_types LIMIT 3`);
      console.log('\nSample data (first 3 rows):');
      dataResult.rows.forEach((row, idx) => {
        console.log(`\n  Row ${idx + 1}:`, JSON.stringify(row, null, 2));
      });
    }

    // Check account_type_conditions
    const conditionsCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'account_type_conditions'
      )
    `);
    console.log('\n\n=== account_type_conditions table ===');
    console.log('Exists:', conditionsCheck.rows[0].exists);

    if (conditionsCheck.rows[0].exists) {
      const countResult = await client.query(`SELECT COUNT(*) FROM account_type_conditions`);
      console.log('Total conditions:', countResult.rows[0].count);

      if (parseInt(countResult.rows[0].count) > 0) {
        const sampleResult = await client.query(`SELECT * FROM account_type_conditions LIMIT 3`);
        console.log('\nSample conditions:');
        sampleResult.rows.forEach((row, idx) => {
          console.log(`\n  Condition ${idx + 1}:`);
          console.log(`    Code: ${row.account_type_code}`);
          console.log(`    Type: ${row.condition_type}`);
          console.log(`    Label: ${row.condition_label}`);
        });
      }
    }

    console.log('\n\n=== Testing the API query ===');
    const apiQuery = await client.query(`
      SELECT 
        at.code as account_type,
        at.name,
        at.description
      FROM account_types at
      WHERE at.code IN ('S01', 'S02', 'S03', 'S04', 'S05', 'S06')
      LIMIT 3
    `);
    console.log(`Found ${apiQuery.rows.length} account types for S01-S06:`);
    apiQuery.rows.forEach((row: any) => {
      console.log(`  - ${row.account_type}: ${row.name}`);
    });

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await client.end();
  }
}

checkDatabase();
