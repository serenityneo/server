/**
 * ADMIN ROUTES FOR CARD MANAGEMENT
 * 
 * Admin endpoints to:
 * - Review/Approve card requests (both member and partner requests)
 * - Approve/Reject card cancellation requests
 * - Approve/Reject card renewal requests
 * - Process card requests (mark as ready, delivered, etc.)
 * - View all card operations with audit trail
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { db } from '../../services/db';
import { customers, systemErrors } from '../../db/schema';
import { cardRequests, cardTypes } from '../../db/card-schema';
import { cardCancellationRequests } from '../../db/partner-operations-schema';
import { eq, and, or, desc, sql } from 'drizzle-orm';

interface ReviewCardRequestBody {
  Body: {
    requestId: number;
    adminId: number;
    action: 'APPROVE' | 'REJECT';
    reviewNote?: string;
    rejectionReason?: string;
  };
}

interface ProcessCardRequestBody {
  Body: {
    requestId: number;
    adminId: number;
    status: 'PROCESSING' | 'READY' | 'DELIVERED';
    cardNumber?: string;
    cardExpiryDate?: string;
    notes?: string;
  };
}

export interface ReviewCancellationRequestBody {
  Body: {
    requestId: number;
    adminId: number;
    action: 'APPROVE' | 'REJECT';
    reviewNotes?: string;
    rejectionReason?: string;
    approvalNotes?: string;
  };
}

export interface ProcessCancellationRequestBody {
  Body: {
    requestId: number;
    adminId: number;
    processingNotes?: string;
  };
}

const handleError = (request: FastifyRequest, reply: any, error: unknown, statusCode: number = 500) => {
  request.log.error({ err: error }, 'Request error');

  if (statusCode >= 500) {
    db.insert(systemErrors).values({
      message: error instanceof Error ? error.message : 'Unknown card admin error',
      stack: error instanceof Error ? error.stack : undefined,
      path: request.url,
      method: request.method,
      severity: 'CRITICAL',
      metadata: {
        headers: request.headers,
        query: request.query,
        params: request.params,
        ip: request.ip
      }
    }).catch(err => request.log.error({ err }, 'Failed to log error to system_errors table'));
  }

  reply.status(statusCode).send({
    success: false,
    error: statusCode === 401 ? 'Non autorisé' :
      statusCode === 404 ? 'Resource introuvable' :
        'Une erreur est survenue. Veuillez réessayer.'
  });
};

export default async function adminCardRoutes(fastify: FastifyInstance) {

  // ============================================================================
  // 1. GET PENDING CARD REQUESTS (awaiting admin review)
  // ============================================================================
  fastify.get('/pending-card-requests', async (request, reply) => {
    try {
      const { limit = '50', offset = '0', isPartnerRequest } = request.query as any;

      let query = db
        .select({
          id: cardRequests.id,
          customer_id: cardRequests.customerId,
          card_type_id: cardRequests.cardTypeId,
          request_number: cardRequests.requestNumber,
          payment_method: cardRequests.paymentMethod,
          amount_usd: cardRequests.amountUsd,
          amount_cdf: cardRequests.amountCdf,
          status: cardRequests.status,
          requested_at: cardRequests.requestedAt,
          is_partner_request: cardRequests.isPartnerRequest,
          requested_by_partner_id: cardRequests.requestedByPartnerId,
          customer_name: sql<string>`CONCAT(c.first_name, ' ', c.last_name)`,
          customer_phone: sql<string>`c.mobile_money_number`,
          card_type_name: cardTypes.name,
          partner_name: sql<string>`CONCAT(p.first_name, ' ', p.last_name)`,
        })
        .from(cardRequests)
        .leftJoin(
          sql`customers AS c`,
          sql`c.id = ${cardRequests.customerId}`
        )
        .leftJoin(cardTypes, eq(cardRequests.cardTypeId, cardTypes.id))
        .leftJoin(
          sql`customers AS p`,
          sql`p.id = ${cardRequests.requestedByPartnerId}`
        )
        .$dynamic();

      const conditions = [
        or(
          eq(cardRequests.status, 'PAID'),
          eq(cardRequests.status, 'PENDING')
        )
      ];

      if (isPartnerRequest !== undefined) {
        conditions.push(eq(cardRequests.isPartnerRequest, isPartnerRequest === 'true'));
      }

      const pendingRequests = await query
        .where(and(...conditions))
        .orderBy(desc(cardRequests.requestedAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      return reply.send({
        success: true,
        data: pendingRequests
      });

    } catch (error: any) {
      handleError(request, reply, error, 500);
    }
  });

  // ============================================================================
  // 2. REVIEW CARD REQUEST (Approve/Reject)
  // ============================================================================
  fastify.post('/review-card-request', async (request: FastifyRequest, reply) => {
    try {
      const { requestId, adminId, action, reviewNote, rejectionReason } = request.body as ReviewCardRequestBody['Body'];

      // Get the card request
      const cardRequest = await db
        .select()
        .from(cardRequests)
        .where(eq(cardRequests.id, requestId))
        .limit(1);

      if (!cardRequest || cardRequest.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Demande de carte non trouvée'
        });
      }

      if (action === 'APPROVE') {
        // Approve the request - move to PROCESSING
        await db
          .update(cardRequests)
          .set({
            status: 'PROCESSING',
            reviewedById: adminId,
            reviewNote,
            approvedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
          .where(eq(cardRequests.id, requestId));

        return reply.send({
          success: true,
          message: 'Demande de carte approuvée. Carte en cours de préparation.',
          data: { request_id: requestId, status: 'PROCESSING' }
        });

      } else {
        // Reject the request
        await db
          .update(cardRequests)
          .set({
            status: 'REJECTED',
            reviewedById: adminId,
            reviewNote,
            rejectionReason,
            rejectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
          .where(eq(cardRequests.id, requestId));

        // TODO: Refund payment if already paid

        return reply.send({
          success: true,
          message: 'Demande de carte rejetée. Client sera notifié.',
          data: { request_id: requestId, status: 'REJECTED' }
        });
      }

    } catch (error: any) {
      handleError(request, reply, error, 500);
    }
  });

  // ============================================================================
  // 3. PROCESS CARD REQUEST (mark as ready/delivered)
  // ============================================================================
  fastify.post('/process-card-request', async (request: FastifyRequest, reply) => {
    try {
      const { requestId, adminId, status, cardNumber, cardExpiryDate, notes } = request.body as ProcessCardRequestBody['Body'];

      const updateData: any = {
        status,
        reviewedById: adminId,
        updatedAt: new Date().toISOString()
      };

      if (status === 'READY') {
        updateData.readyAt = new Date().toISOString();
        if (cardNumber) updateData.cardNumber = cardNumber;
        if (cardExpiryDate) updateData.cardExpiryDate = cardExpiryDate;
      } else if (status === 'DELIVERED') {
        updateData.deliveredAt = new Date().toISOString();
      } else if (status === 'PROCESSING') {
        // Already in processing, just update notes
        if (notes) updateData.reviewNote = notes;
      }

      await db
        .update(cardRequests)
        .set(updateData)
        .where(eq(cardRequests.id, requestId));

      return reply.send({
        success: true,
        message: `Carte marquée comme ${status}`,
        data: { request_id: requestId, status }
      });

    } catch (error: any) {
      handleError(request, reply, error, 500);
    }
  });

  // ============================================================================
  // 4. GET PENDING CANCELLATION/RENEWAL REQUESTS
  // ============================================================================
  fastify.get('/pending-cancellation-requests', async (request, reply) => {
    try {
      const { limit = '50', offset = '0', requestType, isPartnerRequest } = request.query as any;

      let query = db
        .select({
          id: cardCancellationRequests.id,
          customer_id: cardCancellationRequests.customerId,
          card_number: cardCancellationRequests.cardNumber,
          request_type: cardCancellationRequests.requestType,
          cancellation_reason: cardCancellationRequests.cancellationReason,
          renewal_reason: cardCancellationRequests.renewalReason,
          additional_notes: cardCancellationRequests.additionalNotes,
          urgency_level: cardCancellationRequests.urgencyLevel,
          status: cardCancellationRequests.status,
          is_partner_request: cardCancellationRequests.isPartnerRequest,
          requested_by_partner_id: cardCancellationRequests.requestedByPartnerId,
          created_at: cardCancellationRequests.createdAt,
          customer_name: sql<string>`CONCAT(c.first_name, ' ', c.last_name)`,
          customer_phone: sql<string>`c.mobile_money_number`,
          partner_name: sql<string>`CONCAT(p.first_name, ' ', p.last_name)`,
        })
        .from(cardCancellationRequests)
        .leftJoin(
          sql`customers AS c`,
          sql`c.id = ${cardCancellationRequests.customerId}`
        )
        .leftJoin(
          sql`customers AS p`,
          sql`p.id = ${cardCancellationRequests.requestedByPartnerId}`
        )
        .$dynamic();

      const conditions = [eq(cardCancellationRequests.status, 'PENDING')];

      if (requestType) {
        conditions.push(eq(cardCancellationRequests.requestType, requestType));
      }
      if (isPartnerRequest !== undefined) {
        conditions.push(eq(cardCancellationRequests.isPartnerRequest, isPartnerRequest === 'true'));
      }

      const pendingRequests = await query
        .where(and(...conditions))
        .orderBy(desc(cardCancellationRequests.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      return reply.send({
        success: true,
        data: pendingRequests
      });

    } catch (error: any) {
      handleError(request, reply, error, 500);
    }
  });

  // ============================================================================
  // 5. REVIEW CANCELLATION/RENEWAL REQUEST
  // ============================================================================
  fastify.post('/review-cancellation-request', async (request: FastifyRequest, reply) => {
    try {
      const { requestId, adminId, action, reviewNotes, rejectionReason, approvalNotes } = request.body as ReviewCancellationRequestBody['Body'];

      const cancellationRequest = await db
        .select()
        .from(cardCancellationRequests)
        .where(eq(cardCancellationRequests.id, requestId))
        .limit(1);

      if (!cancellationRequest || cancellationRequest.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Demande non trouvée'
        });
      }

      if (action === 'APPROVE') {
        await db
          .update(cardCancellationRequests)
          .set({
            status: 'APPROVED',
            reviewedByAdminId: adminId,
            reviewedAt: new Date().toISOString(),
            reviewNotes,
            approvalNotes,
            updatedAt: new Date().toISOString()
          })
          .where(eq(cardCancellationRequests.id, requestId));

        return reply.send({
          success: true,
          message: `Demande approuvée. En attente de traitement.`,
          data: { request_id: requestId, status: 'APPROVED' }
        });

      } else {
        await db
          .update(cardCancellationRequests)
          .set({
            status: 'REJECTED',
            reviewedByAdminId: adminId,
            reviewedAt: new Date().toISOString(),
            reviewNotes,
            rejectionReason,
            updatedAt: new Date().toISOString()
          })
          .where(eq(cardCancellationRequests.id, requestId));

        return reply.send({
          success: true,
          message: 'Demande rejetée. Client/Partner sera notifié.',
          data: { request_id: requestId, status: 'REJECTED' }
        });
      }

    } catch (error: any) {
      handleError(request, reply, error, 500);
    }
  });

  // ============================================================================
  // 6. PROCESS CANCELLATION (mark as processed)
  // ============================================================================
  fastify.post('/process-cancellation', async (request: FastifyRequest, reply) => {
    try {
      const { requestId, adminId, processingNotes } = request.body as ProcessCancellationRequestBody['Body'];

      // Update the original card request to CANCELLED
      const cancellationRequest = await db
        .select()
        .from(cardCancellationRequests)
        .where(eq(cardCancellationRequests.id, requestId))
        .limit(1);

      if (!cancellationRequest || cancellationRequest.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Demande non trouvée'
        });
      }

      const req = cancellationRequest[0];

      if (req.cardRequestId) {
        await db
          .update(cardRequests)
          .set({
            status: 'CANCELLED',
            cancelledAt: new Date().toISOString(),
            reviewNote: `Cancelled by admin ${adminId}. ${processingNotes || ''}`,
            updatedAt: new Date().toISOString()
          })
          .where(eq(cardRequests.id, req.cardRequestId));
      }

      // Mark cancellation request as processed
      await db
        .update(cardCancellationRequests)
        .set({
          status: 'PROCESSED',
          processedByAdminId: adminId,
          processedAt: new Date().toISOString(),
          processingNotes,
          customerNotified: true,
          customerNotifiedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .where(eq(cardCancellationRequests.id, requestId));

      return reply.send({
        success: true,
        message: 'Annulation traitée avec succès',
        data: { request_id: requestId }
      });

    } catch (error: any) {
      handleError(request, reply, error, 500);
    }
  });

  // ============================================================================
  // 7. GET ALL CARD OPERATIONS (audit view)
  // ============================================================================
  fastify.get('/all-card-operations', async (request, reply) => {
    try {
      const { limit = '100', offset = '0', customerId, partnerId, status } = request.query as any;

      let query = db
        .select({
          id: cardRequests.id,
          customer_id: cardRequests.customerId,
          request_number: cardRequests.requestNumber,
          payment_method: cardRequests.paymentMethod,
          amount_usd: cardRequests.amountUsd,
          status: cardRequests.status,
          requested_at: cardRequests.requestedAt,
          approved_at: cardRequests.approvedAt,
          delivered_at: cardRequests.deliveredAt,
          is_partner_request: cardRequests.isPartnerRequest,
          requested_by_partner_id: cardRequests.requestedByPartnerId,
          partner_ip_address: cardRequests.partnerIpAddress,
          customer_name: sql<string>`CONCAT(c.first_name, ' ', c.last_name)`,
          partner_name: sql<string>`CONCAT(p.first_name, ' ', p.last_name)`,
        })
        .from(cardRequests)
        .leftJoin(
          sql`customers AS c`,
          sql`c.id = ${cardRequests.customerId}`
        )
        .leftJoin(
          sql`customers AS p`,
          sql`p.id = ${cardRequests.requestedByPartnerId}`
        )
        .$dynamic();

      const conditions = [];
      if (customerId) {
        conditions.push(eq(cardRequests.customerId, parseInt(customerId)));
      }
      if (partnerId) {
        conditions.push(eq(cardRequests.requestedByPartnerId, parseInt(partnerId)));
      }
      if (status) {
        conditions.push(eq(cardRequests.status, status));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const operations = await query
        .orderBy(desc(cardRequests.requestedAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      return reply.send({
        success: true,
        data: operations
      });

    } catch (error: any) {
      handleError(request, reply, error, 500);
    }
  });
}
