/**
 * Customer Account Services Routes
 * Manages notification service subscriptions
 * Optimized for fast response times (P90/P95 < 200ms)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AccountNotificationService } from '../services/account-notification.service';

interface GetSubscriptionQuery {
  customerId: string;
  accountId: string;
}

interface UpdateSubscriptionBody {
  customer_id: number;
  account_id: number;
  sms_enabled?: boolean;
  email_enabled?: boolean;
  push_notification_enabled?: boolean;
  in_app_notification_enabled?: boolean;
  monthly_total_fee_usd?: number;
  monthly_total_fee_cdf?: number;
}

interface CancelSubscriptionQuery {
  customerId: string;
  accountId: string;
}

export default async function accountServicesRoutes(fastify: FastifyInstance) {
  /**
   * GET /customer/account-services
   * Get notification service subscription for an account
   */
  fastify.get('/account-services', {
    schema: {
      tags: ['Customer', 'Account Services'],
      summary: 'Get account notification services',
      querystring: {
        type: 'object',
        required: ['customerId', 'accountId'],
        properties: {
          customerId: { type: 'string' },
          accountId: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, accountId } = request.query as GetSubscriptionQuery;

      if (!customerId || !accountId) {
        return reply.status(400).send({
          success: false,
          error: 'customerId and accountId required',
        });
      }

      const subscription = await AccountNotificationService.getSubscription(
        parseInt(customerId, 10),
        parseInt(accountId, 10)
      );

      return reply.send({
        success: true,
        subscription,
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to fetch account services');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch subscription',
      });
    }
  });

  /**
   * POST /customer/account-services
   * Create or update notification service subscription
   */
  fastify.post('/account-services', {
    schema: {
      tags: ['Customer', 'Account Services'],
      summary: 'Create or update account services',
      body: {
        type: 'object',
        required: ['customer_id', 'account_id'],
        properties: {
          customer_id: { type: 'number' },
          account_id: { type: 'number' },
          sms_enabled: { type: 'boolean' },
          email_enabled: { type: 'boolean' },
          push_notification_enabled: { type: 'boolean' },
          in_app_notification_enabled: { type: 'boolean' },
          monthly_total_fee_usd: { type: 'number' },
          monthly_total_fee_cdf: { type: 'number' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const {
        customer_id,
        account_id,
        sms_enabled,
        email_enabled,
        push_notification_enabled,
        in_app_notification_enabled,
        monthly_total_fee_usd,
        monthly_total_fee_cdf,
      } = request.body as UpdateSubscriptionBody;

      if (!customer_id || !account_id) {
        return reply.status(400).send({
          success: false,
          error: 'customer_id and account_id required',
        });
      }

      const subscription = await AccountNotificationService.upsertSubscription({
        customerId: customer_id,
        accountId: account_id,
        smsEnabled: sms_enabled,
        emailEnabled: email_enabled,
        pushNotificationEnabled: push_notification_enabled,
        inAppNotificationEnabled: in_app_notification_enabled,
        monthlyTotalFeeUsd: monthly_total_fee_usd,
        monthlyTotalFeeCdf: monthly_total_fee_cdf,
      });

      return reply.send({
        success: true,
        subscription,
        message: 'Subscription saved successfully',
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to save account services');
      return reply.status(500).send({
        success: false,
        error: 'Failed to save subscription',
      });
    }
  });

  /**
   * DELETE /customer/account-services
   * Cancel subscription (disable all paid services)
   */
  fastify.delete('/account-services', {
    schema: {
      tags: ['Customer', 'Account Services'],
      summary: 'Cancel account services subscription',
      querystring: {
        type: 'object',
        required: ['customerId', 'accountId'],
        properties: {
          customerId: { type: 'string' },
          accountId: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, accountId } = request.query as CancelSubscriptionQuery;

      if (!customerId || !accountId) {
        return reply.status(400).send({
          success: false,
          error: 'customerId and accountId required',
        });
      }

      const subscription = await AccountNotificationService.cancelSubscription(
        parseInt(customerId, 10),
        parseInt(accountId, 10)
      );

      return reply.send({
        success: true,
        subscription,
        message: 'Subscription canceled successfully',
      });
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to cancel subscription');
      
      const statusCode = error.message.includes('not found') ? 404 : 500;

      return reply.status(statusCode).send({
        success: false,
        error: error.message || 'Failed to cancel subscription',
      });
    }
  });

  // NOTE: /notification-fees route is now in customer-notifications.routes.ts to avoid duplication

  /**
   * POST /customer/activate-service
   * Activate a specific notification service
   */
  fastify.post('/activate-service', {
    schema: {
      tags: ['Customer', 'Account Services'],
      summary: 'Activate a notification service',
      body: {
        type: 'object',
        required: ['customerId', 'accountId', 'serviceType'],
        properties: {
          customerId: { type: 'number' },
          accountId: { type: 'number' },
          serviceType: { type: 'string', enum: ['SMS', 'EMAIL', 'PUSH'] },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, accountId, serviceType } = request.body as {
        customerId: number;
        accountId: number;
        serviceType: 'SMS' | 'EMAIL' | 'PUSH';
      };

      const subscription = await AccountNotificationService.activateService(
        customerId,
        accountId,
        serviceType
      );

      return reply.send({
        success: true,
        subscription,
        message: `${serviceType} service activated successfully`,
      });
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to activate service');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to activate service',
      });
    }
  });
}
