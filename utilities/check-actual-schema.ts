import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function checkActualSchema() {
  console.log('🔍 Checking ACTUAL database schema...\n');

  // Check account_types columns
  console.log('=== account_types columns ===');
  try {
    const result1 = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'account_types'
      ORDER BY ordinal_position
    `);
    console.log('Columns:', (result1 as any).rows);
  } catch (error) {
    console.error('Error:', error);
  }

  // Check account_type_conditions columns
  console.log('\n=== account_type_conditions columns ===');
  try {
    const result2 = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'account_type_conditions'
      ORDER BY ordinal_position
    `);
    console.log('Columns:', (result2 as any).rows);
  } catch (error) {
    console.error('Error:', error);
  }

  // Check if tables exist
  console.log('\n=== Check if tables exist ===');
  try {
    const result3 = await db.execute(sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE tablename IN ('account_types', 'account_type_conditions')
    `);
    console.log('Tables found:', (result3 as any).rows);
  } catch (error) {
    console.error('Error:', error);
  }

  // Try a simple query with actual columns
  console.log('\n=== Try querying with actual schema ===');
  try {
    const result4 = await db.execute(sql`
      SELECT * FROM account_types LIMIT 1
    `);
    console.log('Sample row:', (result4 as any).rows[0]);
  } catch (error) {
    console.error('Error:', error);
  }

  console.log('\n✅ Schema check completed!');
  process.exit(0);
}

checkActualSchema().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
