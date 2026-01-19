import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { partnerCommissionService } from '../services/partner-commission.service';
import { db } from '../../../db';
import { customers } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Partner Commission Routes
 * 
 * Endpoints for partners to view their commissions, history, and notifications
 * 
 * - GET /api/v1/partner/commissions/summary - Get commission summary (total, pending, paid)
 * - GET /api/v1/partner/commissions/history - Get commission history with filters
 * - GET /api/v1/partner/commissions/evolution - Get commission evolution data for charts
 * - GET /api/v1/partner/commissions/notifications - Get commission notifications
 * - POST /api/v1/partner/commissions/notifications/:id/read - Mark notification as read
 * - GET /api/v1/partner/commissions/rates - Get current commission rates
 */

/**
 * Security helper - Handle errors safely (BANKING SECURITY)
 */
function handleError(request: FastifyRequest, reply: FastifyReply, error: unknown, statusCode: number = 500) {
  request.log.error({ err: error }, 'Partner commission error');
  reply.status(statusCode).send({
    success: false,
    error: 'Une erreur est survenue. Veuillez réessayer.'
  });
}

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

export async function partnerCommissionRoutes(fastify: FastifyInstance) {
  // Get commission summary
  fastify.get('/api/v1/partner/commissions/summary', {
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

      const summary = await partnerCommissionService.getPartnerSummary(partnerId);

      return reply.send({
        success: true,
        data: summary
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // Get commission history with filters
  fastify.get('/api/v1/partner/commissions/history', {
    preHandler: requirePartnerAuth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          status: { 
            type: 'string',
            enum: ['PENDING', 'APPROVED', 'PAID', 'CANCELLED']
          },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          offset: { type: 'number', minimum: 0 }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;
      const query = request.query as {
        status?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        offset?: number;
      };

      const history = await partnerCommissionService.getPartnerHistory(partnerId, {
        status: query.status,
        startDate: query.startDate,
        endDate: query.endDate,
        limit: query.limit || 50,
        offset: query.offset || 0
      });

      return reply.send({
        success: true,
        data: history,
        count: history.length
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // Get commission evolution for charts
  fastify.get('/api/v1/partner/commissions/evolution', {
    preHandler: requirePartnerAuth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          months: { type: 'number', minimum: 1, maximum: 24 }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;
      const query = request.query as {
        months?: number;
      };

      const evolution = await partnerCommissionService.getCommissionEvolution(
        partnerId,
        query.months || 12
      );

      return reply.send({
        success: true,
        data: evolution
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // Get commission notifications
  fastify.get('/api/v1/partner/commissions/notifications', {
    preHandler: requirePartnerAuth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          unreadOnly: { type: 'boolean' },
          limit: { type: 'number', minimum: 1, maximum: 100 }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;
      const query = request.query as {
        unreadOnly?: boolean;
        limit?: number;
      };

      const notifications = await partnerCommissionService.getPartnerNotifications(partnerId, {
        unreadOnly: query.unreadOnly,
        limit: query.limit || 50
      });

      return reply.send({
        success: true,
        data: notifications,
        count: notifications.length
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // Mark notification as read
  fastify.post('/api/v1/partner/commissions/notifications/:id/read', {
    preHandler: requirePartnerAuth,
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
          customerId: { type: 'number' }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      await partnerCommissionService.markNotificationRead(id);

      return reply.send({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  // Get current commission rates (what partner will earn for each operation)
  fastify.get('/api/v1/partner/commissions/rates', {
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
      const configs = await partnerCommissionService.getAllActiveConfigs();

      // Transform to user-friendly format
      const rates = configs.map(config => ({
        operationType: config.operationType,
        usd: parseFloat(config.commissionAmountUsd),
        cdf: parseFloat(config.commissionAmountCdf),
        percentage: config.commissionPercentage ? parseFloat(config.commissionPercentage) : null,
        description: config.description,
        validUntil: config.validUntil
      }));

      return reply.send({
        success: true,
        data: rates
      });
    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  console.log('[Routes] Partner commission routes registered');
}
