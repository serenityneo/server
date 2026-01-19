/**
 * Customer Billing Routes
 * Provides billing history and related endpoints for customer dashboard
 * Optimized for fast response times (P90/P95 < 200ms)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BillingService } from '../services/billing.service';

interface BillingHistoryQueryParams {
  type?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: string;
  offset?: string;
}

interface CustomerIdBody {
  customerId: number;
}

export default async function customerBillingRoutes(fastify: FastifyInstance) {
  /**
   * POST /customer/billing-history
   * Get billing history for a customer
   * Uses POST to support customer authentication via session/body
   */
  fastify.post('/billing-history', {
    schema: {
      tags: ['Customer', 'Billing'],
      summary: 'Get customer billing history',
      description: 'Retrieve billing history with optional filtering',
      body: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'number' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Billing type filter' },
          status: { type: 'string', description: 'Status filter' },
          dateFrom: { type: 'string', format: 'date', description: 'Start date filter' },
          dateTo: { type: 'string', format: 'date', description: 'End date filter' },
          limit: { type: 'number', default: 100 },
          offset: { type: 'number', default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            records: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  customerId: { type: 'number' },
                  accountId: { type: ['number', 'null'] },
                  billingType: { type: 'string' },
                  serviceType: { type: ['string', 'null'] },
                  description: { type: 'string' },
                  amountUsd: { type: 'string' },
                  amountCdf: { type: 'string' },
                  currencyCharged: { type: 'string' },
                  billingPeriodStart: { type: 'string' },
                  billingPeriodEnd: { type: 'string' },
                  chargedAt: { type: 'string' },
                  status: { type: 'string' },
                  transactionId: { type: ['number', 'null'] },
                  createdAt: { type: 'string' },
                },
              },
            },
            count: { type: 'number' },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.body as CustomerIdBody;
      const query = request.query as BillingHistoryQueryParams;

      // Validate customerId
      if (!customerId || isNaN(Number(customerId))) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid customer ID',
        });
      }

      // Parse query parameters
      const type = query.type || null;
      const status = query.status || null;
      const dateFrom = query.dateFrom || null;
      const dateTo = query.dateTo || null;
      const limit = query.limit ? parseInt(query.limit, 10) : 100;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      // Fetch billing history using optimized Drizzle service
      const records = await BillingService.getBillingHistory({
        customerId: Number(customerId),
        type,
        status,
        dateFrom,
        dateTo,
        limit,
        offset,
      });

      return reply.send({
        success: true,
        records,
        count: records.length,
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to fetch billing history');
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve billing history',
      });
    }
  });

  /**
   * POST /customer/billing-summary
   * Get billing summary statistics for a customer
   */
  fastify.post('/billing-summary', {
    schema: {
      tags: ['Customer', 'Billing'],
      summary: 'Get customer billing summary',
      body: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'number' },
          year: { type: 'number', description: 'Year for summary (default: current year)' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, year } = request.body as CustomerIdBody & { year?: number };

      if (!customerId || isNaN(Number(customerId))) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid customer ID',
        });
      }

      const summary = await BillingService.getBillingSummary(Number(customerId), year);

      return reply.send({
        success: true,
        summary,
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to fetch billing summary');
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve billing summary',
      });
    }
  });
}
