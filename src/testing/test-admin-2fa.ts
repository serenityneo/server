/**
 * Unit Tests for Admin 2FA Verification
 * 
 * Tests the AdminTwoFactorService.verifyTwoFactor method
 * to ensure robust error handling and correct verification logic.
 * 
 * Run with: npm run test:2fa
 */

import { AdminTwoFactorService } from '../modules/admin/services/two-factor.service';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { authenticator } from 'otplib';

const adminTwoFactorService = new AdminTwoFactorService();

// Test configuration
const TEST_USER_ID = 1; // Adjust based on your test database
const INVALID_USER_ID = 999999;

// Color codes for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    reset: '\x1b[0m'
};

function logTest(name: string, passed: boolean, details?: string) {
    const icon = passed ? '✓' : '✗';
    const color = passed ? colors.green : colors.red;
    console.log(`${color}${icon} ${name}${colors.reset}`);
    if (details) {
        console.log(`  ${colors.blue}${details}${colors.reset}`);
    }
}

async function runTests() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 Admin 2FA Verification Tests');
    console.log('='.repeat(60) + '\n');

    let passedTests = 0;
    let failedTests = 0;

    // Test 1: Invalid input parameters - missing userId
    try {
        console.log('Test 1: Invalid input - missing userId');
        const result = await adminTwoFactorService.verifyTwoFactor(0, '123456');
        const passed = !result.valid && result.error === 'Paramètres invalides';
        logTest('Should reject missing userId', passed, `Result: ${JSON.stringify(result)}`);
        passed ? passedTests++ : failedTests++;
    } catch (error) {
        logTest('Should reject missing userId', false, `Unexpected error: ${error}`);
        failedTests++;
    }

    // Test 2: Invalid input parameters - missing code
    try {
        console.log('\nTest 2: Invalid input - missing code');
        const result = await adminTwoFactorService.verifyTwoFactor(TEST_USER_ID, '');
        const passed = !result.valid && result.error === 'Paramètres invalides';
        logTest('Should reject missing code', passed, `Result: ${JSON.stringify(result)}`);
        passed ? passedTests++ : failedTests++;
    } catch (error) {
        logTest('Should reject missing code', false, `Unexpected error: ${error}`);
        failedTests++;
    }

    // Test 3: User not found
    try {
        console.log('\nTest 3: User not found');
        const result = await adminTwoFactorService.verifyTwoFactor(INVALID_USER_ID, '123456');
        const passed = !result.valid && result.error === 'Utilisateur introuvable';
        logTest('Should reject non-existent user', passed, `Result: ${JSON.stringify(result)}`);
        passed ? passedTests++ : failedTests++;
    } catch (error) {
        logTest('Should reject non-existent user', false, `Unexpected error: ${error}`);
        failedTests++;
    }

    // Test 4: 2FA not enabled for user
    try {
        console.log('\nTest 4: 2FA not enabled');
        // First, check if there's a user without 2FA
        const [userWithout2FA] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.mfaEnabled, false))
            .limit(1);

        if (userWithout2FA) {
            const result = await adminTwoFactorService.verifyTwoFactor(userWithout2FA.id, '123456');
            const passed = !result.valid && result.error === '2FA non configuré pour ce compte';
            logTest('Should reject user without 2FA', passed, `Result: ${JSON.stringify(result)}`);
            passed ? passedTests++ : failedTests++;
        } else {
            logTest('Should reject user without 2FA', false, 'No user without 2FA found in database');
            console.log(`  ${colors.yellow}⚠ Skipped: No test user without 2FA available${colors.reset}`);
        }
    } catch (error) {
        logTest('Should reject user without 2FA', false, `Unexpected error: ${error}`);
        failedTests++;
    }

    // Test 5: Invalid TOTP code
    try {
        console.log('\nTest 5: Invalid TOTP code');
        // Find a user with 2FA enabled
        const [userWith2FA] = await db
            .select({ id: users.id, mfaSecret: users.mfaSecret })
            .from(users)
            .where(eq(users.mfaEnabled, true))
            .limit(1);

        if (userWith2FA && userWith2FA.mfaSecret) {
            const result = await adminTwoFactorService.verifyTwoFactor(userWith2FA.id, '000000');
            const passed = !result.valid && result.failedAttempts !== undefined;
            logTest('Should reject invalid TOTP code', passed, `Result: valid=${result.valid}, failedAttempts=${result.failedAttempts}`);
            passed ? passedTests++ : failedTests++;
        } else {
            logTest('Should reject invalid TOTP code', false, 'No user with 2FA found in database');
            console.log(`  ${colors.yellow}⚠ Skipped: No test user with 2FA available${colors.reset}`);
        }
    } catch (error) {
        logTest('Should reject invalid TOTP code', false, `Unexpected error: ${error}`);
        failedTests++;
    }

    // Test 6: Valid TOTP code
    try {
        console.log('\nTest 6: Valid TOTP code');
        // Find a user with 2FA enabled
        const [userWith2FA] = await db
            .select({ id: users.id, mfaSecret: users.mfaSecret })
            .from(users)
            .where(eq(users.mfaEnabled, true))
            .limit(1);

        if (userWith2FA && userWith2FA.mfaSecret) {
            // Generate a valid TOTP code
            const validCode = authenticator.generate(userWith2FA.mfaSecret);
            console.log(`  Generated valid code: ${validCode}`);

            const result = await adminTwoFactorService.verifyTwoFactor(userWith2FA.id, validCode);
            const passed = result.valid === true;
            logTest('Should accept valid TOTP code', passed, `Result: ${JSON.stringify(result)}`);
            passed ? passedTests++ : failedTests++;
        } else {
            logTest('Should accept valid TOTP code', false, 'No user with 2FA found in database');
            console.log(`  ${colors.yellow}⚠ Skipped: No test user with 2FA available${colors.reset}`);
        }
    } catch (error) {
        logTest('Should accept valid TOTP code', false, `Unexpected error: ${error}`);
        failedTests++;
    }

    // Test 7: Backup code verification
    try {
        console.log('\nTest 7: Valid backup code');
        // Find a user with 2FA and backup codes
        const [userWith2FA] = await db
            .select({ id: users.id, mfaBackupCodes: users.mfaBackupCodes })
            .from(users)
            .where(eq(users.mfaEnabled, true))
            .limit(1);

        if (userWith2FA && userWith2FA.mfaBackupCodes && (userWith2FA.mfaBackupCodes as string[]).length > 0) {
            const backupCodes = userWith2FA.mfaBackupCodes as string[];
            const testBackupCode = backupCodes[0];
            console.log(`  Using backup code: ${testBackupCode}`);

            const result = await adminTwoFactorService.verifyTwoFactor(userWith2FA.id, testBackupCode);
            const passed = result.valid === true;
            logTest('Should accept valid backup code', passed, `Result: ${JSON.stringify(result)}`);
            passed ? passedTests++ : failedTests++;

            // Verify the backup code was removed
            const [updatedUser] = await db
                .select({ mfaBackupCodes: users.mfaBackupCodes })
                .from(users)
                .where(eq(users.id, userWith2FA.id))
                .limit(1);

            const updatedCodes = updatedUser.mfaBackupCodes as string[];
            const codeRemoved = !updatedCodes.includes(testBackupCode);
            logTest('Should remove used backup code', codeRemoved, `Remaining codes: ${updatedCodes.length}`);
            codeRemoved ? passedTests++ : failedTests++;
        } else {
            logTest('Should accept valid backup code', false, 'No user with backup codes found');
            console.log(`  ${colors.yellow}⚠ Skipped: No test user with backup codes available${colors.reset}`);
        }
    } catch (error) {
        logTest('Should accept valid backup code', false, `Unexpected error: ${error}`);
        failedTests++;
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`${colors.green}✓ Passed: ${passedTests}${colors.reset}`);
    console.log(`${colors.red}✗ Failed: ${failedTests}${colors.reset}`);
    console.log(`Total: ${passedTests + failedTests}`);
    console.log('='.repeat(60) + '\n');

    process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
    console.error('Test suite failed:', error);
    process.exit(1);
});
