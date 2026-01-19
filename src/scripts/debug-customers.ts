
import { db } from '../db';
import { customers } from '../db/schema';
import { count } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
    console.log('🔍 Checking customers in database...');
    console.log('DATABASE_URL starts with:', process.env.DATABASE_URL?.substring(0, 20));

    try {
        const [result] = await db.select({ count: count() }).from(customers);
        console.log(`✅ Total customers found: ${result.count}`);

        if (result.count > 0) {
            const sample = await db.select().from(customers).limit(5);
            console.log('📋 Sample customers:', JSON.stringify(sample.map(c => ({
                id: c.id,
                firstName: c.firstName,
                lastName: c.lastName,
                email: c.email,
                kycStatus: c.kycStatus
            })), null, 2));
        } else {
            console.log('⚠️ No customers found in the table.');
        }
    } catch (error) {
        console.error('❌ Database error:', error);
    } finally {
        process.exit(0);
    }
}

main();
