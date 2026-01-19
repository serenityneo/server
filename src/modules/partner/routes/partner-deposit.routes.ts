import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { customers, accounts, transactions } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { depositTrackingService } from '../services/deposit-tracking.service';
import { eligibilityEngine } from '../../../services/eligibility-engine';

/**
 * Partner Deposit Routes
 * 
 * Endpoints for partners to perform deposit operations
 * Includes automatic first deposit detection and commission award
 */

/**
 * Security helper - Handle errors safely (BANKING SECURITY)
 */
function handleError(request: FastifyRequest, reply: FastifyReply, error: unknown, statusCode: number = 500) {
  // Log full error server-side for debugging
  request.log.error({ err: error }, 'Partner deposit error');
  
  // Send only generic error message to client (NEVER expose SQL/internal details)
  reply.status(statusCode).send({
    success: false,
    error: statusCode === 401 ? 'Non autorisé' : 
           statusCode === 403 ? 'Accès refusé' : 
           'Une erreur est survenue. Veuillez réessayer.'
  });
}

/**
 * Middleware to verify partner authentication
 */
async function requirePartnerAuth(request: FastifyRequest, reply: FastifyReply) {
  const customerId = (request.body as any)?.partnerId || (request.query as any)?.partnerId;
  
  if (!customerId) {
    return reply.code(401).send({
      success: false,
      error: 'Partner authentication required. Please provide partnerId.'
    });
  }

  // Verify this is a partner account
  const [customer] = await db
    .select({ id: customers.id, customerType: customers.customerType })
    .from(customers)
    .where(and(
      eq(customers.id, Number(customerId)),
      eq(customers.customerType, 'PARTNER')
    ))
    .limit(1);

  if (!customer) {
    return reply.code(403).send({
      success: false,
      error: 'Access denied. Partner authentication required.'
    });
  }

  // Attach to request for use in routes
  (request as any).partnerId = Number(customerId);
}

export async function partnerDepositRoutes(fastify: FastifyInstance) {
  /**
   * POST /partner/deposit
   * Process a deposit for a member account
   * Automatically detects and awards commission for first deposits
   */
  fastify.post('/partner/deposit', {
    preHandler: requirePartnerAuth,
    schema: {
      tags: ['Partner - Operations'],
      summary: 'Process member deposit (with first deposit commission)',
      body: {
        type: 'object',
        properties: {
          partnerId: { type: 'number', description: 'Partner performing the deposit' },
          customerId: { type: 'number', description: 'Member customer ID' },
          accountNumber: { type: 'string', description: 'Member account number' },
          amount: { type: 'number', minimum: 0.01, description: 'Deposit amount' },
          currency: { type: 'string', enum: ['USD', 'CDF'], description: 'Currency' },
          notes: { type: 'string', description: 'Optional notes' }
        },
        required: ['partnerId', 'customerId', 'amount', 'currency']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;
      const body = request.body as {
        customerId: number;
        accountNumber?: string;
        amount: number;
        currency: 'USD' | 'CDF';
        notes?: string;
      };

      // Validate member exists
      const [member] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, body.customerId))
        .limit(1);

      if (!member) {
        return reply.status(404).send({
          success: false,
          error: 'Member not found'
        });
      }

      if (member.customerType !== 'MEMBER') {
        return reply.status(400).send({
          success: false,
          error: 'Deposits can only be made to member accounts'
        });
      }

      // Find member's account (get default S01 account if account number not specified)
      let account;
      if (body.accountNumber) {
        [account] = await db
          .select()
          .from(accounts)
          .where(and(
            eq(accounts.accountNumber, body.accountNumber),
            eq(accounts.customerId, body.customerId)
          ))
          .limit(1);
      } else {
        // Get first active account
        [account] = await db
          .select()
          .from(accounts)
          .where(and(
            eq(accounts.customerId, body.customerId),
            eq(accounts.status, 'ACTIVE')
          ))
          .limit(1);
      }

      if (!account) {
        return reply.status(404).send({
          success: false,
          error: 'No active account found for this member'
        });
      }

      // Check for first deposit BEFORE processing
      const isFirstDeposit = await depositTrackingService.isFirstDeposit(body.customerId);

      // Create transaction record
      const referenceNumber = `DEP-${Date.now()}-${partnerId}`;
      const [transaction] = await db.insert(transactions).values({
        accountId: account.id,
        transactionType: 'DEPOSIT',
        amountCdf: body.currency === 'CDF' ? body.amount.toString() : '0',
        amountUsd: body.currency === 'USD' ? body.amount.toString() : '0',
        currency: body.currency,
        description: `Deposit by partner #${partnerId}${body.notes ? ': ' + body.notes : ''}`,
        referenceNumber,
        status: 'COMPLETED',
        processedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }).returning();

      // Update account balance
      const balanceField = body.currency === 'CDF' ? 'balanceCdf' : 'balanceUsd';
      await db
        .update(accounts)
        .set({
          [balanceField]: (parseFloat(account[balanceField] || '0') + body.amount).toString(),
          updatedAt: new Date().toISOString()
        })
        .where(eq(accounts.id, account.id));

      // Track first deposit and award commission
      let firstDepositResult = null;
      if (isFirstDeposit) {
        firstDepositResult = await depositTrackingService.recordFirstDeposit({
          customerId: body.customerId,
          depositAmount: body.amount,
          currency: body.currency,
          partnerId
        });
      }

      // Trigger eligibility evaluation asynchronously (non-blocking)
      // This checks if the deposit unlocks any new accounts (S02-S06) or services (BOMBÉ, etc.)
      eligibilityEngine.evaluateAllForCustomer(body.customerId, 'DEPOSIT').catch(err => {
        request.log.error({ err }, 'Eligibility evaluation error after partner deposit');
      });

      return reply.send({
        success: true,
        message: 'Deposit processed successfully',
        data: {
          transaction,
          isFirstDeposit: isFirstDeposit,
          commissionAwarded: firstDepositResult?.commissionAwarded || false,
          commissionDetails: firstDepositResult?.commissionDetails
        }
      });

    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /partner/deposit/first-deposit-stats
   * Get partner's first deposit statistics
   */
  fastify.get('/partner/deposit/first-deposit-stats', {
    preHandler: requirePartnerAuth,
    schema: {
      tags: ['Partner - Operations'],
      summary: 'Get first deposit statistics',
      querystring: {
        type: 'object',
        properties: {
          partnerId: { type: 'number' }
        },
        required: ['partnerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;

      const stats = await depositTrackingService.getPartnerFirstDepositStats(partnerId);

      return reply.send({
        success: true,
        data: stats
      });

    } catch (error) {
      handleError(request, reply, error, 500);
    }
  });

  console.log('[Routes] Partner deposit routes registered');
}
