/**
 * KYC CONDITIONAL ROUTES
 * Routes pour logique KYC conditionnelle (business profiles)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { KYCConditionalService } from '../kyc-conditional.service';

export function registerKycConditionalRoutes(app: FastifyInstance) {
  /**
   * GET /kyc/requirements/:customerId
   * Get KYC requirements for customer
   */
  app.get('/kyc/requirements/:customerId', {
    schema: {
      tags: ['KYC'],
      summary: 'Get KYC requirements based on customer profile',
      params: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
        },
        required: ['customerId'],
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.params as { customerId: number };

      const requirements = await KYCConditionalService.getKYCRequirements(Number(customerId));

      return reply.send({
        success: true,
        data: requirements,
      });
    } catch (error: any) {
      console.error('[KYC] Error fetching requirements:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Erreur lors de la récupération des exigences KYC',
      });
    }
  });

  /**
   * POST /kyc/can-proceed
   * Check if customer can proceed to specific KYC step
   */
  app.post('/kyc/can-proceed', {
    schema: {
      tags: ['KYC'],
      summary: 'Check if customer can proceed to KYC step',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          targetStep: { type: 'string', enum: ['KYC1', 'KYC2', 'BUSINESS_KYC'] },
        },
        required: ['customerId', 'targetStep'],
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, targetStep } = request.body as {
        customerId: number;
        targetStep: 'KYC1' | 'KYC2' | 'BUSINESS_KYC';
      };

      const result = await KYCConditionalService.canProceedToStep(customerId, targetStep);

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('[KYC] Error checking step eligibility:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Erreur lors de la vérification',
      });
    }
  });

  /**
   * POST /kyc/business/complete
   * Complete business KYC
   */
  app.post('/kyc/business/complete', {
    schema: {
      tags: ['KYC'],
      summary: 'Complete business KYC and upgrade to GOLD',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          documents: { type: 'object' },
        },
        required: ['customerId', 'documents'],
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, documents } = request.body as {
        customerId: number;
        documents: Record<string, string>;
      };

      await KYCConditionalService.completeBusinessKYC(customerId, documents);

      return reply.send({
        success: true,
        message: 'Business KYC complété - Client upgradé GOLD',
      });
    } catch (error: any) {
      console.error('[KYC] Error completing business KYC:', error);
      return reply.status(400).send({
        success: false,
        error: error.message || 'Erreur lors de la complétion Business KYC',
      });
    }
  });

  /**
   * GET /kyc/business/document-requirements
   * Get business document requirements
   */
  app.get('/kyc/business/document-requirements', {
    schema: {
      tags: ['KYC'],
      summary: 'Get business document requirements by type',
      querystring: {
        type: 'object',
        properties: {
          businessType: { type: 'string' },
        },
        required: ['businessType'],
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { businessType } = request.query as { businessType: string };

      const requirements = KYCConditionalService.getBusinessDocumentRequirements(businessType);

      return reply.send({
        success: true,
        data: requirements,
      });
    } catch (error: any) {
      console.error('[KYC] Error fetching document requirements:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des exigences',
      });
    }
  });
}
