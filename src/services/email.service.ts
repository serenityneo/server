import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Email Service for sending 2FA error reports and notifications
 * Configured for support@neo-serenity.africa
 */
export class EmailService {
  private transporter: Transporter;
  private readonly supportEmail = 'support@neo-serenity.africa';
  private readonly fromEmail = 'noreply@neo-serenity.africa';
  private readonly fromName = 'Serenity Neo Support';

  constructor() {
    // Initialize email transporter
    // In production, use proper SMTP credentials from environment variables
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || this.fromEmail,
        pass: process.env.SMTP_PASSWORD || '',
      },
    });

    console.log('[EmailService] Initialized with SMTP:', {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || '587',
      from: this.fromEmail
    });
  }

  /**
   * Send 2FA error report to support team
   */
  async send2FAErrorReport(report: {
    reportId: number;
    userEmail?: string;
    userPhone?: string;
    errorType: string;
    errorMessage?: string;
    userDescription?: string;
    failedAttempts: number;
    authenticatorApp?: string;
    deviceInfo?: any;
    ipAddress?: string;
    userAgent?: string;
    screenshotUrl?: string;
    createdAt: string;
  }): Promise<boolean> {
    try {
      const subject = `🔒 2FA Error Report #${report.reportId} - ${report.errorType}`;

      const htmlContent = this.buildErrorReportHTML(report);
      const textContent = this.buildErrorReportText(report);

      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: this.supportEmail,
        subject: subject,
        text: textContent,
        html: htmlContent,
      };

      console.log('[EmailService] Sending 2FA error report email:', {
        reportId: report.reportId,
        to: this.supportEmail,
        subject
      });

      const info = await this.transporter.sendMail(mailOptions);

      console.log('[EmailService] Email sent successfully:', {
        reportId: report.reportId,
        messageId: info.messageId
      });

      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
      // Don't throw - we still want to save the report even if email fails
      return false;
    }
  }

  /**
   * Build HTML email content for error report
   */
  private buildErrorReportHTML(report: any): string {
    const userContact = report.userEmail || report.userPhone || 'Unknown';
    const deviceSummary = report.deviceInfo
      ? `${report.deviceInfo.browser || 'Unknown'} on ${report.deviceInfo.os || 'Unknown'}`
      : 'Not available';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: #8B4513;
      color: white;
      padding: 20px;
      border-radius: 8px 8px 0 0;
    }
    .content {
      background: #f9f9f9;
      border: 1px solid #ddd;
      border-top: none;
      padding: 20px;
      border-radius: 0 0 8px 8px;
    }
    .section {
      margin-bottom: 20px;
    }
    .label {
      font-weight: bold;
      color: #8B4513;
      display: inline-block;
      width: 150px;
    }
    .value {
      display: inline-block;
    }
    .screenshot {
      margin-top: 10px;
      max-width: 100%;
    }
    .footer {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #666;
    }
    .alert {
      background: #FEF3C7;
      border-left: 4px solid #F59E0B;
      padding: 12px;
      margin: 15px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 24px;">🔒 2FA Error Report</h1>
    <p style="margin: 5px 0 0 0; opacity: 0.9;">Report #${report.reportId}</p>
  </div>
  
  <div class="content">
    <div class="alert">
      <strong>⚠️ Priority:</strong> Customer experiencing 2FA authentication issues
    </div>

    <div class="section">
      <h2 style="color: #8B4513; font-size: 18px;">User Information</h2>
      <div><span class="label">Contact:</span> <span class="value">${userContact}</span></div>
      <div><span class="label">Report ID:</span> <span class="value">#${report.reportId}</span></div>
      <div><span class="label">Time:</span> <span class="value">${new Date(report.createdAt).toLocaleString()}</span></div>
    </div>

    <div class="section">
      <h2 style="color: #8B4513; font-size: 18px;">Error Details</h2>
      <div><span class="label">Error Type:</span> <span class="value">${report.errorType}</span></div>
      <div><span class="label">Failed Attempts:</span> <span class="value">${report.failedAttempts}</span></div>
      ${report.authenticatorApp ? `<div><span class="label">Authenticator:</span> <span class="value">${report.authenticatorApp}</span></div>` : ''}
      ${report.errorMessage ? `<div style="margin-top: 10px;"><span class="label">System Message:</span><br/><span class="value">${report.errorMessage}</span></div>` : ''}
    </div>

    ${report.userDescription ? `
    <div class="section">
      <h2 style="color: #8B4513; font-size: 18px;">User's Description</h2>
      <p style="background: white; padding: 12px; border-left: 3px solid #8B4513; margin: 10px 0;">${report.userDescription}</p>
    </div>
    ` : ''}

    <div class="section">
      <h2 style="color: #8B4513; font-size: 18px;">Technical Context</h2>
      <div><span class="label">Device:</span> <span class="value">${deviceSummary}</span></div>
      <div><span class="label">IP Address:</span> <span class="value">${report.ipAddress || 'Not captured'}</span></div>
      ${report.userAgent ? `<div><span class="label">User Agent:</span><br/><span class="value" style="font-size: 11px;">${report.userAgent}</span></div>` : ''}
    </div>

    ${report.screenshotUrl ? `
    <div class="section">
      <h2 style="color: #8B4513; font-size: 18px;">Screenshot</h2>
      <p>User provided screenshot: <a href="${report.screenshotUrl}" target="_blank">View Screenshot</a></p>
    </div>
    ` : ''}

    <div class="section" style="margin-top: 30px; padding: 15px; background: #e8f4f8; border-radius: 6px;">
      <h3 style="margin-top: 0; color: #0369a1;">📋 Next Steps</h3>
      <ol style="margin: 10px 0;">
        <li>Review the error report in the admin dashboard</li>
        <li>Contact the user to gather more information if needed</li>
        <li>Check server logs for the timestamp: ${new Date(report.createdAt).toISOString()}</li>
        <li>Verify user's 2FA configuration in the database</li>
        <li>Update report status once resolved</li>
      </ol>
    </div>
  </div>

  <div class="footer">
    <p>This is an automated email from Serenity Bank 2FA Error Reporting System.</p>
    <p>To view and manage this report, login to the admin dashboard at: <strong>/admin/2fa-reports</strong></p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Build plain text email content for error report
   */
  private buildErrorReportText(report: any): string {
    const userContact = report.userEmail || report.userPhone || 'Unknown';

    return `
2FA ERROR REPORT #${report.reportId}
=====================================

USER INFORMATION:
- Contact: ${userContact}
- Report ID: #${report.reportId}
- Time: ${new Date(report.createdAt).toLocaleString()}

ERROR DETAILS:
- Error Type: ${report.errorType}
- Failed Attempts: ${report.failedAttempts}
${report.authenticatorApp ? `- Authenticator: ${report.authenticatorApp}` : ''}
${report.errorMessage ? `- System Message: ${report.errorMessage}` : ''}

${report.userDescription ? `USER'S DESCRIPTION:\n${report.userDescription}\n` : ''}

TECHNICAL CONTEXT:
- IP Address: ${report.ipAddress || 'Not captured'}
${report.userAgent ? `- User Agent: ${report.userAgent}` : ''}

${report.screenshotUrl ? `SCREENSHOT:\n${report.screenshotUrl}\n` : ''}

NEXT STEPS:
1. Review the error report in the admin dashboard
2. Contact the user to gather more information if needed
3. Check server logs for timestamp: ${new Date(report.createdAt).toISOString()}
4. Verify user's 2FA configuration in the database
5. Update report status once resolved

---
This is an automated email from Serenity Bank 2FA Error Reporting System.
To view and manage this report, login to: /admin/2fa-reports
    `.trim();
  }

  /**
   * Send confirmation email to user after submitting error report
   */
  async sendUserConfirmation(userEmail: string, reportId: number): Promise<boolean> {
    try {
      const subject = `✅ Your 2FA Support Request #${reportId} Has Been Received`;

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: #8B4513;
      color: white;
      padding: 20px;
      border-radius: 8px 8px 0 0;
      text-align: center;
    }
    .content {
      background: #f9f9f9;
      border: 1px solid #ddd;
      border-top: none;
      padding: 20px;
      border-radius: 0 0 8px 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 24px;">✅ Support Request Received</h1>
  </div>
  
  <div class="content">
    <p>Dear Customer,</p>
    
    <p>Thank you for reporting your 2FA authentication issue. We have received your support request and our technical team will investigate and respond as soon as possible.</p>
    
    <div style="background: #e8f4f8; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0;"><strong>Your Reference Number:</strong> #${reportId}</p>
    </div>
    
    <p><strong>What happens next:</strong></p>
    <ul>
      <li>Our technical team will review your report within 24 hours</li>
      <li>You may be contacted for additional information</li>
      <li>We'll work to resolve the issue as quickly as possible</li>
    </ul>
    
    <p>In the meantime, if you have backup codes from when you set up 2FA, you may try using one of those to access your account.</p>
    
    <p>If you have any urgent questions, please contact us at: <strong>${this.supportEmail}</strong></p>
    
    <p style="margin-top: 30px;">Best regards,<br><strong>Serenity Bank Support Team</strong></p>
  </div>
</body>
</html>
      `;

      const textContent = `
SUPPORT REQUEST RECEIVED

Dear Customer,

Thank you for reporting your 2FA authentication issue. We have received your support request and our technical team will investigate and respond as soon as possible.

Your Reference Number: #${reportId}

WHAT HAPPENS NEXT:
- Our technical team will review your report within 24 hours
- You may be contacted for additional information
- We'll work to resolve the issue as quickly as possible

In the meantime, if you have backup codes from when you set up 2FA, you may try using one of those to access your account.

If you have any urgent questions, please contact us at: ${this.supportEmail}

Best regards,
Serenity Bank Support Team
      `.trim();

      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: userEmail,
        subject: subject,
        text: textContent,
        html: htmlContent,
      };

      const info = await this.transporter.sendMail(mailOptions);

      console.log('[EmailService] User confirmation email sent:', {
        reportId,
        to: userEmail,
        messageId: info.messageId
      });

      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send user confirmation:', error);
      return false;
    }
  }

  /**
   * Send card request confirmation email to customer
   */
  async sendCardRequestConfirmation(data: {
    customerEmail: string;
    customerName: string;
    requestNumber: string;
    cardType: string;
    amount: string;
    currency: string;
    paymentMethod: string;
    status: string;
  }): Promise<boolean> {
    try {
      const subject = `\u2705 Demande de carte ${data.cardType} - ${data.requestNumber}`;
      const paymentMethodLabel = data.paymentMethod === 'S01_ACCOUNT' ? 'Compte S01' : 'Mobile Money';
      const statusLabel = data.status === 'PAID' ? 'Pay\u00e9e - En cours de traitement' : 'En attente de paiement';

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #5C4033; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #FAF7F5; border: 1px solid #EADACD; border-top: none; padding: 20px; border-radius: 0 0 8px 8px; }
    .card-info { background: white; border: 1px solid #EADACD; border-radius: 8px; padding: 15px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .label { color: #666; }
    .value { font-weight: bold; color: #5C4033; }
    .status-badge { display: inline-block; background: ${data.status === 'PAID' ? '#10B981' : '#F59E0B'}; color: white; padding: 5px 12px; border-radius: 20px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header"><h1 style="margin: 0;">\u2705 Demande de Carte Confirm\u00e9e</h1></div>
  <div class="content">
    <p>Bonjour <strong>${data.customerName}</strong>,</p>
    <p>Votre demande de carte a \u00e9t\u00e9 re\u00e7ue.</p>
    <div class="card-info">
      <div class="info-row"><span class="label">N\u00b0 demande:</span><span class="value">${data.requestNumber}</span></div>
      <div class="info-row"><span class="label">Type:</span><span class="value">${data.cardType}</span></div>
      <div class="info-row"><span class="label">Montant:</span><span class="value">${data.amount} ${data.currency}</span></div>
      <div class="info-row"><span class="label">Paiement:</span><span class="value">${paymentMethodLabel}</span></div>
      <div class="info-row"><span class="label">Statut:</span><span class="status-badge">${statusLabel}</span></div>
    </div>
    <p>Cordialement,<br><strong>Serenity Bank</strong></p>
  </div>
</body>
</html>
      `;

      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: data.customerEmail,
        subject: subject,
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      console.log('[EmailService] Card request confirmation sent to:', data.customerEmail);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send card confirmation:', error);
      return false;
    }
  }

  /**
   * Send card ready notification email
   */
  async sendCardReadyNotification(data: {
    customerEmail: string;
    customerName: string;
    requestNumber: string;
    cardType: string;
  }): Promise<boolean> {
    try {
      const subject = `Votre carte ${data.cardType} est pr\u00eate ! - ${data.requestNumber}`;
      const htmlContent = `
<!DOCTYPE html>
<html><body style="font-family: Arial; max-width: 600px; margin: 0 auto;">
  <div style="background: #5C4033; color: white; padding: 20px; text-align: center;"><h1>Votre carte est pr\u00eate !</h1></div>
  <div style="background: #FAF7F5; padding: 20px;">
    <p>Bonjour <strong>${data.customerName}</strong>,</p>
    <p>Votre <strong>${data.cardType}</strong> est pr\u00eate \u00e0 \u00eatre retir\u00e9e.</p>
    <p>N\u00b0 demande: <strong>${data.requestNumber}</strong></p>
    <p>Pr\u00e9sentez-vous \u00e0 votre agence avec une pi\u00e8ce d'identit\u00e9.</p>
    <p>Cordialement,<br><strong>Serenity Bank</strong></p>
  </div>
</body></html>
      `;

      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: data.customerEmail,
        subject: subject,
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      console.log('[EmailService] Card ready notification sent to:', data.customerEmail);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send card ready notification:', error);
      return false;
    }
  }
  /**
   * Send critical system alert
   */
  async sendSystemAlert(data: {
    errorId: number;
    message: string;
    path: string;
    stack?: string;
  }): Promise<boolean> {
    try {
      const subject = `🚨 SYSTEM ALERT #${data.errorId} - ${data.message.substring(0, 50)}`;

      const htmlContent = `
<!DOCTYPE html>
<html>
<body style="font-family: monospace; padding: 20px;">
  <h1 style="color: red;">🚨 CRITICAL SYSTEM ERROR</h1>
  <p><strong>ID:</strong> #${data.errorId}</p>
  <p><strong>Path:</strong> ${data.path}</p>
  <p><strong>Message:</strong> ${data.message}</p>
  <pre style="background: #eee; padding: 10px; overflow: auto;">${data.stack || 'No stack trace'}</pre>
</body>
</html>
      `;

      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: process.env.ADMIN_EMAIL || this.supportEmail, // Send to admin
        subject,
        html: htmlContent
      });

      console.log('[EmailService] System alert sent for error:', data.errorId);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send system alert:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
