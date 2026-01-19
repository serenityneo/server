/**
 * ADMIN ROUTES FOR PARTNER KYC MANAGEMENT
 * 
 * Admin endpoints to:
 * - Review KYC completed by partners
 * - Approve/Reject partner-completed KYC
 * - Unlock KYC if partner abandoned
 * - View audit trail
 */

import { FastifyInstance } from 'fastify';
import { db } from '../../services/db';
import { customers } from '../../db/schema';
import { partnerKycCompletions } from '../../db/partner-operations-schema';
import { eq, and, or, desc, sql } from 'drizzle-orm';
import { resendEmailService } from '../../services/resend-email.service';

interface ReviewKYCBody {
  Body: {
    sessionId: number;
    adminId: number;
    action: 'APPROVE' | 'REJECT';
    reviewNotes?: string;
    rejectionReason?: string;
  };
}

interface GetPendingReviewsQuery {
  Querystring: {
    limit?: string;
    offset?: string;
    partnerId?: string;
    customerId?: string;
  };
}

export default async function adminPartnerKycRoutes(fastify: FastifyInstance) {

  // ============================================================================
  // 1. GET PENDING KYC REVIEWS
  // ============================================================================
  fastify.get<GetPendingReviewsQuery>('/pending-reviews', async (request, reply) => {
    try {
      const { limit = '20', offset = '0', partnerId, customerId } = request.query;

      let query = db
        .select({
          id: partnerKycCompletions.id,
          partner_id: partnerKycCompletions.partnerId,
          customer_id: partnerKycCompletions.customerId,
          kyc_step_completed: partnerKycCompletions.kycStepCompleted,
          completion_finished_at: partnerKycCompletions.completionFinishedAt,
          data_filled: partnerKycCompletions.dataFilled,
          documents_uploaded: partnerKycCompletions.documentsUploaded,
          review_status: partnerKycCompletions.reviewStatus,
          partner_ip_address: partnerKycCompletions.partnerIpAddress,
          application_source: partnerKycCompletions.applicationSource,
          created_at: partnerKycCompletions.createdAt,
          partner_name: sql<string>`CONCAT(p.first_name, ' ', p.last_name)`,
          customer_name: sql<string>`CONCAT(c.first_name, ' ', c.last_name)`,
          customer_public_id: sql<string>`c.public_id`,
        })
        .from(partnerKycCompletions)
        .leftJoin(
          sql`customers AS p`,
          sql`p.id = ${partnerKycCompletions.partnerId}`
        )
        .leftJoin(
          sql`customers AS c`,
          sql`c.id = ${partnerKycCompletions.customerId}`
        )
        .$dynamic();

      const conditions = [eq(partnerKycCompletions.reviewStatus, 'PENDING_REVIEW')];

      if (partnerId) {
        conditions.push(eq(partnerKycCompletions.partnerId, parseInt(partnerId)));
      }
      if (customerId) {
        conditions.push(eq(partnerKycCompletions.customerId, parseInt(customerId)));
      }

      const pendingReviews = await query
        .where(and(...conditions))
        .orderBy(desc(partnerKycCompletions.completionFinishedAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      return reply.send({
        success: true,
        data: pendingReviews
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des révisions en attente'
      });
    }
  });

  // ============================================================================
  // 2. REVIEW KYC (Approve/Reject)
  // ============================================================================
  fastify.post<ReviewKYCBody>('/review-kyc', async (request, reply) => {
    try {
      const { sessionId, adminId, action, reviewNotes, rejectionReason } = request.body;

      // Get the KYC completion session
      const session = await db
        .select()
        .from(partnerKycCompletions)
        .where(eq(partnerKycCompletions.id, sessionId))
        .limit(1);

      if (!session || session.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Session KYC non trouvée'
        });
      }

      const kycSession = session[0];

      if (kycSession.reviewStatus !== 'PENDING_REVIEW') {
        return reply.status(400).send({
          success: false,
          error: 'Cette session KYC a déjà été révisée'
        });
      }

      // Update the review status
      await db
        .update(partnerKycCompletions)
        .set({
          reviewStatus: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          reviewedByAdminId: adminId,
          reviewedAt: new Date().toISOString(),
          reviewNotes,
          rejectionReason: action === 'REJECT' ? rejectionReason : null,
          updatedAt: new Date().toISOString()
        })
        .where(eq(partnerKycCompletions.id, sessionId));

      if (action === 'APPROVE') {
        // Update customer KYC status
        const currentStep = kycSession.kycStepCompleted || 0;
        const isKYC1Complete = currentStep >= 4;

        await db
          .update(customers)
          .set({
            kycStep: currentStep,
            kycStatus: isKYC1Complete ? 'KYC1_COMPLETED' : 'KYC1_PENDING',
            kycCompleted: isKYC1Complete,
            kyc1CompletionDate: isKYC1Complete ? new Date().toISOString() : null,
            validatedByUserId: adminId,
            updatedAt: new Date().toISOString()
          })
          .where(eq(customers.id, kycSession.customerId));

        // Mark customer as notified (placeholder - actual notification would be sent here)
        await db
          .update(partnerKycCompletions)
          .set({
            customerNotified: true,
            customerNotifiedAt: new Date().toISOString(),
            notificationMethod: 'EMAIL'
          })
          .where(eq(partnerKycCompletions.id, sessionId));

        // ✅ SERENITY NEO: WELCOME PARTNER EMAIL (Async)
        // Fetch partner email
        db.select({ email: customers.email, firstName: customers.firstName })
          .from(customers)
          .where(eq(customers.id, kycSession.customerId))
          .limit(1)
          .then(([customer]) => {
            if (customer?.email) {
              resendEmailService.sendWelcomePartner(customer.email, customer.firstName)
                .catch(err => console.error('[ReviewKYC] Failed to send partner welcome email:', err));
            }
          }).catch(err => console.error('[ReviewKYC] Failed to fetch customer for email:', err));
      } else {
        // If rejected, update customer status back
        await db
          .update(customers)
          .set({
            kycStatus: 'KYC1_REJECTED',
            rejectedByUserId: adminId,
            rejectionReason,
            rejectionNotes: reviewNotes,
            updatedAt: new Date().toISOString()
          })
          .where(eq(customers.id, kycSession.customerId));
      }

      return reply.send({
        success: true,
        message: action === 'APPROVE'
          ? 'KYC approuvé avec succès. Client notifié.'
          : 'KYC rejeté. Client notifié.',
        data: {
          session_id: sessionId,
          action,
          customer_id: kycSession.customerId
        }
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la révision du KYC'
      });
    }
  });

  // ============================================================================
  // 3. GET ALL KYC COMPLETIONS (with filters)
  // ============================================================================
  fastify.get('/all-completions', async (request, reply) => {
    try {
      const { limit = '50', offset = '0', status, partnerId, customerId } = request.query as any;

      let query = db
        .select({
          id: partnerKycCompletions.id,
          partner_id: partnerKycCompletions.partnerId,
          customer_id: partnerKycCompletions.customerId,
          kyc_step_completed: partnerKycCompletions.kycStepCompleted,
          authorization_status: partnerKycCompletions.authorizationStatus,
          completion_status: partnerKycCompletions.completionStatus,
          review_status: partnerKycCompletions.reviewStatus,
          completion_started_at: partnerKycCompletions.completionStartedAt,
          completion_finished_at: partnerKycCompletions.completionFinishedAt,
          reviewed_at: partnerKycCompletions.reviewedAt,
          is_locked: partnerKycCompletions.isLocked,
          locked_until: partnerKycCompletions.lockedUntil,
          created_at: partnerKycCompletions.createdAt,
          partner_name: sql<string>`CONCAT(p.first_name, ' ', p.last_name)`,
          customer_name: sql<string>`CONCAT(c.first_name, ' ', c.last_name)`,
        })
        .from(partnerKycCompletions)
        .leftJoin(
          sql`customers AS p`,
          sql`p.id = ${partnerKycCompletions.partnerId}`
        )
        .leftJoin(
          sql`customers AS c`,
          sql`c.id = ${partnerKycCompletions.customerId}`
        )
        .$dynamic();

      const conditions = [];
      if (status) {
        conditions.push(eq(partnerKycCompletions.reviewStatus, status));
      }
      if (partnerId) {
        conditions.push(eq(partnerKycCompletions.partnerId, parseInt(partnerId)));
      }
      if (customerId) {
        conditions.push(eq(partnerKycCompletions.customerId, parseInt(customerId)));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const completions = await query
        .orderBy(desc(partnerKycCompletions.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      return reply.send({
        success: true,
        data: completions
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des complétions KYC'
      });
    }
  });

  // ============================================================================
  // 4. UNLOCK KYC (Admin override)
  // ============================================================================
  fastify.post('/unlock-kyc', async (request, reply) => {
    try {
      const { customerId, adminId, reason } = request.body as any;

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
          error: 'Aucun verrouillage actif trouvé'
        });
      }

      // Unlock
      await db
        .update(partnerKycCompletions)
        .set({
          isLocked: false,
          lockReason: `Admin unlock by ${adminId}: ${reason || 'Manual override'}`,
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
        error: 'Erreur lors du déverrouillage'
      });
    }
  });

  // ============================================================================
  // 5. GET KYC AUDIT TRAIL
  // ============================================================================
  fastify.get('/audit-trail/:customerId', async (request, reply) => {
    try {
      const { customerId } = request.params as any;

      const auditTrail = await db
        .select()
        .from(partnerKycCompletions)
        .where(eq(partnerKycCompletions.customerId, parseInt(customerId)))
        .orderBy(desc(partnerKycCompletions.createdAt));

      return reply.send({
        success: true,
        data: auditTrail
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération de l\'audit trail'
      });
    }
  });
}
