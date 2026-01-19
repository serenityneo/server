import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local or .env
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { getPool } from '../services/db';

async function main() {
    console.log('🔄 Initializing database connection...');
    const pool = getPool();

    if (!pool) {
        console.error('❌ Failed to initialize database pool. Check DATABASE_URL.');
        process.exit(1);
    }

    const createTableSQL = `
    CREATE TABLE IF NOT EXISTS system_errors (
      id SERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      stack TEXT,
      path TEXT,
      method TEXT,
      user_id INTEGER REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
      severity TEXT DEFAULT 'CRITICAL' NOT NULL,
      metadata JSONB,
      is_resolved BOOLEAN DEFAULT FALSE NOT NULL,
      resolved_at TIMESTAMP(3),
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE INDEX IF NOT EXISTS system_errors_created_at_idx ON system_errors (created_at DESC NULLS LAST);
    CREATE INDEX IF NOT EXISTS system_errors_severity_idx ON system_errors (severity ASC NULLS LAST);
  `;

    try {
        console.log('🛠️ Creating system_errors table...');
        await pool.query(createTableSQL);
        console.log('✅ Success: system_errors table created (or already exists).');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating table:', error);
        process.exit(1);
    }
}

main();
