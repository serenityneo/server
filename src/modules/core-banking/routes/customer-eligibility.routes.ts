/**
 * Customer Eligibility & Smart Notifications Routes
 * 
 * Provides endpoints for:
 * - Customer eligibility status (accounts S01-S06 and services BOMBÉ, TELEMA, etc.)
 * - Smart notifications (celebration, progress, motivation, alerts)
 * - Progress tracking towards eligibility
 * 
 * All routes use POST with customerId in body for security (no URL params)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { 
  customerEligibilityStatus, 
  customerNotifications,
  customers,
  accounts
} from '../../../db/schema';
import { eq, and, desc, ne, or, isNull, gte, lte, sql } from 'drizzle-orm';
import { eligibilityEngine } from '../../../services/eligibility-engine';

interface CustomerIdBody {
  customerId: number;
}

interface NotificationActionBody extends CustomerIdBody {
  notificationId: number;
}

/**
 * Customer Eligibility Routes
 */
export default async function customerEligibilityRoutes(fastify: FastifyInstance) {
  
  /**
   * POST /customer/eligibility/status
   * Get customer's eligibility status for all accounts and services
   */
  fastify.post('/eligibility/status', {
    schema: {
      tags: ['Customer', 'Eligibility'],
      summary: 'Get customer eligibility status',
      description: 'Returns eligibility status for all 6 accounts (S01-S06) and 5 credit services',
      body: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'number' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            eligibility: {
              type: 'object',
              properties: {
                accounts: { type: 'array', items: { type: 'object' } },
                services: { type: 'array', items: { type: 'object' } },
                summary: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.body as CustomerIdBody;
      
      if (!customerId || isNaN(Number(customerId))) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid customer ID'
        });
      }

      const id = Number(customerId);

      // Get all eligibility status records
      const status = await db
        .select()
        .from(customerEligibilityStatus)
        .where(eq(customerEligibilityStatus.customerId, id))
        .orderBy(customerEligibilityStatus.targetType, customerEligibilityStatus.targetCode);

      // Split into accounts and services
      const accountStatus = status.filter(s => s.targetType === 'ACCOUNT');
      const serviceStatus = status.filter(s => s.targetType === 'SERVICE');

      // Calculate summary
      const eligibleAccounts = accountStatus.filter(s => s.isEligible).length;
      const activatedAccounts = accountStatus.filter(s => s.isActivated).length;
      const eligibleServices = serviceStatus.filter(s => s.isEligible).length;
      const activatedServices = serviceStatus.filter(s => s.isActivated).length;

      // Find next milestone
      const nextMilestone = status
        .filter(s => !s.isEligible)
        .sort((a, b) => parseFloat(b.progressPercentage.toString()) - parseFloat(a.progressPercentage.toString()))[0];

      return reply.send({
        success: true,
        eligibility: {
          accounts: accountStatus.map(formatEligibilityItem),
          services: serviceStatus.map(formatEligibilityItem),
          summary: {
            totalAccounts: 6,
            eligibleAccounts,
            activatedAccounts,
            totalServices: 5,
            eligibleServices,
            activatedServices,
            overallProgress: status.length > 0 
              ? Math.round(status.reduce((sum, s) => sum + parseFloat(s.progressPercentage.toString()), 0) / status.length)
              : 0,
            nextMilestone: nextMilestone ? {
              type: nextMilestone.targetType,
              code: nextMilestone.targetCode,
              progress: parseFloat(nextMilestone.progressPercentage.toString()),
              estimatedDays: nextMilestone.estimatedDaysToEligibility
            } : null
          }
        }
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to fetch eligibility status');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch eligibility status'
      });
    }
  });

  /**
   * POST /customer/eligibility/evaluate
   * Trigger eligibility evaluation for the customer
   */
  fastify.post('/eligibility/evaluate', {
    schema: {
      tags: ['Customer', 'Eligibility'],
      summary: 'Evaluate customer eligibility',
      description: 'Triggers a fresh evaluation of eligibility for all targets',
      body: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.body as CustomerIdBody;
      
      if (!customerId || isNaN(Number(customerId))) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid customer ID'
        });
      }

      const id = Number(customerId);

      // Run eligibility evaluation
      const results = await eligibilityEngine.evaluateAllForCustomer(id, 'CUSTOMER_REQUEST');

      return reply.send({
        success: true,
        message: 'Eligibility evaluated successfully',
        results: results.map(r => ({
          targetType: r.targetType,
          targetCode: r.targetCode,
          isEligible: r.isEligible,
          score: r.eligibilityScore,
          progress: r.progressPercentage,
          conditionsMet: r.conditionsMet.length,
          conditionsMissing: r.conditionsMissing.length,
          estimatedDays: r.estimatedDaysToEligibility
        }))
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to evaluate eligibility');
      return reply.status(500).send({
        success: false,
        error: 'Failed to evaluate eligibility'
      });
    }
  });

  /**
   * POST /customer/notifications/smart
   * Get smart notifications for the customer (celebration, progress, motivation, etc.)
   */
  fastify.post('/notifications/smart', {
    schema: {
      tags: ['Customer', 'Notifications'],
      summary: 'Get smart notifications',
      description: 'Returns active smart notifications (not dismissed) for the dashboard',
      body: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'number' },
          limit: { type: 'number', default: 10 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, limit = 10 } = request.body as CustomerIdBody & { limit?: number };
      
      if (!customerId || isNaN(Number(customerId))) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid customer ID'
        });
      }

      const id = Number(customerId);
      const now = new Date().toISOString();

      // Get active notifications (not dismissed, not expired, scheduled or no schedule)
      const notifications = await db
        .select()
        .from(customerNotifications)
        .where(and(
          eq(customerNotifications.customerId, id),
          eq(customerNotifications.isDismissed, false),
          or(
            isNull(customerNotifications.expiresAt),
            gte(customerNotifications.expiresAt, now)
          ),
          or(
            isNull(customerNotifications.scheduledFor),
            sql`${customerNotifications.scheduledFor} <= ${now}`
          )
        ))
        .orderBy(
          desc(customerNotifications.priority),
          desc(customerNotifications.createdAt)
        )
        .limit(limit);

      // Update last shown and shown count
      for (const notif of notifications) {
        await db.update(customerNotifications)
          .set({
            lastShownAt: now,
            shownCount: (notif.shownCount || 0) + 1,
            updatedAt: now
          })
          .where(eq(customerNotifications.id, notif.id));
      }

      // Group by type for UI
      const grouped = {
        celebration: notifications.filter(n => n.notificationType === 'CELEBRATION'),
        progress: notifications.filter(n => n.notificationType === 'PROGRESS'),
        motivation: notifications.filter(n => n.notificationType === 'MOTIVATION'),
        alerts: notifications.filter(n => n.notificationType === 'ALERT'),
        reminders: notifications.filter(n => n.notificationType === 'REMINDER'),
        system: notifications.filter(n => n.notificationType === 'SYSTEM')
      };

      return reply.send({
        success: true,
        notifications: notifications.map(formatNotification),
        grouped,
        unreadCount: notifications.filter(n => !n.isRead).length,
        totalCount: notifications.length
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to fetch smart notifications');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch notifications'
      });
    }
  });

  /**
   * POST /customer/notifications/dismiss
   * Dismiss a notification
   */
  fastify.post('/notifications/dismiss', {
    schema: {
      tags: ['Customer', 'Notifications'],
      summary: 'Dismiss notification',
      body: {
        type: 'object',
        required: ['customerId', 'notificationId'],
        properties: {
          customerId: { type: 'number' },
          notificationId: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, notificationId } = request.body as NotificationActionBody;
      
      if (!customerId || !notificationId) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request parameters'
        });
      }

      const now = new Date().toISOString();

      // Update notification
      const [updated] = await db
        .update(customerNotifications)
        .set({
          isDismissed: true,
          dismissedAt: now,
          updatedAt: now
        })
        .where(and(
          eq(customerNotifications.id, notificationId),
          eq(customerNotifications.customerId, customerId)
        ))
        .returning();

      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'Notification not found'
        });
      }

      return reply.send({
        success: true,
        message: 'Notification dismissed'
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to dismiss notification');
      return reply.status(500).send({
        success: false,
        error: 'Failed to dismiss notification'
      });
    }
  });

  /**
   * POST /customer/notifications/mark-read
   * Mark a notification as read
   */
  fastify.post('/notifications/mark-read', {
    schema: {
      tags: ['Customer', 'Notifications'],
      summary: 'Mark notification as read',
      body: {
        type: 'object',
        required: ['customerId', 'notificationId'],
        properties: {
          customerId: { type: 'number' },
          notificationId: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, notificationId } = request.body as NotificationActionBody;
      
      if (!customerId || !notificationId) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request parameters'
        });
      }

      const now = new Date().toISOString();

      await db
        .update(customerNotifications)
        .set({
          isRead: true,
          readAt: now,
          updatedAt: now
        })
        .where(and(
          eq(customerNotifications.id, notificationId),
          eq(customerNotifications.customerId, customerId)
        ));

      return reply.send({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to mark notification read');
      return reply.status(500).send({
        success: false,
        error: 'Failed to mark notification read'
      });
    }
  });

  /**
   * POST /customer/notifications/action
   * Record that user took action on a notification
   */
  fastify.post('/notifications/action', {
    schema: {
      tags: ['Customer', 'Notifications'],
      summary: 'Record action taken on notification',
      body: {
        type: 'object',
        required: ['customerId', 'notificationId'],
        properties: {
          customerId: { type: 'number' },
          notificationId: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, notificationId } = request.body as NotificationActionBody;
      
      if (!customerId || !notificationId) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request parameters'
        });
      }

      const now = new Date().toISOString();

      await db
        .update(customerNotifications)
        .set({
          isActionTaken: true,
          actionTakenAt: now,
          isRead: true,
          readAt: now,
          updatedAt: now
        })
        .where(and(
          eq(customerNotifications.id, notificationId),
          eq(customerNotifications.customerId, customerId)
        ));

      return reply.send({
        success: true,
        message: 'Action recorded'
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to record action');
      return reply.status(500).send({
        success: false,
        error: 'Failed to record action'
      });
    }
  });

  /**
   * POST /customer/eligibility/target/:targetType/:targetCode
   * Get detailed eligibility for a specific account or service
   */
  fastify.post('/eligibility/target', {
    schema: {
      tags: ['Customer', 'Eligibility'],
      summary: 'Get eligibility details for specific target',
      body: {
        type: 'object',
        required: ['customerId', 'targetType', 'targetCode'],
        properties: {
          customerId: { type: 'number' },
          targetType: { type: 'string', enum: ['ACCOUNT', 'SERVICE'] },
          targetCode: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, targetType, targetCode } = request.body as CustomerIdBody & { 
        targetType: 'ACCOUNT' | 'SERVICE'; 
        targetCode: string 
      };
      
      if (!customerId || !targetType || !targetCode) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request parameters'
        });
      }

      const id = Number(customerId);

      // Get eligibility status
      const [status] = await db
        .select()
        .from(customerEligibilityStatus)
        .where(and(
          eq(customerEligibilityStatus.customerId, id),
          eq(customerEligibilityStatus.targetType, targetType),
          eq(customerEligibilityStatus.targetCode, targetCode)
        ))
        .limit(1);

      if (!status) {
        // Evaluate if no status exists
        const result = await eligibilityEngine.evaluateEligibility(id, targetType, targetCode, 'CUSTOMER_REQUEST');
        
        return reply.send({
          success: true,
          eligibility: {
            targetType: result.targetType,
            targetCode: result.targetCode,
            isEligible: result.isEligible,
            isActivated: false,
            score: result.eligibilityScore,
            progress: result.progressPercentage,
            conditionsMet: result.conditionsMet,
            conditionsMissing: result.conditionsMissing,
            estimatedDays: result.estimatedDaysToEligibility
          }
        });
      }

      return reply.send({
        success: true,
        eligibility: {
          targetType: status.targetType,
          targetCode: status.targetCode,
          isEligible: status.isEligible,
          isActivated: status.isActivated,
          score: parseFloat(status.eligibilityScore.toString()),
          progress: parseFloat(status.progressPercentage.toString()),
          conditionsMet: status.conditionsMet || [],
          conditionsMissing: status.conditionsMissing || [],
          estimatedDays: status.estimatedDaysToEligibility,
          lastEvaluated: status.lastEvaluatedAt,
          eligibleSince: status.eligibleSince,
          activatedAt: status.activatedAt
        }
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to get target eligibility');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get eligibility details'
      });
    }
  });
}

/**
 * Format eligibility item for API response
 */
function formatEligibilityItem(item: any) {
  return {
    id: item.id,
    targetType: item.targetType,
    targetCode: item.targetCode,
    isEligible: item.isEligible,
    isActivated: item.isActivated,
    score: parseFloat(item.eligibilityScore?.toString() || '0'),
    progress: parseFloat(item.progressPercentage?.toString() || '0'),
    estimatedDays: item.estimatedDaysToEligibility,
    conditionsMet: item.conditionsMet || [],
    conditionsMissing: item.conditionsMissing || [],
    lastEvaluated: item.lastEvaluatedAt,
    eligibleSince: item.eligibleSince,
    activatedAt: item.activatedAt
  };
}

/**
 * Format notification for API response
 */
function formatNotification(item: any) {
  return {
    id: item.id,
    type: item.notificationType,
    priority: item.priority,
    title: item.title,
    message: item.message,
    actionLabel: item.actionLabel,
    actionUrl: item.actionUrl,
    icon: item.icon,
    targetType: item.targetType,
    targetCode: item.targetCode,
    displayDuration: item.displayDurationSeconds,
    isRead: item.isRead,
    isDismissed: item.isDismissed,
    isActionTaken: item.isActionTaken,
    createdAt: item.createdAt,
    metadata: item.metadata
  };
}
