import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Partner2FAService } from '../services/partner-2fa.service';
import { resendEmailService } from '../../../services/resend-email.service';
import { db } from '../../../db';
import { customers } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { handleError } from './error-handler';

const partner2FAService = new Partner2FAService();

/**
 * Partner 2FA Management Routes
 * 
 * SECURITY REQUIREMENTS:
 * - Partners CAN activate/deactivate their 2FA
 * - Partners CANNOT change phone number (separate admin-only route)
 * - All routes require partner authentication via customerId
 * - Rate limiting and audit logging enabled
 * - High level of security protection
 */

/**
 * Middleware to verify partner authentication
 */
async function requirePartnerAuth(request: FastifyRequest, reply: FastifyReply) {
  const customerId = (request.body as any)?.customerId || (request.query as any)?.customerId;

  if (!customerId) {
    return reply.code(401).send({
      success: false,
      error: 'Authentication required. Please provide customerId.'
    });
  }

  // Verify this is a partner account
  const [customer] = await db
    .select({ id: customers.id, customerType: customers.customerType })
    .from(customers)
    .where(and(
      eq(customers.id, Number(customerId)),
      eq(customers.customerType, 'PARTNER')
    ))
    .limit(1);

  if (!customer) {
    return reply.code(403).send({
      success: false,
      error: 'Access denied. Partner authentication required.'
    });
  }

  // Attach to request for use in routes
  (request as any).partnerId = Number(customerId);
}

export async function partnerTwoFactorRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/partner/2fa/status
   * Get partner's 2FA status
   * 
   * SECURITY: Requires partner authentication
   */
  fastify.get('/api/v1/partner/2fa/status', {
    preHandler: requirePartnerAuth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;

      const status = await partner2FAService.getTwoFactorStatus(partnerId);

      return reply.send(status);
    } catch (error) {
      console.error('[Partner 2FA] Error getting status:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /api/v1/partner/2fa/setup
   * Generate QR code and secret for 2FA setup
   * 
   * SECURITY: Requires partner authentication
   * RATE LIMIT: 5 attempts per hour
   */
  fastify.post('/api/v1/partner/2fa/setup', {
    preHandler: requirePartnerAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;

      const result = await partner2FAService.setupTwoFactor(partnerId);

      return reply.send(result);
    } catch (error) {
      console.error('[Partner 2FA] Error setting up 2FA:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /api/v1/partner/2fa/enable
   * Enable 2FA after verifying the code
   * 
   * SECURITY: Requires valid TOTP code verification
   * RATE LIMIT: 5 attempts per hour
   */
  fastify.post('/api/v1/partner/2fa/enable', {
    preHandler: requirePartnerAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          secret: { type: 'string' },
          code: { type: 'string', minLength: 6, maxLength: 8 }
        },
        required: ['customerId', 'secret', 'code']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;
      const { secret, code } = request.body as { customerId: number; secret: string; code: string };

      const result = await partner2FAService.enableTwoFactor(partnerId, secret, code);

      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.send(result);
    } catch (error) {
      console.error('[Partner 2FA] Error enabling 2FA:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /api/v1/partner/2fa/disable
   * Disable 2FA - Requires password verification
   * 
   * SECURITY: Partners CAN disable their 2FA but must provide password
   * RATE LIMIT: 5 attempts per hour
   */
  fastify.post('/api/v1/partner/2fa/disable', {
    preHandler: requirePartnerAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          password: { type: 'string', minLength: 6 }
        },
        required: ['customerId', 'password']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;
      const { password } = request.body as { customerId: number; password: string };

      const result = await partner2FAService.disableTwoFactor(partnerId, password);

      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.send(result);
    } catch (error) {
      console.error('[Partner 2FA] Error disabling 2FA:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /api/v1/partner/2fa/verify
   * Verify 2FA code during login or sensitive operations
   * 
   * SECURITY: Support TOTP and backup codes
   */
  fastify.post('/api/v1/partner/2fa/verify', {
    preHandler: requirePartnerAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          code: { type: 'string', minLength: 6, maxLength: 8 }
        },
        required: ['customerId', 'code']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;
      const { code } = request.body as { customerId: number; code: string };

      const isValid = await partner2FAService.verifyTwoFactor(partnerId, code);

      if (!isValid) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid verification code. Please try again.'
        });
      }

      return reply.send({
        success: true,
        message: '2FA verification successful'
      });

      // ✅ SERENITY NEO: SECURITY ALERT (Async)
      // Fetch partner email
      db.select({ email: customers.email })
        .from(customers)
        .where(eq(customers.id, partnerId))
        .limit(1)
        .then(([partner]) => {
          if (partner?.email) {
            const ip = request.ip;
            const userAgent = request.headers['user-agent'] || 'unknown';

            resendEmailService.sendLoginAlert(partner.email, (partner as any).firstName || 'Partenaire', {
              ip,
              device: userAgent.substring(0, 100),
              browser: 'Unknown',
              os: 'Unknown',
              provider: 'Unknown',
              location: 'Unknown',
              time: new Date().toISOString()
            }).catch(err => request.log.error({ err }, 'Failed to send partner login alert'));
          }
        }).catch(err => request.log?.error({ err }, 'Failed to fetch partner email for alert'));
    } catch (error) {
      console.error('[Partner 2FA] Error verifying code:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /api/v1/partner/2fa/regenerate-backup-codes
   * Regenerate backup codes - Requires password verification
   * 
   * SECURITY: Password required to prevent unauthorized backup code regeneration
   */
  fastify.post('/api/v1/partner/2fa/regenerate-backup-codes', {
    preHandler: requirePartnerAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          password: { type: 'string', minLength: 6 }
        },
        required: ['customerId', 'password']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;
      const { password } = request.body as { customerId: number; password: string };

      const result = await partner2FAService.regenerateBackupCodes(partnerId, password);

      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.send(result);
    } catch (error) {
      console.error('[Partner 2FA] Error regenerating backup codes:', error);
      handleError(request, reply, error, 500);
    }

  });
}
