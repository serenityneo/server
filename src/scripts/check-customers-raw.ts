
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('❌ DATABASE_URL is missing in .env.local');
        process.exit(1);
    }

    console.log('🔌 Connecting to DB (max 1)...');
    const sql = postgres(url, { max: 1, connect_timeout: 5 });

    try {
        const result = await sql`select count(*) as count from customers`;
        console.log(`✅ Total customers: ${result[0].count}`);

        if (result[0].count > 0) {
            const customers = await sql`
        select id, "firstName", "lastName", "email", "kycStatus" 
        from customers 
        limit 5
      `;
            console.log('📋 Sample customers:', JSON.stringify(customers, null, 2));
        } else {
            console.log('⚠️ Table is empty.');
        }
    } catch (err) {
        console.error('❌ Query failed:', err);
    } finally {
        await sql.end();
    }
}

main();
