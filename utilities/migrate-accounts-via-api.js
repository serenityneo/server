/**
 * Execute account number migration via API
 * Uses the running backend server to avoid connection timeouts
 */

const API_URL = 'http://localhost:3001/api/v1/admin/migrate-account-numbers';
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN || 'your-secure-admin-token-here';

async function runMigration() {
  console.log('🚀 Starting account number migration via API...\n');
  console.log('📡 Connecting to:', API_URL);
  console.log('');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      },
      body: JSON.stringify({}) // Empty body but valid JSON
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }

    const result = await response.json();
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 MIGRATION RESULT');
    console.log('='.repeat(80));
    console.log(JSON.stringify(result, null, 2));
    console.log('='.repeat(80));
    
    if (result.success) {
      console.log('\n✨ Migration completed successfully!');
      process.exit(0);
    } else {
      console.log('\n❌ Migration failed. Check logs above.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error executing migration:', error.message);
    process.exit(1);
  }
}

runMigration();
