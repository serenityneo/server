import { Client } from 'pg';

async function checkDatabase() {
  // Connect directly (without pgbouncer)
  const connectionString = process.env.DATABASE_URL?.replace('pgbouncer=true', 'pgbouncer=false').replace('-pooler.', '.');
  
  console.log('🔍 Testing direct database connection...\n');
  console.log('Connection string pattern:', connectionString?.substring(0, 50) + '...\n');

  const client = new Client({ connectionString });

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
    
    console.log(`=== Found ${tablesResult.rows.length} tables ===`);
    tablesResult.rows.forEach((row: any) => {
      console.log(`  - ${row.tablename}`);
    });

    // Check if account_types exists
    const accountTypesCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'account_types'
      )
    `);
    console.log('\naccount_types exists:', accountTypesCheck.rows[0].exists);

    if (accountTypesCheck.rows[0].exists) {
      // Get schema
      const schemaResult = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'account_types'
        ORDER BY ordinal_position
      `);
      console.log('\naccount_types columns:');
      schemaResult.rows.forEach((row: any) => {
        console.log(`  - ${row.column_name}: ${row.data_type}`);
      });

      // Get data
      const dataResult = await client.query(`SELECT * FROM account_types LIMIT 3`);
      console.log('\nSample data:');
      console.log(JSON.stringify(dataResult.rows, null, 2));
    }

    // Check account_type_conditions
    const conditionsCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'account_type_conditions'
      )
    `);
    console.log('\naccount_type_conditions exists:', conditionsCheck.rows[0].exists);

    if (conditionsCheck.rows[0].exists) {
      const condCount = await client.query(`SELECT COUNT(*) FROM account_type_conditions`);
      console.log('Total conditions:', condCount.rows[0].count);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

checkDatabase();
