
import { db } from '../db';
import { customers, accounts, bwakisaServices } from '../db/schema';
import { eq, isNull } from 'drizzle-orm';

async function backfillAccounts() {
    console.log('Starting backfill process...');

    try {
        // 1. Find customers without CIF code (or we can just check those without accounts, but CIF is a good proxy for "fully initialized")
        const usersToBackfill = await db.select().from(customers).where(isNull(customers.cifCode));

        console.log(`Found ${usersToBackfill.length} customers to backfill.`);

        for (const customer of usersToBackfill) {
            console.log(`Processing customer ID: ${customer.id} (${customer.email})...`);

            await db.transaction(async (tx) => {
                // Generate CIF
                const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
                const cifCode = `CIF-${dateStr}-${randomSuffix}`;

                // Update Customer
                await tx.update(customers)
                    .set({
                        cifCode: cifCode,
                        kycStatus: customer.kycStatus === 'NOT_STARTED' ? 'KYC1_PENDING' : customer.kycStatus, // Ensure at least pending if they are in system
                        accountCreationDate: new Date().toISOString(),
                    })
                    .where(eq(customers.id, customer.id));

                // Create Accounts
                // S01 - Compte Courant
                await tx.insert(accounts).values({
                    customerId: customer.id,
                    accountNumber: cifCode, // Main account uses CIF
                    accountType: 'S01_STANDARD',
                    currency: 'USD',
                    balanceCdf: '0',
                    balanceUsd: '0',
                    status: 'ACTIVE',
                    openedDate: new Date().toISOString(),
                });

                // S02 - Epargne Obligatoire
                await tx.insert(accounts).values({
                    customerId: customer.id,
                    accountNumber: `${cifCode}-S02`,
                    accountType: 'S02_MANDATORY_SAVINGS',
                    currency: 'USD',
                    balanceCdf: '0',
                    balanceUsd: '0',
                    status: 'ACTIVE', // Or LOCKED? User said "Locked" in UI, but DB status might be ACTIVE but restricted. Let's keep ACTIVE for now and handle UI lock.
                    openedDate: new Date().toISOString(),
                });

                // S03 - Caution (Locked)
                await tx.insert(accounts).values({
                    customerId: customer.id,
                    accountNumber: `${cifCode}-S03`,
                    accountType: 'S03_CAUTION',
                    currency: 'USD',
                    balanceCdf: '0',
                    balanceUsd: '0',
                    status: 'INACTIVE',
                    openedDate: new Date().toISOString(),
                });

                // S04 - Credit (Locked)
                await tx.insert(accounts).values({
                    customerId: customer.id,
                    accountNumber: `${cifCode}-S04`,
                    accountType: 'S04_CREDIT',
                    currency: 'USD',
                    balanceCdf: '0',
                    balanceUsd: '0',
                    status: 'INACTIVE',
                    openedDate: new Date().toISOString(),
                });

                // S05 - Bwakisa Carte (Service)
                // Also create the account for it
                await tx.insert(accounts).values({
                    customerId: customer.id,
                    accountNumber: `${cifCode}-S05`,
                    accountType: 'S05_BWAKISA_CARTE',
                    currency: 'USD',
                    balanceCdf: '0',
                    balanceUsd: '0',
                    status: 'INACTIVE',
                    openedDate: new Date().toISOString(),
                });

                // S06 - Fines (Locked)
                await tx.insert(accounts).values({
                    customerId: customer.id,
                    accountNumber: `${cifCode}-S06`,
                    accountType: 'S06_FINES',
                    currency: 'USD',
                    balanceCdf: '0',
                    balanceUsd: '0',
                    status: 'INACTIVE',
                    openedDate: new Date().toISOString(),
                });

                // Activate Default Bwakisa Service (as per account.service.ts logic)
                await tx.insert(bwakisaServices).values({
                    customerId: customer.id,
                    periodicity: 'DAILY',
                    status: 'ACTIVE',
                    startDate: new Date(),
                });
            });
            console.log(`Finished customer ID: ${customer.id}`);
        }

        console.log('Backfill completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Backfill failed:', error);
        process.exit(1);
    }
}

backfillAccounts();
