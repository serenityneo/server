#!/usr/bin/env node

const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function testMigration() {
  await client.connect();
  console.log('✅ Connected to database\n');

  try {
    // Test 1: Create agents table
    console.log('🔄 Creating agents table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
          id SERIAL PRIMARY KEY,
          code VARCHAR(5) UNIQUE NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('PHYSICAL', 'VIRTUAL')),
          name TEXT NOT NULL,
          agency_id INTEGER,
          is_active BOOLEAN DEFAULT true NOT NULL,
          created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    console.log('✅ Agents table created\n');

    // Test 2: Check if we can query it
    const result = await client.query('SELECT COUNT(*) FROM agents;');
    console.log(`✅ Agents table has ${result.rows[0].count} rows\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('SQL State:', error.code);
    console.error('Position:', error.position);
  } finally {
    await client.end();
  }
}

testMigration();
