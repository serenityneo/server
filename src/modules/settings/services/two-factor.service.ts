import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { db } from '../../../db';
import { customers } from '../../../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Two-Factor Authentication Service
 * Handles TOTP (Time-based One-Time Password) authentication using authenticator apps
 */
export class TwoFactorService {
  private readonly APP_NAME = 'Serenity Bank';

  /**
   * Generate backup recovery codes
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
   * Setup 2FA for a customer - Generate secret and QR code
   */
  async setupTwoFactor(customerId: number) {
    try {
      // Check if customer exists
      const [customer] = await db
        .select({ 
          id: customers.id, 
          email: customers.email,
          mobileMoneyNumber: customers.mobileMoneyNumber 
        })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer) {
        throw new Error('Client introuvable');
      }

      // Generate a secret for this customer
      const secret = authenticator.generateSecret();

      // Create identifier for QR code (use email or phone)
      const identifier = customer.email || customer.mobileMoneyNumber || `customer-${customerId}`;

      // Generate OTPAuth URL for QR code
      const otpauthUrl = authenticator.keyuri(
        identifier,
        this.APP_NAME,
        secret
      );

      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

      // Generate backup codes
      const backupCodes = this.generateBackupCodes(10);

      return {
        success: true,
        secret,
        qrCodeUrl: qrCodeDataUrl,
        backupCodes,
        manualEntryKey: secret // For manual entry in authenticator apps
      };
    } catch (error) {
      throw new Error(`Échec de la configuration 2FA: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Enable 2FA - Verify code and save secret to database
   */
  async enableTwoFactor(customerId: number, secret: string, code: string) {
    try {
      console.log('[Customer 2FA Enable] Starting verification:', {
        customerId,
        codeLength: code.length,
        secretLength: secret.length
      });

      // Configure authenticator with time window tolerance
      // This allows for clock drift between server and authenticator app
      // window: 1 means accept codes from 1 step before/after current time (90s total window)
      authenticator.options = {
        window: 1, // Accept codes from ±30 seconds (90s total window)
      };

      // Verify the code against the secret
      const isValid = authenticator.verify({
        token: code,
        secret: secret
      });

      console.log('[Customer 2FA Enable] Verification result:', {
        isValid,
        customerId,
        window: authenticator.options.window
      });

      if (!isValid) {
        return {
          success: false,
          error: 'Code invalide. Vérifiez que l\'heure de votre appareil est correcte et réessayez.'
        };
      }

      // Generate backup codes
      const backupCodes = this.generateBackupCodes(10);

      // Save to database
      await db
        .update(customers)
        .set({
          mfaEnabled: true,
          mfaSecret: secret,
          mfaBackupCodes: backupCodes,
          mfaConfiguredAt: new Date().toISOString()
        })
        .where(eq(customers.id, customerId));

      console.log('[Customer 2FA Enable] Successfully enabled for customer:', customerId);

      return {
        success: true,
        backupCodes
      };
    } catch (error) {
      console.error('[Customer 2FA Enable] Error:', error);
      throw new Error(`Échec de l'activation 2FA: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Verify 2FA code during login or verification
   */
  async verifyTwoFactor(customerId: number, code: string): Promise<boolean> {
    try {
      // Get customer's MFA secret and backup codes
      const [customer] = await db
        .select({
          mfaSecret: customers.mfaSecret,
          mfaBackupCodes: customers.mfaBackupCodes,
          mfaEnabled: customers.mfaEnabled
        })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer || !customer.mfaEnabled || !customer.mfaSecret) {
        throw new Error('2FA non configuré pour ce compte');
      }

      // Configure authenticator with time window tolerance
      // This is critical for compatibility with all authenticator apps
      authenticator.options = {
        window: 1, // Accept codes from ±30 seconds (90s total window)
      };

      // First, try TOTP verification
      const isValidTotp = authenticator.verify({
        token: code,
        secret: customer.mfaSecret
      });

      if (isValidTotp) {
        return true;
      }

      // If TOTP fails, check backup codes
      const backupCodes = customer.mfaBackupCodes as string[] || [];
      const codeIndex = backupCodes.findIndex(
        (backupCode) => backupCode === code.toUpperCase()
      );

      if (codeIndex !== -1) {
        // Remove used backup code
        const updatedBackupCodes = backupCodes.filter((_, index) => index !== codeIndex);
        
        await db
          .update(customers)
          .set({ mfaBackupCodes: updatedBackupCodes })
          .where(eq(customers.id, customerId));

        return true;
      }

      return false;
    } catch (error) {
      throw new Error(`Échec de la vérification 2FA: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Disable 2FA - Requires password verification (handled by route)
   */
  async disableTwoFactor(customerId: number) {
    try {
      // Check if customer exists and has 2FA enabled
      const [customer] = await db
        .select({ 
          id: customers.id,
          mfaEnabled: customers.mfaEnabled 
        })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer) {
        throw new Error('Client introuvable');
      }

      if (!customer.mfaEnabled) {
        return {
          success: false,
          error: 'L\'authentification à deux facteurs n\'est pas activée'
        };
      }

      // Disable 2FA and clear secrets
      await db
        .update(customers)
        .set({
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: null,
          mfaConfiguredAt: null
        })
        .where(eq(customers.id, customerId));

      return {
        success: true,
        message: 'L\'authentification à deux facteurs a été désactivée'
      };
    } catch (error) {
      throw new Error(`Échec de la désactivation 2FA: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Get 2FA status for a customer
   */
  async getTwoFactorStatus(customerId: number) {
    try {
      const [customer] = await db
        .select({
          mfaEnabled: customers.mfaEnabled,
          mfaConfiguredAt: customers.mfaConfiguredAt,
          backupCodesCount: customers.mfaBackupCodes
        })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer) {
        throw new Error('Client introuvable');
      }

      const backupCodes = customer.backupCodesCount as string[] || [];

      return {
        success: true,
        enabled: customer.mfaEnabled || false,
        configuredAt: customer.mfaConfiguredAt,
        remainingBackupCodes: backupCodes.length
      };
    } catch (error) {
      throw new Error(`Échec de la récupération du statut 2FA: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(customerId: number) {
    try {
      // Check if 2FA is enabled
      const [customer] = await db
        .select({ 
          mfaEnabled: customers.mfaEnabled 
        })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer || !customer.mfaEnabled) {
        throw new Error('2FA doit être activé pour régénérer les codes de secours');
      }

      // Generate new backup codes
      const backupCodes = this.generateBackupCodes(10);

      // Update database
      await db
        .update(customers)
        .set({ mfaBackupCodes: backupCodes })
        .where(eq(customers.id, customerId));

      return {
        success: true,
        backupCodes
      };
    } catch (error) {
      throw new Error(`Échec de la régénération des codes: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }
}
