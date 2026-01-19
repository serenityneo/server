import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TwoFactorService } from './services/two-factor.service';
import { PasswordService } from './services/password.service';
import { db } from '../../db';
import { customers } from '../../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Security helper - Handle errors safely (BANKING SECURITY)
 */
function handleError(request: FastifyRequest, reply: FastifyReply, error: unknown, statusCode: number = 400) {
  request.log.error({ err: error }, 'Settings error');
  reply.status(statusCode).send({
    success: false,
    error: 'Une erreur est survenue. Veuillez réessayer.'
  });
}

/**
 * Settings Routes
 * Handles 2FA management, password changes, email/phone updates, and notification preferences
 */
export async function registerSettingsRoutes(fastify: FastifyInstance) {
  const twoFactorService = new TwoFactorService();
  const passwordService = new PasswordService();

  // Security helper - Require authentication token
  const requireToken = async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = String(request.headers['authorization'] || '');
    const expectedToken = process.env.CORE_BANKING_API_TOKEN || '';
    
    if (!expectedToken) return; // Skip if not configured
    
    const isValid = authHeader.startsWith('Bearer ') && authHeader.slice(7) === expectedToken;
    if (!isValid) {
      reply.status(401).send({ error: 'Non autorisé' });
    }
  };

  // ===== 2FA ROUTES =====

  /**
   * GET /settings/2fa/status
   * Get current 2FA status for customer
   */
  fastify.get('/settings/2fa/status', {
    preHandler: requireToken,
    schema: {
      tags: ['Settings'],
      summary: 'Obtenir le statut 2FA',
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            enabled: { type: 'boolean' },
            configuredAt: { type: 'string', nullable: true },
            remainingBackupCodes: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { customerId } = request.query as { customerId: number };
    
    try {
      const status = await twoFactorService.getTwoFactorStatus(customerId);
      return status;
    } catch (error) {
      handleError(request, reply, error, 400);
    }
  });

  /**
   * POST /settings/2fa/setup
   * Initialize 2FA setup - Generate secret and QR code
   */
  fastify.post('/settings/2fa/setup', {
    preHandler: requireToken,
    schema: {
      tags: ['Settings'],
      summary: 'Configurer 2FA - Générer QR code',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            secret: { type: 'string' },
            qrCodeUrl: { type: 'string' },
            backupCodes: { type: 'array', items: { type: 'string' } },
            manualEntryKey: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { customerId } = request.body as { customerId: number };
    
    try {
      const setup = await twoFactorService.setupTwoFactor(customerId);
      return setup;
    } catch (error) {
      handleError(request, reply, error, 400);
    }
  });

  /**
   * POST /settings/2fa/enable
   * Enable 2FA - Verify code and save to database
   */
  fastify.post('/settings/2fa/enable', {
    preHandler: requireToken,
    schema: {
      tags: ['Settings'],
      summary: 'Activer 2FA',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          secret: { type: 'string' },
          code: { type: 'string' }
        },
        required: ['customerId', 'secret', 'code']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            backupCodes: { type: 'array', items: { type: 'string' } },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { customerId, secret, code } = request.body as { customerId: number; secret: string; code: string };
    
    try {
      const result = await twoFactorService.enableTwoFactor(customerId, secret, code);
      return result;
    } catch (error) {
      handleError(request, reply, error, 400);
    }
  });

  /**
   * POST /settings/2fa/disable
   * Disable 2FA - Requires password confirmation
   */
  fastify.post('/settings/2fa/disable', {
    preHandler: requireToken,
    schema: {
      tags: ['Settings'],
      summary: 'Désactiver 2FA',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          password: { type: 'string' }
        },
        required: ['customerId', 'password']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { customerId, password } = request.body as { customerId: number; password: string };
    
    try {
      // Verify password first
      const isValidPassword = await passwordService.verifyPassword(customerId, password);
      
      if (!isValidPassword) {
        return { success: false, error: 'Mot de passe incorrect' };
      }

      const result = await twoFactorService.disableTwoFactor(customerId);
      return result;
    } catch (error) {
      handleError(request, reply, error, 400);
    }
  });

  /**
   * POST /settings/2fa/verify
   * Verify 2FA code (for login or testing)
   */
  fastify.post('/settings/2fa/verify', {
    preHandler: requireToken,
    schema: {
      tags: ['Settings'],
      summary: 'Vérifier code 2FA',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          code: { type: 'string' }
        },
        required: ['customerId', 'code']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            valid: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { customerId, code } = request.body as { customerId: number; code: string };
    
    try {
      const isValid = await twoFactorService.verifyTwoFactor(customerId, code);
      return { success: true, valid: isValid };
    } catch (error) {
      handleError(request, reply, error, 400);
    }
  });

  /**
   * POST /settings/2fa/regenerate-backup-codes
   * Regenerate backup codes
   */
  fastify.post('/settings/2fa/regenerate-backup-codes', {
    preHandler: requireToken,
    schema: {
      tags: ['Settings'],
      summary: 'Régénérer codes de secours',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            backupCodes: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { customerId } = request.body as { customerId: number };
    
    try {
      const result = await twoFactorService.regenerateBackupCodes(customerId);
      return result;
    } catch (error) {
      handleError(request, reply, error, 400);
    }
  });

  // ===== PASSWORD ROUTES =====

  /**
   * POST /settings/password/update
   * Update customer password
   */
  fastify.post('/settings/password/update', {
    preHandler: requireToken,
    schema: {
      tags: ['Settings'],
      summary: 'Mettre à jour le mot de passe',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          currentPassword: { type: 'string' },
          newPassword: { type: 'string' }
        },
        required: ['customerId', 'currentPassword', 'newPassword']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { customerId, currentPassword, newPassword } = request.body as { 
      customerId: number; 
      currentPassword: string; 
      newPassword: string;
    };
    
    try {
      const result = await passwordService.updatePassword(customerId, currentPassword, newPassword);
      return result;
    } catch (error) {
      handleError(request, reply, error, 400);
    }
  });

  // ===== CONTACT UPDATE ROUTES =====

  /**
   * POST /settings/email/update
   * Update customer email (requires OTP verification via Next.js API)
   */
  fastify.post('/settings/email/update', {
    preHandler: requireToken,
    schema: {
      tags: ['Settings'],
      summary: 'Mettre à jour l\'email',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          newEmail: { type: 'string' }
        },
        required: ['customerId', 'newEmail']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { customerId, newEmail } = request.body as { customerId: number; newEmail: string };
    
    try {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newEmail)) {
        return { success: false, error: 'Format d\'email invalide' };
      }

      // Check if email already exists
      const [existingCustomer] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.email, newEmail))
        .limit(1);

      if (existingCustomer) {
        return { success: false, error: 'Cet email est déjà utilisé' };
      }

      // Update email
      await db
        .update(customers)
        .set({ 
          email: newEmail,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, customerId));

      return {
        success: true,
        message: 'Email mis à jour avec succès'
      };
    } catch (error) {
      handleError(request, reply, error, 400);
    }
  });

  /**
   * POST /settings/phone/update
   * Update customer phone number (requires OTP verification via Next.js API)
   */
  fastify.post('/settings/phone/update', {
    preHandler: requireToken,
    schema: {
      tags: ['Settings'],
      summary: 'Mettre à jour le téléphone',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          newPhone: { type: 'string' }
        },
        required: ['customerId', 'newPhone']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { customerId, newPhone } = request.body as { customerId: number; newPhone: string };
    
    try {
      // Check if phone already exists
      const [existingCustomer] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.mobileMoneyNumber, newPhone))
        .limit(1);

      if (existingCustomer) {
        return { success: false, error: 'Ce numéro est déjà utilisé' };
      }

      // Update phone
      await db
        .update(customers)
        .set({ 
          mobileMoneyNumber: newPhone,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, customerId));

      return {
        success: true,
        message: 'Numéro de téléphone mis à jour avec succès'
      };
    } catch (error) {
      handleError(request, reply, error, 400);
    }
  });

  fastify.log.info('Settings routes registered successfully');
}
