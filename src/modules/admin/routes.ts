import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db';
import { customers, users, roles, customerStatus, kycStatus, quartiers, communes, postalCodes, kycDrafts, agencies, accounts, transactions, accountTypeConditions, serviceConditions, customerEligibilityStatus, customerNotifications, creditTypes } from '../../db/schema';
import { eq, like, and, or, desc, gte, lt, ne, not, getTableColumns, sql } from 'drizzle-orm';
import { hash } from 'argon2';
import { authenticator } from 'otplib';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS, extractUserIdFromCookie, generateAuthCookieValue } from '../../config/auth';

// Import our new services
import { AdminAuthService } from './services/auth.service';
import { resendEmailService } from '../../services/resend-email.service';
import { AdminTwoFactorService } from './services/two-factor.service';
import { accountGenerationService, generateFormattedAccountNumber } from '../core-banking/services/account-generation.service';
import { SponsorshipAdminService } from './sponsorship-admin.service';
import { CustomerAccountsSummaryService } from './customer-accounts-summary.service';
import { CustomerModificationService } from '../../services/customer-modification.service';
import { contractsRoutes } from './contracts-routes';
import { registerApprovedCustomersRoute } from './approved-customers-route';
import { registerContractTypesRoutes } from './contract-types-routes';
import { registerCreditServicesRoutes } from './credit-services-routes';
import { registerCustomerCreationRoutes } from './customer-creation-routes';
import { loyaltyPointsService } from '../loyalty/loyalty-points.service';
import { ApprovalService } from './services/approval.service';
import { MigrationService } from './services/migration.service';
import { migrationRequests, approvalRequests } from '../../db/migration-schema';

/**
 * Admin Routes
 * Handles all administrative functionalities including user management, KYC approval, and 2FA management
 */

// Security helper - Require admin authentication
// Supports both Bearer token and cookie-based authentication
const requireAdminAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  // Check for Bearer token (for API clients)
  const authHeader = String(request.headers['authorization'] || '');
  const expectedToken = process.env.ADMIN_API_TOKEN || process.env.CORE_BANKING_API_TOKEN || '';

  if (authHeader.startsWith('Bearer ') && expectedToken) {
    const isValid = authHeader.slice(7) === expectedToken;
    if (isValid) {
      return; // Token auth successful
    }
  }

  // Check for auth cookie (for web dashboard)
  const authCookie = request.cookies[AUTH_COOKIE_NAME];

  console.log('[AdminAuth] Cookie check:', {
    hasCookie: !!authCookie,
    cookieValue: authCookie ? `${authCookie.substring(0, 15)}...` : 'none',
    allCookies: Object.keys(request.cookies),
  });

  if (authCookie) {
    // Extract and validate userId using shared utility
    const userId = extractUserIdFromCookie(authCookie);

    if (userId === null) {
      console.error('[AdminAuth] Invalid cookie format:', authCookie);
      return reply.status(401).send({ success: false, error: 'Session invalide' });
    }

    console.log('[AdminAuth] ✅ Cookie-based auth successful for userId:', userId);
    return;
  }

  // No valid authentication found
  console.error('[AdminAuth] No valid authentication - no Bearer token or admin cookie');
  reply.status(401).send({ success: false, error: 'Authentication required' });
};

// Security helper - Validate admin role
const validateAdminRole = async (userId: number): Promise<boolean> => {
  try {
    const [user] = await db
      .select({ roleId: users.roleId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return false;

    const [role] = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, user.roleId))
      .limit(1);

    return role && ['Super Admin', 'Admin', 'Manager'].includes(role.name);
  } catch (error) {
    console.error('Error validating admin role:', error);
    return false;
  }
};

// Security helper - Handle errors safely (never expose SQL/technical details to client)
const handleError = (request: FastifyRequest, reply: FastifyReply, error: unknown, statusCode: number = 500) => {
  // Log full error server-side for debugging
  request.log.error({ err: error }, 'Request error');

  // In development, send detailed error
  const isDev = process.env.NODE_ENV === 'development';
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  // Send only generic error message to client (or detailed in dev)
  reply.status(statusCode).send({
    success: false,
    error: statusCode === 401 ? 'Non autorisé' :
      statusCode === 404 ? 'Resource introuvable' :
        isDev ? errorMessage : 'Une erreur est survenue. Veuillez réessayer.',
    ...(isDev && { details: errorMessage, stack: error instanceof Error ? error.stack : undefined })
  });
};

export async function registerAdminRoutes(fastify: FastifyInstance) {
  // Initialize services
  const adminAuthService = new AdminAuthService();
  const adminTwoFactorService = new AdminTwoFactorService();

  // Register contracts routes
  await contractsRoutes(fastify);

  // Register approved customers route
  await registerApprovedCustomersRoute(fastify);

  // Register contract types routes (CRUD)
  await registerContractTypesRoutes(fastify);

  // Register credit services routes (NEW)
  await registerCreditServicesRoutes(fastify);

  // Register customer creation routes (NEW - MEMBERS, VIRTUAL, PHYSICAL)
  await registerCustomerCreationRoutes(fastify);

  // ===== ADMIN AUTHENTICATION ROUTES =====

  /**
   * POST /admin/auth/login
   * Authenticate admin user
   */
  fastify.post('/admin/auth/login', {
    schema: {
      tags: ['Admin Auth'],
      summary: 'Authenticate admin user',
      body: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          password: { type: 'string', minLength: 8 }
        },
        required: ['email', 'password']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            userId: { type: 'number' },
            email: { type: 'string' },
            username: { type: 'string' },
            mfaEnabled: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email, password } = request.body as { email: string; password: string };

      const authResult = await adminAuthService.authenticate(email, password);

      return {
        success: true,
        userId: authResult.userId,
        email: authResult.email,
        username: authResult.username,
        mfaEnabled: authResult.mfaEnabled,
        message: 'Authentification réussie'
      };
    } catch (error) {
      // Log error securely on server side only
      request.log.error({ err: error }, 'Authentication failed');

      // Send sanitized error to client (never expose SQL or technical details)
      reply.status(401).send({
        success: false,
        error: 'Identifiants invalides' // Generic message only
      });
    }
  });

  /**
   * POST /admin/auth/2fa/setup
   * Setup 2FA for admin user
   * Note: No auth required - this is part of the initial login flow
   */
  fastify.post('/admin/auth/2fa/setup', {
    schema: {
      tags: ['Admin Auth'],
      summary: 'Setup 2FA for admin user',
      body: {
        type: 'object',
        properties: {
          userId: { type: 'number' }
        },
        required: ['userId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            secret: { type: 'string' },
            qrCodeUrl: { type: 'string' },
            backupCodes: {
              type: 'array',
              items: { type: 'string' }
            },
            manualEntryKey: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.body as { userId: number };

      const setupResult = await adminTwoFactorService.setupTwoFactor(userId);

      return {
        success: true,
        secret: setupResult.secret,
        qrCodeUrl: setupResult.qrCodeUrl,
        backupCodes: setupResult.backupCodes,
        manualEntryKey: setupResult.manualEntryKey
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/auth/2fa/enable
   * Enable 2FA for admin user
   * Note: No auth required - this is part of the initial login flow
   */
  fastify.post('/admin/auth/2fa/enable', {
    schema: {
      tags: ['Admin Auth'],
      summary: 'Enable 2FA for admin user',
      body: {
        type: 'object',
        properties: {
          userId: { type: 'number' },
          secret: { type: 'string' },
          code: { type: 'string' }
        },
        required: ['userId', 'secret', 'code']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            backupCodes: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, secret, code } = request.body as { userId: number; secret: string; code: string };

      const enableResult = await adminTwoFactorService.enableTwoFactor(userId, secret, code);

      if (!enableResult.success) {
        return reply.status(400).send({
          success: false,
          error: enableResult.error
        });
      }

      return {
        success: true,
        backupCodes: enableResult.backupCodes
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/auth/2fa/verify
   * Verify 2FA code for admin user during login
   * Enhanced with intelligent failure tracking and diagnostics
   * Note: No auth required - this is part of the login flow
   */
  fastify.post('/admin/auth/2fa/verify', {
    schema: {
      tags: ['Admin Auth'],
      summary: 'Verify 2FA code for admin user',
      description: 'Verify TOTP or backup code with intelligent failure tracking',
      body: {
        type: 'object',
        properties: {
          userId: { type: 'number' },
          code: { type: 'string' }
        },
        required: ['userId', 'code']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            valid: { type: 'boolean' },
            failedAttempts: { type: 'number' },
            diagnostics: { type: 'object' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    try {
      const { userId, code } = request.body as { userId: number; code: string };

      // Validate input parameters
      if (!userId || !code) {
        return reply.status(400).send({
          success: false,
          error: 'Paramètres manquants. userId et code sont requis.'
        });
      }

      const result = await adminTwoFactorService.verifyTwoFactor(userId, code);

      const elapsed = Date.now() - startTime;
      // PERF: Only log slow requests or failures
      if (!result.valid || elapsed > 100) {
        console.log(`[2FA Route] ${result.valid ? 'OK' : 'FAIL'} ${elapsed}ms userId:${userId}`);
      }

      // Handle service-level errors (user not found, 2FA not configured, etc.)
      if (result.error) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      // ✅ CRITICAL: Set httpOnly cookie on successful 2FA verification
      if (result.valid) {
        // SECURITY: Use centralized cookie configuration
        const cookieValue = generateAuthCookieValue(userId);

        reply.setCookie(AUTH_COOKIE_NAME, cookieValue, AUTH_COOKIE_OPTIONS);

        console.log(`[2FA Route] ✅ Secure cookie SET: ${AUTH_COOKIE_NAME}=${cookieValue}`);

        // ✅ SERENITY NEO: SECURITY ALERT (Async)
        // Capture request data synchronously before async operations
        const ip = request.ip;
        const userAgent = request.headers['user-agent'] || 'unknown';

        // Fetch user email to send alert
        adminAuthService.getAdminUser(userId).then(userResult => {
          if (userResult.success && userResult.user.email) {
            resendEmailService.sendLoginAlert(
              userResult.user.email,
              userResult.user.username || 'Admin',
              {
                ip,
                device: userAgent.substring(0, 100),
                browser: 'Unknown',
                os: 'Unknown',
                provider: 'Unknown',
                location: 'Unknown',
                time: new Date().toISOString()
              }
            ).catch(err => request.log.error({ err }, 'Failed to send admin login alert'));
          }
        }).catch(err => request.log.error({ err }, 'Failed to fetch admin user for alert'));
      }

      return {
        success: true,
        valid: result.valid,
        failedAttempts: result.failedAttempts,
        diagnostics: result.diagnostics
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`[2FA Route] ERROR ${elapsed}ms:`, error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/auth/2fa/status/:userId
   * Get 2FA status for admin user
   */
  fastify.get('/admin/auth/2fa/status/:userId', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Auth'],
      summary: 'Get 2FA status for admin user',
      params: {
        type: 'object',
        properties: {
          userId: { type: 'number' }
        },
        required: ['userId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            enabled: { type: 'boolean' },
            configuredAt: { type: 'string' },
            remainingBackupCodes: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params as { userId: number };

      const statusResult = await adminTwoFactorService.getTwoFactorStatus(userId);

      return {
        success: true,
        enabled: statusResult.enabled,
        configuredAt: statusResult.configuredAt,
        remainingBackupCodes: statusResult.remainingBackupCodes
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/auth/validate
   * Validate admin session and return user data
   * Used for session restoration after page refresh
   */
  fastify.get('/admin/auth/validate', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Auth'],
      summary: 'Validate admin session',
      description: 'Restores session data after page refresh. Cookie-based authentication required.',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            admin: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                email: { type: 'string' },
                username: { type: 'string' },
                role: { type: 'string' },
                mfaEnabled: { type: 'boolean' },
                isActive: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Extract userId from auth cookie
      const adminTokenCookie = request.cookies[AUTH_COOKIE_NAME];

      if (!adminTokenCookie) {
        return reply.status(401).send({
          success: false,
          error: 'Non authentifié'
        });
      }

      // Parse userId from cookie using centralized utility
      const userId = extractUserIdFromCookie(adminTokenCookie);

      if (userId === null) {
        return reply.status(401).send({
          success: false,
          error: 'Token invalide'
        });
      }

      const result = await adminAuthService.validateSession(userId);

      return result;
    } catch (error) {
      console.error('[Session Validate] Error:', error);
      return reply.status(401).send({
        success: false,
        error: 'Session invalide'
      });
    }
  });

  /**
   * POST /admin/auth/refresh
   * Refresh admin session - extends session expiration
   */
  fastify.post('/admin/auth/refresh', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Auth'],
      summary: 'Refresh admin session',
      description: 'Renews session expiration. Called automatically during user activity.',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            expiresAt: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminTokenCookie = request.cookies[AUTH_COOKIE_NAME];

      if (!adminTokenCookie) {
        return reply.status(401).send({
          success: false,
          error: 'Non authentifié'
        });
      }

      // Parse userId from cookie
      const userId = parseInt(adminTokenCookie.replace('adminUser_', ''));

      if (isNaN(userId)) {
        return reply.status(401).send({
          success: false,
          error: 'Token invalide'
        });
      }

      const result = await adminAuthService.refreshSession(userId);

      // Update cookie expiration (30 minutes from now)
      reply.setCookie(AUTH_COOKIE_NAME, adminTokenCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 60 // 30 minutes
      });

      return result;
    } catch (error) {
      console.error('[Session Refresh] Error:', error);
      return reply.status(401).send({
        success: false,
        error: 'Échec renouvellement'
      });
    }
  });

  // ===== APPROVAL SYSTEM ROUTES =====

  /**
   * GET /admin/approvals
   * Get approval requests filtered by user role
   */
  fastify.get('/admin/approvals', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Approvals'],
      summary: 'Get approval requests by role',
      querystring: {
        type: 'object',
        properties: {
          userId: { type: 'number' },
          role: { type: 'string', enum: ['Manager', 'Admin', 'Super Admin'] }
        },
        required: ['userId', 'role']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, role } = request.query as { userId: number; role: 'Manager' | 'Admin' | 'Super Admin' };

      const result = await ApprovalService.getApprovalsByRole(userId, role);

      return result;
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/approvals/pending-count
   * Get count of pending approvals for role
   */
  fastify.get('/admin/approvals/pending-count', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Approvals'],
      summary: 'Get pending approvals count',
      querystring: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          role: { type: 'string', enum: ['Manager', 'Admin', 'Super Admin', 'manager', 'admin', 'super admin'] }
        },
        required: ['userId', 'role']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId: userIdStr, role: roleStr } = request.query as { userId: string; role: string };

      // Parse and validate userId
      const userId = parseInt(userIdStr, 10);
      if (isNaN(userId) || userId <= 0) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid userId parameter'
        });
      }

      // Normalize role to proper case
      const normalizeRole = (r: string): 'Manager' | 'Admin' | 'Super Admin' => {
        const lower = r.toLowerCase();
        if (lower === 'manager') return 'Manager';
        if (lower === 'admin') return 'Admin';
        if (lower === 'super admin') return 'Super Admin';
        throw new Error('Invalid role');
      };

      const role = normalizeRole(roleStr);
      const result = await ApprovalService.getPendingCount(userId, role);

      return result;
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/approvals/:id
   * Get approval request details
   */
  fastify.get('/admin/approvals/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Approvals'],
      summary: 'Get approval request details',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      const result = await ApprovalService.getApprovalById(id);

      return result;
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/approvals/:id/validate
   * Validate (approve or reject) an approval request
   */
  fastify.post('/admin/approvals/:id/validate', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Approvals'],
      summary: 'Validate approval request',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          userId: { type: 'number' },
          role: { type: 'string', enum: ['Admin', 'Super Admin'] },
          name: { type: 'string' },
          action: { type: 'string', enum: ['APPROVE', 'REJECT'] },
          rejectionReason: { type: 'string' }
        },
        required: ['userId', 'role', 'name', 'action']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { userId, role, name, action, rejectionReason } = request.body as {
        userId: number;
        role: 'Admin' | 'Super Admin';
        name: string;
        action: 'APPROVE' | 'REJECT';
        rejectionReason?: string;
      };

      if (action === 'REJECT' && (!rejectionReason || rejectionReason.length < 20)) {
        return reply.status(400).send({
          success: false,
          error: 'Rejection reason must be at least 20 characters'
        });
      }

      const result = await ApprovalService.validateApprovalRequest({
        approvalId: id,
        validatedBy: { userId, role, name },
        action,
        rejectionReason
      });

      return result;
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // ===== MIGRATION ROUTES =====

  /**
   * POST /admin/migrations/create
   * Create a migration request for a MEMBER customer
   */
  fastify.post('/admin/migrations/create', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Migrations'],
      summary: 'Create migration request',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          createdByUserId: { type: 'number' },
          createdByRole: { type: 'string', enum: ['Manager', 'Admin'] },
          createdByName: { type: 'string' },
          deposits: {
            type: 'object',
            properties: {
              s01Cdf: { type: 'number' },
              s01Usd: { type: 'number' },
              s02Cdf: { type: 'number' },
              s02Usd: { type: 'number' },
              s03Cdf: { type: 'number' },
              s03Usd: { type: 'number' },
              s04Cdf: { type: 'number' },
              s04Usd: { type: 'number' },
              s05Cdf: { type: 'number' },
              s05Usd: { type: 'number' },
              s06Cdf: { type: 'number' },
              s06Usd: { type: 'number' }
            },
            required: ['s01Cdf', 's01Usd', 's02Cdf', 's02Usd', 's03Cdf', 's03Usd', 's04Cdf', 's04Usd', 's05Cdf', 's05Usd', 's06Cdf', 's06Usd']
          },
          kycData: { type: 'object' },
          missingKycFields: { type: 'array', items: { type: 'string' } },
          requestedServices: { type: 'array', items: { type: 'string' } }
        },
        required: ['customerId', 'createdByUserId', 'createdByRole', 'createdByName', 'deposits']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;

      const result = await MigrationService.createMigrationRequest({
        customerId: body.customerId,
        createdBy: {
          userId: body.createdByUserId,
          role: body.createdByRole,
          name: body.createdByName
        },
        deposits: body.deposits,
        kycData: body.kycData,
        missingKycFields: body.missingKycFields,
        requestedServices: body.requestedServices
      });

      return result;
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/migrations/:id
   * Get migration request details
   */
  fastify.get('/admin/migrations/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Migrations'],
      summary: 'Get migration request details',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      const result = await MigrationService.getMigrationRequest(id);

      return result;
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/customers/:customerId/migrations
   * Get all migration requests for a customer
   */
  fastify.get('/admin/customers/:customerId/migrations', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Migrations'],
      summary: 'Get customer migration requests',
      params: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.params as { customerId: number };

      const result = await MigrationService.getCustomerMigrations(customerId);

      return result;
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // ===== DASHBOARD STATISTICS ROUTES =====

  /**
   * GET /admin/dashboard/stats
   * Get dashboard statistics
   */
  fastify.get('/admin/dashboard/stats', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Get dashboard statistics',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            stats: {
              type: 'object',
              properties: {
                totalUsers: { type: 'number' },
                activeUsers: { type: 'number' },
                pendingKyc: { type: 'number' },
                verifiedKyc: { type: 'number' },
                active2FA: { type: 'number' },
                securityAlerts: { type: 'number' },
                userGrowth: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      month: { type: 'string' },
                      users: { type: 'number' },
                      kycSubmissions: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    try {
      // ===== ULTRA-OPTIMIZED: Single query combining all stats + growth =====
      const [result] = await db.execute(sql`
        WITH stats AS (
          SELECT 
            -- User stats
            (SELECT COUNT(*) FROM users) as total_users,
            (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
            (SELECT COUNT(*) FROM users WHERE mfa_enabled = true) as mfa_users,
            -- Customer stats
            (SELECT COUNT(*) FROM customers) as total_customers,
            (SELECT COUNT(*) FROM customers WHERE status = 'ACTIVE') as active_customers,
            (SELECT COUNT(*) FROM customers WHERE mfa_enabled = true) as mfa_customers,
            (SELECT COUNT(*) FROM customers WHERE kyc_status IN ('KYC1_PENDING', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW')) as pending_kyc,
            (SELECT COUNT(*) FROM customers WHERE kyc_status = 'KYC2_VERIFIED') as verified_kyc,
            (SELECT COUNT(*) FROM customers WHERE status IN ('SUSPENDED', 'CLOSED')) as security_alerts
        ),
        -- Pre-calculate month boundaries
        month_0 AS (SELECT date_trunc('month', CURRENT_DATE) as start_date),
        month_1 AS (SELECT date_trunc('month', CURRENT_DATE - interval '1 month') as start_date),
        month_2 AS (SELECT date_trunc('month', CURRENT_DATE - interval '2 months') as start_date),
        month_3 AS (SELECT date_trunc('month', CURRENT_DATE - interval '3 months') as start_date),
        month_4 AS (SELECT date_trunc('month', CURRENT_DATE - interval '4 months') as start_date),
        month_5 AS (SELECT date_trunc('month', CURRENT_DATE - interval '5 months') as start_date),
        -- Growth stats (simplified - only count customers, not users)
        growth AS (
          SELECT 
            to_char(month_5.start_date, 'Mon') as month_5_label,
            (SELECT COUNT(*) FROM customers WHERE created_at >= month_5.start_date AND created_at < month_4.start_date) as month_5_users,
            (SELECT COUNT(*) FROM customers WHERE created_at >= month_5.start_date AND created_at < month_4.start_date AND kyc_status IN ('KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED')) as month_5_kyc,
            to_char(month_4.start_date, 'Mon') as month_4_label,
            (SELECT COUNT(*) FROM customers WHERE created_at >= month_4.start_date AND created_at < month_3.start_date) as month_4_users,
            (SELECT COUNT(*) FROM customers WHERE created_at >= month_4.start_date AND created_at < month_3.start_date AND kyc_status IN ('KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED')) as month_4_kyc,
            to_char(month_3.start_date, 'Mon') as month_3_label,
            (SELECT COUNT(*) FROM customers WHERE created_at >= month_3.start_date AND created_at < month_2.start_date) as month_3_users,
            (SELECT COUNT(*) FROM customers WHERE created_at >= month_3.start_date AND created_at < month_2.start_date AND kyc_status IN ('KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED')) as month_3_kyc,
            to_char(month_2.start_date, 'Mon') as month_2_label,
            (SELECT COUNT(*) FROM customers WHERE created_at >= month_2.start_date AND created_at < month_1.start_date) as month_2_users,
            (SELECT COUNT(*) FROM customers WHERE created_at >= month_2.start_date AND created_at < month_1.start_date AND kyc_status IN ('KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED')) as month_2_kyc,
            to_char(month_1.start_date, 'Mon') as month_1_label,
            (SELECT COUNT(*) FROM customers WHERE created_at >= month_1.start_date AND created_at < month_0.start_date) as month_1_users,
            (SELECT COUNT(*) FROM customers WHERE created_at >= month_1.start_date AND created_at < month_0.start_date AND kyc_status IN ('KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED')) as month_1_kyc,
            to_char(month_0.start_date, 'Mon') as month_0_label,
            (SELECT COUNT(*) FROM customers WHERE created_at >= month_0.start_date) as month_0_users,
            (SELECT COUNT(*) FROM customers WHERE created_at >= month_0.start_date AND kyc_status IN ('KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED')) as month_0_kyc
          FROM month_0, month_1, month_2, month_3, month_4, month_5
        )
        SELECT 
          s.*,
          g.month_5_label, g.month_5_users, g.month_5_kyc,
          g.month_4_label, g.month_4_users, g.month_4_kyc,
          g.month_3_label, g.month_3_users, g.month_3_kyc,
          g.month_2_label, g.month_2_users, g.month_2_kyc,
          g.month_1_label, g.month_1_users, g.month_1_kyc,
          g.month_0_label, g.month_0_users, g.month_0_kyc
        FROM stats s, growth g
      `);

      const queryTime = Date.now() - startTime;
      console.log(`[Dashboard Stats] Query executed in ${queryTime}ms`);

      const data = (result as any)[0] || {};

      // Build user growth array from flattened data
      const userGrowth = [
        { month: data.month_5_label || 'N/A', users: parseInt(data.month_5_users || '0'), kycSubmissions: parseInt(data.month_5_kyc || '0') },
        { month: data.month_4_label || 'N/A', users: parseInt(data.month_4_users || '0'), kycSubmissions: parseInt(data.month_4_kyc || '0') },
        { month: data.month_3_label || 'N/A', users: parseInt(data.month_3_users || '0'), kycSubmissions: parseInt(data.month_3_kyc || '0') },
        { month: data.month_2_label || 'N/A', users: parseInt(data.month_2_users || '0'), kycSubmissions: parseInt(data.month_2_kyc || '0') },
        { month: data.month_1_label || 'N/A', users: parseInt(data.month_1_users || '0'), kycSubmissions: parseInt(data.month_1_kyc || '0') },
        { month: data.month_0_label || 'N/A', users: parseInt(data.month_0_users || '0'), kycSubmissions: parseInt(data.month_0_kyc || '0') },
      ];

      const totalTime = Date.now() - startTime;
      if (totalTime > 200) {
        console.warn(`[Dashboard Stats] ⚠️ Slow request: ${totalTime}ms (target: <200ms)`);
      }

      return {
        success: true,
        stats: {
          totalUsers: parseInt(data.total_users || '0') + parseInt(data.total_customers || '0'),
          activeUsers: parseInt(data.active_users || '0') + parseInt(data.active_customers || '0'),
          pendingKyc: parseInt(data.pending_kyc || '0'),
          verifiedKyc: parseInt(data.verified_kyc || '0'),
          active2FA: parseInt(data.mfa_users || '0') + parseInt(data.mfa_customers || '0'),
          securityAlerts: parseInt(data.security_alerts || '0'),
          userGrowth
        }
      };
    } catch (error) {
      console.error('[Dashboard Stats] Error after', Date.now() - startTime, 'ms:', error);
      handleError(request, reply, error, 500);
    }
  });

  // ===== ACCOUNT TYPE CONDITIONS ROUTES =====

  /**
   * GET /admin/account-types/conditions
   * Get all account type conditions
   */
  fastify.get('/admin/account-types/conditions', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Get all account type conditions',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            accountTypes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  accountType: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  conditions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'number' },
                        conditionType: { type: 'string' },
                        conditionLabel: { type: 'string' },
                        conditionDescription: { type: 'string' },
                        displayOrder: { type: 'number' },
                        isActive: { type: 'boolean' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get all account types with their conditions
      const accountTypesResult = await db.execute(sql`
        SELECT 
          at.code as account_type,
          at.name,
          at.name as label,
          at.description,
          COALESCE(
            json_agg(
              json_build_object(
                'id', atc.id,
                'conditionType', atc.condition_type,
                'conditionLabel', atc.condition_label,
                'conditionDescription', atc.condition_description,
                'displayOrder', atc.display_order,
                'isActive', atc.is_active
              ) ORDER BY atc.display_order
            ) FILTER (WHERE atc.id IS NOT NULL),
            '[]'::json
          ) as conditions
        FROM account_types at
        LEFT JOIN account_type_conditions atc ON at.code = atc.account_type_code
        WHERE at.code IN ('S01_STANDARD', 'S02_MANDATORY_SAVINGS', 'S03_CAUTION', 'S04_CREDIT', 'S05_BWAKISA_CARTE', 'S06_FINES')
        GROUP BY at.code, at.name, at.description
        ORDER BY at.code
      `);

      // Drizzle v0.33+ returns array-like object, need to extract rows properly
      console.log('[Account Conditions] Raw query result type:', typeof accountTypesResult);
      console.log('[Account Conditions] Raw query result keys:', Object.keys(accountTypesResult || {}));

      // Extract the actual data array from Drizzle result
      const accountTypes = Array.isArray(accountTypesResult)
        ? accountTypesResult
        : (accountTypesResult as any).rows || [];

      console.log('[Account Conditions] Extracted accountTypes:', {
        isArray: Array.isArray(accountTypes),
        length: accountTypes?.length,
        sample: accountTypes?.[0],
        sampleKeys: accountTypes?.[0] ? Object.keys(accountTypes[0]) : [],
        allAccountTypes: accountTypes.map((at: any) => ({
          account_type: at.account_type,
          name: at.name,
          conditionsCount: Array.isArray(at.conditions) ? at.conditions.length : 0
        }))
      });

      // CRITICAL FIX: Fastify schema expects camelCase 'accountType' but SQL returns snake_case 'account_type'
      // Transform the data to match the schema
      const formattedAccountTypes = accountTypes.map((at: any) => ({
        accountType: at.account_type,  // snake_case → camelCase
        name: at.name,
        label: at.label,
        description: at.description,
        conditions: at.conditions
      }));

      return {
        success: true,
        accountTypes: formattedAccountTypes
      };
    } catch (error) {
      console.error('[Account Conditions] Error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch account conditions'
      });
    }
  });

  /**
   * GET /admin/account-types/:accountType/conditions
   * Get conditions for specific account type
   */
  fastify.get('/admin/account-types/:accountType/conditions', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Get conditions for specific account type',
      params: {
        type: 'object',
        properties: {
          accountType: { type: 'string' }
        },
        required: ['accountType']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            accountType: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            conditions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  conditionType: { type: 'string' },
                  conditionLabel: { type: 'string' },
                  conditionDescription: { type: 'string' },
                  displayOrder: { type: 'number' },
                  isActive: { type: 'boolean' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { accountType } = request.params as { accountType: string };

      // Get account type with conditions
      const result = await db.execute(sql`
        SELECT 
          at.code as account_type,
          at.name,
          at.description,
          COALESCE(
            json_agg(
              json_build_object(
                'id', atc.id,
                'conditionType', atc.condition_type,
                'conditionLabel', atc.condition_label,
                'conditionDescription', atc.condition_description,
                'displayOrder', atc.display_order,
                'isActive', atc.is_active
              ) ORDER BY atc.display_order
            ) FILTER (WHERE atc.id IS NOT NULL),
            '[]'::json
          ) as conditions
        FROM account_types at
        LEFT JOIN account_type_conditions atc ON at.code = atc.account_type_code
        WHERE at.code = ${accountType}
        GROUP BY at.code, at.name, at.description
      `);

      const data = (result as any)[0]; // FIX: Drizzle Result is array-like, no .rows

      if (!data) {
        return reply.status(404).send({
          success: false,
          error: 'Account type not found'
        });
      }

      return {
        success: true,
        accountType: data.account_type,
        name: data.name,
        description: data.description,
        conditions: data.conditions
      };
    } catch (error) {
      console.error('[Account Conditions] Error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch account conditions'
      });
    }
  });

  // ===== USER MANAGEMENT ROUTES =====

  /**
   * GET /admin/roles
   * Get all roles
   */
  fastify.get('/admin/roles', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Get all roles',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            roles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  name: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const roleList = await db
        .select({
          id: roles.id,
          name: roles.name,
          description: roles.description
        })
        .from(roles)
        .orderBy(roles.name);

      return {
        success: true,
        roles: roleList
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/roles
   * Create a new role
   */
  fastify.post('/admin/roles', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Create a new role',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['name']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            role: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                description: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { name, description } = request.body as { name: string; description?: string };

      // Check if role already exists
      const existingRole = await db
        .select()
        .from(roles)
        .where(eq(roles.name, name))
        .limit(1);

      if (existingRole.length > 0) {
        reply.status(400).send({
          success: false,
          error: 'Role with this name already exists'
        });
        return;
      }

      // Create new role
      const [newRole] = await db
        .insert(roles)
        .values({
          name,
          description: description || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .returning();

      return {
        success: true,
        message: 'Role created successfully',
        role: newRole
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * PUT /admin/roles/:id
   * Update an existing role
   */
  fastify.put('/admin/roles/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Update an existing role',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['name']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            role: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                description: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { name, description } = request.body as { name: string; description?: string };

      // Check if role exists
      const [existingRole] = await db
        .select()
        .from(roles)
        .where(eq(roles.id, id))
        .limit(1);

      if (!existingRole) {
        reply.status(404).send({
          success: false,
          error: 'Role not found'
        });
        return;
      }

      // Check if name is already taken by another role
      const [duplicateName] = await db
        .select()
        .from(roles)
        .where(and(eq(roles.name, name), ne(roles.id, id)))
        .limit(1);

      if (duplicateName) {
        reply.status(400).send({
          success: false,
          error: 'Role name already exists'
        });
        return;
      }

      // Update role
      const [updatedRole] = await db
        .update(roles)
        .set({
          name,
          description: description || null,
          updatedAt: new Date().toISOString()
        })
        .where(eq(roles.id, id))
        .returning();

      return {
        success: true,
        message: 'Role updated successfully',
        role: updatedRole
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * DELETE /admin/roles/:id
   * Delete a role (only if not assigned to any users)
   */
  fastify.delete('/admin/roles/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Delete a role',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      // Check if role exists
      const [existingRole] = await db
        .select()
        .from(roles)
        .where(eq(roles.id, id))
        .limit(1);

      if (!existingRole) {
        reply.status(404).send({
          success: false,
          error: 'Role not found'
        });
        return;
      }

      // Check if role is assigned to any users
      const [userCount] = await db
        .select({ count: db.$count(users) })
        .from(users)
        .where(eq(users.roleId, id));

      if (userCount.count > 0) {
        reply.status(400).send({
          success: false,
          error: `Cannot delete role. It is assigned to ${userCount.count} user(s). Please reassign these users first.`
        });
        return;
      }

      // Delete role
      await db
        .delete(roles)
        .where(eq(roles.id, id));

      return {
        success: true,
        message: 'Role deleted successfully'
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/users
   * Create a new user
   */
  fastify.post('/admin/users', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Create a new user',
      body: {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 50 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          roleId: { type: 'number' },
          agencyId: { type: 'number' },
          validated: { type: 'boolean' },
          isActive: { type: 'boolean' }
        },
        required: ['username', 'email', 'password', 'roleId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                username: { type: 'string' },
                email: { type: 'string' },
                roleId: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { username, email, password, roleId, agencyId, validated = false, isActive = true } = request.body as {
        username: string;
        email: string;
        password: string;
        roleId: number;
        agencyId?: number;
        validated?: boolean;
        isActive?: boolean;
      };

      // Check if username already exists
      const existingUsername = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUsername.length > 0) {
        reply.status(400).send({
          success: false,
          error: 'Username already exists'
        });
        return;
      }

      // Check if email already exists
      const existingEmail = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail.length > 0) {
        reply.status(400).send({
          success: false,
          error: 'Email already exists'
        });
        return;
      }

      // Verify the role exists
      const [role] = await db
        .select()
        .from(roles)
        .where(eq(roles.id, roleId))
        .limit(1);

      if (!role) {
        reply.status(400).send({
          success: false,
          error: 'Invalid role ID'
        });
        return;
      }

      // If agencyId is provided, verify it exists
      if (agencyId) {
        const [agency] = await db
          .select()
          .from(agencies)
          .where(eq(agencies.id, agencyId))
          .limit(1);

        if (!agency) {
          reply.status(400).send({
            success: false,
            error: 'Invalid agency ID'
          });
          return;
        }

        // Verify role requires agency (Cashier or Manager)
        const requiresAgency = ['Cashier', 'Manager', 'Caissier', 'Responsable'].includes(role.name);
        if (!requiresAgency) {
          reply.status(400).send({
            success: false,
            error: `Role ${role.name} does not require an agency assignment`
          });
          return;
        }
      } else {
        // Check if role requires agency
        const requiresAgency = ['Cashier', 'Manager', 'Caissier', 'Responsable'].includes(role.name);
        if (requiresAgency) {
          reply.status(400).send({
            success: false,
            error: `Role ${role.name} requires an agency assignment`
          });
          return;
        }
      }

      // Hash the password
      const hashedPassword = await hash(password);

      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          email,
          passwordHash: hashedPassword,
          roleId,
          agencyId: agencyId || null,
          validated,
          isActive,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .returning({
          id: users.id,
          username: users.username,
          email: users.email,
          roleId: users.roleId,
          agencyId: users.agencyId
        });

      return {
        success: true,
        message: 'User created successfully',
        user: newUser
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/users
   * Get all users with pagination and filtering
   */
  fastify.get('/admin/users', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Get all users',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', default: 1 },
          limit: { type: 'number', default: 20 },
          search: { type: 'string' },
          status: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string' },
                  mobileMoneyNumber: { type: 'string' },
                  status: { type: 'string' },
                  mfaEnabled: { type: 'boolean' },
                  accountCreationDate: { type: 'string' },
                  kycStatus: { type: 'string' },
                  roleId: { type: 'number' },
                  roleName: { type: 'string' },
                  agencyId: { type: ['number', 'null'] },
                  agencyCode: { type: ['string', 'null'] },
                  agencyName: { type: ['string', 'null'] }
                }
              }
            },
            totalCount: { type: 'number' },
            currentPage: { type: 'number' },
            totalPages: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { page = 1, limit = 20, search = '', status = '' } = request.query as {
        page?: number;
        limit?: number;
        search?: string;
        status?: string
      };

      // Build query conditions for users table
      let conditions = and();

      if (search) {
        conditions = and(
          conditions,
          or(
            like(users.username, `%${search}%`),
            like(users.email, `%${search}%`)
          )
        );
      }

      // Handle status filtering (active/inactive)
      if (status) {
        if (status === 'ACTIVE') {
          conditions = and(conditions, eq(users.isActive, true));
        } else if (status === 'SUSPENDED' || status === 'INACTIVE') {
          conditions = and(conditions, eq(users.isActive, false));
        }
      }

      // Get total count
      const [{ count }] = await db.select({ count: db.$count(users, conditions) }).from(users);

      // Get paginated users with role and agency information (using LEFT JOIN like customers endpoint)
      // IMPORTANT: Agency code and name should be returned in the response
      const userList = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          roleId: users.roleId,
          agencyId: users.agencyId,
          validated: users.validated,
          isActive: users.isActive,
          mfaEnabled: users.mfaEnabled,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          roleName: roles.name,
          agencyCode: agencies.code,
          agencyName: agencies.name
        })
        .from(users)
        .leftJoin(roles, eq(users.roleId, roles.id))
        .leftJoin(agencies, eq(users.agencyId, agencies.id))
        .where(conditions)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

      console.log('[Admin Users] User list sample:', userList.slice(0, 2));
      console.log('[Admin Users] User with ID 5 (Mellia):', userList.find(u => u.id === 5));

      // Map to expected format for frontend
      const formattedUsers = userList.map(user => {
        return {
          id: user.id,
          firstName: user.username, // Use username as firstName
          lastName: user.roleName || 'User', // Use role as lastName
          email: user.email,
          mobileMoneyNumber: '-', // Not applicable for users table
          status: user.isActive ? 'ACTIVE' : 'SUSPENDED',
          mfaEnabled: user.mfaEnabled,
          accountCreationDate: user.createdAt,
          kycStatus: 'NOT_APPLICABLE', // Not applicable for users table
          roleId: user.roleId,
          roleName: user.roleName || 'User',
          agencyId: user.agencyId,
          agencyCode: user.agencyCode || null,
          agencyName: user.agencyName || null
        };
      });

      console.log('[Admin Users] Formatted user with ID 5:', formattedUsers.find(u => u.id === 5));

      return {
        success: true,
        users: formattedUsers,
        totalCount: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit)
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * PUT /admin/users/:id
   * Update a user
   */
  fastify.put('/admin/users/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Update user',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 50 },
          email: { type: 'string', format: 'email' },
          roleId: { type: 'number' },
          agencyId: { type: 'number' },
          validated: { type: 'boolean' },
          isActive: { type: 'boolean' }
        },
        required: ['username', 'email', 'roleId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { username, email, roleId, agencyId, validated, isActive } = request.body as {
        username: string;
        email: string;
        roleId: number;
        agencyId?: number | null;
        validated?: boolean;
        isActive?: boolean;
      };

      // Check if user exists
      const [existingUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);

      if (!existingUser) {
        reply.status(404).send({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Check if username is taken by another user
      if (username !== existingUser.username) {
        const [usernameTaken] = await db
          .select()
          .from(users)
          .where(and(eq(users.username, username), not(eq(users.id, id))))
          .limit(1);

        if (usernameTaken) {
          reply.status(400).send({
            success: false,
            error: 'Username already taken'
          });
          return;
        }
      }

      // Check if email is taken by another user
      if (email !== existingUser.email) {
        const [emailTaken] = await db
          .select()
          .from(users)
          .where(and(eq(users.email, email), not(eq(users.id, id))))
          .limit(1);

        if (emailTaken) {
          reply.status(400).send({
            success: false,
            error: 'Email already taken'
          });
          return;
        }
      }

      // Get role information to check if agency is required
      const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);

      if (!role) {
        reply.status(400).send({
          success: false,
          error: 'Role not found'
        });
        return;
      }

      // Check if role requires agency (Cashier/Manager/Caissier/Responsable)
      const requiresAgency = ['Cashier', 'Manager', 'Caissier', 'Responsable'].includes(role.name);

      if (requiresAgency && !agencyId) {
        reply.status(400).send({
          success: false,
          error: `Role ${role.name} requires an agency assignment`
        });
        return;
      }

      // If agency is provided, verify it exists
      if (agencyId) {
        const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);

        if (!agency) {
          reply.status(400).send({
            success: false,
            error: 'Agency not found'
          });
          return;
        }
      }

      // Update user
      await db
        .update(users)
        .set({
          username,
          email,
          roleId,
          agencyId: requiresAgency ? agencyId : null,
          validated: validated ?? existingUser.validated,
          isActive: isActive ?? existingUser.isActive,
          updatedAt: new Date().toISOString()
        })
        .where(eq(users.id, id));

      return {
        success: true,
        message: 'User updated successfully'
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/users/:id/block
   * Block/unblock a user
   */
  fastify.post('/admin/users/:id/block', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Block/unblock user',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          block: { type: 'boolean' }
        },
        required: ['block']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { block } = request.body as { block: boolean };

      // Update users table instead of customers
      await db
        .update(users)
        .set({
          isActive: !block,
          updatedAt: new Date().toISOString()
        })
        .where(eq(users.id, id));

      return {
        success: true,
        message: block ? 'User blocked successfully' : 'User unblocked successfully'
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/users/:id/reset-password
   * Reset user password
   */
  fastify.post('/admin/users/:id/reset-password', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Reset user password',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          newPassword: { type: 'string', minLength: 8 }
        },
        required: ['newPassword']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { newPassword } = request.body as { newPassword: string };

      // Hash the new password
      const hashedPassword = await hash(newPassword);

      // Update users table instead of customers
      await db
        .update(users)
        .set({
          passwordHash: hashedPassword,
          updatedAt: new Date().toISOString()
        })
        .where(eq(users.id, id));

      return {
        success: true,
        message: 'Password reset successfully'
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * DELETE /admin/users/:id
   * Delete a user
   */
  fastify.delete('/admin/users/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Delete user',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      // Delete from users table instead of customers
      // Note: In a real application, you might want to soft delete or archive instead
      await db
        .delete(users)
        .where(eq(users.id, id));

      return {
        success: true,
        message: 'User deleted successfully'
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // ===== 2FA MANAGEMENT ROUTES =====

  /**
   * POST /admin/users/:id/2fa
   * Enable/disable 2FA for a user
   */
  fastify.post('/admin/users/:id/2fa', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Enable/disable 2FA for user',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          enable: { type: 'boolean' }
        },
        required: ['enable']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { enable } = request.body as { enable: boolean };

      if (enable) {
        // Enable 2FA - generate secret
        const secret = authenticator.generateSecret();
        await db
          .update(users)
          .set({
            mfaEnabled: true,
            mfaSecret: secret,
            mfaConfiguredAt: new Date().toISOString()
          })
          .where(eq(users.id, id));
      } else {
        // Disable 2FA - clear secrets
        await db
          .update(users)
          .set({
            mfaEnabled: false,
            mfaSecret: null,
            mfaBackupCodes: null,
            mfaConfiguredAt: null
          })
          .where(eq(users.id, id));
      }

      return {
        success: true,
        message: enable ? '2FA enabled successfully' : '2FA disabled successfully'
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/users/:id/role
   * Update user role
   */
  fastify.post('/admin/users/:id/role', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Update user role',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          roleId: { type: 'number' }
        },
        required: ['roleId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { roleId } = request.body as { roleId: number };

      // Verify the role exists
      const [role] = await db
        .select()
        .from(roles)
        .where(eq(roles.id, roleId))
        .limit(1);

      if (!role) {
        reply.status(400).send({
          success: false,
          error: 'Invalid role ID'
        });
        return;
      }

      // Update user role
      await db
        .update(users)
        .set({
          roleId: roleId,
          updatedAt: new Date().toISOString()
        })
        .where(eq(users.id, id));

      return {
        success: true,
        message: 'User role updated successfully'
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // ===== KYC MANAGEMENT ROUTES =====

  /**
   * GET /admin/kyc/submissions
   * Get all KYC submissions
   */
  fastify.get('/admin/kyc/submissions', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Get all KYC submissions',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', default: 1 },
          limit: { type: 'number', default: 20 },
          status: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            submissions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string' },
                  kycStatus: { type: 'string' },
                  kycStep: { type: 'number' },
                  submissionDate: { type: 'string' }
                }
              }
            },
            totalCount: { type: 'number' },
            currentPage: { type: 'number' },
            totalPages: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { page = 1, limit = 20, status = '' } = request.query as {
        page?: number;
        limit?: number;
        status?: string
      };

      // Build query conditions
      let conditions = and(
        or(
          eq(customers.kycStatus, kycStatus.enumValues[1]), // KYC1_PENDING
          eq(customers.kycStatus, kycStatus.enumValues[3]), // KYC2_PENDING
          eq(customers.kycStatus, kycStatus.enumValues[4]), // KYC2_UNDER_REVIEW
          eq(customers.kycStatus, kycStatus.enumValues[5])  // KYC2_VERIFIED
        )
      );

      // Handle KYC status filtering with proper enum values
      if (status) {
        // Map string status to enum values
        switch (status) {
          case 'KYC1_PENDING':
            conditions = and(conditions, eq(customers.kycStatus, kycStatus.enumValues[1]));
            break;
          case 'KYC2_PENDING':
            conditions = and(conditions, eq(customers.kycStatus, kycStatus.enumValues[3]));
            break;
          case 'KYC2_UNDER_REVIEW':
            conditions = and(conditions, eq(customers.kycStatus, kycStatus.enumValues[4]));
            break;
          case 'KYC2_VERIFIED':
            conditions = and(conditions, eq(customers.kycStatus, kycStatus.enumValues[5]));
            break;
          case 'REJECTED':
            conditions = and(conditions, eq(customers.kycStatus, kycStatus.enumValues[6]));
            break;
          case 'KYC1_COMPLETED':
            conditions = and(conditions, eq(customers.kycStatus, kycStatus.enumValues[2]));
            break;
          case 'NOT_STARTED':
            conditions = and(conditions, eq(customers.kycStatus, kycStatus.enumValues[0]));
            break;
        }
      }

      // Get total count
      const [{ count }] = await db.select({ count: db.$count(customers, conditions) }).from(customers);

      // Get paginated submissions
      const submissions = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          kycStatus: customers.kycStatus,
          kycStep: customers.kycStep,
          submissionDate: customers.kyc2SubmissionDate
        })
        .from(customers)
        .where(conditions)
        .orderBy(desc(customers.kyc2SubmissionDate))
        .limit(limit)
        .offset((page - 1) * limit);

      return {
        success: true,
        submissions,
        totalCount: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit)
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/kyc/submissions/:id
   * Get detailed KYC submission data
   */
  fastify.get('/admin/kyc/submissions/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Get detailed KYC submission',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            submission: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                email: { type: 'string' },
                mobileMoneyNumber: { type: 'string' },
                dateOfBirth: { type: 'string' },
                placeOfBirth: { type: 'string' },
                civilStatus: { type: 'string' },
                gender: { type: 'string' },
                nationality: { type: 'string' },
                address: { type: 'string' },
                profession: { type: 'string' },
                employer: { type: 'string' },
                monthlyIncome: { type: 'number' },
                idCardNumber: { type: 'string' },
                idCardExpiry: { type: 'string' },
                idCardFrontUrl: { type: 'string' },
                idCardBackUrl: { type: 'string' },
                passportNumber: { type: 'string' },
                passportExpiry: { type: 'string' },
                passportUrl: { type: 'string' },
                birthCertificateUrl: { type: 'string' },
                residenceCertificateUrl: { type: 'string' },
                incomeProofUrl: { type: 'string' },
                facePhotoUrl: { type: 'string' },
                signaturePhotoUrl: { type: 'string' },
                kycStatus: { type: 'string' },
                kycStep: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      const [submission] = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          mobileMoneyNumber: customers.mobileMoneyNumber,
          dateOfBirth: customers.dateOfBirth,
          placeOfBirth: customers.placeOfBirth,
          civilStatus: customers.civilStatus,
          gender: customers.gender,
          nationality: customers.nationality,
          address: customers.address,
          profession: customers.profession,
          employer: customers.employer,
          monthlyIncome: customers.monthlyIncome,
          idCardNumber: customers.idCardNumber,
          idCardExpiry: customers.idCardExpiry,
          idCardFrontUrl: customers.idCardFrontUrl,
          idCardBackUrl: customers.idCardBackUrl,
          passportNumber: customers.passportNumber,
          passportExpiry: customers.passportExpiry,
          passportUrl: customers.passportUrl,
          birthCertificateUrl: customers.birthCertificateUrl,
          residenceCertificateUrl: customers.residenceCertificateUrl,
          incomeProofUrl: customers.incomeProofUrl,
          facePhotoUrl: customers.facePhotoUrl,
          signaturePhotoUrl: customers.signaturePhotoUrl,
          kycStatus: customers.kycStatus,
          kycStep: customers.kycStep
        })
        .from(customers)
        .where(eq(customers.id, id))
        .limit(1);

      if (!submission) {
        return reply.status(404).send({ success: false, error: 'Submission not found' });
      }

      return {
        success: true,
        submission
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/kyc/submissions/:id/approve
   * Approve/reject KYC submission
   */
  fastify.post('/admin/kyc/submissions/:id/approve', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Approve/reject KYC submission',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          approve: { type: 'boolean' },
          kycLevel: { type: 'string', enum: ['KYC1', 'KYC2', 'KYC3'] },
          notes: { type: 'string' }
        },
        required: ['approve']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { approve, kycLevel, notes } = request.body as {
        approve: boolean;
        kycLevel?: string;
        notes?: string
      };

      let updateData: any = {
        kycStatus: approve ? 'KYC2_VERIFIED' : 'REJECTED',
        kyc2ValidationDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (!approve && notes) {
        // In a real implementation, you might want to store rejection notes
        updateData.rejectionNotes = notes;
      }

      await db
        .update(customers)
        .set(updateData)
        .where(eq(customers.id, id));

      return {
        success: true,
        message: approve ? 'KYC approved successfully' : 'KYC rejected successfully'
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/kyc/submissions/:id/change-level
   * Change KYC level/type for a user
   */
  fastify.post('/admin/kyc/submissions/:id/change-level', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Change KYC level/type',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          kycLevel: { type: 'string', enum: ['KYC1', 'KYC2', 'KYC3'] }
        },
        required: ['kycLevel']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { kycLevel } = request.body as { kycLevel: string };

      // Map KYC level to proper enum values
      let kycStatusValue: typeof kycStatus.enumValues[number];
      switch (kycLevel) {
        case 'KYC1':
          kycStatusValue = kycStatus.enumValues[2]; // KYC1_COMPLETED
          break;
        case 'KYC2':
          kycStatusValue = kycStatus.enumValues[5]; // KYC2_VERIFIED
          break;
        case 'KYC3':
          // Assuming KYC3 is not yet implemented, we'll use KYC2
          kycStatusValue = kycStatus.enumValues[5]; // KYC2_VERIFIED
          break;
        default:
          kycStatusValue = kycStatus.enumValues[0]; // NOT_STARTED
      }

      await db
        .update(customers)
        .set({
          kycStatus: kycStatusValue,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, id));

      return {
        success: true,
        message: `KYC level changed to ${kycLevel} successfully`
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // ===== CUSTOMER MANAGEMENT ROUTES =====

  /**
   * GET /admin/customers
   * Get all customers with advanced filtering
   */
  fastify.get('/admin/customers', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Get all customers',
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          status: { type: 'string' },
          customerType: { type: 'string' },
          kycStatus: { type: 'string' },
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { search, status, customerType, kycStatus: kycStatusFilter, limit = 50, offset = 0 } = request.query as any;

      // Apply filters
      const conditions = [];

      if (search) {
        conditions.push(
          or(
            like(customers.firstName, `%${search}%`),
            like(customers.lastName, `%${search}%`),
            like(customers.email, `%${search}%`),
            like(customers.mobileMoneyNumber, `%${search}%`),
            like(customers.cifCode, `%${search}%`),
            // NEW: Search by CIF and account number
            like(customers.cif, `%${search}%`),
            like(customers.accountNumber, `%${search}%`)
          )
        );
      }

      if (status) {
        conditions.push(eq(customers.status, status as any));
      }

      if (customerType) {
        conditions.push(eq(customers.customerType, customerType as any));
      }

      if (kycStatusFilter) {
        conditions.push(eq(customers.kycStatus, kycStatusFilter as any));
      }

      // Build query with JOINs for agency and agent data
      let query = db
        .select({
          // Customer fields
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          mobileMoneyNumber: customers.mobileMoneyNumber,
          dateOfBirth: customers.dateOfBirth,
          placeOfBirth: customers.placeOfBirth,
          gender: customers.gender,
          nationality: customers.nationality,
          address: customers.address,
          profession: customers.profession,
          employer: customers.employer,
          monthlyIncome: customers.monthlyIncome,
          civilStatus: customers.civilStatus,
          customerType: customers.customerType,
          status: customers.status,
          kycStatus: customers.kycStatus,
          category: customers.category,
          isActive: customers.isActive,
          mfaEnabled: customers.mfaEnabled,
          lastLogin: customers.lastLogin,
          createdAt: customers.createdAt,
          accountCreationDate: customers.accountCreationDate,
          cifCode: customers.cifCode,
          publicId: customers.publicId,
          kycStep: customers.kycStep,
          maxTransactionAmount: customers.maxTransactionAmount,
          maxDailyOperations: customers.maxDailyOperations,
          requiresDualApproval: customers.requiresDualApproval,
          isPoliticalPerson: customers.isPoliticalPerson,
          referenceName: customers.referenceName,
          referencePhone: customers.referencePhone,
          referenceRelationship: customers.referenceRelationship,
          idCardNumber: customers.idCardNumber,
          businessDocuments: customers.businessDocuments,
          quartierId: customers.quartierId,
          postalCodeId: customers.postalCodeId,
          // NEW: Banking structure fields
          cif: customers.cif,
          accountNumber: customers.accountNumber,
          agentId: customers.agentId,
          agencyId: customers.agencyId,
          // NEW: Partner fields (for agents)
          partnerLevel: customers.partnerLevel,
          partnerCode: customers.partnerCode,
          // Agency data
          agencyName: agencies.name,
          agencyCode: agencies.code,
          // Agent data will be fetched separately if needed
          agentCode: sql<string>`NULL`,
          agentName: sql<string>`NULL`,
        })
        .from(customers)
        .leftJoin(agencies, eq(customers.agencyId, agencies.id));

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const customersList = await query
        .orderBy(desc(customers.createdAt))
        .limit(Number(limit))
        .offset(Number(offset));

      // Get account balances for each customer (optimized batch query)
      const customerIds = customersList.map(c => c.id);
      const accountsData = customerIds.length > 0 ? await db
        .select({
          customerId: accounts.customerId,
          balanceCdf: sql<string>`SUM(CAST(${accounts.balanceCdf} AS DECIMAL))`,
          balanceUsd: sql<string>`SUM(CAST(${accounts.balanceUsd} AS DECIMAL))`,
          accountCount: sql<number>`COUNT(${accounts.id})`,
        })
        .from(accounts)
        .where(sql`${accounts.customerId} IN (${sql.join(customerIds.map(id => sql`${id}`), sql`, `)})`)
        .groupBy(accounts.customerId) : [];

      // Get migration status for each customer (optimized batch query)
      const migrationsData = customerIds.length > 0 ? await db
        .select({
          customerId: migrationRequests.customerId,
          migrationId: migrationRequests.id,
          approvalStatus: approvalRequests.status,
          createdAt: migrationRequests.createdAt,
        })
        .from(migrationRequests)
        .leftJoin(approvalRequests, eq(migrationRequests.approvalRequestId, approvalRequests.id))
        .where(sql`${migrationRequests.customerId} IN (${sql.join(customerIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(desc(migrationRequests.createdAt)) : [];

      // Create lookup map for balances
      const balancesMap = new Map(
        accountsData.map(a => [a.customerId, a])
      );

      // Create lookup map for migrations (only most recent per customer)
      const migrationsMap = new Map<number, { migrationId: number, status: string | null, createdAt: string }>();
      migrationsData.forEach(m => {
        if (!migrationsMap.has(m.customerId)) {
          migrationsMap.set(m.customerId, {
            migrationId: m.migrationId,
            status: m.approvalStatus,
            createdAt: m.createdAt
          });
        }
      });

      // Enrich customers with balance data and manual creation flag
      const enrichedCustomers = customersList.map(customer => {
        const balances = balancesMap.get(customer.id);

        // Extract isManualCreation from businessDocuments JSON
        const businessDocs = customer.businessDocuments as any;
        const isManualCreation = businessDocs?.isManualCreation === true;

        // Get migration status if exists
        const migration = migrationsMap.get(customer.id);

        return {
          ...customer,
          totalBalanceCdf: balances?.balanceCdf || '0',
          totalBalanceUsd: balances?.balanceUsd || '0',
          accountsCount: balances?.accountCount || 0,
          isManualCreation,  // ✅ Add flag for frontend to identify paper clients
          // Migration status info
          migrationStatus: migration?.status || null,  // 'PENDING' | 'APPROVED' | 'REJECTED' | null
          migrationId: migration?.migrationId || null,
          migrationCreatedAt: migration?.createdAt || null
        };
      });

      // Get total count
      const [{ count }] = await db
        .select({ count: db.$count(customers) })
        .from(customers)
        .where(conditions.length > 0 ? and(...conditions) : undefined) as any;

      return {
        success: true,
        customers: enrichedCustomers,
        total: count,
        limit: Number(limit),
        offset: Number(offset)
      };
    } catch (error) {
      console.error('[Admin] Error fetching customers:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/customers/:id
   * Get customer details by ID
   */
  fastify.get('/admin/customers/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Get customer by ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, id))
        .limit(1);

      if (!customer) {
        reply.status(404).send({
          success: false,
          error: 'Customer not found'
        });
        return;
      }

      // Fetch geography data separately if exists
      let quartierData = null;
      let communeData = null;
      let postalCodeData = null;

      if (customer.quartierId) {
        [quartierData] = await db
          .select()
          .from(quartiers)
          .where(eq(quartiers.id, customer.quartierId))
          .limit(1);

        if (quartierData && quartierData.communeId) {
          [communeData] = await db
            .select()
            .from(communes)
            .where(eq(communes.id, quartierData.communeId))
            .limit(1);
        }
      }

      if (customer.postalCodeId) {
        [postalCodeData] = await db
          .select()
          .from(postalCodes)
          .where(eq(postalCodes.id, customer.postalCodeId))
          .limit(1);
      }

      // Combine data
      const enrichedCustomer = {
        ...customer,
        quartierName: quartierData?.name || null,
        communeId: communeData?.id || null,
        communeName: communeData?.name || null,
        postalCode: postalCodeData?.code || null
      };

      return {
        success: true,
        customer: enrichedCustomer
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/customers
   * Create new customer manually (paper records migration)
   * Features:
   * - Generates CIF, account number, assigns agency (round-robin) and agent (load-balancing)
   * - Admin can override agency and agent selection
   * - Creates 12 accounts (S01-S06 x CDF + USD)
   * - Supports initial balances for migration
   * - Supports account activation (S02-S06)
   * - Supports credit services pre-activation
   * - Creates intelligent welcome notification
   */
  fastify.post('/admin/customers', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Create new customer manually (paper records migration)',
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string' },
          mobileMoneyNumber: { type: 'string' },
          customerType: { type: 'string', enum: ['MEMBER', 'PARTNER'] },
          password: { type: 'string', minLength: 8 },
          isActive: { type: 'boolean' },
          autoValidateKYC: { type: 'boolean' },
          // Flag to differentiate self-registration from admin creation
          isSelfRegistration: { type: 'boolean' },
          // Override automatic agency/agent selection
          agencyIdOverride: { type: 'number' },
          agentIdOverride: { type: 'number' },
          // Initial balances for paper records migration
          initialBalances: {
            type: 'object',
            properties: {
              s01_cdf: { type: 'number' },
              s01_usd: { type: 'number' },
              s02_cdf: { type: 'number' },
              s02_usd: { type: 'number' },
              s03_cdf: { type: 'number' },
              s03_usd: { type: 'number' },
              s04_cdf: { type: 'number' },
              s04_usd: { type: 'number' },
              s05_cdf: { type: 'number' },
              s05_usd: { type: 'number' },
              s06_cdf: { type: 'number' },
              s06_usd: { type: 'number' }
            }
          },
          // Accounts to activate (S01 always active)
          accountActivations: {
            type: 'array',
            items: { type: 'string', enum: ['S02', 'S03', 'S04', 'S05', 'S06'] }
          },
          // Credit services to pre-activate
          serviceActivations: {
            type: 'array',
            items: { type: 'string', enum: ['BOMBE', 'TELEMA', 'MOPAO', 'VIMBISA', 'LIKELEMBA'] }
          }
        },
        required: ['firstName', 'lastName', 'mobileMoneyNumber', 'password']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const {
        firstName,
        lastName,
        email,
        mobileMoneyNumber,
        customerType = 'MEMBER',
        password,
        isActive = true,
        autoValidateKYC = false,
        initialBalances = {},
        agencyIdOverride,
        agentIdOverride,
        accountActivations = [], // ['S02', 'S03', etc.]
        serviceActivations = [], // ['BOMBE', 'TELEMA', etc.]
        isSelfRegistration = false // true if user registered themselves
      } = request.body as any;

      // Determine if this is a manual creation by admin or self-registration
      const isManualByAdmin = !isSelfRegistration;

      // Extract admin info from JWT token for audit trail
      const adminUser = (request as any).user; // Set by requireAdminAuth middleware
      const adminId = isManualByAdmin ? adminUser?.id : null;
      const adminRole = isManualByAdmin ? (adminUser?.role || 'ADMIN') : null;
      const adminName = isManualByAdmin
        ? (`${adminUser?.firstName || ''} ${adminUser?.lastName || ''}`.trim() || 'Unknown Admin')
        : null;
      const adminIp = isManualByAdmin
        ? (request.headers['x-forwarded-for'] || request.ip || 'Unknown')
        : null;

      console.log('[Admin] Creating customer manually:', {
        admin: { id: adminId, role: adminRole, name: adminName, ip: adminIp },
        customer: { firstName, lastName, mobile: mobileMoneyNumber },
        autoValidateKYC,
        hasInitialBalances: Object.keys(initialBalances).length > 0,
        agencyOverride: agencyIdOverride,
        agentOverride: agentIdOverride,
        accountActivations,
        serviceActivations
      });

      // Normalize phone number (remove spaces and formatting)
      const normalizedPhone = mobileMoneyNumber.replace(/[\s-]/g, '');

      // Check if mobile number already exists
      const [existingCustomer] = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          cif: customers.cif,
          cifCode: customers.cifCode,
          publicId: customers.publicId,
          accountNumber: customers.accountNumber,
          email: customers.email,
          mobileMoneyNumber: customers.mobileMoneyNumber,
          status: customers.status,
          kycStatus: customers.kycStatus,
          createdAt: customers.createdAt
        })
        .from(customers)
        .where(eq(customers.mobileMoneyNumber, normalizedPhone))
        .limit(1);

      if (existingCustomer) {
        reply.status(409).send({
          success: false,
          error: 'Duplicate phone number detected',
          field: 'mobileMoneyNumber',
          message: 'Ce numéro de téléphone est déjà utilisé par un autre client',
          existingCustomer: {
            cif: existingCustomer.cif || existingCustomer.cifCode,
            publicId: existingCustomer.publicId,
            firstName: existingCustomer.firstName,
            lastName: existingCustomer.lastName,
            accountNumber: existingCustomer.accountNumber,
            phone: existingCustomer.mobileMoneyNumber,
            email: existingCustomer.email,
            status: existingCustomer.status,
            kycStatus: existingCustomer.kycStatus,
            createdAt: existingCustomer.createdAt
          }
        });
        return;
      }

      // Check if email already exists (if provided) - case-insensitive
      if (email) {
        const normalizedEmail = email.trim().toLowerCase();
        const [existingEmail] = await db
          .select({
            id: customers.id,
            firstName: customers.firstName,
            lastName: customers.lastName,
            cif: customers.cif,
            cifCode: customers.cifCode,
            publicId: customers.publicId,
            accountNumber: customers.accountNumber,
            email: customers.email,
            mobileMoneyNumber: customers.mobileMoneyNumber,
            status: customers.status,
            kycStatus: customers.kycStatus,
            createdAt: customers.createdAt
          })
          .from(customers)
          .where(sql`LOWER(${customers.email}) = ${normalizedEmail}`)
          .limit(1);

        if (existingEmail) {
          reply.status(409).send({
            success: false,
            error: 'Duplicate email detected',
            field: 'email',
            message: 'Cet email est déjà utilisé par un autre client',
            existingCustomer: {
              cif: existingEmail.cif || existingEmail.cifCode,
              publicId: existingEmail.publicId,
              firstName: existingEmail.firstName,
              lastName: existingEmail.lastName,
              accountNumber: existingEmail.accountNumber,
              phone: existingEmail.mobileMoneyNumber,
              email: existingEmail.email,
              status: existingEmail.status,
              kycStatus: existingEmail.kycStatus,
              createdAt: existingEmail.createdAt
            }
          });
          return;
        }
      }

      // Hash password
      const passwordHash = await hash(password);

      // Generate new CIF, Agency, Agent, and Account Number using account generation service
      const accountData = await accountGenerationService.generateCompleteAccount();

      // Apply overrides if provided by admin
      const finalAgencyId = agencyIdOverride || accountData.agencyId;
      const finalAgentId = agentIdOverride || accountData.agentId;

      // If agency was overridden, generate new account number for that agency
      let finalAccountNumber = accountData.accountNumber;
      if (agencyIdOverride && agencyIdOverride !== accountData.agencyId) {
        finalAccountNumber = await accountGenerationService.generateAccountNumber(agencyIdOverride);
        console.log(`[Admin] Agency overridden: ${accountData.agencyId} -> ${agencyIdOverride}, new account number: ${finalAccountNumber}`);
      }

      // Keep old CIF code format for backward compatibility (deprecated)
      const now = new Date();
      const datePart = now.toISOString().split('T')[0].replace(/-/g, '');
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      const oldCifCode = `CIF-${datePart}-${randomPart}`;

      // Generate public ID
      const publicId = `CUST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      // Create customer with new account structure + audit trail
      const [newCustomer] = await db
        .insert(customers)
        .values({
          firstName,
          lastName,
          email: email || null,
          mobileMoneyNumber,
          customerType: customerType as any,
          passwordHash,
          isActive,
          cifCode: oldCifCode, // Deprecated - keep for backward compatibility
          cif: accountData.cif, // New CIF system (8 digits)
          agencyId: finalAgencyId, // Assigned agency (or overridden)
          agentId: finalAgentId, // Assigned virtual agent (or overridden)
          accountNumber: finalAccountNumber, // Account number (8 digits, unique per agency)
          publicId,
          status: autoValidateKYC ? 'ACTIVE' : 'PENDING' as any,
          kycStatus: autoValidateKYC ? 'KYC2_VERIFIED' : 'NOT_STARTED' as any,
          category: 'CATEGORY_1' as any,
          kycStep: autoValidateKYC ? 4 : 0,
          kycCompleted: autoValidateKYC,
          otpVerified: autoValidateKYC, // Auto-verify for manual creation
          mfaEnabled: false,
          kycLockStep: 'NONE' as any,
          suspiciousActivityCount: 0,
          partnerActionsCount: 0,
          requiresDualApproval: false,
          maxDailyOperations: 50,
          // AUDIT TRAIL: Track who created this customer (only for manual creation)
          createdByAdminId: isManualByAdmin ? adminId : null,
          createdByAdminRole: isManualByAdmin ? adminRole : null,
          createdByAdminIp: isManualByAdmin ? (adminIp as string) : null,
          createdByAdminName: isManualByAdmin ? adminName : null,
          createdByUserAgent: isManualByAdmin ? (request.headers['user-agent'] || null) : null,
          createdBySessionId: null,
          createdByDeviceFingerprint: null,
          isManualCreation: isManualByAdmin, // true only if created by admin
          passwordChangedAfterCreation: !isManualByAdmin, // true for self-registration (they chose their own password)
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        })
        .returning();

      // CREATE 12 ACCOUNTS (S01-S06 in CDF and USD) automatically
      console.log('[Admin] Creating 12 accounts (6 types x 2 currencies) for customer:', newCustomer.id);

      // Get agency code for account number generation
      const [assignedAgency] = await db
        .select({ code: agencies.code, name: agencies.name })
        .from(agencies)
        .where(eq(agencies.id, finalAgencyId))
        .limit(1);

      const agencyCode = assignedAgency?.code || '01';
      const agencyName = assignedAgency?.name || 'Unknown Agency';

      // Define account types with activation based on accountActivations array
      const accountTypesConfig = [
        { code: 'S01', type: 'S01_STANDARD', baseStatus: 'ACTIVE' }, // Always active
        { code: 'S02', type: 'S02_MANDATORY_SAVINGS', baseStatus: 'INACTIVE' },
        { code: 'S03', type: 'S03_CAUTION', baseStatus: 'INACTIVE' },
        { code: 'S04', type: 'S04_CREDIT', baseStatus: 'INACTIVE' },
        { code: 'S05', type: 'S05_BWAKISA_CARTE', baseStatus: 'INACTIVE' },
        { code: 'S06', type: 'S06_FINES', baseStatus: 'INACTIVE' }
      ];

      const currencies: Array<'CDF' | 'USD'> = ['CDF', 'USD'];
      let accountSequence = 1;

      const createdAccounts = [];
      const activatedAccountCodes: string[] = ['S01']; // S01 always activated

      for (const accType of accountTypesConfig) {
        // Determine if this account type should be activated
        const shouldActivate = accType.code === 'S01' || (accountActivations as string[]).includes(accType.code);
        if (shouldActivate && !activatedAccountCodes.includes(accType.code)) {
          activatedAccountCodes.push(accType.code);
        }

        for (const currency of currencies) {
          // Format: S01-71094594-20251227-001
          const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
          const accountNum = `${accType.code}-${accountData.cif}-${dateStr}-${accountSequence.toString().padStart(3, '0')}`;
          accountSequence++;

          const balanceCdf = currency === 'CDF' ? (initialBalances[`${accType.code.toLowerCase()}_cdf`] || 0) : 0;
          const balanceUsd = currency === 'USD' ? (initialBalances[`${accType.code.toLowerCase()}_usd`] || 0) : 0;

          // Determine final status
          const finalStatus = shouldActivate ? 'ACTIVE' : 'INACTIVE';

          const [account] = await db
            .insert(accounts)
            .values({
              customerId: newCustomer.id,
              accountNumber: accountNum,
              accountType: accType.type as any,
              accountTypeCode: accType.code,
              currency: currency as any,
              balanceCdf: balanceCdf.toString(),
              balanceUsd: balanceUsd.toString(),
              status: finalStatus as any,
              openedDate: now.toISOString(),
              createdAt: now.toISOString(),
              updatedAt: now.toISOString()
            })
            .returning();

          createdAccounts.push(account);
          console.log(`[Admin] ✅ Created ${accType.code}-${currency}: ${accountNum} [${finalStatus}] (Balance: ${currency === 'USD' ? `$${balanceUsd}` : `${balanceCdf} FC`})`);
        }
      }

      console.log('[Admin] ✅ Customer created with 12 accounts:', {
        customerId: newCustomer.id,
        cif: newCustomer.cif,
        agencyCode,
        agencyName,
        accountsCreated: createdAccounts.length,
        activatedAccounts: activatedAccountCodes,
        createdBy: adminName,
        isSelfRegistration
      });

      // CREATE INTELLIGENT WELCOME NOTIFICATION (only for admin-created customers)
      if (isManualByAdmin) {
        const notificationMessage = autoValidateKYC
          ? `Bienvenue chez Serenity! Votre compte a été créé par ${adminName}. Votre profil est complet et actif. Pour votre sécurité, nous vous recommandons de changer votre mot de passe.`
          : `Bienvenue chez Serenity! Votre compte a été créé par ${adminName}. Pour finaliser votre inscription et activer tous les services:
1. Vérifiez vos informations personnelles
2. Uploadez vos documents d'identité
3. Acceptez nos conditions d'utilisation
4. Changez votre mot de passe temporaire`;

        await db.insert(customerNotifications).values({
          customerId: newCustomer.id,
          notificationType: 'SYSTEM',
          priority: 'HIGH',
          title: '🎉 Bienvenue chez Serenity!',
          message: notificationMessage,
          actionLabel: autoValidateKYC ? 'Changer mon mot de passe' : 'Compléter mon profil',
          actionUrl: autoValidateKYC ? '/dashboard/settings/security' : '/dashboard/kyc/review',
          icon: 'user-check',
          displayDurationSeconds: 600, // 10 minutes
          isRepeatable: true, // Can reappear until action is taken
          repeatIntervalHours: 24, // Show again every 24h if not completed
          metadata: {
            createdByAdmin: adminName,
            createdByAdminId: adminId,
            createdByRole: adminRole,
            requiresKYC: !autoValidateKYC,
            requiresPasswordChange: true,
            createdAt: now.toISOString(),
            activatedAccounts: activatedAccountCodes,
            activatedServices: serviceActivations
          } as any
        });

        console.log('[Admin] 🔔 Welcome notification created for customer:', newCustomer.id);
      }

      // AWARD WELCOME BONUS POINTS (only for MEMBER and PARTNER customers)
      if (newCustomer.customerType === 'MEMBER' || newCustomer.customerType === 'PARTNER') {
        try {
          await loyaltyPointsService.awardPoints({
            customerId: newCustomer.id,
            pointTypeCode: 'WELCOME',
            operationId: newCustomer.id,
            metadata: {
              customerType: newCustomer.customerType,
              createdBy: adminName || 'Self-Registration',
              isSelfRegistration
            }
          });
          console.log('[Admin] 🎉 Welcome bonus point awarded to customer:', newCustomer.id);
        } catch (error) {
          console.error('[Admin] ⚠️  Failed to award welcome bonus:', error);
          // Don't block customer creation if point award fails
        }
      }

      // TODO: Activate credit services (BOMBE, TELEMA, etc.) if specified
      // This would require updating customer_eligibility_status table
      if ((serviceActivations as string[]).length > 0) {
        console.log('[Admin] 🎱 Services to activate:', serviceActivations);
        // Service activation logic would go here
        // For now, we just log the services that should be activated
      }

      return {
        success: true,
        message: `Client créé avec succès (12 comptes S01-S06 en CDF et USD, ${activatedAccountCodes.length} comptes activés)`,
        customer: {
          id: newCustomer.id,
          firstName: newCustomer.firstName,
          lastName: newCustomer.lastName,
          email: newCustomer.email,
          mobileMoneyNumber: newCustomer.mobileMoneyNumber,
          customerType: newCustomer.customerType,
          cifCode: newCustomer.cifCode, // Old format (deprecated)
          cif: newCustomer.cif, // New CIF (8 digits)
          agencyId: newCustomer.agencyId,
          agencyCode,
          agencyName,
          agentId: newCustomer.agentId,
          accountNumber: newCustomer.accountNumber,
          publicId: newCustomer.publicId,
          kycStatus: newCustomer.kycStatus,
          isManualCreation: isManualByAdmin,
          createdByAdmin: adminName,
          accountsCreated: createdAccounts.length,
          activatedAccounts: activatedAccountCodes,
          servicesActivated: serviceActivations
        },
        accounts: createdAccounts.map(acc => ({
          accountNumber: acc.accountNumber,
          type: acc.accountTypeCode,
          currency: acc.currency,
          status: acc.status,
          balanceCdf: acc.balanceCdf,
          balanceUsd: acc.balanceUsd
        }))
      };
    } catch (error) {
      console.error('[Admin] Error creating customer:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/customers/create-member
   * Create member manually with full KYC1 data and bypass KYC
   * Designed for paper records migration
   * Features:
   * - Complete KYC1 information (Step1 + Step2)
   * - Automatic or manual agency/agent assignment
   * - Bypass KYC option (client completes later)
   * - Full audit trail
   */
  fastify.post('/admin/customers/create-member', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Create member manually with KYC1 data',
      body: {
        type: 'object',
        properties: {
          // KYC1 Step1 - Personal Information
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          dateOfBirth: { type: 'string' },
          gender: { type: 'string', enum: ['M', 'F'] },
          motherName: { type: 'string' },
          maritalStatus: { type: 'string', enum: ['single', 'married', 'divorced', 'widowed'] },

          // KYC1 Step2 - Geographic Information
          countryOfBirth: { type: 'string' },
          placeOfBirth: { type: 'string' },
          nationality: { type: 'string' },
          address: { type: 'string' },
          communeId: { type: 'number' },
          quartierId: { type: 'number' },
          postalCodeId: { type: 'number' },

          // Contact
          mobileMoneyNumber: { type: 'string' },
          email: { type: 'string' },

          // Assignment
          assignmentMode: { type: 'string', enum: ['auto', 'manual'], default: 'auto' },
          agencyId: { type: 'number' },
          agentId: { type: 'number' },

          // Security
          temporaryPassword: { type: 'string', minLength: 8 },
          bypassKyc: { type: 'boolean', default: true }
        },
        required: ['firstName', 'lastName', 'dateOfBirth', 'gender', 'motherName', 'maritalStatus',
          'countryOfBirth', 'placeOfBirth', 'nationality', 'address',
          'mobileMoneyNumber', 'temporaryPassword']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const {
        // Personal
        firstName, lastName, dateOfBirth, gender, motherName, maritalStatus,
        // Geographic
        countryOfBirth, placeOfBirth, nationality, address, communeId, quartierId, postalCodeId,
        // Contact
        mobileMoneyNumber, email,
        // Assignment
        assignmentMode = 'auto', agencyId, agentId,
        // Security
        temporaryPassword, bypassKyc = true
      } = request.body as any;

      // Extract admin info for audit trail
      const adminUser = (request as any).user;
      const adminId = adminUser?.id;
      const adminRole = adminUser?.role || 'ADMIN';
      const adminName = `${adminUser?.firstName || ''} ${adminUser?.lastName || ''}`.trim() || 'Unknown Admin';
      const adminIp = request.headers['x-forwarded-for'] || request.ip || 'Unknown';

      console.log('[Admin] Creating member manually:', {
        admin: { id: adminId, role: adminRole, name: adminName, ip: adminIp },
        member: { firstName, lastName, mobile: mobileMoneyNumber },
        bypassKyc,
        assignmentMode
      });

      // Normalize phone number (remove spaces and formatting)
      const normalizedPhone = mobileMoneyNumber.replace(/[\s-]/g, '');

      // Check if mobile number already exists
      const [existingCustomer] = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          cif: customers.cif,
          cifCode: customers.cifCode,
          publicId: customers.publicId,
          accountNumber: customers.accountNumber,
          email: customers.email,
          mobileMoneyNumber: customers.mobileMoneyNumber,
          status: customers.status,
          kycStatus: customers.kycStatus,
          createdAt: customers.createdAt
        })
        .from(customers)
        .where(eq(customers.mobileMoneyNumber, normalizedPhone))
        .limit(1);

      if (existingCustomer) {
        reply.status(409).send({
          success: false,
          error: 'Duplicate phone number detected',
          field: 'mobileMoneyNumber',
          message: 'Ce numéro de téléphone est déjà utilisé par un autre client',
          existingCustomer: {
            cif: existingCustomer.cif || existingCustomer.cifCode,
            publicId: existingCustomer.publicId,
            firstName: existingCustomer.firstName,
            lastName: existingCustomer.lastName,
            accountNumber: existingCustomer.accountNumber,
            phone: existingCustomer.mobileMoneyNumber,
            email: existingCustomer.email,
            status: existingCustomer.status,
            kycStatus: existingCustomer.kycStatus,
            createdAt: existingCustomer.createdAt
          }
        });
        return;
      }

      // Check if email already exists (if provided) - case-insensitive
      if (email) {
        const normalizedEmail = email.trim().toLowerCase();
        const [existingEmail] = await db
          .select({
            id: customers.id,
            firstName: customers.firstName,
            lastName: customers.lastName,
            cif: customers.cif,
            cifCode: customers.cifCode,
            publicId: customers.publicId,
            accountNumber: customers.accountNumber,
            email: customers.email,
            mobileMoneyNumber: customers.mobileMoneyNumber,
            status: customers.status,
            kycStatus: customers.kycStatus,
            createdAt: customers.createdAt
          })
          .from(customers)
          .where(sql`LOWER(${customers.email}) = ${normalizedEmail}`)
          .limit(1);

        if (existingEmail) {
          reply.status(409).send({
            success: false,
            error: 'Duplicate email detected',
            field: 'email',
            message: 'Cet email est déjà utilisé par un autre client',
            existingCustomer: {
              cif: existingEmail.cif || existingEmail.cifCode,
              publicId: existingEmail.publicId,
              firstName: existingEmail.firstName,
              lastName: existingEmail.lastName,
              accountNumber: existingEmail.accountNumber,
              phone: existingEmail.mobileMoneyNumber,
              email: existingEmail.email,
              status: existingEmail.status,
              kycStatus: existingEmail.kycStatus,
              createdAt: existingEmail.createdAt
            }
          });
          return;
        }
      }

      // Hash password
      const passwordHash = await hash(temporaryPassword);

      // Generate all account info using centralized service (SAME as KYC Step 4)
      // This ensures consistent ID generation across all customer creation flows
      let accountInfo = await accountGenerationService.generateCompleteAccount();
      console.log('[Admin] Generated account info:', {
        publicId: accountInfo.publicId,
        cif: accountInfo.cif,
        agencyId: accountInfo.agencyId,
        agencyCode: accountInfo.agencyCode,
        agentId: accountInfo.agentId,
        agentCode: accountInfo.agentCode,
        accountNumber: accountInfo.accountNumber,
      });

      // Old CIF format (deprecated - kept for backward compatibility)
      const now = new Date();
      const datePart = now.toISOString().split('T')[0].replace(/-/g, '');
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      const oldCifCode = `CIF-${datePart}-${randomPart}`;

      // Create customer with KYC1 data
      let newCustomer;
      let creationAttempts = 0;
      const maxCreationAttempts = 3;

      // Boucle de réessai en cas de collision de Public ID (sécurité supplémentaire)
      while (creationAttempts < maxCreationAttempts) {
        try {
          [newCustomer] = await db
            .insert(customers)
            .values({
              firstName,
              lastName,
              dateOfBirth,
              gender: gender as any,
              // NOTE: motherName and countryOfBirth are stored temporarily in referenceName field
              // until proper schema fields are added
              referenceName: motherName, // Temporary storage for motherName
              civilStatus: maritalStatus,
              placeOfBirth: `${countryOfBirth} - ${placeOfBirth}`, // Combine country and place
              nationality,
              address,
              // NOTE: communeId is not a direct field - it's accessed via quartier relationship
              quartierId: quartierId || null,
              postalCodeId: postalCodeId || null,
              email: email || null,
              mobileMoneyNumber,
              customerType: 'MEMBER' as any,
              passwordHash,
              isActive: true,
              cifCode: oldCifCode,
              cif: accountInfo.cif, // Use generated CIF from service
              agencyId: accountInfo.agencyId, // Use generated agency ID from service
              agentId: accountInfo.agentId, // Use generated agent ID from service
              accountNumber: accountInfo.accountNumber, // Use generated account number from service
              publicId: accountInfo.publicId, // Use generated public ID from service
              // KYC Status - PENDING if bypass
              status: bypassKyc ? 'PENDING' as any : 'ACTIVE' as any,
              kycStatus: bypassKyc ? 'NOT_STARTED' as any : 'KYC1_COMPLETED' as any,
              kycStep: bypassKyc ? 0 : 2,
              kycCompleted: !bypassKyc,
              otpVerified: true,
              kycLockStep: 'NONE' as any,
              category: 'CATEGORY_1' as any,
              // NOTE: Audit trail fields (createdByAdminId, createdByAdminRole, etc.) 
              // don't exist in Drizzle schema yet - they're in Prisma schema only
              // Store audit info temporarily in businessDocuments JSON field
              businessDocuments: {
                createdByAdminId: adminId,
                createdByAdminRole: adminRole,
                createdByAdminIp: adminIp as string,
                createdByAdminName: adminName,
                createdByUserAgent: request.headers['user-agent'] || null,
                isManualCreation: true,
                passwordChangedAfterCreation: false,
                auditTimestamp: now.toISOString()
              } as any,
              mfaEnabled: false,
              suspiciousActivityCount: 0,
              partnerActionsCount: 0,
              requiresDualApproval: false,
              maxDailyOperations: 50,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString()
            })
            .returning();

          // Succès - sortir de la boucle
          break;

        } catch (insertError: any) {
          creationAttempts++;

          // Vérifier si c'est une erreur de duplication de Public ID
          if (insertError.code === '23505' && insertError.constraint === 'idx_customers_public_id_unique') {
            console.warn(`[Admin] Collision de Public ID détectée (tentative ${creationAttempts}/${maxCreationAttempts}), régénération...`);

            if (creationAttempts >= maxCreationAttempts) {
              throw new Error('Impossible de générer un Public ID unique après plusieurs tentatives');
            }

            // Régénérer un nouveau Public ID
            accountInfo = await accountGenerationService.generateCompleteAccount();
            console.log(`[Admin] Nouveau Public ID généré: ${accountInfo.publicId}`);
          } else {
            // Autre erreur - propager
            throw insertError;
          }
        }
      }

      if (!newCustomer) {
        throw new Error('Impossible de créer le client après plusieurs tentatives');
      }

      // CREATE 12 ACCOUNTS (S01-S06 in CDF and USD)
      console.log('[Admin] Creating 12 accounts for member:', newCustomer.id);

      const [assignedAgency] = await db
        .select({ code: agencies.code, name: agencies.name })
        .from(agencies)
        .where(eq(agencies.id, accountInfo.agencyId)) // Use agency ID from service
        .limit(1);

      const agencyCode = assignedAgency?.code || accountInfo.agencyCode;
      const agencyName = assignedAgency?.name || 'Unknown Agency';

      const accountTypesConfig = [
        { code: 'S01', type: 'S01_STANDARD', status: 'ACTIVE' },
        { code: 'S02', type: 'S02_MANDATORY_SAVINGS', status: 'ACTIVE' },  // ✅ ACTIVE for admin-created
        { code: 'S03', type: 'S03_CAUTION', status: 'ACTIVE' },  // ✅ ACTIVE for admin-created
        { code: 'S04', type: 'S04_CREDIT', status: 'ACTIVE' },  // ✅ ACTIVE for admin-created
        { code: 'S05', type: 'S05_BWAKISA_CARTE', status: 'ACTIVE' },  // ✅ ACTIVE for admin-created
        { code: 'S06', type: 'S06_FINES', status: 'ACTIVE' }  // ✅ ACTIVE for admin-created
      ];

      const currencies: Array<'CDF' | 'USD'> = ['CDF', 'USD'];
      let accountSequence = 1;
      const createdAccounts = [];

      for (const accType of accountTypesConfig) {
        for (const currency of currencies) {
          // Use centralized account number generation for consistency
          const accountNum = generateFormattedAccountNumber(accountInfo.cif, accType.code, accountSequence);
          accountSequence++;

          const [account] = await db
            .insert(accounts)
            .values({
              customerId: newCustomer.id,
              accountNumber: accountNum,
              accountType: accType.type as any,
              accountTypeCode: accType.code,
              currency: currency as any,
              balanceCdf: '0',
              balanceUsd: '0',
              status: accType.status as any,
              openedDate: now.toISOString(),
              createdAt: now.toISOString(),
              updatedAt: now.toISOString()
            })
            .returning();

          createdAccounts.push(account);
          console.log(`[Admin] Created ${accType.code}-${currency}: ${accountNum} [${accType.status}]`);
        }
      }

      // Create welcome notification (non-blocking - log error but continue)
      try {
        const notificationMessage = bypassKyc
          ? `Bienvenue chez Serenity! Votre compte a été créé par ${adminName}. Pour finaliser votre inscription:
1. Connectez-vous avec votre téléphone et mot de passe temporaire
2. Complétez vos informations KYC
3. Changez votre mot de passe
4. Uploadez vos documents d'identité`
          : `Bienvenue chez Serenity! Votre compte a été créé et activé par ${adminName}. Vous pouvez vous connecter immédiatement.`;

        await db.insert(customerNotifications).values({
          customerId: newCustomer.id,
          notificationType: 'SYSTEM',
          priority: 'HIGH',
          title: 'Bienvenue chez Serenity!',
          message: notificationMessage,
          actionLabel: bypassKyc ? 'Compléter mon profil' : 'Accéder à mon compte',
          actionUrl: bypassKyc ? '/dashboard/kyc/step1' : '/dashboard',
          icon: 'user-check',
          displayDurationSeconds: 600,
          isRepeatable: true,
          repeatIntervalHours: 24,
          metadata: {
            createdByAdmin: adminName,
            createdByAdminId: adminId,
            createdByRole: adminRole,
            requiresKYC: bypassKyc,
            requiresPasswordChange: true,
            createdAt: now.toISOString()
          } as any
        });
        console.log('[Admin] Welcome notification created successfully');
      } catch (notifError) {
        // Log but don't fail the entire operation
        console.error('[Admin] Failed to create welcome notification:', notifError);
        console.error('[Admin] Customer creation succeeded, but notification failed - continuing...');
      }

      console.log('[Admin] Member created successfully:', {
        customerId: newCustomer.id,
        cif: newCustomer.cif,
        agencyCode,
        agencyName,
        accountsCreated: createdAccounts.length
      });

      return {
        success: true,
        message: 'Membre créé avec succès',
        data: {
          customerId: newCustomer.id,
          cif: newCustomer.cif,
          publicId: accountInfo.publicId, // Include public ID in response
          accountNumber: newCustomer.accountNumber,
          firstName: newCustomer.firstName,
          lastName: newCustomer.lastName,
          mobileMoneyNumber: newCustomer.mobileMoneyNumber,
          temporaryPassword,
          agencyId: accountInfo.agencyId, // Use agency ID from service
          agencyCode: accountInfo.agencyCode, // Use agency code from service
          agencyName,
          agentId: accountInfo.agentId, // Use agent ID from service
          agentCode: accountInfo.agentCode, // Use agent code from service
          kycStatus: newCustomer.kycStatus,
          bypassKyc,
          accountsCreated: createdAccounts.length
        }
      };
    } catch (error) {
      console.error('[Admin] Error creating member:', error);
      // Log detailed error for debugging
      if (error instanceof Error) {
        console.error('[Admin] Error stack:', error.stack);
        console.error('[Admin] Error message:', error.message);
        console.error('[Admin] Error name:', error.name);
      }

      // Return structured error response
      return reply.status(500).send({
        success: false,
        error: 'Une erreur est survenue lors de la création du membre',
        message: error instanceof Error ? error.message : 'Erreur inconnue',
        details: process.env.NODE_ENV === 'development' && error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : undefined
      });
    }
  });

  /**
   * PUT /admin/customers/:id
   * Update customer information (comprehensive)
   */
  fastify.put('/admin/customers/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Update customer (all fields)',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string' },
          mobileMoneyNumber: { type: 'string' },
          dateOfBirth: { type: 'string' },
          placeOfBirth: { type: 'string' },
          gender: { type: 'string' },
          nationality: { type: 'string' },
          address: { type: 'string' },
          profession: { type: 'string' },
          employer: { type: 'string' },
          monthlyIncome: { type: 'number' },
          status: { type: 'string' },
          category: { type: 'string' },
          customerType: { type: 'string' },
          isActive: { type: 'boolean' },
          maxTransactionAmount: { type: 'number' },
          maxDailyOperations: { type: 'number' },
          requiresDualApproval: { type: 'boolean' },
          isPoliticalPerson: { type: 'boolean' },
          referenceName: { type: 'string' },
          referencePhone: { type: 'string' },
          referenceRelationship: { type: 'string' },
          idCardNumber: { type: 'string' },
          civilStatus: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const updateData = request.body as any;

      // Check if customer exists
      const [existingCustomer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, id))
        .limit(1);

      if (!existingCustomer) {
        reply.status(404).send({
          success: false,
          error: 'Customer not found'
        });
        return;
      }

      // Clean update data (remove undefined/null)
      const cleanData: any = {};
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && updateData[key] !== null && updateData[key] !== '') {
          cleanData[key] = updateData[key];
        }
      });

      // Update customer
      const [updatedCustomer] = await db
        .update(customers)
        .set({
          ...cleanData,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, id))
        .returning();

      return {
        success: true,
        message: 'Customer updated successfully',
        customer: updatedCustomer
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/customers/:id/block
   * Block or unblock customer with reason
   */
  fastify.post('/admin/customers/:id/block', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Block/unblock customer with reason',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          block: { type: 'boolean' },
          reason: { type: 'string' }
        },
        required: ['block']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { block, reason } = request.body as { block: boolean; reason?: string };

      // Require reason when blocking
      if (block && !reason) {
        reply.status(400).send({
          success: false,
          error: 'Reason is required when blocking a customer'
        });
        return;
      }

      // Create audit metadata
      const auditData: any = {
        action: block ? 'BLOCK' : 'UNBLOCK',
        timestamp: new Date().toISOString(),
        reason: reason || null
      };

      const [customer] = await db
        .update(customers)
        .set({
          isActive: !block,
          status: block ? 'SUSPENDED' as any : 'ACTIVE' as any,
          updatedAt: new Date().toISOString(),
          // Store audit info in business_documents temporarily (we'll create proper audit table later)
          businessDocuments: auditData as any
        })
        .where(eq(customers.id, id))
        .returning();

      if (!customer) {
        reply.status(404).send({
          success: false,
          error: 'Customer not found'
        });
        return;
      }

      return {
        success: true,
        message: `Customer ${block ? 'blocked' : 'unblocked'} successfully`
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/customers/:id/reset-password
   * Reset customer password
   */
  fastify.post('/admin/customers/:id/reset-password', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Reset customer password',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          newPassword: { type: 'string', minLength: 8 }
        },
        required: ['newPassword']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { newPassword } = request.body as { newPassword: string };

      // Hash new password
      const passwordHash = await hash(newPassword);

      const [customer] = await db
        .update(customers)
        .set({
          passwordHash,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, id))
        .returning();

      if (!customer) {
        reply.status(404).send({
          success: false,
          error: 'Customer not found'
        });
        return;
      }

      return {
        success: true,
        message: 'Password reset successfully'
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/customers/:id/reset-2fa
   * Reset customer 2FA/MFA
   */
  fastify.post('/admin/customers/:id/reset-2fa', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Reset customer 2FA',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      const [customer] = await db
        .update(customers)
        .set({
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: null,
          mfaConfiguredAt: null,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, id))
        .returning();

      if (!customer) {
        reply.status(404).send({
          success: false,
          error: 'Customer not found'
        });
        return;
      }

      return {
        success: true,
        message: '2FA reset successfully'
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * PUT /admin/customers/:id/initialize-accounts
   * Initialize all 6 accounts with default balances for manual customer
   */
  fastify.put('/admin/customers/:id/initialize-accounts', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Initialize customer accounts with default balances',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          s01_cdf: { type: 'number', default: 0 },
          s01_usd: { type: 'number', default: 0 },
          s02_cdf: { type: 'number', default: 0 },
          s03_cdf: { type: 'number', default: 0 },
          s04_cdf: { type: 'number', default: 0 },
          s05_cdf: { type: 'number', default: 0 },
          s06_cdf: { type: 'number', default: 0 },
          resetExisting: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const {
        s01_cdf = 0,
        s01_usd = 0,
        s02_cdf = 0,
        s03_cdf = 0,
        s04_cdf = 0,
        s05_cdf = 0,
        s06_cdf = 0,
        resetExisting = false
      } = request.body as any;

      const adminUser = (request as any).user;
      const adminIp = request.headers['x-forwarded-for'] || request.ip || 'Unknown';

      console.log('[Admin] Initializing accounts for customer:', id, { resetExisting });

      // Get customer's accounts
      const customerAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.customerId, id));

      if (customerAccounts.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'No accounts found for this customer'
        });
      }

      // Update each account with default balances
      const updated = [];
      const balancesMap: any = {
        'S01': { cdf: s01_cdf, usd: s01_usd },
        'S02': { cdf: s02_cdf, usd: 0 },
        'S03': { cdf: s03_cdf, usd: 0 },
        'S04': { cdf: s04_cdf, usd: 0 },
        'S05': { cdf: s05_cdf, usd: 0 },
        'S06': { cdf: s06_cdf, usd: 0 }
      };

      for (const account of customerAccounts) {
        const accountType = account.accountTypeCode as string;
        if (!accountType) continue; // Skip if no account type

        const balanceData = balancesMap[accountType];

        if (balanceData) {
          const updateData: any = {
            updatedAt: new Date().toISOString()
          };

          if (resetExisting) {
            // Reset to new values
            updateData.balanceCdf = balanceData.cdf.toString();
            updateData.balanceUsd = balanceData.usd.toString();
          } else {
            // Only set if balance is 0 (initialize only)
            if (parseFloat(account.balanceCdf) === 0 && parseFloat(account.balanceUsd) === 0) {
              updateData.balanceCdf = balanceData.cdf.toString();
              updateData.balanceUsd = balanceData.usd.toString();
            }
          }

          const [updatedAccount] = await db
            .update(accounts)
            .set(updateData)
            .where(eq(accounts.id, account.id))
            .returning();

          updated.push(updatedAccount);
          console.log(`[Admin] ✅ Initialized ${accountType}: CDF=${balanceData.cdf}, USD=${balanceData.usd}`);
        }
      }

      // Track who modified
      await db
        .update(customers)
        .set({
          lastModifiedByAdminId: adminUser?.id,
          lastModifiedByAdminIp: adminIp as string,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, id));

      return {
        success: true,
        message: `${updated.length} comptes initialisés`,
        updatedAccounts: updated.map(acc => ({
          type: acc.accountTypeCode,
          balanceCdf: acc.balanceCdf,
          balanceUsd: acc.balanceUsd
        }))
      };
    } catch (error) {
      console.error('[Admin] Error initializing accounts:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * PUT /admin/customers/:id/accounts
   * Update account balances for manual customer (paper records)
   */
  fastify.put('/admin/customers/:id/accounts', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Update customer account balances',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          s01_cdf: { type: 'number' },
          s01_usd: { type: 'number' },
          s02_cdf: { type: 'number' },
          s03_cdf: { type: 'number' },
          s04_cdf: { type: 'number' },
          s05_cdf: { type: 'number' },
          s06_cdf: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const balances = request.body as any;

      const adminUser = (request as any).user;
      const adminIp = request.headers['x-forwarded-for'] || request.ip || 'Unknown';

      console.log('[Admin] Updating account balances for customer:', id, balances);

      // Get customer's accounts
      const customerAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.customerId, id));

      if (customerAccounts.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'No accounts found for this customer'
        });
      }

      // Update each account balance
      const updated = [];
      for (const account of customerAccounts) {
        const accountType = account.accountTypeCode?.toLowerCase();
        const cdfBalance = balances[`${accountType}_cdf`];
        const usdBalance = balances[`${accountType}_usd`];

        if (cdfBalance !== undefined || usdBalance !== undefined) {
          const updateData: any = {
            updatedAt: new Date().toISOString()
          };

          if (cdfBalance !== undefined) {
            updateData.balanceCdf = cdfBalance.toString();
          }
          if (usdBalance !== undefined) {
            updateData.balanceUsd = usdBalance.toString();
          }

          const [updatedAccount] = await db
            .update(accounts)
            .set(updateData)
            .where(eq(accounts.id, account.id))
            .returning();

          updated.push(updatedAccount);
          console.log(`[Admin] ✅ Updated ${accountType}: CDF=${cdfBalance}, USD=${usdBalance}`);
        }
      }

      // Track who modified
      await db
        .update(customers)
        .set({
          lastModifiedByAdminId: adminUser?.id,
          lastModifiedByAdminIp: adminIp as string,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, id));

      return {
        success: true,
        message: `${updated.length} comptes mis à jour`,
        updatedAccounts: updated.map(acc => ({
          type: acc.accountTypeCode,
          balanceCdf: acc.balanceCdf,
          balanceUsd: acc.balanceUsd
        }))
      };
    } catch (error) {
      console.error('[Admin] Error updating account balances:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * DELETE /admin/customers/:id
   * Delete customer (soft delete - set to closed)
   */
  fastify.delete('/admin/customers/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Delete customer',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      // Soft delete - set status to CLOSED and deactivate
      const [customer] = await db
        .update(customers)
        .set({
          status: 'CLOSED' as any,
          isActive: false,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, id))
        .returning();

      if (!customer) {
        reply.status(404).send({
          success: false,
          error: 'Customer not found'
        });
        return;
      }

      return {
        success: true,
        message: 'Customer deleted successfully'
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // ===== MODIFICATION REQUEST ENDPOINTS (APPROVAL WORKFLOW) =====

  /**
   * POST /admin/modification-requests
   * Create a modification request (balance update, info update, etc.)
   * Requires approval from appropriate role based on requester
   */
  fastify.post('/admin/modification-requests', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Modifications'],
      summary: 'Create a modification request',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          changeType: {
            type: 'string',
            enum: ['BALANCE_UPDATE', 'INFO_UPDATE', 'STATUS_CHANGE', 'ACCOUNT_CREATION']
          },
          requestedChanges: { type: 'object' },
          reason: { type: 'string', minLength: 20 }
        },
        required: ['customerId', 'changeType', 'requestedChanges', 'reason']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, changeType, requestedChanges, reason } = request.body as {
        customerId: number;
        changeType: string;
        requestedChanges: Record<string, any>;
        reason: string;
      };

      // Extract admin info from request
      const adminUser = (request as any).user;
      const adminId = adminUser?.id || 1; // TODO: Get from session
      const adminRole = adminUser?.role || 'ADMIN'; // TODO: Get from session
      const adminName = adminUser?.username || 'Admin User'; // TODO: Get from session

      // Create modification request
      const pendingChange = await CustomerModificationService.requestModification({
        customerId,
        changeType: changeType as any,
        requestedChanges,
        reason,
        requestedByAdminId: adminId,
        requestedByRole: adminRole,
        requestedByName: adminName,
        request
      });

      return {
        success: true,
        message: 'Modification request created successfully. Awaiting approval.',
        modificationRequest: {
          id: pendingChange.id,
          customerId: pendingChange.customerId,
          changeType: pendingChange.changeType,
          status: pendingChange.status,
          expiresAt: pendingChange.expiresAt,
          requiredApprover: CustomerModificationService['getRequiredApproverRole'](adminRole)
        }
      };
    } catch (error: any) {
      console.error('[Admin] Error creating modification request:', error);
      reply.status(400).send({
        success: false,
        error: error.message || 'Failed to create modification request'
      });
    }
  });

  /**
   * GET /admin/modification-requests
   * List all modification requests (with filters)
   */
  fastify.get('/admin/modification-requests', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Modifications'],
      summary: 'List modification requests',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'] },
          customerId: { type: 'number' },
          changeType: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { status, customerId, changeType } = request.query as any;

      const modifications = await CustomerModificationService.getPendingModifications({
        status,
        customerId: customerId ? parseInt(customerId) : undefined,
        changeType
      });

      return {
        success: true,
        count: modifications.length,
        modifications
      };
    } catch (error) {
      console.error('[Admin] Error fetching modification requests:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/modification-requests/:id/approve
   * Approve a modification request (role-based rules apply)
   */
  fastify.post('/admin/modification-requests/:id/approve', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Modifications'],
      summary: 'Approve a modification request',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      // Extract approver info
      const approverUser = (request as any).user;
      const approverId = approverUser?.id || 1; // TODO: Get from session
      const approverRole = approverUser?.role || 'MANAGER'; // TODO: Get from session
      const approverName = approverUser?.username || 'Manager User'; // TODO: Get from session

      // Approve the modification
      await CustomerModificationService.approveModification(
        id,
        approverId,
        approverRole,
        approverName,
        request
      );

      return {
        success: true,
        message: 'Modification approved and applied successfully'
      };
    } catch (error: any) {
      console.error('[Admin] Error approving modification:', error);
      reply.status(400).send({
        success: false,
        error: error.message || 'Failed to approve modification'
      });
    }
  });

  /**
   * POST /admin/modification-requests/:id/reject
   * Reject a modification request (reason required)
   */
  fastify.post('/admin/modification-requests/:id/reject', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Modifications'],
      summary: 'Reject a modification request',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          rejectionReason: { type: 'string', minLength: 20 }
        },
        required: ['rejectionReason']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { rejectionReason } = request.body as { rejectionReason: string };

      // Extract rejector info
      const rejectorUser = (request as any).user;
      const rejectorId = rejectorUser?.id || 1;
      const rejectorRole = rejectorUser?.role || 'MANAGER';
      const rejectorName = rejectorUser?.username || 'Manager User';

      // Reject the modification
      await CustomerModificationService.rejectModification(
        id,
        rejectorId,
        rejectorRole,
        rejectorName,
        rejectionReason,
        request
      );

      return {
        success: true,
        message: 'Modification rejected successfully'
      };
    } catch (error: any) {
      console.error('[Admin] Error rejecting modification:', error);
      reply.status(400).send({
        success: false,
        error: error.message || 'Failed to reject modification'
      });
    }
  });

  /**
   * DELETE /admin/modification-requests/:id
   * Cancel a modification request (only by creator)
   */
  fastify.delete('/admin/modification-requests/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Modifications'],
      summary: 'Cancel a modification request',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const cancellerUser = (request as any).user;
      const cancellerId = cancellerUser?.id || 1;

      await CustomerModificationService.cancelModification(id, cancellerId, request);

      return {
        success: true,
        message: 'Modification request cancelled successfully'
      };
    } catch (error: any) {
      console.error('[Admin] Error cancelling modification:', error);
      reply.status(400).send({
        success: false,
        error: error.message || 'Failed to cancel modification'
      });
    }
  });

  /**
   * GET /admin/customers/:id/modification-history
   * Get complete modification history for a customer
   */
  fastify.get('/admin/customers/:id/modification-history', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Modifications'],
      summary: 'Get customer modification history',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      const history = await CustomerModificationService.getCustomerModificationHistory(id);

      return {
        success: true,
        count: history.length,
        modificationHistory: history
      };
    } catch (error) {
      console.error('[Admin] Error fetching modification history:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/kyc/approve
   * Approve customer KYC (KYC1 or KYC2)
   */
  fastify.post('/admin/kyc/approve', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin KYC'],
      summary: 'Approve customer KYC',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          level: { type: 'string', enum: ['KYC1', 'KYC2'] },
          notes: { type: 'string' }
        },
        required: ['customerId', 'level']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, level, notes } = request.body as {
        customerId: number;
        level: 'KYC1' | 'KYC2';
        notes?: string;
      };

      // TODO: Extract admin user ID from session/token
      // For now using hardcoded value - replace with: request.user.id
      const adminUserId = 1; // TEMPORARY - Replace with actual admin ID from session

      // Get customer
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer) {
        reply.status(404).send({
          success: false,
          error: 'Customer not found'
        });
        return;
      }

      // Determine new status and update fields
      let updateData: any = {
        updatedAt: new Date().toISOString(),
        validatedByUserId: adminUserId, // BANKING COMPLIANCE: Track who validated
        adminNotes: notes || null // Store admin notes
      };

      if (level === 'KYC1') {
        updateData.kycStatus = 'KYC1_COMPLETED';
        updateData.kyc1CompletionDate = new Date().toISOString();
        updateData.kycStep = 2; // Move to next step
      } else if (level === 'KYC2') {
        updateData.kycStatus = 'KYC2_VERIFIED';
        updateData.kyc2ValidationDate = new Date().toISOString();
        updateData.kycCompleted = true;
        updateData.kycStep = 4; // Completed
        updateData.category = 'GOLD'; // Upgrade to GOLD after KYC2
      }

      // BANKING COMPLIANCE: Append to audit trail (trigger will also log this)
      const existingAuditTrail: any[] = Array.isArray(customer.kycAuditTrail) ? customer.kycAuditTrail : [];
      const newAuditEntry = {
        action: `${level}_APPROVED`,
        timestamp: new Date().toISOString(),
        userId: adminUserId,
        userName: 'Admin User', // TODO: Fetch from users table
        notes: notes || null,
        previousStatus: customer.kycStatus,
        newStatus: updateData.kycStatus
      };

      updateData.kycAuditTrail = [...existingAuditTrail, newAuditEntry] as any;

      // Keep legacy businessDocuments for backward compatibility
      updateData.businessDocuments = newAuditEntry;

      // Update customer
      const [updatedCustomer] = await db
        .update(customers)
        .set(updateData)
        .where(eq(customers.id, customerId))
        .returning();

      console.log(`[Admin KYC] ${level} approved by admin ${adminUserId} for customer ${customerId}`);

      return {
        success: true,
        message: `${level} approved successfully`,
        customer: {
          id: updatedCustomer.id,
          kycStatus: updatedCustomer.kycStatus,
          kycStep: updatedCustomer.kycStep,
          validatedBy: adminUserId,
          validatedAt: updateData.kyc2ValidationDate || updateData.kyc1CompletionDate
        }
      };
    } catch (error) {
      console.error('[Admin KYC] Error approving:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/kyc/reject
   * Reject customer KYC with reason
   */
  fastify.post('/admin/kyc/reject', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin KYC'],
      summary: 'Reject customer KYC',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          level: { type: 'string', enum: ['KYC1', 'KYC2'] },
          reason: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['customerId', 'level', 'reason']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, level, reason, notes } = request.body as {
        customerId: number;
        level: 'KYC1' | 'KYC2';
        reason: string;
        notes?: string;
      };

      // TODO: Extract admin user ID from session/token
      const adminUserId = 1; // TEMPORARY - Replace with actual admin ID from session

      // BANKING COMPLIANCE: Validate reason
      if (!reason || reason.trim().length < 15) {
        reply.status(400).send({
          success: false,
          error: 'La raison de rejet doit contenir au moins 15 caractères (conformité bancaire)'
        });
        return;
      }

      // Get customer
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer) {
        reply.status(404).send({
          success: false,
          error: 'Customer not found'
        });
        return;
      }

      // BANKING COMPLIANCE: Create detailed audit trail with rejection tracking
      const existingAuditTrail: any[] = Array.isArray(customer.kycAuditTrail) ? customer.kycAuditTrail : [];
      const rejectionAuditEntry = {
        action: `${level}_REJECTED`,
        timestamp: new Date().toISOString(),
        userId: adminUserId,
        userName: 'Admin User', // TODO: Fetch from users table
        reason: reason.trim(),
        notes: notes || null,
        previousStatus: customer.kycStatus,
        newStatus: 'REJECTED'
      };

      // Update customer - BANKING COMPLIANCE: Track rejection with full traceability
      const [updatedCustomer] = await db
        .update(customers)
        .set({
          kycStatus: 'REJECTED' as any,
          updatedAt: new Date().toISOString(),
          rejectedByUserId: adminUserId, // BANKING COMPLIANCE: Track who rejected
          rejectionReason: reason.trim(), // Customer-visible reason
          rejectionNotes: notes || null, // Internal admin notes
          kycAuditTrail: [...existingAuditTrail, rejectionAuditEntry], // Full audit trail
          businessDocuments: rejectionAuditEntry as any // Legacy compatibility
        })
        .where(eq(customers.id, customerId))
        .returning();

      console.log(`[Admin KYC] ${level} rejected by admin ${adminUserId} for customer ${customerId}. Reason: ${reason.substring(0, 50)}...`);

      // SEND NOTIFICATION TO CUSTOMER - KYC REJECTED
      await db.insert(customerNotifications).values({
        customerId,
        notificationType: 'ALERT',
        priority: 'HIGH',
        title: `Votre demande ${level} a été refusée`,
        message: `Nous n'avons pas pu valider votre dossier ${level}. Raison: ${reason.trim()}. Veuillez corriger les éléments indiqués et resoumettre votre demande.`,
        actionLabel: 'Corriger mon dossier',
        actionUrl: '/dashboard/kyc',
        icon: 'alert-triangle',
        displayDurationSeconds: 0,
        isRepeatable: false,
        metadata: {
          kycLevel: level,
          rejectionReason: reason.trim(),
          rejectedBy: adminUserId,
          rejectedAt: rejectionAuditEntry.timestamp,
          previousStatus: customer.kycStatus
        } as any
      });

      console.log(`[Admin KYC] Rejection notification sent to customer ${customerId}`);

      return {
        success: true,
        message: `${level} rejected successfully. Customer will be notified.`,
        customer: {
          id: updatedCustomer.id,
          kycStatus: updatedCustomer.kycStatus,
          rejectedBy: adminUserId,
          rejectedAt: rejectionAuditEntry.timestamp,
          reason: reason.trim()
        }
      };
    } catch (error) {
      console.error('[Admin KYC] Error rejecting:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/kyc/mark-prefilled
   * Mark KYC2 as pre-filled for admin-created customers who completed KYC2 manually at agency
   * This allows admin to indicate that KYC2 data was already collected physically
   */
  fastify.post('/admin/kyc/mark-prefilled', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin KYC'],
      summary: 'Mark KYC2 as pre-filled for manual customers',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          notes: { type: 'string' },
          verificationMethod: { type: 'string', enum: ['IN_AGENCY', 'PHONE_VERIFIED', 'DOCUMENT_VERIFIED'] }
        },
        required: ['customerId', 'verificationMethod']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, notes, verificationMethod } = request.body as {
        customerId: number;
        notes?: string;
        verificationMethod: 'IN_AGENCY' | 'PHONE_VERIFIED' | 'DOCUMENT_VERIFIED';
      };

      // Get admin info
      const adminUserId = 1; // TODO: Replace with actual admin ID from session

      // Get customer
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer) {
        return reply.status(404).send({
          success: false,
          error: 'Customer not found'
        });
      }

      // Verify customer was created by admin
      if (!customer.isManualCreation) {
        return reply.status(400).send({
          success: false,
          error: 'Cette fonctionnalité est réservée aux clients créés manuellement par l\'agence'
        });
      }

      // Verify KYC1 is at least completed
      const validKyc1Statuses = ['KYC1_COMPLETED', 'KYC1_VERIFIED'];
      if (!validKyc1Statuses.includes(customer.kycStatus || '')) {
        return reply.status(400).send({
          success: false,
          error: 'Le KYC1 doit être validé avant de marquer le KYC2 comme pré-rempli'
        });
      }

      // Build audit entry
      const existingAuditTrail: any[] = Array.isArray(customer.kycAuditTrail) ? customer.kycAuditTrail : [];
      const prefilledAuditEntry = {
        action: 'KYC2_MARKED_PREFILLED',
        timestamp: new Date().toISOString(),
        userId: adminUserId,
        verificationMethod,
        notes: notes || null,
        previousStatus: customer.kycStatus
      };

      // Update customer - KYC2 moves to PENDING for admin review
      const [updatedCustomer] = await db
        .update(customers)
        .set({
          kycStatus: 'KYC2_PENDING' as any,
          kyc2SubmissionDate: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          adminNotes: notes || customer.adminNotes,
          lastModifiedByAdminId: adminUserId,
          kycAuditTrail: [...existingAuditTrail, prefilledAuditEntry]
        })
        .where(eq(customers.id, customerId))
        .returning();

      // Send notification to customer
      await db.insert(customerNotifications).values({
        customerId,
        notificationType: 'SYSTEM',
        priority: 'MEDIUM',
        title: 'Votre dossier KYC 2 est en cours de validation',
        message: `Les informations de votre KYC niveau 2 recueillies en agence sont en cours de validation. Vous serez notifié dès que la vérification sera terminée.`,
        actionLabel: 'Voir mon profil',
        actionUrl: '/dashboard/client/documents',
        icon: 'file-check',
        displayDurationSeconds: 0,
        isRepeatable: false,
        metadata: {
          kycLevel: 'KYC2',
          verificationMethod,
          markedBy: adminUserId,
          markedAt: prefilledAuditEntry.timestamp
        } as any
      });

      console.log(`[Admin KYC] KYC2 marked as pre-filled for customer ${customerId} by admin ${adminUserId}`);

      return {
        success: true,
        message: 'KYC2 marqué comme pré-rempli. Le client peut maintenant être validé.',
        customer: {
          id: updatedCustomer.id,
          kycStatus: updatedCustomer.kycStatus,
          kyc2SubmissionDate: updatedCustomer.kyc2SubmissionDate
        }
      };
    } catch (error) {
      console.error('[Admin KYC] Error marking as pre-filled:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/kyc/:customerId/complete
   * Get complete KYC data including drafts, documents, and geography
   * OPTIMIZED: Single query with joins for performance
   */
  fastify.get('/admin/kyc/:customerId/complete', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin KYC'],
      summary: 'Get complete KYC data for a customer',
      params: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.params as { customerId: number };

      // SECURITY: Validate customer exists
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer) {
        return reply.status(404).send({
          success: false,
          error: 'Customer not found'
        });
      }

      // Fetch KYC drafts (step1, step2, step3) - PARALLEL for speed
      const [step1Draft, step2Draft, step3Draft] = await Promise.all([
        db.select().from(kycDrafts)
          .where(and(
            eq(kycDrafts.customerId, customerId),
            eq(kycDrafts.kycStep, 'step1')
          ))
          .limit(1)
          .then(r => r[0] || null),

        db.select().from(kycDrafts)
          .where(and(
            eq(kycDrafts.customerId, customerId),
            eq(kycDrafts.kycStep, 'step2')
          ))
          .limit(1)
          .then(r => r[0] || null),

        db.select().from(kycDrafts)
          .where(and(
            eq(kycDrafts.customerId, customerId),
            eq(kycDrafts.kycStep, 'step3')
          ))
          .limit(1)
          .then(r => r[0] || null)
      ]);

      // Fetch geography data if exists - PARALLEL
      let quartierData = null;
      let communeData = null;
      let postalCodeData = null;

      const [quartierResult, postalCodeResult] = await Promise.all([
        customer.quartierId
          ? db.select().from(quartiers).where(eq(quartiers.id, customer.quartierId)).limit(1)
          : Promise.resolve([]),
        customer.postalCodeId
          ? db.select().from(postalCodes).where(eq(postalCodes.id, customer.postalCodeId)).limit(1)
          : Promise.resolve([])
      ]);

      quartierData = quartierResult[0] || null;
      postalCodeData = postalCodeResult[0] || null;

      // Fetch commune if quartier exists
      if (quartierData && quartierData.communeId) {
        const [communeResult] = await db
          .select()
          .from(communes)
          .where(eq(communes.id, quartierData.communeId))
          .limit(1);
        communeData = communeResult || null;
      }

      // Determine KYC completion status
      const kycProgress = {
        step1Complete: !!(step1Draft || (customer.firstName && customer.lastName && customer.dateOfBirth)),
        step2Complete: !!(step2Draft || (customer.placeOfBirth && customer.nationality)),
        step3Complete: !!(step3Draft || (customer.idCardFrontUrl && customer.facePhotoUrl)),
        currentStep: customer.kycStep || 0,
        stoppedAt: null as string | null,
        canContinue: true
      };

      // Determine where user stopped
      if (!kycProgress.step1Complete) {
        kycProgress.stoppedAt = 'step1';
      } else if (!kycProgress.step2Complete) {
        kycProgress.stoppedAt = 'step2';
      } else if (!kycProgress.step3Complete) {
        kycProgress.stoppedAt = 'step3';
      } else if (customer.kycStatus === 'NOT_STARTED' || customer.kycStatus === null) {
        kycProgress.stoppedAt = 'step4';
      }

      // Build documents object with metadata
      const documents = {
        idCardFront: customer.idCardFrontUrl ? {
          url: customer.idCardFrontUrl,
          exists: true,
          type: 'idCardFront'
        } : null,
        idCardBack: customer.idCardBackUrl ? {
          url: customer.idCardBackUrl,
          exists: true,
          type: 'idCardBack'
        } : null,
        facePhoto: customer.facePhotoUrl ? {
          url: customer.facePhotoUrl,
          exists: true,
          type: 'facePhoto'
        } : null,
        signature: customer.signaturePhotoUrl ? {
          url: customer.signaturePhotoUrl,
          exists: true,
          type: 'signature'
        } : null,
        passport: customer.passportUrl ? {
          url: customer.passportUrl,
          exists: true,
          type: 'passport'
        } : null,
        birthCertificate: customer.birthCertificateUrl ? {
          url: customer.birthCertificateUrl,
          exists: true,
          type: 'birthCertificate'
        } : null,
        residenceCertificate: customer.residenceCertificateUrl ? {
          url: customer.residenceCertificateUrl,
          exists: true,
          type: 'residenceCertificate'
        } : null,
        incomeProof: customer.incomeProofUrl ? {
          url: customer.incomeProofUrl,
          exists: true,
          type: 'incomeProof'
        } : null
      };

      return {
        success: true,
        customer: {
          ...customer,
          // Add submission date
          submittedAt: customer.kyc2SubmissionDate || customer.createdAt,
          submissionDate: customer.kyc2SubmissionDate || customer.createdAt
        },
        drafts: {
          step1: step1Draft ? {
            data: step1Draft.draftData,
            updatedAt: step1Draft.updatedAt,
            version: step1Draft.version
          } : null,
          step2: step2Draft ? {
            data: step2Draft.draftData,
            updatedAt: step2Draft.updatedAt,
            version: step2Draft.version
          } : null,
          step3: step3Draft ? {
            data: step3Draft.draftData,
            updatedAt: step3Draft.updatedAt,
            version: step3Draft.version
          } : null
        },
        geography: {
          commune: communeData ? { id: communeData.id, name: communeData.name } : null,
          quartier: quartierData ? { id: quartierData.id, name: quartierData.name } : null,
          postalCode: postalCodeData ? { id: postalCodeData.id, code: postalCodeData.code } : null
        },
        documents,
        progress: kycProgress
      };
    } catch (error) {
      console.error('[Admin KYC] Error fetching complete data:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * DELETE /admin/kyc/document
   * Delete customer document with MANDATORY audit trail (Banking compliance)
   * SECURITY: Soft delete + Audit trail + Admin authorization required
   */
  fastify.delete('/admin/kyc/document', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin KYC'],
      summary: 'Delete customer document with audit trail',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          documentField: {
            type: 'string',
            enum: [
              'idCardFrontUrl', 'idCardBackUrl', 'facePhotoUrl', 'signaturePhotoUrl',
              'passportUrl', 'birthCertificateUrl', 'residenceCertificateUrl', 'incomeProofUrl'
            ]
          },
          reason: { type: 'string', minLength: 15 },
          notifyClient: { type: 'boolean', default: true }
        },
        required: ['customerId', 'documentField', 'reason']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, documentField, reason, notifyClient = true } = request.body as {
        customerId: number;
        documentField: string;
        reason: string;
        notifyClient?: boolean;
      };

      // BANKING COMPLIANCE: Validate reason length
      if (!reason || reason.trim().length < 15) {
        return reply.status(400).send({
          success: false,
          error: 'La raison de suppression doit contenir au moins 15 caractères (conformité bancaire)'
        });
      }

      // Get customer
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer) {
        return reply.status(404).send({
          success: false,
          error: 'Client non trouvé'
        });
      }

      // Verify document exists
      const documentUrl = (customer as any)[documentField];
      if (!documentUrl) {
        return reply.status(404).send({
          success: false,
          error: 'Document non trouvé pour ce client'
        });
      }

      // BANKING AUDIT TRAIL: Create deletion record BEFORE deleting
      const auditRecord = {
        action: 'DOCUMENT_DELETED',
        documentField,
        documentUrl: documentUrl,
        reason: reason.trim(),
        deletedAt: new Date().toISOString(),
        deletedBy: 'admin', // TODO: Replace with actual admin ID from session
        customerId,
        customerName: `${customer.firstName} ${customer.lastName}`,
        notifiedClient: notifyClient
      };

      // SOFT DELETE: Set document URL to null (preserve audit trail)
      const updateData: any = {
        [documentField]: null,
        updatedAt: new Date().toISOString(),
        // Store audit in businessDocuments field (JSONB)
        businessDocuments: auditRecord
      };

      await db
        .update(customers)
        .set(updateData)
        .where(eq(customers.id, customerId));

      // TODO: Send notification to customer if notifyClient = true
      // Example:
      // if (notifyClient) {
      //   await sendNotification({
      //     customerId,
      //     type: 'DOCUMENT_DELETED',
      //     title: 'Document supprimé',
      //     message: `Votre document a été supprimé. Raison: ${reason}`,
      //     priority: 'high'
      //   });
      // }

      console.log('[Admin KYC] Document deleted with audit trail:', auditRecord);

      return {
        success: true,
        message: 'Document supprimé avec succès. Audit trail enregistré.',
        audit: {
          documentField,
          deletedAt: auditRecord.deletedAt,
          reason: auditRecord.reason
        }
      };
    } catch (error) {
      console.error('[Admin KYC] Error deleting document:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/kyc/validate-granular
   * Granular validation with document-level and field-level feedback
   */
  fastify.post('/admin/kyc/validate-granular', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin KYC'],
      summary: 'Validate KYC with granular document/field feedback',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          level: { type: 'string', enum: ['KYC1', 'KYC2', 'KYC3'] },
          action: { type: 'string', enum: ['approve_all', 'reject_all', 'approve_with_issues', 'require_resubmit'] },
          globalReason: { type: 'string' },
          documentsIssues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                documentType: { type: 'string' },
                status: { type: 'string', enum: ['approved', 'rejected', 'needs_replacement'] },
                reason: { type: 'string' },
                action: { type: 'string', enum: ['delete', 'flag', 'request_new'] }
              }
            }
          },
          dataIssues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                isValid: { type: 'boolean' },
                reason: { type: 'string' }
              }
            }
          },
          adminNotes: { type: 'string' }
        },
        required: ['customerId', 'level', 'action']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const {
        customerId,
        level,
        action,
        globalReason,
        documentsIssues = [],
        dataIssues = [],
        adminNotes
      } = request.body as any;

      // SECURITY: Validate input
      if (action === 'reject_all' && (!globalReason || globalReason.length < 20)) {
        return reply.status(400).send({
          success: false,
          error: 'Global reason must be at least 20 characters for rejection'
        });
      }

      // Get customer
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer) {
        return reply.status(404).send({
          success: false,
          error: 'Customer not found'
        });
      }

      // Build validation record
      const validationRecord = {
        level,
        action,
        globalReason: globalReason || null,
        documentsIssues,
        dataIssues,
        validatedAt: new Date().toISOString(),
        adminNotes: adminNotes || null
      };

      // Determine new status based on action
      let newStatus: string;
      let updateData: any = {
        updatedAt: new Date().toISOString()
      };

      if (action === 'approve_all') {
        if (level === 'KYC1') {
          newStatus = 'KYC1_COMPLETED';
          updateData.kycStatus = 'KYC1_COMPLETED';
          updateData.kyc1CompletionDate = new Date().toISOString();
          updateData.kycStep = 2;
        } else if (level === 'KYC2') {
          newStatus = 'KYC2_VERIFIED';
          updateData.kycStatus = 'KYC2_VERIFIED';
          updateData.kyc2ValidationDate = new Date().toISOString();
          updateData.kycCompleted = true;
          updateData.kycStep = 4;
          updateData.category = 'GOLD';
        } else {
          newStatus = 'KYC3_VERIFIED';
          updateData.kycStatus = 'KYC3_VERIFIED';
        }
      } else {
        newStatus = 'REJECTED';
        updateData.kycStatus = 'REJECTED';
      }

      // Store validation record in business documents (temp solution)
      updateData.businessDocuments = validationRecord;

      // Update customer
      const [updatedCustomer] = await db
        .update(customers)
        .set(updateData)
        .where(eq(customers.id, customerId))
        .returning();

      // Build client feedback message
      let clientMessage = '';
      const documentsToResubmit: string[] = [];
      const fieldsToCorrect: string[] = [];

      if (documentsIssues.length > 0) {
        documentsIssues.forEach((issue: any) => {
          if (issue.status === 'rejected' || issue.status === 'needs_replacement') {
            documentsToResubmit.push(issue.documentType);
          }
        });
      }

      if (dataIssues.length > 0) {
        dataIssues.forEach((issue: any) => {
          if (!issue.isValid) {
            fieldsToCorrect.push(issue.field);
          }
        });
      }

      if (action === 'approve_all') {
        clientMessage = `Votre demande ${level} a été approuvée avec succès!`;
      } else {
        clientMessage = `Votre demande ${level} nécessite des corrections. ${globalReason || ''}`;
      }

      return {
        success: true,
        customer: updatedCustomer,
        notificationSent: false, // TODO: Implement notification
        feedback: {
          clientMessage,
          documentsToResubmit,
          fieldsToCorrect
        }
      };
    } catch (error) {
      console.error('[Admin KYC] Error in granular validation:', error);
      handleError(request, reply, error, 500);
    }
  });

  // NOTE: Agency routes are now handled by core-banking module at /admin/agencies
  // See: server/src/modules/core-banking/routes/agencies.routes.ts
  // The endpoint returns: { success: true, data: [...agencies with counts] }

  /**
   * GET /admin/communes
   * Get all communes for dropdown
   */
  fastify.get('/admin/communes', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Get all communes'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const communesList = await db
        .select()
        .from(communes)
        .orderBy(communes.name);

      return {
        success: true,
        communes: communesList
      };
    } catch (error) {
      console.error('[Admin] Error fetching communes:', error);
      handleError(request, reply, error, 500);
    }
  });

  // NOTE: Agents routes are now handled by core-banking module at /admin/agents
  // See: server/src/modules/core-banking/routes/agents.routes.ts

  // ===== TRANSACTIONS ROUTES =====

  /**
   * GET /admin/transactions
   * Get all transactions with optional customer enrichment
   */
  fastify.get('/admin/transactions', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Get all transactions',
      querystring: {
        type: 'object',
        properties: {
          includeCustomer: { type: 'boolean', default: false },
          transactionType: { type: 'string' },
          status: { type: 'string' },
          currency: { type: 'string' },
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
          limit: { type: 'number', default: 1000 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { includeCustomer, transactionType, status, currency, dateFrom, dateTo, limit } = request.query as any;

      // Build base query
      let query = db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          creditId: transactions.creditId,
          transactionType: transactions.transactionType,
          amountCdf: transactions.amountCdf,
          amountUsd: transactions.amountUsd,
          currency: transactions.currency,
          description: transactions.description,
          referenceNumber: transactions.referenceNumber,
          status: transactions.status,
          processedAt: transactions.processedAt,
          createdAt: transactions.createdAt,
          updatedAt: transactions.updatedAt,
        })
        .from(transactions);

      // Apply filters
      const conditions = [];

      if (transactionType) {
        conditions.push(eq(transactions.transactionType, transactionType));
      }

      if (status) {
        conditions.push(eq(transactions.status, status));
      }

      if (currency) {
        conditions.push(eq(transactions.currency, currency));
      }

      if (dateFrom) {
        conditions.push(sql`${transactions.createdAt} >= ${dateFrom}`);
      }

      if (dateTo) {
        conditions.push(sql`${transactions.createdAt} <= ${dateTo}`);
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const transactionsList = await query
        .orderBy(desc(transactions.createdAt))
        .limit(limit || 1000);

      // Enrich with customer data if requested
      if (includeCustomer && transactionsList.length > 0) {
        // Get unique account IDs
        const accountIds = [...new Set(transactionsList.map(t => t.accountId).filter(id => id !== null))] as number[];

        if (accountIds.length > 0) {
          // Get accounts with customer info
          const accountsData = await db
            .select({
              accountId: accounts.id,
              accountNumber: accounts.accountNumber,
              customerId: accounts.customerId,
              customerFirstName: customers.firstName,
              customerLastName: customers.lastName,
              customerCif: customers.cif,
            })
            .from(accounts)
            .leftJoin(customers, eq(accounts.customerId, customers.id))
            .where(sql`${accounts.id} IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`);

          // Create lookup map
          const accountMap = new Map(accountsData.map(a => [
            a.accountId,
            {
              accountNumber: a.accountNumber,
              customerName: a.customerFirstName && a.customerLastName
                ? `${a.customerFirstName} ${a.customerLastName}`
                : null,
              customerCif: a.customerCif,
            }
          ]));

          // Enrich transactions
          const enrichedTransactions = transactionsList.map(t => {
            const accountData = t.accountId ? accountMap.get(t.accountId) : null;
            return {
              ...t,
              accountNumber: accountData?.accountNumber || null,
              customerName: accountData?.customerName || null,
              customerCif: accountData?.customerCif || null,
            };
          });

          return {
            success: true,
            transactions: enrichedTransactions
          };
        }
      }

      return {
        success: true,
        transactions: transactionsList
      };
    } catch (error) {
      console.error('[Admin] Error fetching transactions:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/transactions/:id
   * Get transaction details
   */
  fastify.get('/admin/transactions/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin'],
      summary: 'Get transaction by ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      const [transaction] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1);

      if (!transaction) {
        return reply.status(404).send({
          success: false,
          error: 'Transaction not found'
        });
      }

      // Get account and customer info if account exists
      if (transaction.accountId) {
        const [accountData] = await db
          .select({
            accountNumber: accounts.accountNumber,
            customerId: accounts.customerId,
            customerFirstName: customers.firstName,
            customerLastName: customers.lastName,
            customerCif: customers.cif,
          })
          .from(accounts)
          .leftJoin(customers, eq(accounts.customerId, customers.id))
          .where(eq(accounts.id, transaction.accountId))
          .limit(1);

        if (accountData) {
          return {
            success: true,
            transaction: {
              ...transaction,
              accountNumber: accountData.accountNumber,
              customerName: accountData.customerFirstName && accountData.customerLastName
                ? `${accountData.customerFirstName} ${accountData.customerLastName}`
                : null,
              customerCif: accountData.customerCif,
            }
          };
        }
      }

      return {
        success: true,
        transaction
      };
    } catch (error) {
      console.error('[Admin] Error fetching transaction:', error);
      handleError(request, reply, error, 500);
    }
  });

  // ===== SPONSORSHIP ADMIN ROUTES =====

  /**
   * GET /admin/sponsorships
   * Get all sponsorships with filters
   */
  fastify.get('/admin/sponsorships', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Sponsorships'],
      summary: 'Get all MOPAO sponsorships',
      querystring: {
        type: 'object',
        properties: {
          sponsorId: { type: 'number' },
          sponsoredId: { type: 'number' },
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { sponsorId?: number; sponsoredId?: number; isActive?: boolean };

      const sponsorships = await SponsorshipAdminService.getAllSponsorships({
        sponsorId: query.sponsorId ? Number(query.sponsorId) : undefined,
        sponsoredId: query.sponsoredId ? Number(query.sponsoredId) : undefined,
        isActive: query.isActive !== undefined ? query.isActive : undefined,
      });

      return reply.send({
        success: true,
        count: sponsorships.length,
        data: sponsorships,
      });
    } catch (error) {
      console.error('[Admin] Error fetching sponsorships:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/sponsorships/sponsor/:sponsorId
   * Get sponsor statistics
   */
  fastify.get('/admin/sponsorships/sponsor/:sponsorId', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Sponsorships'],
      summary: 'Get sponsor statistics',
      params: {
        type: 'object',
        properties: {
          sponsorId: { type: 'number' }
        },
        required: ['sponsorId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { sponsorId } = request.params as { sponsorId: number };

      const stats = await SponsorshipAdminService.getSponsorStats(Number(sponsorId));

      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('[Admin] Error fetching sponsor stats:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/sponsorships/customer/:customerId/history
   * Get customer sponsorship history (as sponsor OR sponsored)
   */
  fastify.get('/admin/sponsorships/customer/:customerId/history', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Sponsorships'],
      summary: 'Get customer sponsorship history',
      params: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.params as { customerId: number };

      const history = await SponsorshipAdminService.getCustomerSponsorshipHistory(Number(customerId));

      return reply.send({
        success: true,
        data: history,
      });
    } catch (error) {
      console.error('[Admin] Error fetching sponsorship history:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * DELETE /admin/sponsorships/:sponsorshipId
   * Remove/cancel a sponsorship (admin only)
   */
  fastify.delete('/admin/sponsorships/:sponsorshipId', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Sponsorships'],
      summary: 'Remove/cancel sponsorship',
      params: {
        type: 'object',
        properties: {
          sponsorshipId: { type: 'number' }
        },
        required: ['sponsorshipId']
      },
      body: {
        type: 'object',
        properties: {
          adminId: { type: 'number' },
          reason: { type: 'string' }
        },
        required: ['adminId', 'reason']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { sponsorshipId } = request.params as { sponsorshipId: number };
      const { adminId, reason } = request.body as { adminId: number; reason: string };

      // Validate admin role
      const isAdmin = await validateAdminRole(adminId);
      if (!isAdmin) {
        return reply.status(403).send({
          success: false,
          error: 'Accès refusé - Rôle admin requis',
        });
      }

      await SponsorshipAdminService.removeSponsor(Number(sponsorshipId), adminId, reason);

      return reply.send({
        success: true,
        message: 'Parrainage retiré avec succès',
      });
    } catch (error: any) {
      console.error('[Admin] Error removing sponsorship:', error);
      if (error.message.includes('not found') || error.message.includes('inactive')) {
        return reply.status(404).send({
          success: false,
          error: error.message,
        });
      }
      handleError(request, reply, error, 500);
    }
  });

  // ===== CUSTOMER ACCOUNTS SUMMARY ROUTES =====

  /**
   * GET /admin/customers/:customerId/accounts-summary
   * Get complete accounts/services summary for a customer
   */
  fastify.get('/admin/customers/:customerId/accounts-summary', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Customers'],
      summary: 'Get customer accounts and services summary',
      params: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.params as { customerId: number };

      const summary = await CustomerAccountsSummaryService.getCustomerSummary(Number(customerId));

      return reply.send({
        success: true,
        data: summary,
      });
    } catch (error: any) {
      console.error('[Admin] Error fetching customer summary:', error);
      if (error.message.includes('not found')) {
        return reply.status(404).send({
          success: false,
          error: 'Client introuvable',
        });
      }
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/customers/accounts-summary
   * Get accounts summary for all customers (paginated)
   */
  fastify.get('/admin/customers/accounts-summary', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Customers'],
      summary: 'Get all customers accounts summary (paginated)',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', default: 1 },
          limit: { type: 'number', default: 50 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { page?: number; limit?: number };
      const page = query.page || 1;
      const limit = Math.min(query.limit || 50, 100); // Max 100

      const result = await CustomerAccountsSummaryService.getAllCustomersSummary(page, limit);

      return reply.send({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('[Admin] Error fetching all customers summary:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/migrate-account-numbers
   * Migrate all account numbers to use real CIF instead of "CIF" text
   * 
   * IMPORTANT: This is a one-time migration script
   * Updates format from: S01-CIF-20251227-001
   * To: S01-71094594-20251227-001
   */
  fastify.post('/admin/migrate-account-numbers', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Migration'],
      summary: 'Migrate account numbers to use real CIF values',
      description: 'One-time migration to replace "CIF" text with actual CIF numbers in all account numbers'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('\n' + '='.repeat(80));
      console.log('🔄 ACCOUNT NUMBER MIGRATION STARTED');
      console.log('='.repeat(80));
      console.log('Requested by admin at:', new Date().toISOString());
      console.log('');

      // Get all customers with valid CIF
      const allCustomers = await db
        .select({
          id: customers.id,
          cif: customers.cif,
          cifCode: customers.cifCode,
          firstName: customers.firstName,
          lastName: customers.lastName,
        })
        .from(customers)
        .where(sql`${customers.cif} IS NOT NULL`);

      console.log(`📊 Found ${allCustomers.length} customers with CIF to process\n`);

      let totalUpdated = 0;
      let customersProcessed = 0;
      let errors = 0;
      const migrationLog: any[] = [];

      for (const customer of allCustomers) {
        try {
          // Get all accounts for this customer
          const customerAccounts = await db
            .select()
            .from(accounts)
            .where(eq(accounts.customerId, customer.id));

          if (customerAccounts.length === 0) {
            migrationLog.push({
              customerId: customer.id,
              customerName: `${customer.firstName} ${customer.lastName}`,
              status: 'skipped',
              reason: 'no accounts'
            });
            continue;
          }

          console.log(`\n👤 Processing Customer ${customer.id}: ${customer.firstName} ${customer.lastName}`);
          console.log(`   CIF: ${customer.cif}`);
          console.log(`   Accounts found: ${customerAccounts.length}`);

          let accountsUpdated = 0;
          const updates: any[] = [];

          for (const account of customerAccounts) {
            const oldAccountNumber = account.accountNumber;

            // Check if account number contains "CIF" text (old format)
            if (!oldAccountNumber || !oldAccountNumber.includes('-CIF-')) {
              continue;
            }

            // Extract components from old account number
            // Old format: S01-CIF-20251227-001
            // New format: S01-71094594-20251227-001
            const parts = oldAccountNumber.split('-');

            if (parts.length !== 4 || parts[1] !== 'CIF') {
              console.log(`   ⚠️  Account ${account.id} has unexpected format: ${oldAccountNumber} - skipping`);
              continue;
            }

            const accountType = parts[0];  // S01, S02, etc.
            const dateStr = parts[2];       // 20251227
            const sequence = parts[3];      // 001, 002, etc.

            // Build new account number with real CIF
            const newAccountNumber = `${accountType}-${customer.cif}-${dateStr}-${sequence}`;

            // Update account number in database
            await db
              .update(accounts)
              .set({
                accountNumber: newAccountNumber,
                updatedAt: new Date().toISOString()
              })
              .where(eq(accounts.id, account.id));

            console.log(`   ✅ Updated account ${account.id}:`);
            console.log(`      OLD: ${oldAccountNumber}`);
            console.log(`      NEW: ${newAccountNumber}`);

            updates.push({
              accountId: account.id,
              oldNumber: oldAccountNumber,
              newNumber: newAccountNumber
            });

            accountsUpdated++;
            totalUpdated++;
          }

          customersProcessed++;
          console.log(`   📏 Summary: ${accountsUpdated}/${customerAccounts.length} accounts updated for this customer`);

          migrationLog.push({
            customerId: customer.id,
            customerName: `${customer.firstName} ${customer.lastName}`,
            cif: customer.cif,
            totalAccounts: customerAccounts.length,
            accountsUpdated,
            updates
          });

        } catch (error) {
          errors++;
          console.error(`   ❌ Error processing customer ${customer.id}:`, error);
          migrationLog.push({
            customerId: customer.id,
            customerName: `${customer.firstName} ${customer.lastName}`,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      console.log('\n' + '='.repeat(80));
      console.log('📊 MIGRATION SUMMARY');
      console.log('='.repeat(80));
      console.log(`✅ Customers processed: ${customersProcessed}/${allCustomers.length}`);
      console.log(`✅ Total accounts updated: ${totalUpdated}`);
      console.log(`❌ Errors encountered: ${errors}`);
      console.log('='.repeat(80));

      return reply.send({
        success: true,
        message: errors === 0
          ? 'Migration completed successfully!'
          : `Migration completed with ${errors} errors`,
        summary: {
          customersTotal: allCustomers.length,
          customersProcessed,
          accountsUpdated: totalUpdated,
          errors
        },
        log: migrationLog
      });
    } catch (error) {
      console.error('\n❌ FATAL ERROR during migration:', error);
      handleError(request, reply, error, 500);
    }
  });

  // ===== CONDITIONS MANAGEMENT ROUTES =====
  // Dynamic conditions for accounts (S01-S06) and services (BOMBÉ, TELEMA, etc.)

  /**
   * GET /admin/conditions/accounts
   * Get all account type conditions
   */
  fastify.get('/admin/conditions/accounts', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Conditions'],
      summary: 'Get all account type conditions',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            conditions: { type: 'array' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const conditions = await db
        .select()
        .from(accountTypeConditions)
        .orderBy(accountTypeConditions.accountTypeCode, accountTypeConditions.displayOrder);

      return { success: true, conditions };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/conditions/services
   * Get all service conditions
   */
  fastify.get('/admin/conditions/services', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Conditions'],
      summary: 'Get all service conditions',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            conditions: { type: 'array' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const conditions = await db
        .select()
        .from(serviceConditions)
        .orderBy(serviceConditions.serviceCode, serviceConditions.displayOrder);

      return { success: true, conditions };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/conditions/accounts
   * Create a new account condition
   */
  fastify.post('/admin/conditions/accounts', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Conditions'],
      summary: 'Create account condition',
      body: {
        type: 'object',
        properties: {
          accountTypeCode: { type: 'string' },
          conditionType: { type: 'string' },
          conditionKey: { type: 'string' },
          conditionLabel: { type: 'string' },
          conditionDescription: { type: 'string' },
          requiredValue: { type: 'object' },
          validationRule: { type: 'string' },
          displayOrder: { type: 'number' },
          isActive: { type: 'boolean' }
        },
        required: ['accountTypeCode', 'conditionType', 'conditionKey', 'conditionLabel']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;

      const [newCondition] = await db
        .insert(accountTypeConditions)
        .values({
          accountTypeCode: body.accountTypeCode,
          conditionType: body.conditionType,
          conditionKey: body.conditionKey,
          conditionLabel: body.conditionLabel,
          conditionDescription: body.conditionDescription,
          requiredValue: body.requiredValue || {},
          validationRule: body.validationRule,
          displayOrder: body.displayOrder || 0,
          isActive: body.isActive !== false
        })
        .returning();

      return { success: true, condition: newCondition };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/conditions/services
   * Create a new service condition
   */
  fastify.post('/admin/conditions/services', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Conditions'],
      summary: 'Create service condition',
      body: {
        type: 'object',
        properties: {
          serviceCode: { type: 'string' },
          conditionType: { type: 'string' },
          conditionKey: { type: 'string' },
          conditionLabel: { type: 'string' },
          conditionDescription: { type: 'string' },
          operator: { type: 'string' },
          requiredValue: { type: 'object' },
          weight: { type: 'number' },
          displayOrder: { type: 'number' },
          isActive: { type: 'boolean' },
          isMandatory: { type: 'boolean' }
        },
        required: ['serviceCode', 'conditionType', 'conditionKey', 'conditionLabel', 'requiredValue']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;

      const [newCondition] = await db
        .insert(serviceConditions)
        .values({
          serviceCode: body.serviceCode,
          conditionType: body.conditionType,
          conditionKey: body.conditionKey,
          conditionLabel: body.conditionLabel,
          conditionDescription: body.conditionDescription,
          operator: body.operator || 'GREATER_THAN_OR_EQUAL',
          requiredValue: body.requiredValue,
          weight: body.weight || 10,
          displayOrder: body.displayOrder || 0,
          isActive: body.isActive !== false,
          isMandatory: body.isMandatory !== false
        })
        .returning();

      return { success: true, condition: newCondition };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * PUT /admin/conditions/accounts/:id
   * Update an account condition
   */
  fastify.put('/admin/conditions/accounts/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Conditions'],
      summary: 'Update account condition',
      params: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const body = request.body as any;

      const [updated] = await db
        .update(accountTypeConditions)
        .set({
          ...body,
          updatedAt: new Date().toISOString()
        })
        .where(eq(accountTypeConditions.id, id))
        .returning();

      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Condition not found' });
      }

      return { success: true, condition: updated };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * PUT /admin/conditions/services/:id
   * Update a service condition
   */
  fastify.put('/admin/conditions/services/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Conditions'],
      summary: 'Update service condition',
      params: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const body = request.body as any;

      const [updated] = await db
        .update(serviceConditions)
        .set({
          ...body,
          updatedAt: new Date().toISOString()
        })
        .where(eq(serviceConditions.id, id))
        .returning();

      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Condition not found' });
      }

      return { success: true, condition: updated };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * DELETE /admin/conditions/accounts/:id
   * Delete an account condition
   */
  fastify.delete('/admin/conditions/accounts/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Conditions'],
      summary: 'Delete account condition',
      params: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      await db
        .delete(accountTypeConditions)
        .where(eq(accountTypeConditions.id, id));

      return { success: true, message: 'Condition deleted' };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * DELETE /admin/conditions/services/:id
   * Delete a service condition
   */
  fastify.delete('/admin/conditions/services/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Conditions'],
      summary: 'Delete service condition',
      params: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      await db
        .delete(serviceConditions)
        .where(eq(serviceConditions.id, id));

      return { success: true, message: 'Condition deleted' };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/conditions/accounts/:id/toggle
   * Toggle account condition active status
   */
  fastify.post('/admin/conditions/accounts/:id/toggle', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Conditions'],
      summary: 'Toggle account condition status'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      // Get current status
      const [current] = await db
        .select({ isActive: accountTypeConditions.isActive })
        .from(accountTypeConditions)
        .where(eq(accountTypeConditions.id, id));

      if (!current) {
        return reply.status(404).send({ success: false, error: 'Condition not found' });
      }

      const [updated] = await db
        .update(accountTypeConditions)
        .set({
          isActive: !current.isActive,
          updatedAt: new Date().toISOString()
        })
        .where(eq(accountTypeConditions.id, id))
        .returning();

      return { success: true, condition: updated };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/conditions/services/:id/toggle
   * Toggle service condition active status
   */
  fastify.post('/admin/conditions/services/:id/toggle', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Conditions'],
      summary: 'Toggle service condition status'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      // Get current status
      const [current] = await db
        .select({ isActive: serviceConditions.isActive })
        .from(serviceConditions)
        .where(eq(serviceConditions.id, id));

      if (!current) {
        return reply.status(404).send({ success: false, error: 'Condition not found' });
      }

      const [updated] = await db
        .update(serviceConditions)
        .set({
          isActive: !current.isActive,
          updatedAt: new Date().toISOString()
        })
        .where(eq(serviceConditions.id, id))
        .returning();

      return { success: true, condition: updated };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/eligibility/customer/:customerId
   * Get eligibility status for a customer
   */
  fastify.get('/admin/eligibility/customer/:customerId', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Eligibility'],
      summary: 'Get customer eligibility status'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.params as { customerId: number };

      const status = await db
        .select()
        .from(customerEligibilityStatus)
        .where(eq(customerEligibilityStatus.customerId, customerId))
        .orderBy(customerEligibilityStatus.targetType, customerEligibilityStatus.targetCode);

      return { success: true, eligibility: status };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /admin/eligibility/evaluate/:customerId
   * Trigger eligibility evaluation for a customer
   */
  fastify.post('/admin/eligibility/evaluate/:customerId', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Eligibility'],
      summary: 'Evaluate customer eligibility'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.params as { customerId: number };

      // Import eligibility engine
      const { eligibilityEngine } = await import('../../services/eligibility-engine');

      const results = await eligibilityEngine.evaluateAllForCustomer(customerId, 'ADMIN_MANUAL');

      return {
        success: true,
        message: `Evaluated ${results.length} targets`,
        results: results.map(r => ({
          targetType: r.targetType,
          targetCode: r.targetCode,
          isEligible: r.isEligible,
          score: r.eligibilityScore,
          conditionsMet: r.conditionsMet.length,
          conditionsMissing: r.conditionsMissing.length
        }))
      };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/notifications/customer/:customerId
   * Get notifications for a customer
   */
  fastify.get('/admin/notifications/customer/:customerId', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Notifications'],
      summary: 'Get customer notifications'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.params as { customerId: number };

      const notifications = await db
        .select()
        .from(customerNotifications)
        .where(eq(customerNotifications.customerId, customerId))
        .orderBy(desc(customerNotifications.createdAt))
        .limit(50);

      return { success: true, notifications };
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });
}
