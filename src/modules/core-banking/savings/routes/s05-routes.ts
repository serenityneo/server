/**
 * S05 BUAKISA CARTE API ROUTES
 * 
 * Routes pour épargne programmée avec périodicité flexible
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { S05BuakisaService, Periodicity } from '../services/s05-buakisa.service';
import { S05TerminationService } from '../services/s05-termination.service';

export async function registerS05Routes(fastify: FastifyInstance) {
  
  /**
   * Créer un compte d'épargne S05
   * POST /api/v1/savings/s05/create
   */
  fastify.post('/api/v1/savings/s05/create', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { 
        customerId, 
        periodicity, 
        targetAmountCdf = 0, 
        targetAmountUsd = 0, 
        numberOfPeriods 
      } = request.body as {
        customerId: number;
        periodicity: Periodicity;
        targetAmountCdf?: number;
        targetAmountUsd?: number;
        numberOfPeriods: number;
      };

      // Validation
      if (!customerId || !periodicity || !numberOfPeriods) {
        return reply.code(400).send({
          success: false,
          message: 'customerId, periodicity et numberOfPeriods requis',
        });
      }

      if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(periodicity)) {
        return reply.code(400).send({
          success: false,
          message: 'Périodicité invalide. Valeurs: DAILY, WEEKLY, MONTHLY, YEARLY',
        });
      }

      if (numberOfPeriods < 2) {
        return reply.code(400).send({
          success: false,
          message: 'Minimum 2 périodes requis',
        });
      }

      const result = await S05BuakisaService.createSavingsAccount({
        customerId,
        periodicity,
        targetAmountCdf,
        targetAmountUsd,
        numberOfPeriods,
      });

      return reply.code(201).send({
        success: true,
        data: result.savings,
        message: result.message,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: error.message || 'Erreur lors de la création du compte S05',
      });
    }
  });

  /**
   * Dépôt sur compte S05
   * POST /api/v1/savings/s05/deposit
   */
  fastify.post('/api/v1/savings/s05/deposit', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const {
        savingsId,
        customerId,
        amountCdf = 0,
        amountUsd = 0,
        currency,
        depositMethod,
        referenceNumber,
      } = request.body as {
        savingsId: number;
        customerId: number;
        amountCdf?: number;
        amountUsd?: number;
        currency: 'CDF' | 'USD';
        depositMethod?: string;
        referenceNumber?: string;
      };

      // Validation
      if (!savingsId || !customerId || !currency) {
        return reply.code(400).send({
          success: false,
          message: 'savingsId, customerId et currency requis',
        });
      }

      if (!['CDF', 'USD'].includes(currency)) {
        return reply.code(400).send({
          success: false,
          message: 'Devise invalide. Valeurs: CDF, USD',
        });
      }

      if (amountCdf <= 0 && amountUsd <= 0) {
        return reply.code(400).send({
          success: false,
          message: 'Montant doit être > 0',
        });
      }

      const result = await S05BuakisaService.depositToS05({
        savingsId,
        customerId,
        amountCdf,
        amountUsd,
        currency,
        depositMethod,
        referenceNumber,
      });

      return reply.code(200).send({
        success: true,
        data: {
          savings: result.savings,
          goesTo: result.goesTo,
          periodNumber: result.periodNumber,
        },
        message: result.message,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: error.message || 'Erreur lors du dépôt S05',
      });
    }
  });

  /**
   * Récupérer compte S05
   * GET /api/v1/savings/s05/:savingsId
   */
  fastify.get('/api/v1/savings/s05/:savingsId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { savingsId } = request.params as { savingsId: string };

      const savings = await S05BuakisaService.getSavingsAccount(parseInt(savingsId));

      if (!savings) {
        return reply.code(404).send({
          success: false,
          message: 'Compte épargne S05 non trouvé',
        });
      }

      return reply.code(200).send({
        success: true,
        data: savings,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: error.message || 'Erreur lors de la récupération du compte S05',
      });
    }
  });

  /**
   * Récupérer tous les comptes S05 d'un client
   * GET /api/v1/savings/s05/customer/:customerId
   */
  fastify.get('/api/v1/savings/s05/customer/:customerId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.params as { customerId: string };

      const savingsAccounts = await S05BuakisaService.getCustomerSavingsAccounts(parseInt(customerId));

      return reply.code(200).send({
        success: true,
        data: savingsAccounts,
        count: savingsAccounts.length,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: error.message || 'Erreur lors de la récupération des comptes S05',
      });
    }
  });

  /**
   * Récupérer historique dépôts S05
   * GET /api/v1/savings/s05/:savingsId/deposits
   */
  fastify.get('/api/v1/savings/s05/:savingsId/deposits', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { savingsId } = request.params as { savingsId: string };

      const deposits = await S05BuakisaService.getSavingsDeposits(parseInt(savingsId));

      return reply.code(200).send({
        success: true,
        data: deposits,
        count: deposits.length,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: error.message || 'Erreur lors de la récupération des dépôts',
      });
    }
  });

  /**
   * Récupérer tracking périodes
   * GET /api/v1/savings/s05/:savingsId/periods
   */
  fastify.get('/api/v1/savings/s05/:savingsId/periods', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { savingsId } = request.params as { savingsId: string };

      const periods = await S05BuakisaService.getPeriodTracking(parseInt(savingsId));

      return reply.code(200).send({
        success: true,
        data: periods,
        count: periods.length,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: error.message || 'Erreur lors de la récupération des périodes',
      });
    }
  });

  /**
   * Sortie anticipée avec pénalité 10%
   * POST /api/v1/savings/s05/early-termination
   */
  fastify.post('/api/v1/savings/s05/early-termination', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const {
        savingsId,
        customerId,
        reason,
        approvedBy,
      } = request.body as {
        savingsId: number;
        customerId: number;
        reason?: string;
        approvedBy?: number;
      };

      // Validation
      if (!savingsId || !customerId) {
        return reply.code(400).send({
          success: false,
          message: 'savingsId et customerId requis',
        });
      }

      const result = await S05TerminationService.earlyTermination({
        savingsId,
        customerId,
        reason,
        approvedBy,
      });

      return reply.code(200).send({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: error.message || 'Erreur lors de la sortie anticipée',
      });
    }
  });

  /**
   * Retrait à maturité (SANS pénalité)
   * POST /api/v1/savings/s05/withdraw-maturity
   */
  fastify.post('/api/v1/savings/s05/withdraw-maturity', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const {
        savingsId,
        customerId,
      } = request.body as {
        savingsId: number;
        customerId: number;
      };

      // Validation
      if (!savingsId || !customerId) {
        return reply.code(400).send({
          success: false,
          message: 'savingsId et customerId requis',
        });
      }

      const result = await S05TerminationService.withdrawAtMaturity({
        savingsId,
        customerId,
      });

      return reply.code(200).send({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: error.message || 'Erreur lors du retrait à maturité',
      });
    }
  });

  /**
   * ADMIN: Statistiques S05 allocation
   * GET /api/v1/savings/s05/admin/stats
   */
  fastify.get('/api/v1/savings/s05/admin/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { period, startDate, endDate, customerId } = request.query as {
        period?: 'MONTH' | 'QUARTER' | 'SEMESTER' | 'YEAR';
        startDate?: string;
        endDate?: string;
        customerId?: string;
      };

      // TODO: Implémenter statistiques admin
      // - Total allocations S05
      // - Total solde clients
      // - Nombre comptes actifs
      // - Taux de completion
      // - Par périodicité

      return reply.code(200).send({
        success: true,
        message: 'Statistiques admin S05 - À implémenter',
        data: {
          period,
          startDate,
          endDate,
          customerId,
        },
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: error.message || 'Erreur lors de la récupération des statistiques',
      });
    }
  });
}
