/**
 * MIGRATION SCRIPT: Update Account Numbers to Use Real CIF
 * 
 * Problem: Old accounts use "CIF" text in account numbers (e.g., S01-CIF-20251227-001)
 * Solution: Replace with actual CIF value (e.g., S01-71094594-20251227-001)
 * 
 * This script:
 * 1. Finds all customers with valid CIF
 * 2. Updates their account numbers to use real CIF
 * 3. Preserves date and sequence number
 */

import { db } from '../db';
import { customers, accounts } from '../db/schema';
import { eq, isNotNull, sql } from 'drizzle-orm';

async function migrateAccountNumbers() {
  console.log('🔄 Starting account number migration to real CIF...\n');

  try {
    // Get all customers with valid CIF
    const allCustomers = await db
      .select({
        id: customers.id,
        cif: customers.cif,
        cifCode: customers.cifCode,
        firstName: customers.firstName,
        lastName: customers.lastName,
      })
      .from(customers)
      .where(isNotNull(customers.cif));

    console.log(`📊 Found ${allCustomers.length} customers with CIF to process\n`);

    let totalUpdated = 0;
    let customersProcessed = 0;
    let errors = 0;

    for (const customer of allCustomers) {
      try {
        // Get all accounts for this customer
        const customerAccounts = await db
          .select()
          .from(accounts)
          .where(eq(accounts.customerId, customer.id));

        if (customerAccounts.length === 0) {
          console.log(`⚠️  Customer ${customer.id} (${customer.firstName} ${customer.lastName}) has no accounts - skipping`);
          continue;
        }

        console.log(`\n👤 Processing Customer ${customer.id}: ${customer.firstName} ${customer.lastName}`);
        console.log(`   CIF: ${customer.cif}`);
        console.log(`   Accounts found: ${customerAccounts.length}`);

        let accountsUpdated = 0;

        for (const account of customerAccounts) {
          const oldAccountNumber = account.accountNumber;

          // Check if account number contains "CIF" text (old format)
          if (!oldAccountNumber || !oldAccountNumber.includes('-CIF-')) {
            console.log(`   ℹ️  Account ${account.id} already has correct format or no number - skipping`);
            continue;
          }

          // Extract components from old account number
          // Old format: S01-CIF-20251227-001
          // New format: S01-71094594-20251227-001
          const parts = oldAccountNumber.split('-');
          
          if (parts.length !== 4 || parts[1] !== 'CIF') {
            console.log(`   ⚠️  Account ${account.id} has unexpected format: ${oldAccountNumber} - skipping`);
            continue;
          }

          const accountType = parts[0];  // S01, S02, etc.
          const dateStr = parts[2];       // 20251227
          const sequence = parts[3];      // 001, 002, etc.

          // Build new account number with real CIF
          const newAccountNumber = `${accountType}-${customer.cif}-${dateStr}-${sequence}`;

          // Update account number in database
          await db
            .update(accounts)
            .set({ 
              accountNumber: newAccountNumber,
              updatedAt: new Date().toISOString()
            })
            .where(eq(accounts.id, account.id));

          console.log(`   ✅ Updated account ${account.id}:`);
          console.log(`      OLD: ${oldAccountNumber}`);
          console.log(`      NEW: ${newAccountNumber}`);

          accountsUpdated++;
          totalUpdated++;
        }

        customersProcessed++;
        console.log(`   📝 Summary: ${accountsUpdated}/${customerAccounts.length} accounts updated for this customer`);

      } catch (error) {
        errors++;
        console.error(`   ❌ Error processing customer ${customer.id}:`, error);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ Customers processed: ${customersProcessed}/${allCustomers.length}`);
    console.log(`✅ Total accounts updated: ${totalUpdated}`);
    console.log(`❌ Errors encountered: ${errors}`);
    console.log('='.repeat(80));

    if (errors === 0) {
      console.log('\n✨ Migration completed successfully!');
    } else {
      console.log(`\n⚠️  Migration completed with ${errors} errors. Please review logs above.`);
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ FATAL ERROR during migration:', error);
    process.exit(1);
  }
}

// Run migration
console.log('🚀 Account Number Migration Script');
console.log('📝 This will update all account numbers to use real CIF values');
console.log('⚠️  Make sure you have a database backup before proceeding!\n');

migrateAccountNumbers();
