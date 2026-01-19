import { Resend } from 'resend';
import { db } from '../db';
import { emailLogs } from '../db/schema';

interface EmailOptions {
  to: string;
  subject: string;
  templateId?: string;
  templateData?: Record<string, any>;
  html?: string; // Fallback for non-template emails
  type: 'OTP' | 'WELCOME' | '2FA_CODES' | 'ALERT' | 'TRANSACTION';
  metadata?: Record<string, any>;
}

/**
 * Resend Email Service with Template Support
 * 
 * IMPORTANT: All templates must be created in Resend Dashboard first.
 * See: /brain/resend_templates_guide.md for setup instructions.
 * 
 * Environment Variables Required:
 * - RESEND_API_KEY: Your Resend API key
 * - RESEND_FROM_EMAIL: Sender email address
 * - RESEND_TEMPLATE_*: Template IDs (optional, defaults to template names)
 */
export class ResendEmailService {
  private resend: Resend;
  private fromEmail: string;

  // Circuit Breaker State
  private failureCount = 0;
  private lastFailureTime = 0;
  private circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private readonly CIRCUIT_THRESHOLD = 5;
  private readonly RESET_TIMEOUT = 60000; // 1 minute
  private readonly MAX_RETRIES = 3;

  // Template IDs (set in Resend Dashboard or via env vars)
  private readonly TEMPLATES = {
    OTP: process.env.RESEND_TEMPLATE_OTP || 'otp-verification',
    WELCOME_CLIENT: process.env.RESEND_TEMPLATE_WELCOME_CLIENT || 'welcome-client',
    WELCOME_PARTNER: process.env.RESEND_TEMPLATE_WELCOME_PARTNER || 'welcome-partner',
    BACKUP_CODES: process.env.RESEND_TEMPLATE_BACKUP_CODES || '2fa-backup-codes',
    DISABLED_ALERT: process.env.RESEND_TEMPLATE_DISABLED_ALERT || '2fa-disabled-alert',
    LOGIN_ALERT: process.env.RESEND_TEMPLATE_LOGIN_ALERT || 'login-alert',
  };

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ RESEND_API_KEY is missing. Email service will not function.');
    }
    this.resend = new Resend(apiKey);
    this.fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  }

  /**
   * Check if circuit is open
   */
  private checkCircuit(): boolean {
    if (this.circuitState === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.RESET_TIMEOUT) {
        this.circuitState = 'HALF_OPEN';
        console.log('[Resend] Circuit HALF_OPEN - Testing connection');
        return true;
      }
      console.warn('[Resend] Circuit OPEN - Fast Failing');
      return false;
    }
    return true;
  }

  /**
   * Record success (close circuit)
   */
  private recordSuccess() {
    if (this.circuitState !== 'CLOSED') {
      this.circuitState = 'CLOSED';
      this.failureCount = 0;
      console.log('[Resend] Circuit CLOSED - Recovered');
    }
  }

  /**
   * Record failure (maybe open circuit)
   */
  private recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.CIRCUIT_THRESHOLD) {
      this.circuitState = 'OPEN';
      console.error('[Resend] Circuit OPENED due to repeated failures');
    }
  }

  /**
   * Send an email with Retry and Circuit Breaker
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!process.env.RESEND_API_KEY) {
      console.warn(`[Resend] Mock send to ${options.to}: ${options.subject}`);
      return false;
    }

    if (!this.checkCircuit()) {
      await this.logEmail(options, 'FAILED', undefined, 'Circuit Breaker OPEN');
      return false;
    }

    let attempt = 0;
    let lastError: any;

    while (attempt <= this.MAX_RETRIES) {
      try {
        console.log(`[Resend] Sending ${options.type} email to ${options.to} (Attempt ${attempt + 1}/${this.MAX_RETRIES + 1})`);

        // Prepare email payload
        const emailPayload: any = {
          from: `Serenity Neo Bank <${this.fromEmail}>`,
          to: options.to,
          subject: options.subject,
          tags: [
            { name: 'type', value: options.type },
            { name: 'env', value: process.env.NODE_ENV || 'development' }
          ]
        };

        // Use template if provided, otherwise use HTML
        if (options.templateId) {
          // Resend React template syntax
          emailPayload.react = options.templateId;
          if (options.templateData) {
            emailPayload.react_props = options.templateData;
          }
        } else if (options.html) {
          emailPayload.html = options.html;
        }

        const { data, error } = await this.resend.emails.send(emailPayload);

        if (error) {
          throw new Error(error.message);
        }

        // Success
        this.recordSuccess();
        await this.logEmail(options, 'SENT', data?.id);
        return true;

      } catch (err: any) {
        lastError = err;
        console.error(`[Resend] Attempt ${attempt + 1} failed:`, err.message);

        // Exponential Backoff
        if (attempt < this.MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        attempt++;
      }
    }

    // Failure after retries
    this.recordFailure();
    await this.logEmail(options, 'FAILED', undefined, `Max retries reached. Last error: ${lastError?.message}`);
    return false;
  }

  /**
   * Log email event to database
   */
  private async logEmail(
    options: EmailOptions,
    status: 'SENT' | 'FAILED',
    resendId?: string,
    errorMessage?: string
  ) {
    try {
      await db.insert(emailLogs).values({
        recipient: options.to,
        emailType: options.type,
        subject: options.subject,
        status,
        resendId,
        errorMessage,
        metadata: options.metadata,
        sentAt: new Date().toISOString()
      });
    } catch (logErr) {
      console.error('[Resend] Failed to log email event:', logErr);
    }
  }

  // ===========================================================================
  // SPECIFIC EMAIL METHODS (Using Templates)
  // ===========================================================================

  /**
   * Send OTP Verification Code
   */
  async sendOTP(email: string, code: string, purpose: string) {
    return this.sendEmail({
      to: email,
      subject: `Code de vérification : ${code}`,
      templateId: this.TEMPLATES.OTP,
      templateData: {
        code,
        purpose
      },
      type: 'OTP',
      metadata: { purpose }
    });
  }

  /**
   * Send Login Alert (Security) with detailed device information
   */
  async sendLoginAlert(
    email: string,
    clientName: string,
    details: {
      ip: string;
      device: string;
      browser: string;
      os: string;
      provider: string;
      location: string;
      time: string;
    }
  ) {
    return this.sendEmail({
      to: email,
      subject: 'Alerte de sécurité - Nouvelle connexion',
      templateId: this.TEMPLATES.LOGIN_ALERT,
      templateData: {
        clientName,
        ip: details.ip,
        device: details.device,
        browser: details.browser,
        os: details.os,
        provider: details.provider,
        location: details.location,
        time: details.time,
        supportUrl: `${process.env.UI_BASE_URL}/contact`,
        supportPhone: process.env.SUPPORT_PHONE || '+243 XX XXX XXXX',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@neo-srnt.com'
      },
      type: 'ALERT',
      metadata: details
    });
  }

  /**
   * Send Welcome Email to New Client
   */
  async sendWelcomeClient(email: string, name: string) {
    return this.sendEmail({
      to: email,
      subject: 'Bienvenue chez Serenity Neo ! 🚀',
      templateId: this.TEMPLATES.WELCOME_CLIENT,
      templateData: {
        firstName: name,
        dashboardUrl: `${process.env.UI_BASE_URL}/dashboard/client`
      },
      type: 'WELCOME',
      metadata: { role: 'CLIENT' }
    });
  }

  /**
   * Send Welcome Email to New Partner
   */
  async sendWelcomePartner(email: string, name: string) {
    return this.sendEmail({
      to: email,
      subject: 'Votre compte Partenaire est approuvé ✅',
      templateId: this.TEMPLATES.WELCOME_PARTNER,
      templateData: {
        firstName: name,
        dashboardUrl: `${process.env.UI_BASE_URL}/dashboard/partner`
      },
      type: 'WELCOME',
      metadata: { role: 'PARTNER' }
    });
  }

  /**
   * Send 2FA Backup Codes
   */
  async send2FABackupCodes(email: string, codes: string[]) {
    // Format codes as HTML list
    const codesHtml = codes.map(c => `<div style="margin: 5px 0;">${c}</div>`).join('');

    return this.sendEmail({
      to: email,
      subject: '🔐 Vos codes de récupération 2FA',
      templateId: this.TEMPLATES.BACKUP_CODES,
      templateData: {
        codes: codesHtml
      },
      type: '2FA_CODES'
    });
  }

  /**
   * Send 2FA Disabled Alert
   */
  async send2FADisabledAlert(email: string) {
    return this.sendEmail({
      to: email,
      subject: '⚠️ Alerte Sécurité : 2FA Désactivée',
      templateId: this.TEMPLATES.DISABLED_ALERT,
      templateData: {
        supportUrl: `${process.env.UI_BASE_URL}/contact`,
        dashboardUrl: `${process.env.UI_BASE_URL}/dashboard`
      },
      type: 'ALERT'
    });
  }
}

export const resendEmailService = new ResendEmailService();
