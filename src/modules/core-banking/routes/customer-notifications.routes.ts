import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { 
  notificationServiceFees, 
  customerAccountServices, 
  accounts 
} from '../../../db/schema';
import { eq, and, desc } from 'drizzle-orm';

interface CustomerIdBody {
  customerId: number;
}

interface ActivateServiceBody extends CustomerIdBody {
  serviceType: string;
}

/**
 * Customer Notification Services Routes
 * Optimized endpoints for notification services with P90/P95 < 200ms
 */
export default async function customerNotificationRoutes(fastify: FastifyInstance) {
  /**
   * GET /customer/notification-fees
   * Get all available notification service fees
   */
  fastify.get('/notification-fees', {
    schema: {
      tags: ['Customer', 'Notifications'],
      summary: 'Get notification service fees',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            fees: {
              type: 'array',
              items: { type: 'object' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const fees = await db
        .select()
        .from(notificationServiceFees)
        .orderBy(
          desc(notificationServiceFees.isFree),
          notificationServiceFees.serviceType
        );

      return reply.send({
        success: true,
        fees,
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to fetch notification fees');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch notification fees',
      });
    }
  });

  /**
   * POST /customer/my-notification-services
   * Get customer's notification service configuration
   */
  fastify.post('/my-notification-services', {
    schema: {
      tags: ['Customer', 'Notifications'],
      summary: 'Get customer notification services',
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

      const id = Number(customerId);

      // Get first configuration (global)
      const [services] = await db
        .select()
        .from(customerAccountServices)
        .where(eq(customerAccountServices.customerId, id))
        .limit(1);

      // Return default values if no configuration exists
      if (!services) {
        return reply.send({
          success: true,
          services: {
            sms_enabled: false,
            email_enabled: false,
            push_notification_enabled: false,
            in_app_notification_enabled: true,
            monthly_total_fee_usd: '0.00',
            monthly_total_fee_cdf: '0.00',
          },
        });
      }

      return reply.send({
        success: true,
        services: {
          sms_enabled: services.smsEnabled,
          email_enabled: services.emailEnabled,
          push_notification_enabled: services.pushNotificationEnabled,
          in_app_notification_enabled: services.inAppNotificationEnabled,
          monthly_total_fee_usd: services.monthlyTotalFeeUsd?.toString() || '0.00',
          monthly_total_fee_cdf: services.monthlyTotalFeeCdf?.toString() || '0.00',
        },
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to fetch notification services');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch notification services',
      });
    }
  });

  /**
   * POST /customer/activate-notification-service
   * Activate a notification service for the customer
   */
  fastify.post('/activate-notification-service', {
    schema: {
      tags: ['Customer', 'Notifications'],
      summary: 'Activate notification service',
      body: {
        type: 'object',
        required: ['customerId', 'serviceType'],
        properties: {
          customerId: { type: 'number' },
          serviceType: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, serviceType } = request.body as ActivateServiceBody;

      if (!customerId || isNaN(Number(customerId))) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid customer ID',
        });
      }

      const id = Number(customerId);

      // Get service fee
      const [serviceFee] = await db
        .select()
        .from(notificationServiceFees)
        .where(eq(notificationServiceFees.serviceType, serviceType))
        .limit(1);

      if (!serviceFee) {
        return reply.status(404).send({
          success: false,
          error: 'Service not found',
        });
      }

      if (!serviceFee.isActive) {
        return reply.status(400).send({
          success: false,
          error: 'Service not available',
        });
      }

      // Get customer accounts
      const customerAccounts = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.customerId, id),
            eq(accounts.status, 'ACTIVE')
          )
        );

      if (customerAccounts.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'No active accounts found',
        });
      }

      // Calculate next billing date
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      nextBillingDate.setDate(1);
      nextBillingDate.setHours(0, 0, 0, 0);

      // Get current config
      const [currentConfig] = await db
        .select()
        .from(customerAccountServices)
        .where(eq(customerAccountServices.customerId, id))
        .limit(1);

      // Calculate new totals
      const currentUsd = Number(currentConfig?.monthlyTotalFeeUsd || 0);
      const currentCdf = Number(currentConfig?.monthlyTotalFeeCdf || 0);
      const totalUsd = currentUsd + Number(serviceFee.monthlyFeeUsd);
      const totalCdf = currentCdf + Number(serviceFee.monthlyFeeCdf);

      // Update or create for all accounts
      for (const account of customerAccounts) {
        const updates: any = {
          servicesActivatedAt: new Date(),
          nextBillingDate,
          monthlyTotalFeeUsd: totalUsd.toString(),
          monthlyTotalFeeCdf: totalCdf.toString(),
        };

        switch (serviceType) {
          case 'EMAIL':
            updates.emailEnabled = true;
            break;
          case 'SMS':
            updates.smsEnabled = true;
            break;
          case 'PUSH_NOTIFICATION':
            updates.pushNotificationEnabled = true;
            break;
          default:
            return reply.status(400).send({
              success: false,
              error: 'Invalid service type',
            });
        }

        // Check if record exists
        const [existing] = await db
          .select()
          .from(customerAccountServices)
          .where(
            and(
              eq(customerAccountServices.customerId, id),
              eq(customerAccountServices.accountId, account.id)
            )
          )
          .limit(1);

        if (existing) {
          // Update existing
          await db
            .update(customerAccountServices)
            .set(updates)
            .where(
              and(
                eq(customerAccountServices.customerId, id),
                eq(customerAccountServices.accountId, account.id)
              )
            );
        } else {
          // Create new
          await db
            .insert(customerAccountServices)
            .values([{
              customerId: id,
              accountId: account.id,
              smsEnabled: serviceType === 'SMS',
              emailEnabled: serviceType === 'EMAIL',
              pushNotificationEnabled: serviceType === 'PUSH_NOTIFICATION',
              inAppNotificationEnabled: true,
              monthlyTotalFeeUsd: totalUsd.toString(),
              monthlyTotalFeeCdf: totalCdf.toString(),
              nextBillingDate: nextBillingDate.toISOString(),
            }])
            .returning();
        }
      }

      return reply.send({
        success: true,
        message: `Service ${serviceFee.serviceName} activated successfully`,
        total_fee_usd: totalUsd,
        total_fee_cdf: totalCdf,
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to activate notification service');
      return reply.status(500).send({
        success: false,
        error: 'Failed to activate service',
      });
    }
  });
}
