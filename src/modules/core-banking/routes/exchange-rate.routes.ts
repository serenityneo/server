/**
 * Exchange Rate Routes
 * 
 * Routes pour la gestion des taux de change par l'admin
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { exchangeRateService } from '../services/exchange-rate.service';
import { handleDatabaseError } from '../../../utils/database-error-handler';

interface ConvertBody {
  amount: number;
  from: 'USD' | 'CDF';
  to: 'USD' | 'CDF';
}

interface UpdateRateBody {
  rate: number;
  userId?: number; // ID de l'admin qui modifie le taux
}

export async function exchangeRateRoutes(fastify: FastifyInstance) {
  
  /**
   * GET /exchange-rate/current
   * Récupérer le taux de change actuel (accessible à tous)
   */
  fastify.get('/current', {
    schema: {
      description: 'Récupérer le taux de change actuel USD <-> CDF',
      tags: ['Exchange Rate'],
      response: {
        200: {
          type: 'object',
          properties: {
            usdToCdf: { type: 'number', description: '1 USD = X CDF' },
            cdfToUsd: { type: 'number', description: '1 CDF = X USD' },
            updatedAt: { type: 'string', format: 'date-time' },
            updatedBy: { type: 'number', nullable: true },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const rate = await exchangeRateService.getCurrentRate();
      return reply.send(rate);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * GET /exchange-rate/stats
   * Récupérer les statistiques du taux (accessible à tous)
   */
  fastify.get('/stats', {
    schema: {
      description: 'Récupérer les statistiques du taux de change',
      tags: ['Exchange Rate'],
      response: {
        200: {
          type: 'object',
          properties: {
            current: { type: 'number' },
            lowest24h: { type: 'number', nullable: true },
            highest24h: { type: 'number', nullable: true },
            average24h: { type: 'number', nullable: true },
            lastUpdate: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await exchangeRateService.getExchangeRateStats();
      return reply.send(stats);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * GET /exchange-rate/history
   * Récupérer l'historique des modifications (accessible à tous)
   */
  fastify.get('/history', {
    schema: {
      description: 'Récupérer l\'historique des modifications de taux',
      tags: ['Exchange Rate'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rate: { type: 'number' },
              timestamp: { type: 'string', format: 'date-time' },
              updatedBy: { type: 'number', nullable: true },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const history = await exchangeRateService.getExchangeRateHistory();
      return reply.send(history);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * GET /exchange-rate/audit
   * Récupérer l'historique d'audit bancaire complet (ADMIN uniquement)
   */
  fastify.get('/audit', {
    schema: {
      description: 'Récupérer l\'historique d\'audit bancaire complet',
      tags: ['Exchange Rate', 'Audit'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 100, minimum: 1, maximum: 1000 },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              oldRate: { type: 'number', nullable: true },
              newRate: { type: 'number' },
              changedBy: { type: 'number' },
              changedByEmail: { type: 'string', nullable: true },
              changedByRole: { type: 'string', nullable: true },
              changeReason: { type: 'string', nullable: true },
              ipAddress: { type: 'string', nullable: true },
              userAgent: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    // TODO: Ajouter middleware d'authentification admin
    // preHandler: [fastify.authenticate, fastify.authorizeAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = 100 } = request.query as { limit?: number };
      const audit = await exchangeRateService.getAuditHistory(limit);
      return reply.send(audit);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * POST /exchange-rate/convert
   * Convertir un montant (accessible à tous)
   */
  fastify.post('/convert', {
    schema: {
      description: 'Convertir un montant entre USD et CDF',
      tags: ['Exchange Rate'],
      body: {
        type: 'object',
        required: ['amount', 'from', 'to'],
        properties: {
          amount: { type: 'number' },
          from: { type: 'string', enum: ['USD', 'CDF'] },
          to: { type: 'string', enum: ['USD', 'CDF'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            amount: { type: 'number' },
            from: { type: 'string' },
            to: { type: 'string' },
            result: { type: 'number' },
            rate: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { amount, from, to } = (request.body as ConvertBody);

      if (from === to) {
        return reply.send({
          amount,
          from,
          to,
          result: amount,
          rate: 1,
        });
      }

      let result: number;
      let rate: number;

      if (from === 'USD' && to === 'CDF') {
        result = await exchangeRateService.convertUsdToCdf(amount);
        const currentRate = await exchangeRateService.getCurrentRate();
        rate = currentRate.usdToCdf;
      } else {
        result = await exchangeRateService.convertCdfToUsd(amount);
        const currentRate = await exchangeRateService.getCurrentRate();
        rate = currentRate.cdfToUsd;
      }

      return reply.send({
        amount,
        from,
        to,
        result,
        rate,
      });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * PUT /exchange-rate/update
   * Mettre à jour le taux (ADMIN UNIQUEMENT)
   */
  fastify.put('/update', {
    schema: {
      description: 'Mettre à jour le taux de change (Admin uniquement)',
      tags: ['Exchange Rate'],
      body: {
        type: 'object',
        required: ['rate'],
        properties: {
          rate: { 
            type: 'number',
            description: 'Nouveau taux USD -> CDF (ex: 2850 pour 1 USD = 2850 CDF)',
            minimum: 1,
          },
          userId: {
            type: 'number',
            description: 'ID de l\'admin qui modifie le taux',
          },
          metadata: {
            type: 'object',
            description: 'Métadonnées pour audit (email, role, IP, userAgent)',
            properties: {
              email: { type: 'string' },
              role: { type: 'string' },
              ipAddress: { type: 'string' },
              userAgent: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            rate: { type: 'number' },
          },
        },
      },
    },
    // TODO: Ajouter middleware d'authentification admin
    // preHandler: [fastify.authenticate, fastify.authorizeAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { rate, userId, metadata } = (request.body as UpdateRateBody & { metadata?: any });
      
      // Log pour audit de sécurité bancaire
      if (userId) {
        console.log(`[AUDIT] Exchange rate update by user ${userId} (${metadata?.email || 'unknown'}) from IP ${metadata?.ipAddress || 'unknown'}: 1 USD = ${rate} CDF`);
      } else {
        console.log(`[WARNING] Exchange rate update without userId: 1 USD = ${rate} CDF`);
      }

      await exchangeRateService.setExchangeRate(rate, userId, metadata);

      return reply.send({
        success: true,
        message: `Taux de change mis à jour: 1 USD = ${rate} CDF`,
        rate,
      });
    } catch (error: any) {
      // SECURITY: Never expose SQL queries or internal errors to client
      const safeError = handleDatabaseError(error);
      console.error('[Exchange Rate Update] Error:', error); // Log complet serveur
      return reply.status(400).send(safeError); // Message sécurisé client
    }
  });
}
