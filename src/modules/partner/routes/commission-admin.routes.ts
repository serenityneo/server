import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { commissionConfigurations, commissionNotifications } from '../../../db/schema';
import { eq, and, desc, gte, lte, isNull, or } from 'drizzle-orm';
import { partnerCommissionService } from '../services/partner-commission.service';
import { AUTH_COOKIE_NAME } from '../../../config/auth';

/**
 * Admin routes for managing partner commission configurations
 * 
 * Endpoints:
 * - POST /api/v1/admin/commissions/create - Create new commission config
 * - PUT /api/v1/admin/commissions/:id - Update existing commission config
 * - GET /api/v1/admin/commissions - List all commission configs
 * - GET /api/v1/admin/commissions/:id - Get specific config details
 * - DELETE /api/v1/admin/commissions/:id - Deactivate commission config
 * - GET /api/v1/admin/commissions/active - Get all active configs
 * - POST /api/v1/admin/commissions/:id/expire - Manually expire a config
 */

/**
 * Security helper - Handle errors safely (BANKING SECURITY)
 */
function handleError(request: FastifyRequest, reply: FastifyReply, error: unknown, statusCode: number = 500) {
  request.log.error({ err: error }, 'Commission admin error');
  reply.status(statusCode).send({
    success: false,
    error: 'Une erreur est survenue. Veuillez réessayer.'
  });
}

/**
 * Middleware to verify admin authentication
 */
async function requireAdminAuth(request: FastifyRequest, reply: FastifyReply) {
  const adminTokenCookie = request.cookies[AUTH_COOKIE_NAME];
  
  if (adminTokenCookie && adminTokenCookie.length > 0) {
    return; // Cookie exists - allow access
  }
  
  return reply.status(401).send({ 
    error: 'Unauthorized', 
    message: 'Admin authentication required' 
  });
}

export async function commissionAdminRoutes(fastify: FastifyInstance) {
  // Create new commission configuration
  fastify.post('/api/v1/admin/commissions/create', {
    preHandler: requireAdminAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          operationType: { 
            type: 'string',
            enum: ['CLIENT_CREATION', 'DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'CREDIT_APPLICATION', 'APP_INSTALL']
          },
          commissionAmountUsd: { type: 'number', minimum: 0 },
          commissionAmountCdf: { type: 'number', minimum: 0 },
          commissionPercentage: { type: 'number', minimum: 0, maximum: 100 },
          validFrom: { type: 'string', format: 'date-time' },
          validUntil: { type: 'string', format: 'date-time' },
          description: { type: 'string' },
          conditions: { type: 'object' }
        },
        required: ['operationType', 'commissionAmountUsd', 'commissionAmountCdf']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        operationType: string;
        commissionAmountUsd: number;
        commissionAmountCdf: number;
        commissionPercentage?: number;
        validFrom?: string;
        validUntil?: string;
        description?: string;
        conditions?: any;
      };

      // TODO: Get actual admin ID from session
      const adminId = 1; // Placeholder

      const [config] = await db
        .insert(commissionConfigurations)
        .values({
          operationType: body.operationType,
          commissionAmountUsd: body.commissionAmountUsd.toString(),
          commissionAmountCdf: body.commissionAmountCdf.toString(),
          commissionPercentage: body.commissionPercentage?.toString(),
          validFrom: body.validFrom || new Date().toISOString(),
          validUntil: body.validUntil || null,
          description: body.description,
          conditions: body.conditions,
          isActive: true,
          createdBy: adminId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .returning();

      // Notify all partners about new commission structure
      await partnerCommissionService.notifyAllPartners({
        type: 'CONFIG_CREATED',
        title: 'New Commission Structure Available',
        message: `A new commission structure has been created for ${body.operationType}. You will earn $${body.commissionAmountUsd} USD / ${body.commissionAmountCdf} CDF per operation.`,
        data: {
          operationType: body.operationType,
          amountUsd: body.commissionAmountUsd,
          amountCdf: body.commissionAmountCdf,
          validFrom: config.validFrom,
          validUntil: config.validUntil
        },
        configurationId: config.id
      });

      return reply.status(201).send({
        success: true,
        message: 'Commission configuration created successfully',
        data: config
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // Update commission configuration
  fastify.put('/api/v1/admin/commissions/:id', {
    preHandler: requireAdminAuth,
    schema: {
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
          commissionAmountUsd: { type: 'number', minimum: 0 },
          commissionAmountCdf: { type: 'number', minimum: 0 },
          commissionPercentage: { type: 'number', minimum: 0, maximum: 100 },
          validUntil: { type: 'string', format: 'date-time' },
          description: { type: 'string' },
          conditions: { type: 'object' },
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const body = request.body as any;

      // Get existing config
      const [existing] = await db
        .select()
        .from(commissionConfigurations)
        .where(eq(commissionConfigurations.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Commission configuration not found'
        });
      }

      // Update configuration
      const updates: any = {
        updatedAt: new Date().toISOString()
      };

      if (body.commissionAmountUsd !== undefined) updates.commissionAmountUsd = body.commissionAmountUsd.toString();
      if (body.commissionAmountCdf !== undefined) updates.commissionAmountCdf = body.commissionAmountCdf.toString();
      if (body.commissionPercentage !== undefined) updates.commissionPercentage = body.commissionPercentage.toString();
      if (body.validUntil !== undefined) updates.validUntil = body.validUntil;
      if (body.description !== undefined) updates.description = body.description;
      if (body.conditions !== undefined) updates.conditions = body.conditions;
      if (body.isActive !== undefined) updates.isActive = body.isActive;

      const [updated] = await db
        .update(commissionConfigurations)
        .set(updates)
        .where(eq(commissionConfigurations.id, id))
        .returning();

      // Notify all partners about commission update
      await partnerCommissionService.notifyAllPartners({
        type: 'CONFIG_UPDATED',
        title: 'Commission Structure Updated',
        message: `The commission structure for ${updated.operationType} has been updated. New rates: $${updated.commissionAmountUsd} USD / ${updated.commissionAmountCdf} CDF.`,
        data: {
          operationType: updated.operationType,
          oldAmountUsd: existing.commissionAmountUsd,
          oldAmountCdf: existing.commissionAmountCdf,
          newAmountUsd: updated.commissionAmountUsd,
          newAmountCdf: updated.commissionAmountCdf,
          validUntil: updated.validUntil
        },
        configurationId: updated.id
      });

      return reply.send({
        success: true,
        message: 'Commission configuration updated successfully',
        data: updated
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // Get all commission configurations (with filters)
  fastify.get('/api/v1/admin/commissions', {
    preHandler: requireAdminAuth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          operationType: { type: 'string' },
          isActive: { type: 'boolean' },
          includeExpired: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as {
        operationType?: string;
        isActive?: boolean;
        includeExpired?: boolean;
      };

      let dbQuery = db.select().from(commissionConfigurations).$dynamic();

      if (query.operationType) {
        dbQuery = dbQuery.where(eq(commissionConfigurations.operationType, query.operationType));
      }

      if (query.isActive !== undefined) {
        dbQuery = dbQuery.where(eq(commissionConfigurations.isActive, query.isActive));
      }

      // Filter out expired configs unless explicitly requested
      if (!query.includeExpired) {
        const now = new Date().toISOString();
        dbQuery = dbQuery.where(
          or(
            isNull(commissionConfigurations.validUntil),
            gte(commissionConfigurations.validUntil, now)
          )
        );
      }

      const configs = await dbQuery.orderBy(desc(commissionConfigurations.createdAt));

      return reply.send({
        success: true,
        data: configs,
        count: configs.length
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // Get specific commission configuration
  fastify.get('/api/v1/admin/commissions/:id', {
    preHandler: requireAdminAuth,
    schema: {
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

      const [config] = await db
        .select()
        .from(commissionConfigurations)
        .where(eq(commissionConfigurations.id, id))
        .limit(1);

      if (!config) {
        return reply.status(404).send({
          success: false,
          error: 'Commission configuration not found'
        });
      }

      return reply.send({
        success: true,
        data: config
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // Deactivate commission configuration
  fastify.delete('/api/v1/admin/commissions/:id', {
    preHandler: requireAdminAuth,
    schema: {
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

      const [config] = await db
        .update(commissionConfigurations)
        .set({
          isActive: false,
          updatedAt: new Date().toISOString()
        })
        .where(eq(commissionConfigurations.id, id))
        .returning();

      if (!config) {
        return reply.status(404).send({
          success: false,
          error: 'Commission configuration not found'
        });
      }

      // Notify partners about deactivation
      await partnerCommissionService.notifyAllPartners({
        type: 'CONFIG_EXPIRED',
        title: 'Commission Structure Deactivated',
        message: `The commission structure for ${config.operationType} has been deactivated.`,
        data: {
          operationType: config.operationType,
          amountUsd: config.commissionAmountUsd,
          amountCdf: config.commissionAmountCdf
        },
        configurationId: config.id
      });

      return reply.send({
        success: true,
        message: 'Commission configuration deactivated successfully',
        data: config
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // Get all currently active configurations
  fastify.get('/api/v1/admin/commissions/active', {
    preHandler: requireAdminAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const configs = await partnerCommissionService.getAllActiveConfigs();

      return reply.send({
        success: true,
        data: configs,
        count: configs.length
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // Manually expire a commission configuration
  fastify.post('/api/v1/admin/commissions/:id/expire', {
    preHandler: requireAdminAuth,
    schema: {
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

      const [config] = await db
        .update(commissionConfigurations)
        .set({
          validUntil: new Date().toISOString(),
          isActive: false,
          updatedAt: new Date().toISOString()
        })
        .where(eq(commissionConfigurations.id, id))
        .returning();

      if (!config) {
        return reply.status(404).send({
          success: false,
          error: 'Commission configuration not found'
        });
      }

      // Notify partners
      await partnerCommissionService.notifyAllPartners({
        type: 'CONFIG_EXPIRED',
        title: 'Commission Structure Expired',
        message: `The commission structure for ${config.operationType} has expired.`,
        data: {
          operationType: config.operationType,
          expiredAt: config.validUntil
        },
        configurationId: config.id
      });

      return reply.send({
        success: true,
        message: 'Commission configuration expired successfully',
        data: config
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  console.log('[Routes] Commission admin routes registered');
}
