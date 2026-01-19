/**
 * Migration: Add operation_type, operation_id, metadata columns to serenity_points_ledger
 * 
 * This migration adds tracking fields to support the unified LoyaltyPointsService
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  console.log('🔧 Connecting to database...');
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    console.log('🚀 Starting migration: Add columns to serenity_points_ledger...\n');

    // Check if columns already exist
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'serenity_points_ledger' 
      AND column_name IN ('operation_type', 'operation_id', 'metadata');
    `;
    
    const existingColumns = await client.unsafe(checkQuery);
    const columnNames = existingColumns.map((row: any) => row.column_name);

    if (columnNames.length === 3) {
      console.log('✅ All columns already exist. Skipping migration.');
      return;
    }

    // Add operation_type column
    if (!columnNames.includes('operation_type')) {
      console.log('📝 Adding operation_type column...');
      await client.unsafe(`
        ALTER TABLE serenity_points_ledger 
        ADD COLUMN IF NOT EXISTS operation_type VARCHAR(50);
      `);
      console.log('✅ operation_type column added');
    } else {
      console.log('⏭️  operation_type already exists');
    }

    // Add operation_id column
    if (!columnNames.includes('operation_id')) {
      console.log('📝 Adding operation_id column...');
      await client.unsafe(`
        ALTER TABLE serenity_points_ledger 
        ADD COLUMN IF NOT EXISTS operation_id INTEGER;
      `);
      console.log('✅ operation_id column added');
    } else {
      console.log('⏭️  operation_id already exists');
    }

    // Add metadata column
    if (!columnNames.includes('metadata')) {
      console.log('📝 Adding metadata column...');
      await client.unsafe(`
        ALTER TABLE serenity_points_ledger 
        ADD COLUMN IF NOT EXISTS metadata JSONB;
      `);
      console.log('✅ metadata column added');
    } else {
      console.log('⏭️  metadata already exists');
    }

    // Create index for better query performance
    console.log('📝 Creating index on operation_type...');
    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_serenity_points_operation 
      ON serenity_points_ledger(operation_type);
    `);
    console.log('✅ Index created');

    // Create composite index for anti-fraud checking
    console.log('📝 Creating composite index for duplicate detection...');
    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_serenity_points_duplicate_check 
      ON serenity_points_ledger(customer_id, operation_type, operation_id);
    `);
    console.log('✅ Composite index created');

    // Verify the migration
    console.log('\n📊 Verifying migration...');
    const verifyQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'serenity_points_ledger' 
      AND column_name IN ('operation_type', 'operation_id', 'metadata')
      ORDER BY column_name;
    `;
    
    const columns = await client.unsafe(verifyQuery);
    console.table(columns);

    // Check indexes
    const indexQuery = `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'serenity_points_ledger'
      AND indexname LIKE 'idx_serenity_points%';
    `;
    
    const indexes = await client.unsafe(indexQuery);
    console.log('\n📋 Indexes:');
    indexes.forEach((idx: any) => {
      console.log(`  - ${idx.indexname}`);
    });

    console.log('\n✅ Migration completed successfully!');
    console.log('\n🎯 Next steps:');
    console.log('   1. LoyaltyPointsService is ready to use');
    console.log('   2. LoyaltyNotificationsService is ready to use');
    console.log('   3. Ready to integrate hooks into operations');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration error:', error);
    process.exit(1);
  });
