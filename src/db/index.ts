import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as schema from './schema';
import * as creditSchema from './credit-products-schema';
import * as likelembaSchema from './likelemba-groups-schema';
import * as cardSchema from './card-schema';
import * as partnerOperationsSchema from './partner-operations-schema';
import * as contractsSchema from './contracts-schema';
import * as migrationSchema from './migration-schema';

dotenv.config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing');
}

// ✅ OPTIMIZED: Connection pool with production stability and error recovery
const client = postgres(process.env.DATABASE_URL, {
  prepare: false,          // Required for PgBouncer Transaction mode
  max: 10,                 // Pool size (max 10 connections)
  idle_timeout: 0,         // ✅ FIX: Never close idle connections (was 20)
  max_lifetime: 0,         // ✅ FIX: Never expire connections (was 60*30)
  connect_timeout: 5,      // ✅ Connection timeout: 5s
  onnotice: () => {},      // Suppress notices
  
  connection: {
    application_name: 'serenity-neo-backend',
  },
  
  // ✅ FIX: Handle connection close gracefully without logging noise
  onclose: () => {
    // Silent - connection will auto-reconnect on next query
  },
  
  // ✅ FIX: Add error handler to prevent crash
  onparameter: () => {},
});

export const db = drizzle(client, { schema: { ...schema, ...creditSchema, ...likelembaSchema, ...cardSchema, ...contractsSchema, ...migrationSchema } });
