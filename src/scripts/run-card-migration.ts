/**
 * Card Schema Migration Script
 * Run this to apply the card schema to the database
 */

import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

async function runMigration() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing');
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log('Running card schema migration...');
    
    const migrationPath = path.join(__dirname, '../../drizzle/card-schema-migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    // Split by statement-breakpoint and execute each statement
    const statements = migrationSQL.split(/;\s*$/m).filter(s => s.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await sql.unsafe(statement);
        console.log('✓ Executed statement');
      }
    }
    
    console.log('✅ Card schema migration completed successfully!');
  } catch (error: any) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    await sql.end();
  }
}

runMigration();
