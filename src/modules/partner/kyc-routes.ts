/**
 * PARTNER KYC COMPLETION ROUTES
 * 
 * Endpoints for partners to complete KYC on behalf of customers
 * 
 * Flow:
 * 1. Partner searches for customer by CIF/Public ID/Phone
 * 2. Partner requests authorization to edit customer's KYC
 * 3. System checks if KYC is locked by another partner
 * 4. If available, grant authorization token (expires in 2 hours)
 * 5. Partner completes KYC data using the token
 * 6. Admin reviews and approves the completed KYC
 * 7. Customer is notified when KYC is completed
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../services/db';
import { customers } from '../../db/schema';
import { partnerKycCompletions } from '../../db/partner-operations-schema';
import { eq, and, or, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';

interface SearchCustomerRequest {
  Body: {
    partnerId: number;
    customerIdentifier: string; // CIF, Public ID, or Phone
  };
}

interface RequestAuthorizationRequest {
  Body: {
    partnerId: number;
    customerId: number;
    ipAddress: string;
    userAgent: string;
    deviceInfo: any;
  };
}

interface SubmitKYCDataRequest {
  Body: {
    authorizationToken: string;
    kycStep: number;
    kycData: any;
    documentsUploaded?: any[];
  };
}

interface GetCompletedKYCsRequest {
  Querystring: {
    partnerId: string;
    limit?: string;
    offset?: string;
  };
}

export default async function partnerKycRoutes(fastify: FastifyInstance) {
  
  // ============================================================================
  // 1. SEARCH CUSTOMER
  // ============================================================================
  fastify.post<SearchCustomerRequest>('/search-customer', async (request, reply) => {
    try {
      const { partnerId, customerIdentifier } = request.body;

      if (!customerIdentifier?.trim()) {
        return reply.status(400).send({
          success: false,
          error: 'Numéro client requis'
        });
      }

      const identifier = customerIdentifier.trim();

      // Search by CIF, Public ID, or Mobile Money Number
      const customer = await db
        .select()
        .from(customers)
        .where(
          or(
            eq(customers.cifCode, identifier),
            eq(customers.publicId, identifier),
            eq(customers.mobileMoneyNumber, identifier)
          )
        )
        .limit(1);

      if (!customer || customer.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Client non trouvé'
        });
      }

      const customerData = customer[0];

      // Check if customer is a member (not a partner)
      if (customerData.customerType === 'PARTNER') {
        return reply.status(400).send({
          success: false,
          error: 'Ce compte est un compte partenaire, pas un compte membre'
        });
      }

      // Return customer info
      return reply.send({
        success: true,
        data: {
          id: customerData.id,
          public_id: customerData.publicId,
          first_name: customerData.firstName,
          last_name: customerData.lastName,
          mobile_money_number: customerData.mobileMoneyNumber,
          kyc_status: customerData.kycStatus,
          kyc_step: customerData.kycStep,
          kyc_completed: customerData.kycCompleted,
          kyc_lock_step: customerData.kycLockStep
        }
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la recherche du client'
      });
    }
  });

  // ============================================================================
  // 2. REQUEST AUTHORIZATION
  // ============================================================================
  fastify.post<RequestAuthorizationRequest>('/request-authorization', async (request, reply) => {
    try {
      const { partnerId, customerId, ipAddress, userAgent, deviceInfo } = request.body;

      // Check if customer exists
      const customer = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer || customer.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Client non trouvé'
        });
      }

      const customerData = customer[0];

      // Check if KYC is already completed
      if (customerData.kycCompleted) {
        return reply.status(400).send({
          success: false,
          error: 'Le KYC de ce client est déjà complété et vérifié'
        });
      }

      // Check if KYC is locked by another partner
      const activeAuthorizations = await db
        .select()
        .from(partnerKycCompletions)
        .where(
          and(
            eq(partnerKycCompletions.customerId, customerId),
            eq(partnerKycCompletions.isLocked, true),
            sql`${partnerKycCompletions.lockedUntil} > CURRENT_TIMESTAMP`
          )
        )
        .limit(1);

      if (activeAuthorizations.length > 0) {
        const lock = activeAuthorizations[0];
        
        // Check if it's locked by a different partner
        if (lock.partnerId !== partnerId) {
          return reply.status(423).send({ // 423 Locked
            success: false,
            error: 'Ce KYC est actuellement en cours de modification par un autre partenaire',
            locked_by_partner_id: lock.partnerId,
            locked_until: lock.lockedUntil
          });
        }
      }

      // Generate authorization token
      const authToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

      // Determine which step to complete
      const stepToComplete = (customerData.kycStep || 0) + 1;

      if (stepToComplete > 4) {
        return reply.status(400).send({
          success: false,
          error: 'Toutes les étapes KYC sont déjà complétées'
        });
      }

      // Create authorization session
      const authSession = await db
        .insert(partnerKycCompletions)
        .values({
          partnerId,
          customerId,
          authorizationStatus: 'GRANTED',
          authorizationToken: authToken,
          authorizationGrantedAt: new Date().toISOString(),
          authorizationExpiresAt: expiresAt.toISOString(),
          kycStepCompleted: stepToComplete,
          completionStatus: 'NOT_STARTED',
          isLocked: true,
          lockedUntil: expiresAt.toISOString(),
          lockReason: 'KYC completion in progress',
          partnerIpAddress: ipAddress,
          partnerUserAgent: userAgent,
          partnerDeviceInfo: deviceInfo,
        })
        .returning();

      // Update customer's kyc_lock_step
      await db
        .update(customers)
        .set({
          kycLockStep: `STEP${stepToComplete}` as any,
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, customerId));

      return reply.send({
        success: true,
        message: 'Autorisation accordée',
        data: {
          authorization_token: authToken,
          expires_at: expiresAt.toISOString(),
          customer: {
            id: customerData.id,
            public_id: customerData.publicId,
            first_name: customerData.firstName,
            last_name: customerData.lastName,
            kyc_step: customerData.kycStep
          },
          step_to_complete: stepToComplete
        }
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la demande d\'autorisation'
      });
    }
  });

  // ============================================================================
  // 3. SUBMIT KYC DATA
  // ============================================================================
  fastify.post<SubmitKYCDataRequest>('/submit-data', async (request, reply) => {
    try {
      const { authorizationToken, kycStep, kycData, documentsUploaded } = request.body;

      // Verify authorization token
      const authSession = await db
        .select()
        .from(partnerKycCompletions)
        .where(eq(partnerKycCompletions.authorizationToken, authorizationToken))
        .limit(1);

      if (!authSession || authSession.length === 0) {
        return reply.status(401).send({
          success: false,
          error: 'Token d\'autorisation invalide'
        });
      }

      const session = authSession[0];

      // Check if token is expired
      if (new Date(session.authorizationExpiresAt!) < new Date()) {
        return reply.status(401).send({
          success: false,
          error: 'Token d\'autorisation expiré'
        });
      }

      // Check if authorization is still granted
      if (session.authorizationStatus !== 'GRANTED') {
        return reply.status(401).send({
          success: false,
          error: 'Autorisation révoquée'
        });
      }

      // Update session with KYC data
      await db
        .update(partnerKycCompletions)
        .set({
          completionStatus: 'COMPLETED',
          completionFinishedAt: new Date().toISOString(),
          dataFilled: kycData,
          documentsUploaded: documentsUploaded || [],
          reviewStatus: 'PENDING_REVIEW',
          isLocked: false, // Unlock after completion
          updatedAt: new Date().toISOString()
        })
        .where(eq(partnerKycCompletions.id, session.id));

      // Update customer's KYC step
      await db
        .update(customers)
        .set({
          kycStep: kycStep,
          kycLockStep: 'NONE',
          kycStatus: 'KYC1_UNDER_REVIEW',
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, session.customerId));

      // TODO: Send notification to customer
      // TODO: Notify admin for review

      return reply.send({
        success: true,
        message: 'KYC complété avec succès. En attente de révision par l\'admin',
        data: {
          session_id: session.id,
          review_status: 'PENDING_REVIEW'
        }
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la soumission des données KYC'
      });
    }
  });

  // ============================================================================
  // 4. GET COMPLETED KYCs (by partner)
  // ============================================================================
  fastify.get<GetCompletedKYCsRequest>('/completed', async (request, reply) => {
    try {
      const { partnerId, limit = '10', offset = '0' } = request.query;

      const completedKYCs = await db
        .select({
          id: partnerKycCompletions.id,
          customer_id: partnerKycCompletions.customerId,
          customer_name: sql<string>`CONCAT(${customers.firstName}, ' ', ${customers.lastName})`,
          kyc_step_completed: partnerKycCompletions.kycStepCompleted,
          completion_finished_at: partnerKycCompletions.completionFinishedAt,
          review_status: partnerKycCompletions.reviewStatus,
          reviewed_at: partnerKycCompletions.reviewedAt,
          completion_status: partnerKycCompletions.completionStatus
        })
        .from(partnerKycCompletions)
        .leftJoin(customers, eq(partnerKycCompletions.customerId, customers.id))
        .where(eq(partnerKycCompletions.partnerId, parseInt(partnerId)))
        .orderBy(desc(partnerKycCompletions.completionFinishedAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      return reply.send({
        success: true,
        data: completedKYCs
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des KYC complétés'
      });
    }
  });

  // ============================================================================
  // 5. UNLOCK KYC (for admins - in case partner abandons)
  // ============================================================================
  fastify.post('/unlock-kyc', async (request, reply) => {
    try {
      const { customerId, adminId } = request.body as { customerId: number; adminId: number };

      // Find active lock
      const activeLock = await db
        .select()
        .from(partnerKycCompletions)
        .where(
          and(
            eq(partnerKycCompletions.customerId, customerId),
            eq(partnerKycCompletions.isLocked, true)
          )
        )
        .limit(1);

      if (!activeLock || activeLock.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Aucun verrouillage actif trouvé pour ce client'
        });
      }

      // Unlock
      await db
        .update(partnerKycCompletions)
        .set({
          isLocked: false,
          lockReason: `Unlocked by admin ${adminId}`,
          authorizationStatus: 'REVOKED',
          updatedAt: new Date().toISOString()
        })
        .where(eq(partnerKycCompletions.id, activeLock[0].id));

      // Update customer
      await db
        .update(customers)
        .set({
          kycLockStep: 'NONE',
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, customerId));

      return reply.send({
        success: true,
        message: 'KYC déverrouillé avec succès'
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors du déverrouillage du KYC'
      });
    }
  });
}
