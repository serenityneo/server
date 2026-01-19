/**
 * CARD ROUTES - Admin API
 * Routes for card request management from admin side
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { cardTypes, cardRequests, cardPayments } from '../../../db/card-schema';
import { customers } from '../../../db/schema';
import { eq, and, desc, sql, ilike, or, count, sum } from 'drizzle-orm';
import { emailService } from '../../../services/email.service';

// Generate card number (16 digits)
function generateCardNumber(): string {
  const prefix = '4929'; // Serenity Bank prefix
  const middle = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');
  const suffix = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join('');
  return `${prefix}${middle}${suffix}`;
}

// Generate expiry date (3 years from now)
function generateExpiryDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 3);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${year}`;
}

export async function adminCardRoutes(fastify: FastifyInstance) {
  
  /**
   * GET /requests
   * List all card requests with filters
   */
  fastify.get('/requests', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { status, search, page = '1', limit = '20' } = request.query as {
        status?: string;
        search?: string;
        page?: string;
        limit?: string;
      };
      const offset = (parseInt(page) - 1) * parseInt(limit);

      let whereConditions = [];

      if (status && status !== 'all') {
        whereConditions.push(eq(cardRequests.status, status as any));
      }

      const requests = await db.select({
        id: cardRequests.id,
        requestNumber: cardRequests.requestNumber,
        status: cardRequests.status,
        paymentMethod: cardRequests.paymentMethod,
        amountUsd: cardRequests.amountUsd,
        amountCdf: cardRequests.amountCdf,
        currencyPaid: cardRequests.currencyPaid,
        cardNumber: cardRequests.cardNumber,
        cardExpiryDate: cardRequests.cardExpiryDate,
        requestedAt: cardRequests.requestedAt,
        paidAt: cardRequests.paidAt,
        approvedAt: cardRequests.approvedAt,
        readyAt: cardRequests.readyAt,
        deliveredAt: cardRequests.deliveredAt,
        rejectionReason: cardRequests.rejectionReason,
        reviewNote: cardRequests.reviewNote,
        cardType: {
          id: cardTypes.id,
          code: cardTypes.code,
          name: cardTypes.name,
          cardColor: cardTypes.cardColor
        },
        customer: {
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          mobileMoneyNumber: customers.mobileMoneyNumber,
          email: customers.email,
          cifCode: customers.cifCode
        }
      })
        .from(cardRequests)
        .leftJoin(cardTypes, eq(cardRequests.cardTypeId, cardTypes.id))
        .leftJoin(customers, eq(cardRequests.customerId, customers.id))
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(cardRequests.requestedAt))
        .limit(parseInt(limit))
        .offset(offset);

      // Get total count
      const [totalResult] = await db.select({ count: count() })
        .from(cardRequests)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

      return reply.send({
        success: true,
        data: {
          requests,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalResult.count,
            totalPages: Math.ceil(totalResult.count / parseInt(limit))
          }
        }
      });
    } catch (error: any) {
      console.error('Error fetching card requests:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * GET /requests/:id
   * Get single card request details
   */
  fastify.get('/requests/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const requestId = parseInt(id);

      const [cardRequest] = await db.select({
        id: cardRequests.id,
        requestNumber: cardRequests.requestNumber,
        status: cardRequests.status,
        paymentMethod: cardRequests.paymentMethod,
        mobileMoneyProvider: cardRequests.mobileMoneyProvider,
        mobileMoneyNumber: cardRequests.mobileMoneyNumber,
        paymentReference: cardRequests.paymentReference,
        amountUsd: cardRequests.amountUsd,
        amountCdf: cardRequests.amountCdf,
        currencyPaid: cardRequests.currencyPaid,
        cardNumber: cardRequests.cardNumber,
        cardExpiryDate: cardRequests.cardExpiryDate,
        requestedAt: cardRequests.requestedAt,
        paidAt: cardRequests.paidAt,
        approvedAt: cardRequests.approvedAt,
        readyAt: cardRequests.readyAt,
        deliveredAt: cardRequests.deliveredAt,
        rejectedAt: cardRequests.rejectedAt,
        cancelledAt: cardRequests.cancelledAt,
        rejectionReason: cardRequests.rejectionReason,
        reviewNote: cardRequests.reviewNote,
        cardType: {
          id: cardTypes.id,
          code: cardTypes.code,
          name: cardTypes.name,
          description: cardTypes.description,
          cardColor: cardTypes.cardColor,
          priceUsd: cardTypes.priceUsd,
          priceCdf: cardTypes.priceCdf
        },
        customer: {
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          mobileMoneyNumber: customers.mobileMoneyNumber,
          email: customers.email,
          cifCode: customers.cifCode,
          kycStatus: customers.kycStatus,
          category: customers.category
        }
      })
        .from(cardRequests)
        .leftJoin(cardTypes, eq(cardRequests.cardTypeId, cardTypes.id))
        .leftJoin(customers, eq(cardRequests.customerId, customers.id))
        .where(eq(cardRequests.id, requestId));

      if (!cardRequest) {
        return reply.status(404).send({ success: false, message: 'Demande non trouvée' });
      }

      // Get payment history
      const payments = await db.select()
        .from(cardPayments)
        .where(eq(cardPayments.cardRequestId, requestId))
        .orderBy(desc(cardPayments.createdAt));

      return reply.send({
        success: true,
        data: {
          ...cardRequest,
          payments
        }
      });
    } catch (error: any) {
      console.error('Error fetching card request:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * PUT /requests/:id/status
   * Update card request status
   */
  fastify.put('/requests/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const requestId = parseInt(id);
      const { status, reviewNote, rejectionReason } = request.body as {
        status: 'PAID' | 'PROCESSING' | 'READY' | 'DELIVERED' | 'REJECTED';
        reviewNote?: string;
        rejectionReason?: string;
      };
      const adminId = (request as any).adminId;

      const cardRequest = await db.query.cardRequests.findFirst({
        where: eq(cardRequests.id, requestId)
      });

      if (!cardRequest) {
        return reply.status(404).send({ success: false, message: 'Demande non trouvée' });
      }

      const updateData: any = {
        status,
        reviewedById: adminId,
        reviewNote,
        updatedAt: new Date().toISOString()
      };

      // Set appropriate timestamp based on status
      switch (status) {
        case 'PAID':
          updateData.paidAt = new Date().toISOString();
          break;
        case 'PROCESSING':
          updateData.approvedAt = new Date().toISOString();
          break;
        case 'READY':
          updateData.readyAt = new Date().toISOString();
          // Generate card number and expiry if not already set
          if (!cardRequest.cardNumber) {
            updateData.cardNumber = generateCardNumber();
            updateData.cardExpiryDate = generateExpiryDate();
          }
          break;
        case 'DELIVERED':
          updateData.deliveredAt = new Date().toISOString();
          break;
        case 'REJECTED':
          updateData.rejectedAt = new Date().toISOString();
          updateData.rejectionReason = rejectionReason;
          break;
      }

      await db.update(cardRequests)
        .set(updateData)
        .where(eq(cardRequests.id, requestId));

      // Send notification when card is ready
      if (status === 'READY') {
        try {
          const customer = await db.query.customers.findFirst({
            where: eq(customers.id, cardRequest.customerId)
          });
          const cardType = await db.query.cardTypes.findFirst({
            where: eq(cardTypes.id, cardRequest.cardTypeId)
          });
          if (customer && cardType) {
            emailService.sendCardReadyNotification({
              customerEmail: customer.email || '',
              customerName: `${customer.firstName} ${customer.lastName}`,
              requestNumber: cardRequest.requestNumber,
              cardType: cardType.name
            }).catch(err => console.error('Failed to send card ready email:', err));
          }
        } catch (notifError) {
          console.error('Error sending card ready notification:', notifError);
        }
      }

      return reply.send({
        success: true,
        message: `Statut mis à jour: ${status}`
      });
    } catch (error: any) {
      console.error('Error updating card request status:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * GET /stats
   * Get card request statistics
   */
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get counts by status
      const statusCounts = await db.select({
        status: cardRequests.status,
        count: count()
      })
        .from(cardRequests)
        .groupBy(cardRequests.status);

      // Get total revenue
      const [revenueResult] = await db.select({
        totalUsd: sum(cardPayments.amountUsd),
        totalCdf: sum(cardPayments.amountCdf),
        count: count()
      })
        .from(cardPayments)
        .where(eq(cardPayments.status, 'COMPLETED'));

      // Get requests this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [monthlyResult] = await db.select({
        count: count(),
        paidCount: sql<number>`COUNT(CASE WHEN ${cardRequests.status} IN ('PAID', 'PROCESSING', 'READY', 'DELIVERED') THEN 1 END)`
      })
        .from(cardRequests)
        .where(sql`${cardRequests.requestedAt} >= ${startOfMonth.toISOString()}`);

      return reply.send({
        success: true,
        data: {
          byStatus: statusCounts.reduce((acc, curr) => {
            acc[curr.status] = curr.count;
            return acc;
          }, {} as Record<string, number>),
          revenue: {
            totalUsd: revenueResult.totalUsd || 0,
            totalCdf: revenueResult.totalCdf || 0,
            transactionCount: revenueResult.count
          },
          thisMonth: {
            totalRequests: monthlyResult.count,
            paidRequests: monthlyResult.paidCount
          }
        }
      });
    } catch (error: any) {
      console.error('Error fetching card stats:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * GET /payments
   * Get card payment history (revenue)
   */
  fastify.get('/payments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { page = '1', limit = '20', status } = request.query as {
        page?: string;
        limit?: string;
        status?: string;
      };
      const offset = (parseInt(page) - 1) * parseInt(limit);

      let whereConditions = [];
      if (status) {
        whereConditions.push(eq(cardPayments.status, status));
      }

      const payments = await db.select({
        id: cardPayments.id,
        paymentMethod: cardPayments.paymentMethod,
        mobileMoneyProvider: cardPayments.mobileMoneyProvider,
        amountUsd: cardPayments.amountUsd,
        amountCdf: cardPayments.amountCdf,
        currency: cardPayments.currency,
        status: cardPayments.status,
        transactionReference: cardPayments.transactionReference,
        createdAt: cardPayments.createdAt,
        completedAt: cardPayments.completedAt,
        cardRequest: {
          id: cardRequests.id,
          requestNumber: cardRequests.requestNumber
        },
        customer: {
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          cifCode: customers.cifCode
        }
      })
        .from(cardPayments)
        .leftJoin(cardRequests, eq(cardPayments.cardRequestId, cardRequests.id))
        .leftJoin(customers, eq(cardPayments.customerId, customers.id))
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(cardPayments.createdAt))
        .limit(parseInt(limit))
        .offset(offset);

      const [totalResult] = await db.select({ count: count() })
        .from(cardPayments)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

      return reply.send({
        success: true,
        data: {
          payments,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalResult.count,
            totalPages: Math.ceil(totalResult.count / parseInt(limit))
          }
        }
      });
    } catch (error: any) {
      console.error('Error fetching card payments:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * GET /types
   * List all card types (for admin)
   */
  fastify.get('/types', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const types = await db.select()
        .from(cardTypes)
        .orderBy(cardTypes.displayOrder);

      return reply.send({
        success: true,
        data: types.map(type => ({
          ...type,
          features: type.features ? JSON.parse(type.features) : []
        }))
      });
    } catch (error: any) {
      console.error('Error fetching card types:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * POST /types
   * Create a new card type
   */
  fastify.post('/types', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { code, name, description, priceUsd, priceCdf, cardColor, features, isActive = true, displayOrder = 0 } = request.body as {
        code: string;
        name: string;
        description?: string;
        priceUsd: string;
        priceCdf: string;
        cardColor?: string;
        features?: string[];
        isActive?: boolean;
        displayOrder?: number;
      };

      const [newType] = await db.insert(cardTypes).values({
        code: code.toUpperCase(),
        name,
        description,
        priceUsd,
        priceCdf,
        cardColor: cardColor || '#5C4033',
        features: features ? JSON.stringify(features) : null,
        isActive,
        displayOrder
      }).returning();

      return reply.status(201).send({
        success: true,
        message: 'Type de carte créé',
        data: newType
      });
    } catch (error: any) {
      console.error('Error creating card type:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * PUT /types/:id
   * Update a card type
   */
  fastify.put('/types/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const typeId = parseInt(id);
      const { name, description, priceUsd, priceCdf, cardColor, features, isActive, displayOrder } = request.body as {
        name?: string;
        description?: string;
        priceUsd?: string;
        priceCdf?: string;
        cardColor?: string;
        features?: string[];
        isActive?: boolean;
        displayOrder?: number;
      };

      const updateData: any = { updatedAt: new Date().toISOString() };
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (priceUsd !== undefined) updateData.priceUsd = priceUsd;
      if (priceCdf !== undefined) updateData.priceCdf = priceCdf;
      if (cardColor !== undefined) updateData.cardColor = cardColor;
      if (features !== undefined) updateData.features = JSON.stringify(features);
      if (isActive !== undefined) updateData.isActive = isActive;
      if (displayOrder !== undefined) updateData.displayOrder = displayOrder;

      await db.update(cardTypes)
        .set(updateData)
        .where(eq(cardTypes.id, typeId));

      return reply.send({
        success: true,
        message: 'Type de carte mis à jour'
      });
    } catch (error: any) {
      console.error('Error updating card type:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });
}
