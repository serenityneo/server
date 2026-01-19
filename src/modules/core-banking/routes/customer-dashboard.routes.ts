import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { customers, accounts, transactions } from '../../../db/schema';
import { eq, desc, and, gte } from 'drizzle-orm';
import { PgSelect } from 'drizzle-orm/pg-core';

interface CustomerIdBody {
  customerId: number;
}

interface UpdateProfileBody extends CustomerIdBody {
  firstName?: string;
  lastName?: string;
  email?: string;
  mobileMoneyNumber?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  gender?: string;
  address?: string;
  nationality?: string;
  civilStatus?: string;
  motherName?: string;
  agencyId?: number | null;
}

/**
 * Customer Dashboard Routes
 * Optimized endpoints for dashboard data with P90/P95 < 200ms
 */
export default async function customerDashboardRoutes(fastify: FastifyInstance) {
  /**
   * POST /customer/dashboard
   * Get dashboard data for authenticated customer
   * Uses POST to support secure customer authentication
   */
  fastify.post('/dashboard', {
    schema: {
      tags: ['Customer', 'Dashboard'],
      summary: 'Get customer dashboard data',
      description: 'Retrieve dashboard statistics and recent activity',
      body: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'number' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            stats: {
              type: 'object',
              properties: {
                kycStatus: { type: 'string' },
                accountBalance: { type: 'number' },
                accountBalanceCDF: { type: 'number' },
                accountBalanceUSD: { type: 'number' },
                recentTransactions: { type: 'number' },
                totalAccounts: { type: 'number' },
              },
            },
            accounts: {
              type: 'array',
              items: { type: 'object' },
            },
            recentTransactions: {
              type: 'array',
              items: { type: 'object' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.body as CustomerIdBody;

      if (!customerId || isNaN(Number(customerId))) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid customer ID',
        });
      }

      const id = Number(customerId);

      // Get customer data
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, id));

      if (!customer) {
        return reply.status(404).send({
          success: false,
          error: 'Customer not found',
        });
      }

      // Get customer accounts
      const customerAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.customerId, id));

      // Calculate total balance
      let totalBalanceCDF = 0;
      let totalBalanceUSD = 0;

      customerAccounts.forEach(account => {
        if (account.currency === 'CDF') {
          totalBalanceCDF += Number(account.balanceCdf || 0);
        } else if (account.currency === 'USD') {
          totalBalanceUSD += Number(account.balanceUsd || 0);
        }
      });

      // Get recent transactions (last 30 days)
      const thirtyDaysAgo = new Date();
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

      const accountIds = customerAccounts.map(acc => acc.id).filter(id => id !== null) as number[];
      
      let recentTxs: any[] = [];
      if (accountIds.length > 0) {
        // Get transactions for all customer accounts
        const allTransactions = await db
          .select()
          .from(transactions)
          .where(
            and(
              gte(transactions.createdAt, thirtyDaysAgoStr)
            )
          )
          .orderBy(desc(transactions.createdAt))
          .limit(10);

        // Filter transactions for customer accounts
        recentTxs = allTransactions.filter(tx => 
          tx.accountId !== null && accountIds.includes(tx.accountId)
        );
      }

      const dashboardData = {
        success: true,
        stats: {
          kycStatus: customer.kycStatus || 'NOT_STARTED',
          accountBalance: totalBalanceCDF + (totalBalanceUSD * 2700), // Approximate total in CDF
          accountBalanceCDF: totalBalanceCDF,
          accountBalanceUSD: totalBalanceUSD,
          recentTransactions: recentTxs.length,
          totalAccounts: customerAccounts.length,
        },
        accounts: customerAccounts.map(acc => ({
          id: acc.id,
          accountNumber: acc.accountNumber,
          accountType: acc.accountType,
          currency: acc.currency,
          balance: Number(acc.balanceCdf || 0),
          status: acc.status,
        })),
        recentTransactions: recentTxs.map(tx => ({
          id: tx.id,
          type: tx.transactionType,
          amount: Number(tx.amountCdf),
          currency: tx.currency,
          description: tx.description || '',
          status: tx.status,
          createdAt: tx.createdAt,
        })),
      };

      return reply.send(dashboardData);
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to fetch dashboard data');
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve dashboard data',
      });
    }
  });

  /**
   * POST /customer/accounts
   * Get all accounts for a customer
   */
  fastify.post('/accounts', {
    schema: {
      tags: ['Customer', 'Accounts'],
      summary: 'Get customer accounts',
      body: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'number' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.body as CustomerIdBody;

      if (!customerId || isNaN(Number(customerId))) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid customer ID',
        });
      }

      const customerAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.customerId, Number(customerId)))
        .orderBy(accounts.accountType);

      return reply.send({
        success: true,
        accounts: customerAccounts,
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to fetch accounts');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch accounts',
      });
    }
  });

  /**
   * POST /customer/profile/update
   * Update customer profile information
   */
  fastify.post('/profile/update', {
    schema: {
      tags: ['Customer', 'Profile'],
      summary: 'Update customer profile',
      body: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'number' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string' },
          mobileMoneyNumber: { type: 'string' },
          dateOfBirth: { type: 'string' },
          placeOfBirth: { type: 'string' },
          gender: { type: 'string' },
          address: { type: 'string' },
          nationality: { type: 'string' },
          civilStatus: { type: 'string' },
          motherName: { type: 'string' },
          agencyId: { type: ['number', 'null'] },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, ...updateData } = request.body as UpdateProfileBody;

      if (!customerId || isNaN(Number(customerId))) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid customer ID',
        });
      }

      const id = Number(customerId);

      // Build update object excluding undefined values
      const updateObj: any = {};
      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined) {
          updateObj[key] = value;
        }
      });

      // Update customer profile
      const [updatedCustomer] = await db
        .update(customers)
        .set(updateObj)
        .where(eq(customers.id, id))
        .returning();

      if (!updatedCustomer) {
        return reply.status(404).send({
          success: false,
          error: 'Customer not found',
        });
      }

      return reply.send({
        success: true,
        message: 'Profil mis à jour avec succès',
        data: {
          customer: updatedCustomer,
        },
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to update profile');
      return reply.status(500).send({
        success: false,
        error: 'Failed to update profile',
      });
    }
  });
}
