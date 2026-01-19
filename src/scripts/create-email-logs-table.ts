import * as dotenv from 'dotenv';
import path from 'path';
import { Client } from 'pg';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
    console.log('🔄 Initializing direct database connection for email_logs...');

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('❌ DATABASE_URL is missing.');
        process.exit(1);
    }

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
    });

    try {
        await client.connect();
        console.log('✅ Connected.');

        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS email_logs (
        id SERIAL PRIMARY KEY,
        recipient TEXT NOT NULL,
        email_type TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT NOT NULL,
        resend_id TEXT,
        error_message TEXT,
        metadata JSONB,
        sent_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE INDEX IF NOT EXISTS email_logs_recipient_idx ON email_logs (recipient ASC NULLS LAST);
      CREATE INDEX IF NOT EXISTS email_logs_sent_at_idx ON email_logs (sent_at DESC NULLS LAST);
    `;

        console.log('🛠️ Creating email_logs table...');
        await client.query(createTableSQL);
        console.log('✅ Success: email_logs table ready.');

        await client.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        try { await client.end(); } catch { }
        process.exit(1);
    }
}

main();
