/**
 * S04 ALLOCATION ROUTES
 * 
 * Endpoints Fastify pour gérer le système d'allocation S04:
 * - Demande de crédit avec allocation automatique
 * - Remboursement avec distribution intelligente
 * - Vérification whitelist/blacklist
 * - Consultation soldes et historique
 * 
 * IMPORTANT: Toutes opérations S04 sont GRATUITES ($0)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CreditEligibilityService } from '../services/eligibility.service';

export default async function s04AllocationRoutes(fastify: FastifyInstance) {
  
  /**
   * POST /credit/s04/request
   * Demander un nouveau crédit avec allocation automatique
   */
  fastify.post('/s04/request', {
    schema: {
      tags: ['Credit', 'S04 Allocation'],
      summary: 'Demander un crédit S04',
      description: 'Crée compte S04 + allocation. Prélève frais automatiquement. Vérifie whitelist.',
      body: {
        type: 'object',
        required: ['customerId', 'requestedAmount', 'currency'],
        properties: {
          customerId: { type: 'number' },
          requestedAmount: { type: 'number', minimum: 10 },
          currency: { type: 'string', enum: ['CDF', 'USD'] },
          creditType: { type: 'string', default: 'VIMBISA' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, requestedAmount, currency, creditType } = request.body as {
        customerId: number;
        requestedAmount: number;
        currency: 'CDF' | 'USD';
        creditType?: string;
      };

      fastify.log.info(`[S04 Request] Customer ${customerId} requesting ${requestedAmount} ${currency}`);

      // TODO: Implémenter après intégration schema
      // 1. Vérifier éligibilité (whitelist, score)
      // 2. Calculer solde S04 existant
      // 3. Créer crédit + allocation
      // 4. Retourner résumé

      return reply.status(501).send({
        success: false,
        error: 'Service en cours d\'implémentation - Schema DB en attente',
        message: 'Les tables S04 seront créées lors de la migration',
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to process S04 credit request');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Erreur lors de la demande de crédit',
      });
    }
  });

  /**
   * POST /credit/s04/repay
   * Rembourser un crédit S04
   */
  fastify.post('/s04/repay', {
    schema: {
      tags: ['Credit', 'S04 Allocation'],
      summary: 'Rembourser un crédit S04',
      description: 'Distribution automatique: dette → allocation → solde S04',
      body: {
        type: 'object',
        required: ['allocationId', 'repaymentAmount', 'currency'],
        properties: {
          allocationId: { type: 'number' },
          repaymentAmount: { type: 'number', minimum: 0.01 },
          currency: { type: 'string', enum: ['CDF', 'USD'] },
          paymentMethod: { type: 'string' },
          referenceNumber: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { allocationId, repaymentAmount, currency, paymentMethod, referenceNumber } = request.body as {
        allocationId: number;
        repaymentAmount: number;
        currency: 'CDF' | 'USD';
        paymentMethod?: string;
        referenceNumber?: string;
      };

      fastify.log.info(`[S04 Repay] Allocation ${allocationId} repaying ${repaymentAmount} ${currency}`);

      // TODO: Implémenter après intégration schema
      // 1. Valider allocation existe
      // 2. Traiter remboursement (AllocationService.processRepayment)
      // 3. Mettre à jour stats crédit
      // 4. Vérifier si auto-whitelist
      // 5. Retourner résumé

      return reply.status(501).send({
        success: false,
        error: 'Service en cours d\'implémentation',
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to process S04 repayment');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Erreur lors du remboursement',
      });
    }
  });

  /**
   * GET /credit/s04/status/:customerId
   * Vérifier statut crédit (whitelist/blacklist)
   */
  fastify.get('/s04/status/:customerId', {
    schema: {
      tags: ['Credit', 'S04 Allocation'],
      summary: 'Vérifier statut crédit client',
      description: 'Retourne le statut d\'éligibilité, score crédit, limites et détails du client',
      params: {
        type: 'object',
        properties: {
          customerId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            eligibility: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerIdNum = parseInt((request.params as any).customerId, 10);

      if (isNaN(customerIdNum)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid customer ID format',
        });
      }

      fastify.log.info(`[S04 Status] Checking credit status for customer ${customerIdNum}`);

      // Get customer eligibility details
      const eligibility = await CreditEligibilityService.getCustomerEligibility(customerIdNum);

      const maxCreditLimit = parseFloat(eligibility.maxCreditLimit);
      const currentCreditUsed = parseFloat(eligibility.currentCreditUsed);
      const availableCredit = maxCreditLimit - currentCreditUsed;

      return reply.send({
        success: true,
        eligibility: {
          customerId: customerIdNum,
          eligibilityStatus: eligibility.eligibilityStatus,
          creditScore: eligibility.creditScore,
          maxCreditLimit,
          currentCreditUsed,
          availableCredit,
          totalOutstandingDebt: eligibility.totalOutstandingDebt,
          activeLoans: eligibility.activeLoans,
          totalLoansCompleted: eligibility.totalLoansCompleted,
          totalLoansDefaulted: eligibility.totalLoansDefaulted,
          onTimeRepaymentRate: parseFloat(eligibility.onTimeRepaymentRate),
          blacklistReason: eligibility.blacklistReason,
          whitelistReason: eligibility.whitelistReason,
          lastReviewDate: eligibility.lastReviewDate,
        },
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to fetch credit status');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Erreur lors de la récupération du statut crédit',
      });
    }
  });

  /**
   * GET /credit/s04/allocation/:creditId
   * Récupérer détails allocation d'un crédit
   */
  fastify.get('/s04/allocation/:creditId', {
    schema: {
      tags: ['Credit', 'S04 Allocation'],
      summary: 'Détails allocation crédit',
      params: {
        type: 'object',
        properties: {
          creditId: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { creditId } = request.params as { creditId: string };

      // TODO: Implémenter
      // 1. Get allocation
      // 2. Get repayment history
      // 3. Calculate summary

      return reply.status(501).send({
        success: false,
        error: 'Service en cours d\'implémentation',
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to fetch allocation');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /credit/s04/blacklist
   * Blacklister un client (Admin only)
   */
  fastify.post('/s04/blacklist', {
    schema: {
      tags: ['Credit', 'S04 Allocation', 'Admin'],
      summary: 'Blacklister un client',
      body: {
        type: 'object',
        required: ['customerId', 'reason'],
        properties: {
          customerId: { type: 'number' },
          reason: { type: 'string' },
          changedBy: { type: 'number' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, reason, changedBy } = request.body as {
        customerId: number;
        reason: string;
        changedBy?: number;
      };

      // TODO: Implémenter
      // 1. Verify admin permissions
      // 2. Update status to BLACKLISTED
      // 3. Log in history

      return reply.status(501).send({
        success: false,
        error: 'Service en cours d\'implémentation',
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to blacklist customer');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /credit/s04/whitelist
   * Retirer client de la blacklist (Admin only)
   */
  fastify.post('/s04/whitelist', {
    schema: {
      tags: ['Credit', 'S04 Allocation', 'Admin'],
      summary: 'Whitelister un client',
      body: {
        type: 'object',
        required: ['customerId', 'reason'],
        properties: {
          customerId: { type: 'number' },
          reason: { type: 'string' },
          changedBy: { type: 'number' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, reason, changedBy } = request.body as {
        customerId: number;
        reason: string;
        changedBy?: number;
      };

      // TODO: Implémenter
      // 1. Verify admin permissions
      // 2. Update status to WHITELISTED
      // 3. Log in history

      return reply.status(501).send({
        success: false,
        error: 'Service en cours d\'implémentation',
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to whitelist customer');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /credit/s04/blacklist
   * Liste des clients blacklistés (Admin only)
   */
  fastify.get('/s04/blacklist', {
    schema: {
      tags: ['Credit', 'S04 Allocation', 'Admin'],
      summary: 'Liste clients blacklistés',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // TODO: Implémenter
      // 1. Verify admin permissions
      // 2. Get blacklisted customers
      // 3. Return list with details

      return reply.status(501).send({
        success: false,
        error: 'Service en cours d\'implémentation',
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to fetch blacklist');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  fastify.log.info('✅ S04 Allocation routes registered (stub mode - awaiting schema integration)');
}
