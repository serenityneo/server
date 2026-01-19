import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from '../db';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
    console.log('Running migrations...');
    await migrate(db, { migrationsFolder: 'drizzle' });
    console.log('Migrations complete!');
    process.exit(0);
}

main().catch((err) => {
    console.error('Migration failed!', err);
    process.exit(1);
});
