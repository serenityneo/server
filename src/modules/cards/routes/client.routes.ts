/**
 * CARD ROUTES - Client API
 * Routes for card request management from client side
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { cardTypes, cardRequests, cardPayments } from '../../../db/card-schema';
import { customers, accounts, transactions } from '../../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { emailService } from '../../../services/email.service';

// Generate unique request number
function generateRequestNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CARD-${timestamp}-${random}`;
}

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

export async function clientCardRoutes(fastify: FastifyInstance) {
  
  /**
   * GET /eligibility
   * Check if customer is eligible for card request (KYC2 required)
   */
  fastify.get('/eligibility', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = (request as any).customerId;
      
      if (!customerId) {
        return reply.status(401).send({ success: false, message: 'Non authentifié' });
      }

      const customer = await db.query.customers.findFirst({
        where: eq(customers.id, customerId)
      });

      if (!customer) {
        return reply.status(404).send({ success: false, message: 'Client non trouvé' });
      }

      const kycStatus = customer.kycStatus || 'NOT_STARTED';
      
      // Check KYC2 completion
      const kyc2CompletedStatuses = ['KYC2_VERIFIED', 'KYC3_PENDING', 'KYC3_UNDER_REVIEW', 'KYC3_VERIFIED'];
      const isKyc2Completed = kyc2CompletedStatuses.includes(kycStatus);
      
      // Check if already has pending/active card request
      const existingRequest = await db.query.cardRequests.findFirst({
        where: and(
          eq(cardRequests.customerId, customerId),
          sql`${cardRequests.status} NOT IN ('DELIVERED', 'REJECTED', 'CANCELLED')`
        )
      });

      const conditions = {
        kyc2Completed: isKyc2Completed,
        noPendingRequest: !existingRequest
      };

      const isEligible = conditions.kyc2Completed && conditions.noPendingRequest;

      let message = '';
      if (!conditions.kyc2Completed) {
        message = 'Vous devez compléter le KYC 2 pour demander une carte';
      } else if (!conditions.noPendingRequest) {
        message = 'Vous avez déjà une demande de carte en cours';
      } else {
        message = 'Vous êtes éligible pour demander une carte';
      }

      return reply.send({
        success: true,
        data: {
          isEligible,
          conditions,
          message,
          kycStatus,
          existingRequest: existingRequest ? {
            id: existingRequest.id,
            requestNumber: existingRequest.requestNumber,
            status: existingRequest.status,
            requestedAt: existingRequest.requestedAt
          } : null
        }
      });
    } catch (error: any) {
      console.error('Error checking card eligibility:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * GET /types
   * List available card types
   */
  fastify.get('/types', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const types = await db.select()
        .from(cardTypes)
        .where(eq(cardTypes.isActive, true))
        .orderBy(cardTypes.displayOrder);

      return reply.send({
        success: true,
        data: types.map(type => ({
          id: type.id,
          code: type.code,
          name: type.name,
          description: type.description,
          priceUsd: type.priceUsd,
          priceCdf: type.priceCdf,
          cardColor: type.cardColor,
          features: type.features ? JSON.parse(type.features) : [],
          imageUrl: type.imageUrl
        }))
      });
    } catch (error: any) {
      console.error('Error fetching card types:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * GET /s01-balance
   * Get customer's S01 account balance for payment
   */
  fastify.get('/s01-balance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = (request as any).customerId;
      
      if (!customerId) {
        return reply.status(401).send({ success: false, message: 'Non authentifié' });
      }

      // Find S01 account
      const s01Account = await db.query.accounts.findFirst({
        where: and(
          eq(accounts.customerId, customerId),
          eq(accounts.accountType, 'S01_STANDARD'),
          eq(accounts.status, 'ACTIVE')
        )
      });

      if (!s01Account) {
        return reply.send({
          success: true,
          data: {
            hasS01: false,
            balanceUsd: 0,
            balanceCdf: 0
          }
        });
      }

      return reply.send({
        success: true,
        data: {
          hasS01: true,
          accountId: s01Account.id,
          accountNumber: s01Account.accountNumber,
          balanceUsd: parseFloat(s01Account.balanceUsd || '0'),
          balanceCdf: parseFloat(s01Account.balanceCdf || '0')
        }
      });
    } catch (error: any) {
      console.error('Error fetching S01 balance:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * POST /request
   * Submit a new card request
   */
  fastify.post('/request', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = (request as any).customerId;
      const { cardTypeId, paymentMethod, mobileMoneyProvider, mobileMoneyNumber, currency = 'USD' } = request.body as {
        cardTypeId: number;
        paymentMethod: 'MOBILE_MONEY' | 'S01_ACCOUNT';
        mobileMoneyProvider?: string;
        mobileMoneyNumber?: string;
        currency?: 'USD' | 'CDF';
      };

      if (!customerId) {
        return reply.status(401).send({ success: false, message: 'Non authentifié' });
      }

      // Get card type
      const cardType = await db.query.cardTypes.findFirst({
        where: eq(cardTypes.id, cardTypeId)
      });

      if (!cardType || !cardType.isActive) {
        return reply.status(400).send({ success: false, message: 'Type de carte invalide' });
      }

      // Check eligibility
      const customer = await db.query.customers.findFirst({
        where: eq(customers.id, customerId)
      });

      if (!customer) {
        return reply.status(404).send({ success: false, message: 'Client non trouvé' });
      }

      const kyc2CompletedStatuses = ['KYC2_VERIFIED', 'KYC3_PENDING', 'KYC3_UNDER_REVIEW', 'KYC3_VERIFIED'];
      if (!kyc2CompletedStatuses.includes(customer.kycStatus || '')) {
        return reply.status(400).send({ success: false, message: 'KYC 2 requis pour demander une carte' });
      }

      // Check for existing pending request
      const existingRequest = await db.query.cardRequests.findFirst({
        where: and(
          eq(cardRequests.customerId, customerId),
          sql`${cardRequests.status} NOT IN ('DELIVERED', 'REJECTED', 'CANCELLED')`
        )
      });

      if (existingRequest) {
        return reply.status(400).send({ success: false, message: 'Vous avez déjà une demande de carte en cours' });
      }

      const requestNumber = generateRequestNumber();
      const amountUsd = cardType.priceUsd;
      const amountCdf = cardType.priceCdf;

      // If paying from S01, process payment immediately
      if (paymentMethod === 'S01_ACCOUNT') {
        const s01Account = await db.query.accounts.findFirst({
          where: and(
            eq(accounts.customerId, customerId),
            eq(accounts.accountType, 'S01_STANDARD'),
            eq(accounts.status, 'ACTIVE')
          )
        });

        if (!s01Account) {
          return reply.status(400).send({ success: false, message: 'Compte S01 non trouvé' });
        }

        const balanceUsd = parseFloat(s01Account.balanceUsd || '0');
        const balanceCdf = parseFloat(s01Account.balanceCdf || '0');
        const requiredAmount = currency === 'USD' ? parseFloat(amountUsd) : parseFloat(amountCdf);
        const availableBalance = currency === 'USD' ? balanceUsd : balanceCdf;

        if (availableBalance < requiredAmount) {
          return reply.status(400).send({ 
            success: false, 
            message: `Solde insuffisant. Disponible: ${availableBalance} ${currency}, Requis: ${requiredAmount} ${currency}` 
          });
        }

        // Deduct from S01 account
        await db.transaction(async (tx) => {
          // Update balance
          if (currency === 'USD') {
            await tx.update(accounts)
              .set({ balanceUsd: sql`${accounts.balanceUsd} - ${requiredAmount}` })
              .where(eq(accounts.id, s01Account.id));
          } else {
            await tx.update(accounts)
              .set({ balanceCdf: sql`${accounts.balanceCdf} - ${requiredAmount}` })
              .where(eq(accounts.id, s01Account.id));
          }

          // Create transaction record
          await tx.insert(transactions).values({
            accountId: s01Account.id,
            transactionType: 'CARD_PAYMENT',
            amountUsd: currency === 'USD' ? `-${requiredAmount}` : '0',
            amountCdf: currency === 'CDF' ? `-${requiredAmount}` : '0',
            currency,
            status: 'COMPLETED',
            description: `Paiement carte ${cardType.name} - ${requestNumber}`,
            referenceNumber: requestNumber
          });

          // Create card request
          const [newRequest] = await tx.insert(cardRequests).values({
            customerId,
            cardTypeId,
            requestNumber,
            paymentMethod: 'S01_ACCOUNT',
            amountUsd,
            amountCdf,
            currencyPaid: currency,
            status: 'PAID',
            paidAt: new Date().toISOString()
          }).returning();

          // Create payment record
          await tx.insert(cardPayments).values({
            cardRequestId: newRequest.id,
            customerId,
            paymentMethod: 'S01_ACCOUNT',
            amountUsd,
            amountCdf,
            currency,
            status: 'COMPLETED',
            s01AccountId: s01Account.id,
            completedAt: new Date().toISOString()
          });

          return newRequest;
        });

        // Send email notification (fire and forget)
        emailService.sendCardRequestConfirmation({
          customerEmail: customer.email || '',
          customerName: `${customer.firstName} ${customer.lastName}`,
          requestNumber,
          cardType: cardType.name,
          amount: String(requiredAmount),
          currency,
          paymentMethod: 'S01_ACCOUNT',
          status: 'PAID'
        }).catch(err => console.error('Failed to send card email:', err));

        return reply.status(201).send({
          success: true,
          message: 'Demande de carte soumise avec succès. Paiement effectué depuis votre compte S01.',
          data: {
            requestNumber,
            status: 'PAID',
            cardType: cardType.name,
            amountPaid: requiredAmount,
            currency
          }
        });
      }

      // For Mobile Money, create pending request
      const [newRequest] = await db.insert(cardRequests).values({
        customerId,
        cardTypeId,
        requestNumber,
        paymentMethod: 'MOBILE_MONEY',
        mobileMoneyProvider: mobileMoneyProvider as any,
        mobileMoneyNumber,
        amountUsd,
        amountCdf,
        currencyPaid: currency,
        status: 'PAYMENT_PENDING'
      }).returning();

      // Create pending payment record
      await db.insert(cardPayments).values({
        cardRequestId: newRequest.id,
        customerId,
        paymentMethod: 'MOBILE_MONEY',
        mobileMoneyProvider: mobileMoneyProvider as any,
        amountUsd,
        amountCdf,
        currency,
        status: 'PENDING'
      });

      // Send email notification (fire and forget)
      emailService.sendCardRequestConfirmation({
        customerEmail: customer.email || '',
        customerName: `${customer.firstName} ${customer.lastName}`,
        requestNumber,
        cardType: cardType.name,
        amount: currency === 'USD' ? amountUsd : amountCdf,
        currency,
        paymentMethod: 'MOBILE_MONEY',
        status: 'PAYMENT_PENDING'
      }).catch(err => console.error('Failed to send card email:', err));

      return reply.status(201).send({
        success: true,
        message: 'Demande de carte soumise. Veuillez effectuer le paiement via Mobile Money.',
        data: {
          requestNumber,
          status: 'PAYMENT_PENDING',
          cardType: cardType.name,
          amountToPay: currency === 'USD' ? amountUsd : amountCdf,
          currency,
          mobileMoneyNumber
        }
      });
    } catch (error: any) {
      console.error('Error creating card request:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * GET /my-requests
   * Get customer's card requests with status
   */
  fastify.get('/my-requests', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = (request as any).customerId;
      
      if (!customerId) {
        return reply.status(401).send({ success: false, message: 'Non authentifié' });
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
        cardType: {
          id: cardTypes.id,
          code: cardTypes.code,
          name: cardTypes.name,
          cardColor: cardTypes.cardColor
        }
      })
        .from(cardRequests)
        .leftJoin(cardTypes, eq(cardRequests.cardTypeId, cardTypes.id))
        .where(eq(cardRequests.customerId, customerId))
        .orderBy(desc(cardRequests.requestedAt));

      return reply.send({
        success: true,
        data: requests
      });
    } catch (error: any) {
      console.error('Error fetching card requests:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * POST /cancel/:requestId
   * Cancel a pending card request
   */
  fastify.post('/cancel/:requestId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = (request as any).customerId;
      const { requestId } = request.params as { requestId: string };
      const requestIdNum = parseInt(requestId);

      if (!customerId) {
        return reply.status(401).send({ success: false, message: 'Non authentifié' });
      }

      const cardRequest = await db.query.cardRequests.findFirst({
        where: and(
          eq(cardRequests.id, requestIdNum),
          eq(cardRequests.customerId, customerId)
        )
      });

      if (!cardRequest) {
        return reply.status(404).send({ success: false, message: 'Demande non trouvée' });
      }

      // Can only cancel pending or payment pending requests
      if (!['PENDING', 'PAYMENT_PENDING'].includes(cardRequest.status)) {
        return reply.status(400).send({ success: false, message: 'Cette demande ne peut pas être annulée' });
      }

      await db.update(cardRequests)
        .set({
          status: 'CANCELLED',
          cancelledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .where(eq(cardRequests.id, requestIdNum));

      return reply.send({
        success: true,
        message: 'Demande annulée avec succès'
      });
    } catch (error: any) {
      console.error('Error cancelling card request:', error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });
}
