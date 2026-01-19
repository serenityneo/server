import { db } from './src/db';
import { accountTypes, accountTypeConditions } from './src/db/schema';
import { sql } from 'drizzle-orm';

async function testDatabaseConditions() {
  console.log('🔍 Testing Database Conditions...\n');

  // Test 1: Check account_types table
  console.log('=== TEST 1: account_types table ===');
  try {
    const types = await db.select().from(accountTypes).limit(6);
    console.log(`Found ${types.length} account types:`);
    types.forEach(t => {
      console.log(`  - ${t.code}: ${t.label} (${t.currency})`);
    });
  } catch (error) {
    console.error('Error querying account_types:', error);
  }

  console.log('\n=== TEST 2: account_type_conditions table ===');
  try {
    const conditions = await db.select().from(accountTypeConditions).limit(10);
    console.log(`Found ${conditions.length} conditions:`);
    conditions.forEach(c => {
      console.log(`  - ${c.accountTypeCode}: ${c.conditionType} - ${c.conditionLabel}`);
    });
  } catch (error) {
    console.error('Error querying account_type_conditions:', error);
  }

  console.log('\n=== TEST 3: Full SQL query (same as API endpoint) ===');
  try {
    const result = await db.execute(sql`
      SELECT 
        at.code as account_type,
        at.label as name,
        at.label,
        at.description,
        COALESCE(
          json_agg(
            json_build_object(
              'id', atc.id,
              'conditionType', atc.condition_type,
              'conditionLabel', atc.condition_label,
              'conditionDescription', atc.condition_description,
              'displayOrder', atc.display_order,
              'isActive', atc.is_active
            ) ORDER BY atc.display_order
          ) FILTER (WHERE atc.id IS NOT NULL),
          '[]'::json
        ) as conditions
      FROM account_types at
      LEFT JOIN account_type_conditions atc ON at.code = atc.account_type_code
      WHERE at.code IN ('S01', 'S02', 'S03', 'S04', 'S05', 'S06')
      GROUP BY at.code, at.label, at.description
      ORDER BY at.code
    `);
    
    const rows = (result as any).rows || [];
    console.log(`Found ${rows.length} account types with conditions:`);
    rows.forEach((row: any) => {
      console.log(`\n  ${row.account_type} - ${row.name}`);
      console.log(`  Conditions count: ${row.conditions?.length || 0}`);
      if (row.conditions && row.conditions.length > 0) {
        row.conditions.forEach((c: any, idx: number) => {
          console.log(`    ${idx + 1}. [${c.conditionType}] ${c.conditionLabel}`);
        });
      }
    });
    
    console.log('\n=== FULL JSON OUTPUT ===');
    console.log(JSON.stringify(rows, null, 2));
  } catch (error) {
    console.error('Error executing full SQL query:', error);
  }

  console.log('\n✅ Test completed!');
  process.exit(0);
}

testDatabaseConditions().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
