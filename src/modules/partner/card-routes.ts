/**
 * PARTNER CARD MANAGEMENT ROUTES
 * 
 * Endpoints for partners to manage card requests on behalf of customers
 * 
 * Features:
 * - Create new card request (partner on behalf of customer)
 * - Request card renewal
 * - Request card cancellation (requires admin approval)
 * - View card requests history
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../services/db';
import { customers } from '../../db/schema';
import { cardRequests, cardTypes } from '../../db/card-schema';
import { cardCancellationRequests } from '../../db/partner-operations-schema';
import { eq, and, or, desc, sql } from 'drizzle-orm';

interface CreateCardRequestBody {
  Body: {
    partnerId: number;
    customerId: number;
    cardTypeId: number;
    paymentMethod: 'MOBILE_MONEY' | 'S01_ACCOUNT';
    mobileMoneyProvider?: string;
    mobileMoneyNumber?: string;
    ipAddress: string;
    userAgent: string;
    deviceInfo: any;
  };
}

interface CancelCardRequestBody {
  Body: {
    partnerId?: number;
    customerId: number;
    cardNumber: string;
    cardRequestId?: number;
    cancellationReason: string;
    additionalNotes?: string;
    urgencyLevel: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    isPartnerRequest: boolean;
    ipAddress: string;
    userAgent: string;
    deviceInfo: any;
  };
}

interface RenewalRequestBody {
  Body: {
    partnerId?: number;
    customerId: number;
    cardNumber: string;
    cardRequestId?: number;
    renewalReason: string;
    additionalNotes?: string;
    urgencyLevel: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    isPartnerRequest: boolean;
    ipAddress: string;
    userAgent: string;
    deviceInfo: any;
  };
}

interface GetCardRequestsQuery {
  Querystring: {
    customerId?: string;
    partnerId?: string;
    status?: string;
    limit?: string;
    offset?: string;
  };
}

export default async function partnerCardRoutes(fastify: FastifyInstance) {
  
  // ============================================================================
  // 1. CREATE CARD REQUEST (Partner on behalf of customer)
  // ============================================================================
  fastify.post<CreateCardRequestBody>('/create-request', async (request, reply) => {
    try {
      const {
        partnerId,
        customerId,
        cardTypeId,
        paymentMethod,
        mobileMoneyProvider,
        mobileMoneyNumber,
        ipAddress,
        userAgent,
        deviceInfo
      } = request.body;

      // Verify customer exists
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

      // Check if customer has completed KYC2 (required for card)
      // For now, we'll just check if KYC1 is completed
      if (!customer[0].kycCompleted || customer[0].kycStatus !== 'KYC1_VERIFIED') {
        return reply.status(400).send({
          success: false,
          error: 'Le client doit avoir complété et vérifié son KYC1 pour demander une carte'
        });
      }

      // Get card type details
      const cardType = await db
        .select()
        .from(cardTypes)
        .where(eq(cardTypes.id, cardTypeId))
        .limit(1);

      if (!cardType || cardType.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Type de carte non trouvé'
        });
      }

      // Generate request number
      const requestNumber = `CRD-${Date.now()}-${customerId}`;

      // Create card request
      const newRequest = await db
        .insert(cardRequests)
        .values({
          customerId,
          cardTypeId,
          requestNumber,
          paymentMethod: paymentMethod as any,
          mobileMoneyProvider: mobileMoneyProvider as any,
          mobileMoneyNumber,
          amountUsd: cardType[0].priceUsd!,
          amountCdf: cardType[0].priceCdf!,
          status: 'PENDING',
          // Partner fields
          requestedByPartnerId: partnerId,
          isPartnerRequest: true,
          partnerIpAddress: ipAddress,
          partnerUserAgent: userAgent,
          partnerDeviceInfo: deviceInfo,
        })
        .returning();

      return reply.send({
        success: true,
        message: 'Demande de carte créée avec succès',
        data: newRequest[0]
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la création de la demande de carte'
      });
    }
  });

  // ============================================================================
  // 2. REQUEST CARD CANCELLATION
  // ============================================================================
  fastify.post<CancelCardRequestBody>('/cancel-request', async (request, reply) => {
    try {
      const {
        partnerId,
        customerId,
        cardNumber,
        cardRequestId,
        cancellationReason,
        additionalNotes,
        urgencyLevel,
        isPartnerRequest,
        ipAddress,
        userAgent,
        deviceInfo
      } = request.body;

      // Verify customer exists
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

      // Check if there's already a pending cancellation request for this card
      const existingRequest = await db
        .select()
        .from(cardCancellationRequests)
        .where(
          and(
            eq(cardCancellationRequests.cardNumber, cardNumber),
            eq(cardCancellationRequests.status, 'PENDING')
          )
        )
        .limit(1);

      if (existingRequest && existingRequest.length > 0) {
        return reply.status(400).send({
          success: false,
          error: 'Une demande d\'annulation est déjà en cours pour cette carte'
        });
      }

      // Create cancellation request
      const cancellationRequest = await db
        .insert(cardCancellationRequests)
        .values({
          customerId,
          cardRequestId: cardRequestId || null,
          requestedByPartnerId: isPartnerRequest ? partnerId : null,
          isPartnerRequest,
          cardNumber,
          requestType: 'CANCELLATION',
          cancellationReason,
          additionalNotes,
          urgencyLevel,
          status: 'PENDING',
          requesterIpAddress: ipAddress,
          requesterUserAgent: userAgent,
          requesterDeviceInfo: deviceInfo,
        })
        .returning();

      return reply.send({
        success: true,
        message: 'Demande d\'annulation de carte créée avec succès. En attente d\'approbation admin.',
        data: cancellationRequest[0]
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la création de la demande d\'annulation'
      });
    }
  });

  // ============================================================================
  // 3. REQUEST CARD RENEWAL
  // ============================================================================
  fastify.post<RenewalRequestBody>('/renewal-request', async (request, reply) => {
    try {
      const {
        partnerId,
        customerId,
        cardNumber,
        cardRequestId,
        renewalReason,
        additionalNotes,
        urgencyLevel,
        isPartnerRequest,
        ipAddress,
        userAgent,
        deviceInfo
      } = request.body;

      // Verify customer exists
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

      // Check if there's already a pending renewal request for this card
      const existingRequest = await db
        .select()
        .from(cardCancellationRequests)
        .where(
          and(
            eq(cardCancellationRequests.cardNumber, cardNumber),
            eq(cardCancellationRequests.requestType, 'RENEWAL'),
            eq(cardCancellationRequests.status, 'PENDING')
          )
        )
        .limit(1);

      if (existingRequest && existingRequest.length > 0) {
        return reply.status(400).send({
          success: false,
          error: 'Une demande de renouvellement est déjà en cours pour cette carte'
        });
      }

      // Create renewal request
      const renewalRequest = await db
        .insert(cardCancellationRequests)
        .values({
          customerId,
          cardRequestId: cardRequestId || null,
          requestedByPartnerId: isPartnerRequest ? partnerId : null,
          isPartnerRequest,
          cardNumber,
          requestType: 'RENEWAL',
          renewalReason,
          additionalNotes,
          urgencyLevel,
          status: 'PENDING',
          requesterIpAddress: ipAddress,
          requesterUserAgent: userAgent,
          requesterDeviceInfo: deviceInfo,
        })
        .returning();

      return reply.send({
        success: true,
        message: 'Demande de renouvellement de carte créée avec succès. En attente d\'approbation admin.',
        data: renewalRequest[0]
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la création de la demande de renouvellement'
      });
    }
  });

  // ============================================================================
  // 4. GET CARD REQUESTS (for partner or customer)
  // ============================================================================
  fastify.get<GetCardRequestsQuery>('/requests', async (request, reply) => {
    try {
      const { customerId, partnerId, status, limit = '20', offset = '0' } = request.query;

      let query = db
        .select({
          id: cardRequests.id,
          customer_id: cardRequests.customerId,
          card_type_id: cardRequests.cardTypeId,
          request_number: cardRequests.requestNumber,
          payment_method: cardRequests.paymentMethod,
          amount_usd: cardRequests.amountUsd,
          amount_cdf: cardRequests.amountCdf,
          card_number: cardRequests.cardNumber,
          status: cardRequests.status,
          requested_at: cardRequests.requestedAt,
          is_partner_request: cardRequests.isPartnerRequest,
          requested_by_partner_id: cardRequests.requestedByPartnerId,
          customer_name: sql<string>`CONCAT(${customers.firstName}, ' ', ${customers.lastName})`,
          card_type_name: cardTypes.name,
        })
        .from(cardRequests)
        .leftJoin(customers, eq(cardRequests.customerId, customers.id))
        .leftJoin(cardTypes, eq(cardRequests.cardTypeId, cardTypes.id))
        .$dynamic();

      // Apply filters
      const conditions = [];
      if (customerId) {
        conditions.push(eq(cardRequests.customerId, parseInt(customerId)));
      }
      if (partnerId) {
        conditions.push(eq(cardRequests.requestedByPartnerId, parseInt(partnerId)));
      }
      if (status) {
        conditions.push(eq(cardRequests.status, status as any));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const requests = await query
        .orderBy(desc(cardRequests.requestedAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      return reply.send({
        success: true,
        data: requests
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des demandes de carte'
      });
    }
  });

  // ============================================================================
  // 5. GET CANCELLATION/RENEWAL REQUESTS
  // ============================================================================
  fastify.get('/cancellation-requests', async (request, reply) => {
    try {
      const { customerId, partnerId, requestType, status, limit = '20', offset = '0' } = request.query as any;

      let query = db
        .select({
          id: cardCancellationRequests.id,
          customer_id: cardCancellationRequests.customerId,
          card_number: cardCancellationRequests.cardNumber,
          request_type: cardCancellationRequests.requestType,
          cancellation_reason: cardCancellationRequests.cancellationReason,
          renewal_reason: cardCancellationRequests.renewalReason,
          urgency_level: cardCancellationRequests.urgencyLevel,
          status: cardCancellationRequests.status,
          is_partner_request: cardCancellationRequests.isPartnerRequest,
          requested_by_partner_id: cardCancellationRequests.requestedByPartnerId,
          created_at: cardCancellationRequests.createdAt,
          reviewed_at: cardCancellationRequests.reviewedAt,
          customer_name: sql<string>`CONCAT(${customers.firstName}, ' ', ${customers.lastName})`,
        })
        .from(cardCancellationRequests)
        .leftJoin(customers, eq(cardCancellationRequests.customerId, customers.id))
        .$dynamic();

      // Apply filters
      const conditions = [];
      if (customerId) {
        conditions.push(eq(cardCancellationRequests.customerId, parseInt(customerId)));
      }
      if (partnerId) {
        conditions.push(eq(cardCancellationRequests.requestedByPartnerId, parseInt(partnerId)));
      }
      if (requestType) {
        conditions.push(eq(cardCancellationRequests.requestType, requestType));
      }
      if (status) {
        conditions.push(eq(cardCancellationRequests.status, status));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const requests = await query
        .orderBy(desc(cardCancellationRequests.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      return reply.send({
        success: true,
        data: requests
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des demandes d\'annulation/renouvellement'
      });
    }
  });
}
