/**
 * Test the Drizzle db.execute(sql`...`) format
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

async function testDrizzle() {
  console.log('Testing Drizzle db.execute() format...\n');

  try {
    // Same query as the API endpoint
    const accountTypesResult = await db.execute(sql`
      SELECT 
        at.code as account_type,
        at.name,
        at.name as label,
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
      WHERE at.code IN ('S01_STANDARD', 'S02_MANDATORY_SAVINGS', 'S03_CAUTION', 'S04_CREDIT', 'S05_BWAKISA_CARTE', 'S06_FINES')
      GROUP BY at.code, at.name, at.description
      ORDER BY at.code
    `);

    console.log('Raw result type:', typeof accountTypesResult);
    console.log('Raw result keys:', Object.keys(accountTypesResult as any));
    console.log('Raw result:', accountTypesResult);
    
    // Try different ways to access rows
    const asAny = accountTypesResult as any;
    console.log('\nasAny.rows:', asAny.rows);
    console.log('asAny[0]:', asAny[0]);
    console.log('Array.from:', Array.from(asAny as any));
    
    // Get the actual data
    const accountTypes = asAny.rows || asAny || [];
    
    console.log('\n=== EXTRACTED ACCOUNT TYPES ===');
    console.log('Length:', accountTypes.length);
    accountTypes.forEach((item: any) => {
      console.log(`\n${item.account_type}:`);
      console.log(`  name: ${item.name}`);
      console.log(`  conditions: ${item.conditions?.length || 0}`);
    });

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error);
  }

  process.exit(0);
}

testDrizzle();
