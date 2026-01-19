/**
 * Deep Analysis Script - Check all account-related tables
 * Run with: npx tsx src/scripts/analyze-account-tables.ts
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

async function analyze() {
  console.log('=== DEEP ANALYSIS OF ACCOUNT TABLES ===\n');

  try {
    // 1. Check account_types table
    console.log('1. ACCOUNT_TYPES TABLE:');
    const typesResult = await db.execute(sql`
      SELECT code, name, description FROM account_types ORDER BY code
    `);
    const types = (typesResult as any).rows || [];
    console.log(`   Found ${types.length} account types:`);
    types.forEach((r: any) => console.log(`   - ${r.code} -> "${r.name}"`));

    // 2. Check account_type_conditions table
    console.log('\n2. ACCOUNT_TYPE_CONDITIONS TABLE:');
    const condCountResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM account_type_conditions
    `);
    const condCount = (condCountResult as any).rows?.[0]?.count || 0;
    console.log(`   Total conditions: ${condCount}`);

    if (parseInt(condCount) > 0) {
      const condsResult = await db.execute(sql`
        SELECT account_type_code, condition_type, condition_label 
        FROM account_type_conditions 
        ORDER BY account_type_code, display_order
        LIMIT 10
      `);
      const conds = (condsResult as any).rows || [];
      conds.forEach((r: any) => 
        console.log(`   - ${r.account_type_code} | ${r.condition_type} | ${r.condition_label}`)
      );
    } else {
      console.log('   ⚠️  TABLE IS EMPTY - NO CONDITIONS SEEDED!');
    }

    // 3. Check account_type_configs table
    console.log('\n3. ACCOUNT_TYPE_CONFIGS TABLE:');
    try {
      const configsResult = await db.execute(sql`
        SELECT account_type_code, account_type_name, description 
        FROM account_type_configs 
        ORDER BY account_type_code
      `);
      const configs = (configsResult as any).rows || [];
      console.log(`   Found ${configs.length} configs:`);
      configs.forEach((r: any) => 
        console.log(`   - ${r.account_type_code} -> "${r.account_type_name}"`)
      );
    } catch (e: any) {
      console.log(`   Table may not exist: ${e.message?.substring(0, 100)}`);
    }

    // 4. Schema of account_type_conditions
    console.log('\n4. ACCOUNT_TYPE_CONDITIONS SCHEMA:');
    const schemaResult = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'account_type_conditions' 
      ORDER BY ordinal_position
    `);
    const schema = (schemaResult as any).rows || [];
    schema.forEach((r: any) => console.log(`   - ${r.column_name}: ${r.data_type}`));

    // 5. INCONSISTENCY CHECK
    console.log('\n5. INCONSISTENCY CHECK:');
    console.log('   Checking if account_type_conditions.account_type_code matches account_types.code...');
    
    const accountTypeCodes = types.map((t: any) => t.code);
    console.log(`   account_types codes: ${JSON.stringify(accountTypeCodes)}`);

    // 6. Check what format is expected
    console.log('\n6. FORMAT ANALYSIS:');
    if (accountTypeCodes.length > 0) {
      const firstCode = accountTypeCodes[0];
      if (firstCode.includes('_')) {
        console.log('   ✓ Database uses LONG codes (S01_STANDARD, S02_MANDATORY_SAVINGS, etc.)');
      } else {
        console.log('   ✓ Database uses SHORT codes (S01, S02, etc.)');
      }
    }

    console.log('\n=== ANALYSIS COMPLETE ===\n');

    // Summary
    console.log('SUMMARY:');
    console.log(`- Account Types: ${types.length} records`);
    console.log(`- Account Type Conditions: ${condCount} records`);
    
    if (parseInt(condCount) === 0) {
      console.log('\n⚠️  ACTION REQUIRED: Run the conditions seed script!');
      console.log('   The account_type_conditions table is EMPTY.');
      console.log('   This is why no conditions are displayed in the UI.');
    }

  } catch (error: any) {
    console.error('\n❌ Error during analysis:', error.message);
    console.error(error);
  }

  process.exit(0);
}

analyze();
