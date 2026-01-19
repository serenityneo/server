import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function checkBasicConnection() {
  console.log('🔍 Testing basic database connection...\n');

  try {
    // Test connection
    const result = await db.execute(sql`SELECT current_database(), current_user, version()`);
    const row = (result as any).rows?.[0];
    console.log('✅ Connected to database:', row?.current_database);
    console.log('   User:', row?.current_user);
    console.log('   Version:', row?.version?.substring(0, 50) + '...');

    // List all tables
    console.log('\n=== All tables in database ===');
    const tables = await db.execute(sql`
      SELECT schemaname, tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const tableRows = (tables as any).rows || [];
    console.log(`Found ${tableRows.length} tables:`);
    tableRows.forEach((t: any) => {
      console.log(`  - ${t.tablename}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit(0);
}

checkBasicConnection();
