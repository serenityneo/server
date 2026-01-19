/**
 * Test script to debug customer 55 account summary
 */

const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

async function testCustomerSummary() {
  try {
    console.log('Testing customer ID 55 (bbasabana@gmail.com)...\n');

    // Test 1: Get customer with joins
    console.log('=== Test 1: Customer with LEFT JOINs ===');
    const customerResult = await sql`
      SELECT 
        c.*,
        a.name as agency_name,
        a.code as agency_code,
        u.email as agent_email,
        u.username as agent_username,
        q.name as quartier_name,
        co.name as commune_name,
        p.code as postal_code
      FROM customers c
      LEFT JOIN agencies a ON c.agency_id = a.id
      LEFT JOIN users u ON c.agent_id = u.id
      LEFT JOIN quartiers q ON c.quartier_id = q.id
      LEFT JOIN communes co ON q.commune_id = co.id
      LEFT JOIN postal_codes p ON c.postal_code_id = p.id
      WHERE c.id = 55
      LIMIT 1
    `;
    console.log('Customer:', customerResult[0] ? 'Found' : 'Not found');
    if (customerResult[0]) {
      console.log('  ID:', customerResult[0].id);
      console.log('  Name:', customerResult[0].first_name, customerResult[0].last_name);
      console.log('  Email:', customerResult[0].email);
      console.log('  CIF:', customerResult[0].cif);
      console.log('  Agency:', customerResult[0].agency_name);
      console.log('  Agent:', customerResult[0].agent_username || customerResult[0].agent_email);
      console.log('  Quartier:', customerResult[0].quartier_name);
    }

    // Test 2: Get accounts
    console.log('\n=== Test 2: Accounts ===');
    const accounts = await sql`
      SELECT id, account_type, account_number, balance_usd, balance_cdf, status
      FROM accounts
      WHERE customer_id = 55
      ORDER BY account_type
    `;
    console.log(`Found ${accounts.length} accounts`);
    accounts.forEach(acc => {
      console.log(`  ${acc.account_type}: ${acc.account_number} (USD: ${acc.balance_usd})`);
    });

    // Test 3: Transaction stats
    console.log('\n=== Test 3: Transaction Stats ===');
    const txStats = await sql`
      SELECT 
        COUNT(*) as total_transactions,
        MAX(created_at) as last_transaction_date,
        EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 86400 as account_age_days
      FROM transactions
      WHERE account_id IN (
        SELECT id FROM accounts WHERE customer_id = 55
      )
    `;
    console.log('Transaction stats:', txStats[0]);

    // Test 4: Credit stats
    console.log('\n=== Test 4: Credit Stats ===');
    const creditStats = await sql`
      SELECT 
        COUNT(*) as total_credits,
        SUM(CASE WHEN status IN ('DISBURSED', 'ACTIVE') THEN 1 ELSE 0 END) as active_credits,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_credits,
        SUM(CASE WHEN status = 'DEFAULTED' THEN 1 ELSE 0 END) as defaulted_credits,
        COALESCE(SUM(CAST(approved_amount_usd AS NUMERIC)), 0) as total_disbursed,
        COALESCE(SUM(CAST(total_paid_usd AS NUMERIC)), 0) as total_repaid
      FROM credit_applications
      WHERE customer_id = 55
    `;
    console.log('Credit stats:', creditStats[0]);

    // Test 5: MOPAO sponsorships
    console.log('\n=== Test 5: MOPAO Sponsorships ===');
    const sponsorships = await sql`
      SELECT 
        SUM(CASE WHEN sponsor_customer_id = 55 AND is_active = true THEN 1 ELSE 0 END) as sponsor_active,
        SUM(CASE WHEN sponsor_customer_id = 55 THEN 1 ELSE 0 END) as sponsor_total,
        SUM(CASE WHEN sponsor_customer_id = 55 AND is_active = true THEN CAST(sponsor_s02_locked_amount_usd AS NUMERIC) ELSE 0 END) as total_locked,
        SUM(CASE WHEN sponsored_customer_id = 55 AND is_active = true THEN 1 ELSE 0 END) as sponsored_active,
        SUM(CASE WHEN sponsored_customer_id = 55 THEN 1 ELSE 0 END) as sponsored_total
      FROM mopao_sponsorships
      WHERE sponsor_customer_id = 55 OR sponsored_customer_id = 55
    `;
    console.log('Sponsorship stats:', sponsorships[0]);

    // Test 6: Bwakisa service
    console.log('\n=== Test 6: Bwakisa Service ===');
    const bwakisa = await sql`
      SELECT * FROM bwakisa_services
      WHERE customer_id = 55 AND status = 'ACTIVE'
      LIMIT 1
    `;
    console.log('Bwakisa service:', bwakisa.length > 0 ? 'Active' : 'None');

    // Test 7: Virtual Prison
    console.log('\n=== Test 7: Virtual Prison ===');
    const prison = await sql`
      SELECT * FROM credit_virtual_prison
      WHERE customer_id = 55 AND is_active = true
      LIMIT 1
    `;
    console.log('Virtual prison:', prison.length > 0 ? 'In prison' : 'Free');

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

testCustomerSummary();
