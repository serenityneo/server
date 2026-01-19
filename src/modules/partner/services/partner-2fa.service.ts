import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { db } from '../../../db';
import { customers } from '../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { resendEmailService } from '../../../services/resend-email.service';

/**
 * Partner Two-Factor Authentication Service
 * 
 * SECURITY REQUIREMENTS:
 * - Partners CAN activate/deactivate their 2FA
 * - Partners CANNOT change phone number without admin authorization
 * - High level of security protection throughout
 * - Rate limiting and audit logging for all 2FA operations
 */
export class Partner2FAService {
  private readonly APP_NAME = 'Serenity Neo - Partner Portal';
  private readonly MAX_ATTEMPTS_PER_HOUR = 5;
  private readonly BACKUP_CODE_COUNT = 10;

  /**
   * Generate cryptographically secure backup recovery codes
   */
  private generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric codes
      const code = randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Check rate limiting for 2FA operations
   * SECURITY: Prevent brute force attacks
   */
  private async checkRateLimit(partnerId: number, operation: string): Promise<boolean> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Count failed attempts in the last hour
    const [result] = await db.execute(sql`
      SELECT COUNT(*) as attempt_count
      FROM partner_operations
      WHERE partner_id = ${partnerId}
        AND operation_type = ${`2FA_${operation}`}
        AND status = 'FAILED'
        AND created_at >= ${oneHourAgo}
    `);

    const attemptCount = result?.attempt_count ? parseInt(result.attempt_count as string) : 0;

    if (attemptCount >= this.MAX_ATTEMPTS_PER_HOUR) {
      console.warn('[Partner 2FA] Rate limit exceeded:', {
        partnerId,
        operation,
        attemptCount
      });
      return false;
    }

    return true;
  }

  /**
   * Log 2FA operation for audit trail
   * SECURITY: Complete tracking of all 2FA changes
   */
  private async logOperation(
    partnerId: number,
    operationType: string,
    status: 'SUCCESS' | 'FAILED',
    metadata?: Record<string, any>
  ): Promise<void> {
    await db.execute(sql`
      INSERT INTO partner_operations (
        partner_id, 
        operation_type, 
        description, 
        status, 
        metadata,
        created_at
      ) VALUES (
        ${partnerId},
        ${`2FA_${operationType}`},
        ${`Partner 2FA ${operationType}`},
        ${status},
        ${JSON.stringify(metadata || {})}::jsonb,
        CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Setup 2FA for a partner - Generate secret and QR code
   * SECURITY: Mandatory 2FA after registration
   */
  async setupTwoFactor(partnerId: number) {
    try {
      // Verify this is actually a partner account
      const [partner] = await db
        .select({
          id: customers.id,
          customerType: customers.customerType,
          email: customers.email,
          mobileMoneyNumber: customers.mobileMoneyNumber,
          mfaEnabled: customers.mfaEnabled
        })
        .from(customers)
        .where(
          and(
            eq(customers.id, partnerId),
            eq(customers.customerType, 'PARTNER')
          )
        )
        .limit(1);

      if (!partner) {
        throw new Error('Partner account not found');
      }

      // Check rate limiting
      const canProceed = await this.checkRateLimit(partnerId, 'SETUP');
      if (!canProceed) {
        await this.logOperation(partnerId, 'SETUP', 'FAILED', { reason: 'Rate limit exceeded' });
        throw new Error('Too many 2FA setup attempts. Please try again in 1 hour.');
      }

      // Generate a unique secret for this partner
      const secret = authenticator.generateSecret();

      // Create identifier for QR code (use email or phone)
      const identifier = partner.email || partner.mobileMoneyNumber || `partner-${partnerId}`;

      // Generate OTPAuth URL for QR code
      const otpauthUrl = authenticator.keyuri(
        identifier,
        this.APP_NAME,
        secret
      );

      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

      // Generate backup codes
      const backupCodes = this.generateBackupCodes(this.BACKUP_CODE_COUNT);

      console.log('[Partner 2FA Setup] Secret and QR code generated:', {
        partnerId,
        identifier,
        secretLength: secret.length,
        backupCodeCount: backupCodes.length
      });

      await this.logOperation(partnerId, 'SETUP', 'SUCCESS', { identifier });

      return {
        success: true,
        secret,
        qrCodeUrl: qrCodeDataUrl,
        backupCodes,
        manualEntryKey: secret, // For manual entry in authenticator apps
        appName: this.APP_NAME
      };
    } catch (error) {
      await this.logOperation(partnerId, 'SETUP', 'FAILED', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to setup 2FA: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Enable 2FA - Verify code and save secret to database
   * SECURITY: Requires valid TOTP code verification before activation
   */
  async enableTwoFactor(partnerId: number, secret: string, code: string) {
    try {
      console.log('[Partner 2FA Enable] Starting verification:', {
        partnerId,
        codeLength: code.length,
        secretLength: secret.length
      });

      // Verify this is a partner account
      const [partner] = await db
        .select({
          id: customers.id,
          customerType: customers.customerType,
          mfaEnabled: customers.mfaEnabled
        })
        .from(customers)
        .where(
          and(
            eq(customers.id, partnerId),
            eq(customers.customerType, 'PARTNER')
          )
        )
        .limit(1);

      if (!partner) {
        throw new Error('Partner account not found');
      }

      // Check rate limiting
      const canProceed = await this.checkRateLimit(partnerId, 'ENABLE');
      if (!canProceed) {
        await this.logOperation(partnerId, 'ENABLE', 'FAILED', { reason: 'Rate limit exceeded' });
        throw new Error('Too many 2FA enable attempts. Please try again in 1 hour.');
      }

      // Configure authenticator with time window tolerance
      // This allows for clock drift between server and authenticator app
      authenticator.options = {
        window: 1, // Accept codes from ±30 seconds (90s total window)
      };

      // Verify the code against the secret
      const isValid = authenticator.verify({
        token: code,
        secret: secret
      });

      console.log('[Partner 2FA Enable] Verification result:', {
        isValid,
        partnerId,
        window: authenticator.options.window
      });

      if (!isValid) {
        await this.logOperation(partnerId, 'ENABLE', 'FAILED', { reason: 'Invalid code' });
        return {
          success: false,
          error: 'Invalid verification code. Please check that your device time is correct and try again.'
        };
      }

      // Generate backup codes
      const backupCodes = this.generateBackupCodes(this.BACKUP_CODE_COUNT);

      // Save to database - ENABLE 2FA
      await db
        .update(customers)
        .set({
          mfaEnabled: true,
          mfaSecret: secret,
          mfaBackupCodes: backupCodes,
          mfaConfiguredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, partnerId));

      console.log('[Partner 2FA Enable] Successfully enabled for partner:', partnerId);

      await this.logOperation(partnerId, 'ENABLE', 'SUCCESS', {
        backupCodeCount: backupCodes.length
      });

      return {
        success: true,
        backupCodes,
        message: '2FA successfully enabled for your partner account'
      };
    } catch (error) {
      console.error('[Partner 2FA Enable] Error:', error);
      await this.logOperation(partnerId, 'ENABLE', 'FAILED', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to enable 2FA: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Disable 2FA - Requires password verification
   * SECURITY: Partners CAN deactivate their 2FA (but need password confirmation)
   */
  async disableTwoFactor(partnerId: number, password: string) {
    try {
      console.log('[Partner 2FA Disable] Starting:', { partnerId });

      // Verify this is a partner account and get password hash
      const [partner] = await db
        .select({
          id: customers.id,
          customerType: customers.customerType,
          mfaEnabled: customers.mfaEnabled,
          passwordHash: customers.passwordHash,
          email: customers.email
        })
        .from(customers)
        .where(
          and(
            eq(customers.id, partnerId),
            eq(customers.customerType, 'PARTNER')
          )
        )
        .limit(1);

      if (!partner) {
        throw new Error('Partner account not found');
      }

      if (!partner.mfaEnabled) {
        return {
          success: false,
          error: 'Two-factor authentication is not enabled'
        };
      }

      // SECURITY: Verify password before disabling 2FA
      if (!partner.passwordHash) {
        throw new Error('Password verification failed');
      }

      const isPasswordValid = await bcrypt.compare(password, partner.passwordHash);
      if (!isPasswordValid) {
        await this.logOperation(partnerId, 'DISABLE', 'FAILED', { reason: 'Invalid password' });
        return {
          success: false,
          error: 'Invalid password. Please verify your password and try again.'
        };
      }

      // Check rate limiting
      const canProceed = await this.checkRateLimit(partnerId, 'DISABLE');
      if (!canProceed) {
        await this.logOperation(partnerId, 'DISABLE', 'FAILED', { reason: 'Rate limit exceeded' });
        throw new Error('Too many 2FA disable attempts. Please try again in 1 hour.');
      }

      // Disable 2FA and clear secrets
      await db
        .update(customers)
        .set({
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: null,
          mfaConfiguredAt: null,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, partnerId));

      // Send alert email
      if (partner?.email) {
        resendEmailService.send2FADisabledAlert(partner.email)
          .catch(err => console.error('[Partner 2FA] Failed to send disabled alert email:', err));
      }

      console.log('[Partner 2FA Disable] Successfully disabled for partner:', partnerId);

      await this.logOperation(partnerId, 'DISABLE', 'SUCCESS');

      return {
        success: true,
        message: 'Two-factor authentication has been disabled'
      };
    } catch (error) {
      console.error('[Partner 2FA Disable] Error:', error);
      await this.logOperation(partnerId, 'DISABLE', 'FAILED', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to disable 2FA: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get 2FA status for a partner
   */
  async getTwoFactorStatus(partnerId: number) {
    try {
      const [partner] = await db
        .select({
          id: customers.id,
          customerType: customers.customerType,
          mfaEnabled: customers.mfaEnabled,
          mfaConfiguredAt: customers.mfaConfiguredAt,
          mfaBackupCodes: customers.mfaBackupCodes
        })
        .from(customers)
        .where(
          and(
            eq(customers.id, partnerId),
            eq(customers.customerType, 'PARTNER')
          )
        )
        .limit(1);

      if (!partner) {
        throw new Error('Partner account not found');
      }

      const backupCodes = partner.mfaBackupCodes as string[] || [];

      return {
        success: true,
        enabled: partner.mfaEnabled || false,
        configuredAt: partner.mfaConfiguredAt,
        remainingBackupCodes: backupCodes.length,
        isPartnerAccount: true
      };
    } catch (error) {
      throw new Error(`Failed to get 2FA status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Regenerate backup codes
   * SECURITY: Requires password verification
   */
  async regenerateBackupCodes(partnerId: number, password: string) {
    try {
      console.log('[Partner 2FA] Regenerating backup codes:', { partnerId });

      // Verify this is a partner account and get password hash
      const [partner] = await db
        .select({
          id: customers.id,
          customerType: customers.customerType,
          mfaEnabled: customers.mfaEnabled,
          passwordHash: customers.passwordHash,
          email: customers.email
        })
        .from(customers)
        .where(
          and(
            eq(customers.id, partnerId),
            eq(customers.customerType, 'PARTNER')
          )
        )
        .limit(1);

      if (!partner || !partner.mfaEnabled) {
        throw new Error('2FA must be enabled to regenerate backup codes');
      }

      // SECURITY: Verify password before regenerating codes
      if (!partner.passwordHash) {
        throw new Error('Password verification failed');
      }

      const isPasswordValid = await bcrypt.compare(password, partner.passwordHash);
      if (!isPasswordValid) {
        await this.logOperation(partnerId, 'REGENERATE_BACKUP_CODES', 'FAILED', { reason: 'Invalid password' });
        return {
          success: false,
          error: 'Invalid password. Please verify your password and try again.'
        };
      }

      // Generate new backup codes
      const backupCodes = this.generateBackupCodes(this.BACKUP_CODE_COUNT);

      // Update database
      await db
        .update(customers)
        .set({
          mfaBackupCodes: backupCodes,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, partnerId));

      // Send email with backup codes
      if (partner?.email) {
        resendEmailService.send2FABackupCodes(partner.email, backupCodes)
          .catch(err => console.error('[Partner 2FA] Failed to send backup codes email:', err));
      }

      console.log('[Partner 2FA] Backup codes regenerated:', {
        partnerId,
        codeCount: backupCodes.length
      });

      await this.logOperation(partnerId, 'REGENERATE_BACKUP_CODES', 'SUCCESS', {
        codeCount: backupCodes.length
      });

      return {
        success: true,
        backupCodes,
        message: 'New backup codes generated successfully'
      };
    } catch (error) {
      await this.logOperation(partnerId, 'REGENERATE_BACKUP_CODES', 'FAILED', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to regenerate backup codes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify 2FA code during login or verification
   * SECURITY: Support TOTP and backup codes
   */
  async verifyTwoFactor(partnerId: number, code: string): Promise<boolean> {
    try {
      // Get partner's MFA secret and backup codes
      const [partner] = await db
        .select({
          id: customers.id,
          customerType: customers.customerType,
          mfaSecret: customers.mfaSecret,
          mfaBackupCodes: customers.mfaBackupCodes,
          mfaEnabled: customers.mfaEnabled
        })
        .from(customers)
        .where(
          and(
            eq(customers.id, partnerId),
            eq(customers.customerType, 'PARTNER')
          )
        )
        .limit(1);

      if (!partner || !partner.mfaEnabled || !partner.mfaSecret) {
        throw new Error('2FA not configured for this partner account');
      }

      // Configure authenticator with time window tolerance
      authenticator.options = {
        window: 1, // Accept codes from ±30 seconds (90s total window)
      };

      // First, try TOTP verification
      const isValidTotp = authenticator.verify({
        token: code,
        secret: partner.mfaSecret
      });

      if (isValidTotp) {
        await this.logOperation(partnerId, 'VERIFY', 'SUCCESS', { method: 'TOTP' });
        return true;
      }

      // If TOTP fails, check backup codes
      const backupCodes = partner.mfaBackupCodes as string[] || [];
      const codeIndex = backupCodes.findIndex(
        (backupCode) => backupCode === code.toUpperCase()
      );

      if (codeIndex !== -1) {
        // Remove used backup code
        const updatedBackupCodes = backupCodes.filter((_, index) => index !== codeIndex);

        await db
          .update(customers)
          .set({
            mfaBackupCodes: updatedBackupCodes,
            updatedAt: new Date().toISOString()
          })
          .where(eq(customers.id, partnerId));

        await this.logOperation(partnerId, 'VERIFY', 'SUCCESS', {
          method: 'BACKUP_CODE',
          remainingBackupCodes: updatedBackupCodes.length
        });

        return true;
      }

      await this.logOperation(partnerId, 'VERIFY', 'FAILED', { reason: 'Invalid code' });
      return false;
    } catch (error) {
      await this.logOperation(partnerId, 'VERIFY', 'FAILED', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to verify 2FA: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
