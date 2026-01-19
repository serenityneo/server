/**
 * Test database connection and check account tables
 */

import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testDb() {
  const dbUrl = process.env.DATABASE_URL;
  console.log('DB URL exists:', !!dbUrl);
  
  if (!dbUrl) {
    console.error('No DATABASE_URL found!');
    process.exit(1);
  }

  const client = postgres(dbUrl, { prepare: false });

  try {
    console.log('Testing connection...');
    const result = await client`SELECT 1 as test`;
    console.log('Connection OK:', result);

    // List all tables with 'account'
    console.log('\n=== TABLES CONTAINING "account" ===');
    const tables = await client`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%account%'
      ORDER BY table_name
    `;
    tables.forEach(r => console.log('  -', r.table_name));

    // Check account_types schema
    console.log('\n=== ACCOUNT_TYPES SCHEMA ===');
    const schema = await client`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'account_types' 
      ORDER BY ordinal_position
    `;
    schema.forEach(r => console.log('  -', r.column_name + ':', r.data_type));

    // Check account_types data
    console.log('\n=== ACCOUNT_TYPES DATA ===');
    const types = await client`SELECT code, name FROM account_types ORDER BY code`;
    console.log('  Total:', types.length);
    types.forEach(r => console.log('  -', r.code, '->', r.name));

    // Check account_type_conditions schema
    console.log('\n=== ACCOUNT_TYPE_CONDITIONS SCHEMA ===');
    const condSchema = await client`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'account_type_conditions' 
      ORDER BY ordinal_position
    `;
    condSchema.forEach(r => console.log('  -', r.column_name + ':', r.data_type));

    // Check account_type_conditions data
    console.log('\n=== ACCOUNT_TYPE_CONDITIONS DATA ===');
    const conds = await client`SELECT COUNT(*) as count FROM account_type_conditions`;
    console.log('  Total:', conds[0].count);

    if (parseInt(conds[0].count) > 0) {
      const condData = await client`
        SELECT account_type_code, condition_type, condition_label 
        FROM account_type_conditions 
        ORDER BY account_type_code, display_order
        LIMIT 5
      `;
      condData.forEach(r => console.log('  -', r.account_type_code, '|', r.condition_type, '|', r.condition_label));
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    await client.end();
    process.exit(0);
  }
}

testDb();
