/**
 * Test the account types conditions API query directly
 */

import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testQuery() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('No DATABASE_URL found!');
    process.exit(1);
  }

  const client = postgres(dbUrl, { prepare: false });

  try {
    console.log('Testing API query...\n');
    
    // Same query as the API endpoint
    const result = await client`
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
    `;

    console.log('Query returned', result.length, 'account types:\n');
    
    result.forEach((row: any) => {
      console.log(`=== ${row.account_type} - ${row.name} ===`);
      console.log(`  Label: ${row.label}`);
      console.log(`  Description: ${row.description}`);
      console.log(`  Conditions (${row.conditions?.length || 0}):`);
      if (row.conditions && row.conditions.length > 0) {
        row.conditions.forEach((c: any) => {
          console.log(`    - [${c.conditionType}] ${c.conditionLabel}`);
        });
      } else {
        console.log('    - No conditions');
      }
      console.log('');
    });

    console.log('\n=== JSON Output (for API response) ===\n');
    console.log(JSON.stringify({ success: true, accountTypes: result }, null, 2));

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    await client.end();
    process.exit(0);
  }
}

testQuery();
