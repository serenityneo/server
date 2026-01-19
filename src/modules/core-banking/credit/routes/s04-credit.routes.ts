/**
 * S04 CREDIT ROUTES
 * 
 * Fastify routes for S04 credit allocation system:
 * - Customer endpoints: Request credit, view status, make repayments
 * - Admin endpoints: Approve/reject requests, manage whitelist/blacklist
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AllocationService } from '../services/allocation.service';
import { CreditEligibilityService } from '../services/eligibility.service';

// Type definitions
interface CreditRequestBody {
  customerId: number;
  s04AccountId: number;
  amount: number;
  currency: 'CDF' | 'USD';
}

interface CustomerIdQuery {
  customerId: number;
}

interface RepaymentBody {
  creditRequestId: number;
  customerId: number;
  allocationId: number;
  amount: number;
  currency: 'CDF' | 'USD';
  paymentMethod?: string;
  sourceAccountId?: number;
  notes?: string;
}

interface ApproveCreditBody {
  creditRequestId: number;
  approvedBy: number;
  dueDate: string;
}

interface RejectCreditBody {
  creditRequestId: number;
  rejectionReason: string;
}

interface BlacklistBody {
  customerId: number;
  reason: string;
  blacklistedBy: number;
}

interface WhitelistBody {
  customerId: number;
  reason: string;
  whitelistedBy: number;
  newCreditLimit?: number;
}

interface AllRequestsQuery {
  status?: string;
  customerId?: number;
  limit?: number;
  offset?: number;
}

export default async function s04CreditRoutes(fastify: FastifyInstance) {
  // ===========================================
  // CUSTOMER ENDPOINTS
  // ===========================================

  /**
   * POST /customer/s04/request-credit
   * Customer requests credit from S04 account
   */
  fastify.post('/customer/s04/request-credit', {
    schema: {
      tags: ['S04 Credit', 'Customer'],
      summary: 'Request credit from S04 account',
      body: {
        type: 'object',
        required: ['customerId', 's04AccountId', 'amount', 'currency'],
        properties: {
          customerId: { type: 'number' },
          s04AccountId: { type: 'number' },
          amount: { type: 'number' },
          currency: { type: 'string', enum: ['CDF', 'USD'] },
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, s04AccountId, amount, currency } = request.body as CreditRequestBody;

      // 1. Check eligibility
      const eligibility = await CreditEligibilityService.checkEligibility(customerId, amount);

      if (!eligibility.isEligible) {
        return reply.status(403).send({
          success: false,
          error: eligibility.reason || 'Not eligible for credit',
          eligibility,
        });
      }

      // 2. Get or create allocation
      const allocation = await AllocationService.getOrCreateAllocation({
        customerId,
        s04AccountId,
        currency,
      });

      // 3. Create credit request
      const result = await AllocationService.createCreditRequest({
        customerId,
        s04AccountId,
        allocationId: allocation.id,
        amountRequested: amount,
        currency,
      });

      return reply.send({
        success: true,
        creditRequest: result.creditRequest,
        calculation: result.calculation,
        message: `Credit request submitted successfully. Amount requested: ${amount} ${currency}`,
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to create credit request');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to create credit request',
      });
    }
  });

  /**
   * GET /customer/s04/my-requests
   * Get customer's credit requests
   */
  fastify.get('/customer/s04/my-requests', {
    schema: {
      tags: ['S04 Credit', 'Customer'],
      summary: 'Get my credit requests',
      querystring: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'number' },
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.query as CustomerIdQuery;

      const { db } = await import('../../../../db');
      const { creditRequests } = await import('../../../../db/schema');
      const { eq } = await import('drizzle-orm');

      const requests = await db
        .select()
        .from(creditRequests)
        .where(eq(creditRequests.customerId, customerId));

      return reply.send({
        success: true,
        requests,
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to fetch credit requests');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /customer/s04/repay
   * Make a repayment on credit
   */
  fastify.post('/customer/s04/repay', {
    schema: {
      tags: ['S04 Credit', 'Customer'],
      summary: 'Make credit repayment',
      body: {
        type: 'object',
        required: ['creditRequestId', 'customerId', 'allocationId', 'amount', 'currency'],
        properties: {
          creditRequestId: { type: 'number' },
          customerId: { type: 'number' },
          allocationId: { type: 'number' },
          amount: { type: 'number' },
          currency: { type: 'string', enum: ['CDF', 'USD'] },
          paymentMethod: { type: 'string' },
          sourceAccountId: { type: 'number' },
          notes: { type: 'string' },
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as RepaymentBody;
      const result = await AllocationService.processRepayment(body);

      // Update credit statistics
      await CreditEligibilityService.updateCreditStatistics(body.customerId);

      return reply.send({
        success: true,
        repayment: result.repayment,
        summary: result.summary,
        message: result.summary.isFullyRepaid 
          ? 'Credit fully repaid! 🎉' 
          : `Repayment processed. Remaining debt: ${result.summary.newDebt} ${body.currency}`,
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to process repayment');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /customer/s04/eligibility
   * Check credit eligibility
   */
  fastify.get('/customer/s04/eligibility', {
    schema: {
      tags: ['S04 Credit', 'Customer'],
      summary: 'Check credit eligibility',
      querystring: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'number' },
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.query as CustomerIdQuery;

      const eligibility = await CreditEligibilityService.getCustomerEligibility(customerId);

      return reply.send({
        success: true,
        eligibility,
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to check eligibility');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /customer/s04/allocation-summary
   * Get allocation summary for customer
   */
  fastify.get('/customer/s04/allocation-summary', {
    schema: {
      tags: ['S04 Credit', 'Customer'],
      summary: 'Get allocation summary',
      querystring: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'number' },
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.query as CustomerIdQuery;

      const summary = await AllocationService.getCustomerAllocationSummary(customerId);

      return reply.send({
        success: true,
        allocations: summary.allocations,
        summary: summary.summary,
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to get allocation summary');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // ===========================================
  // ADMIN ENDPOINTS
  // ===========================================

  /**
   * POST /admin/s04/approve-credit
   * Admin approves credit request
   */
  fastify.post('/admin/s04/approve-credit', {
    schema: {
      tags: ['S04 Credit', 'Admin'],
      summary: 'Approve credit request',
      body: {
        type: 'object',
        required: ['creditRequestId', 'approvedBy', 'dueDate'],
        properties: {
          creditRequestId: { type: 'number' },
          approvedBy: { type: 'number' },
          dueDate: { type: 'string' },
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { creditRequestId, approvedBy, dueDate } = request.body as ApproveCreditBody;

      const result = await AllocationService.approveCreditRequest(
        creditRequestId,
        approvedBy,
        new Date(dueDate)
      );

      return reply.send({
        success: result.success,
        creditRequestId: result.creditRequestId,
        amountDisbursed: result.amountDisbursed,
        commissionCollected: result.commissionCollected,
        message: 'Credit request approved and disbursed successfully',
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to approve credit request');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /admin/s04/reject-credit
   * Admin rejects credit request
   */
  fastify.post('/admin/s04/reject-credit', {
    schema: {
      tags: ['S04 Credit', 'Admin'],
      summary: 'Reject credit request',
      body: {
        type: 'object',
        required: ['creditRequestId', 'rejectionReason'],
        properties: {
          creditRequestId: { type: 'number' },
          rejectionReason: { type: 'string' },
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { creditRequestId, rejectionReason } = request.body as RejectCreditBody;

      const { db } = await import('../../../../db');
      const { creditRequests } = await import('../../../../db/schema');
      const { eq } = await import('drizzle-orm');

      await db
        .update(creditRequests)
        .set({
          status: 'REJECTED',
          rejectionReason,
        })
        .where(eq(creditRequests.id, creditRequestId));

      return reply.send({
        success: true,
        message: 'Credit request rejected',
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to reject credit request');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /admin/s04/pending-requests
   * Get all pending credit requests
   */
  fastify.get('/admin/s04/pending-requests', {
    schema: {
      tags: ['S04 Credit', 'Admin'],
      summary: 'Get pending credit requests',
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { db } = await import('../../../../db');
      const { creditRequests, customers } = await import('../../../../db/schema');
      const { eq } = await import('drizzle-orm');

      const pending = await db
        .select({
          request: creditRequests,
          customer: customers,
        })
        .from(creditRequests)
        .leftJoin(customers, eq(creditRequests.customerId, customers.id))
        .where(eq(creditRequests.status, 'PENDING'));

      return reply.send({
        success: true,
        requests: pending,
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to fetch pending requests');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /admin/s04/blacklist-customer
   * Blacklist a customer
   */
  fastify.post('/admin/s04/blacklist-customer', {
    schema: {
      tags: ['S04 Credit', 'Admin'],
      summary: 'Blacklist customer',
      body: {
        type: 'object',
        required: ['customerId', 'reason', 'blacklistedBy'],
        properties: {
          customerId: { type: 'number' },
          reason: { type: 'string' },
          blacklistedBy: { type: 'number' },
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, reason, blacklistedBy } = request.body as BlacklistBody;

      const result = await CreditEligibilityService.blacklistCustomer(
        customerId,
        reason,
        blacklistedBy
      );

      return reply.send(result);

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to blacklist customer');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /admin/s04/whitelist-customer
   * Whitelist a customer
   */
  fastify.post('/admin/s04/whitelist-customer', {
    schema: {
      tags: ['S04 Credit', 'Admin'],
      summary: 'Whitelist customer',
      body: {
        type: 'object',
        required: ['customerId', 'reason', 'whitelistedBy'],
        properties: {
          customerId: { type: 'number' },
          reason: { type: 'string' },
          whitelistedBy: { type: 'number' },
          newCreditLimit: { type: 'number' },
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, reason, whitelistedBy, newCreditLimit } = request.body as WhitelistBody;

      const result = await CreditEligibilityService.whitelistCustomer(
        customerId,
        reason,
        whitelistedBy,
        newCreditLimit
      );

      return reply.send(result);

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to whitelist customer');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /admin/s04/all-requests
   * Get all credit requests with filters
   */
  fastify.get('/admin/s04/all-requests', {
    schema: {
      tags: ['S04 Credit', 'Admin'],
      summary: 'Get all credit requests',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          customerId: { type: 'number' },
          limit: { type: 'number' },
          offset: { type: 'number' },
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { status, customerId, limit = 50, offset = 0 } = request.query as AllRequestsQuery;

      const { db } = await import('../../../../db');
      const { creditRequests, customers } = await import('../../../../db/schema');
      const { eq, and, sql } = await import('drizzle-orm');

      let query = db
        .select({
          request: creditRequests,
          customer: customers,
        })
        .from(creditRequests)
        .leftJoin(customers, eq(creditRequests.customerId, customers.id))
        .limit(limit)
        .offset(offset);

      // Apply filters
      const conditions = [];
      if (status) {
        conditions.push(eq(creditRequests.status, status));
      }
      if (customerId) {
        conditions.push(eq(creditRequests.customerId, customerId));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const requests = await query;

      return reply.send({
        success: true,
        requests,
        pagination: {
          limit,
          offset,
        }
      });

    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to fetch credit requests');
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  fastify.log.info('[Routes] S04 Credit routes registered successfully');
}
