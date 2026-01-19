/**
 * Test dashboard performance - measure P90/P95 metrics
 */

const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

async function measureDashboardQuery(iteration) {
  const startTime = performance.now();
  
  try {
    // Run the ultra-optimized single query
    const [result] = await sql`
      WITH stats AS (
        SELECT 
          -- User stats
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
          (SELECT COUNT(*) FROM users WHERE mfa_enabled = true) as mfa_users,
          -- Customer stats
          (SELECT COUNT(*) FROM customers) as total_customers,
          (SELECT COUNT(*) FROM customers WHERE status = 'ACTIVE') as active_customers,
          (SELECT COUNT(*) FROM customers WHERE mfa_enabled = true) as mfa_customers,
          (SELECT COUNT(*) FROM customers WHERE kyc_status IN ('KYC1_PENDING', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW')) as pending_kyc,
          (SELECT COUNT(*) FROM customers WHERE kyc_status = 'KYC2_VERIFIED') as verified_kyc,
          (SELECT COUNT(*) FROM customers WHERE status IN ('SUSPENDED', 'CLOSED')) as security_alerts
      ),
      -- Pre-calculate month boundaries
      month_0 AS (SELECT date_trunc('month', CURRENT_DATE) as start_date),
      month_1 AS (SELECT date_trunc('month', CURRENT_DATE - interval '1 month') as start_date),
      month_2 AS (SELECT date_trunc('month', CURRENT_DATE - interval '2 months') as start_date),
      month_3 AS (SELECT date_trunc('month', CURRENT_DATE - interval '3 months') as start_date),
      month_4 AS (SELECT date_trunc('month', CURRENT_DATE - interval '4 months') as start_date),
      month_5 AS (SELECT date_trunc('month', CURRENT_DATE - interval '5 months') as start_date),
      -- Growth stats (simplified - only count customers, not users)
      growth AS (
        SELECT 
          to_char(month_5.start_date, 'Mon') as month_5_label,
          (SELECT COUNT(*) FROM customers WHERE created_at >= month_5.start_date AND created_at < month_4.start_date) as month_5_users,
          (SELECT COUNT(*) FROM customers WHERE created_at >= month_5.start_date AND created_at < month_4.start_date AND kyc_status IN ('KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED')) as month_5_kyc,
          to_char(month_4.start_date, 'Mon') as month_4_label,
          (SELECT COUNT(*) FROM customers WHERE created_at >= month_4.start_date AND created_at < month_3.start_date) as month_4_users,
          (SELECT COUNT(*) FROM customers WHERE created_at >= month_4.start_date AND created_at < month_3.start_date AND kyc_status IN ('KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED')) as month_4_kyc,
          to_char(month_3.start_date, 'Mon') as month_3_label,
          (SELECT COUNT(*) FROM customers WHERE created_at >= month_3.start_date AND created_at < month_2.start_date) as month_3_users,
          (SELECT COUNT(*) FROM customers WHERE created_at >= month_3.start_date AND created_at < month_2.start_date AND kyc_status IN ('KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED')) as month_3_kyc,
          to_char(month_2.start_date, 'Mon') as month_2_label,
          (SELECT COUNT(*) FROM customers WHERE created_at >= month_2.start_date AND created_at < month_1.start_date) as month_2_users,
          (SELECT COUNT(*) FROM customers WHERE created_at >= month_2.start_date AND created_at < month_1.start_date AND kyc_status IN ('KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED')) as month_2_kyc,
          to_char(month_1.start_date, 'Mon') as month_1_label,
          (SELECT COUNT(*) FROM customers WHERE created_at >= month_1.start_date AND created_at < month_0.start_date) as month_1_users,
          (SELECT COUNT(*) FROM customers WHERE created_at >= month_1.start_date AND created_at < month_0.start_date AND kyc_status IN ('KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED')) as month_1_kyc,
          to_char(month_0.start_date, 'Mon') as month_0_label,
          (SELECT COUNT(*) FROM customers WHERE created_at >= month_0.start_date) as month_0_users,
          (SELECT COUNT(*) FROM customers WHERE created_at >= month_0.start_date AND kyc_status IN ('KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED')) as month_0_kyc
        FROM month_0, month_1, month_2, month_3, month_4, month_5
      )
      SELECT 
        s.*,
        g.month_5_label, g.month_5_users, g.month_5_kyc,
        g.month_4_label, g.month_4_users, g.month_4_kyc,
        g.month_3_label, g.month_3_users, g.month_3_kyc,
        g.month_2_label, g.month_2_users, g.month_2_kyc,
        g.month_1_label, g.month_1_users, g.month_1_kyc,
        g.month_0_label, g.month_0_users, g.month_0_kyc
      FROM stats s, growth g
    `;
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    return {
      iteration,
      duration: Math.round(duration),
      success: true
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      iteration,
      duration: Math.round(endTime - startTime),
      success: false,
      error: error.message
    };
  }
}

async function runPerformanceTest() {
  console.log('🚀 Dashboard Performance Test\n');
  console.log('Running 20 iterations to measure P90/P95...\n');
  
  const results = [];
  
  // Warm-up run (not counted)
  await measureDashboardQuery(0);
  
  // Run 20 test iterations
  for (let i = 1; i <= 20; i++) {
    const result = await measureDashboardQuery(i);
    results.push(result);
    process.stdout.write(`Iteration ${i}/20: ${result.duration}ms ${result.success ? '✓' : '✗'}\r`);
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between tests
  }
  
  console.log('\n');
  
  // Calculate statistics
  const durations = results.map(r => r.duration).sort((a, b) => a - b);
  const successCount = results.filter(r => r.success).length;
  
  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const min = durations[0];
  const max = durations[durations.length - 1];
  const median = durations[Math.floor(durations.length / 2)];
  const p90 = durations[Math.floor(durations.length * 0.9)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const p99 = durations[Math.floor(durations.length * 0.99)];
  
  console.log('📊 Results:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Success Rate: ${successCount}/${results.length} (${Math.round(successCount/results.length*100)}%)`);
  console.log(`Min:    ${min}ms`);
  console.log(`Avg:    ${avg}ms`);
  console.log(`Median: ${median}ms`);
  console.log(`P90:    ${p90}ms ${p90 < 200 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`P95:    ${p95}ms ${p95 < 200 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`P99:    ${p99}ms`);
  console.log(`Max:    ${max}ms`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (p90 < 200 && p95 < 200) {
    console.log('\n🎉 Performance target achieved! P90 and P95 < 200ms');
  } else {
    console.log('\n⚠️  Performance target not met. P90 or P95 >= 200ms');
  }
  
  await sql.end();
}

runPerformanceTest().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
