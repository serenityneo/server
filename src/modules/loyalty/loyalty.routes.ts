/**
 * LOYALTY POINTS SYSTEM - CLIENT API ROUTES
 * 
 * Endpoints for customers to:
 * - View point balance
 * - Browse transaction history
 * - Explore reward catalog
 * - Redeem points for rewards
 * - Manage notifications
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { loyaltyPointsService } from './loyalty-points.service';
import { loyaltyNotificationsService } from './loyalty-notifications.service';
import { db } from '../../db';
import { loyaltyRewards, loyaltyRedemptions, customers } from '../../db/schema';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Middleware to extract customer ID from auth
 * In production, this would validate JWT token
 */
async function getCustomerId(request: FastifyRequest): Promise<number> {
  // TODO: Extract from JWT token in production
  const customerId = (request.query as any).customerId || (request.body as any)?.customerId;
  
  if (!customerId) {
    throw new Error('Customer ID required');
  }
  
  return parseInt(customerId as string);
}

export async function registerLoyaltyRoutes(fastify: FastifyInstance) {
  
  // ===== CLIENT ENDPOINTS =====
  
  /**
   * GET /loyalty/balance
   * Get customer's current point balance
   */
  fastify.get('/loyalty/balance', {
    schema: {
      tags: ['Loyalty'],
      summary: 'Get point balance',
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            balance: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                earned: { type: 'number' },
                redeemed: { type: 'number' },
                expired: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = await getCustomerId(request);
      const balance = await loyaltyPointsService.getBalance(customerId);
      
      return {
        success: true,
        balance
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching balance');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch balance'
      });
    }
  });

  /**
   * GET /loyalty/history
   * Get customer's point transaction history with pagination
   */
  fastify.get('/loyalty/history', {
    schema: {
      tags: ['Loyalty'],
      summary: 'Get point history',
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          limit: { type: 'number', default: 20 },
          offset: { type: 'number', default: 0 },
          type: { type: 'string', enum: ['EARNED', 'REDEEMED', 'EXPIRED', 'BONUS'] }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = await getCustomerId(request);
      const { limit = 20, offset = 0, type } = request.query as any;
      
      const history = await loyaltyPointsService.getHistory(customerId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        type
      });
      
      return {
        success: true,
        history,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: history.length === parseInt(limit)
        }
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching history');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch history'
      });
    }
  });

  /**
   * GET /loyalty/rewards
   * Browse available rewards catalog
   */
  fastify.get('/loyalty/rewards', {
    schema: {
      tags: ['Loyalty'],
      summary: 'Get rewards catalog',
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          category: { type: 'string' },
          minPoints: { type: 'number' },
          maxPoints: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { category, minPoints, maxPoints } = request.query as any;
      
      // Get all active rewards
      let query = db
        .select()
        .from(loyaltyRewards)
        .where(eq(loyaltyRewards.isActive, true))
        .orderBy(loyaltyRewards.pointsRequired);
      
      const rewards = await query;
      
      // Filter by criteria
      let filtered = rewards;
      
      if (category) {
        filtered = filtered.filter(r => r.category === category);
      }
      
      if (minPoints) {
        filtered = filtered.filter(r => r.pointsRequired >= parseInt(minPoints));
      }
      
      if (maxPoints) {
        filtered = filtered.filter(r => r.pointsRequired <= parseInt(maxPoints));
      }
      
      // If customerId provided, include customer's balance
      let customerBalance = null;
      if ((request.query as any).customerId) {
        const customerId = parseInt((request.query as any).customerId);
        const balance = await loyaltyPointsService.getBalance(customerId);
        customerBalance = balance.currentBalance; // Use currentBalance instead of total
      }
      
      return {
        success: true,
        rewards: filtered.map(reward => ({
          ...reward,
          canAfford: customerBalance !== null ? customerBalance >= reward.pointsRequired : undefined,
          pointsNeeded: customerBalance !== null ? Math.max(0, reward.pointsRequired - customerBalance) : undefined
        })),
        categories: [...new Set(rewards.map(r => r.category))],
        totalRewards: filtered.length,
        customerBalance
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching rewards');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch rewards'
      });
    }
  });

  /**
   * GET /loyalty/rewards/:id
   * Get detailed information about a specific reward
   */
  fastify.get('/loyalty/rewards/:id', {
    schema: {
      tags: ['Loyalty'],
      summary: 'Get reward details',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      
      const [reward] = await db
        .select()
        .from(loyaltyRewards)
        .where(eq(loyaltyRewards.id, id))
        .limit(1);
      
      if (!reward) {
        return reply.status(404).send({
          success: false,
          error: 'Reward not found'
        });
      }
      
      // Get redemption statistics
      const redemptions = await db
        .select()
        .from(loyaltyRedemptions)
        .where(eq(loyaltyRedemptions.rewardId, id));
      
      return {
        success: true,
        reward: {
          ...reward,
          totalRedemptions: redemptions.length,
          remainingStock: reward.stockQuantity !== null 
            ? Math.max(0, reward.stockQuantity - redemptions.filter(r => r.status === 'COMPLETED').length)
            : null
        }
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching reward details');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch reward'
      });
    }
  });

  /**
   * POST /loyalty/redeem
   * Redeem points for a reward
   */
  fastify.post('/loyalty/redeem', {
    schema: {
      tags: ['Loyalty'],
      summary: 'Redeem points for reward',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          rewardId: { type: 'number' }
        },
        required: ['customerId', 'rewardId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, rewardId } = request.body as { customerId: number; rewardId: number };
      
      // Get reward details
      const [reward] = await db
        .select()
        .from(loyaltyRewards)
        .where(eq(loyaltyRewards.id, rewardId))
        .limit(1);
      
      if (!reward) {
        return reply.status(404).send({
          success: false,
          error: 'Reward not found'
        });
      }
      
      if (!reward.isActive) {
        return reply.status(400).send({
          success: false,
          error: 'Reward is no longer available'
        });
      }
      
      // Check stock
      if (reward.stockQuantity !== null) {
        const redemptions = await db
          .select()
          .from(loyaltyRedemptions)
          .where(
            and(
              eq(loyaltyRedemptions.rewardId, rewardId),
              eq(loyaltyRedemptions.status, 'COMPLETED')
            )
          );
        
        if (redemptions.length >= reward.stockQuantity) {
          return reply.status(400).send({
            success: false,
            error: 'Reward is out of stock'
          });
        }
      }
      
      // Redeem points
      const pointRecord = await loyaltyPointsService.redeemPoints(
        customerId,
        reward.pointsRequired,
        `Redemption: ${reward.name}`
      );
      
      // Create redemption record
      const [redemption] = await db
        .insert(loyaltyRedemptions)
        .values({
          customerId,
          rewardId,
          pointsSpent: reward.pointsRequired,
          status: 'PENDING',
          metadata: {
            rewardName: reward.name,
            rewardCategory: reward.category,
            pointRecordId: pointRecord.id
          } as any
        })
        .returning();
      
      // Get customer info for notification
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
      
      // Send notification
      if (customer) {
        await loyaltyNotificationsService.notifyRewardRedeemed({
          customerId,
          customerName: `${customer.firstName} ${customer.lastName}`,
          rewardName: reward.name,
          pointsSpent: reward.pointsRequired
        });
      }
      
      return {
        success: true,
        message: 'Points redeemed successfully',
        redemption: {
          id: redemption.id,
          rewardName: reward.name,
          pointsSpent: reward.pointsRequired,
          status: redemption.status
        }
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error redeeming points');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to redeem points'
      });
    }
  });

  /**
   * GET /loyalty/redemptions
   * Get customer's redemption history
   */
  fastify.get('/loyalty/redemptions', {
    schema: {
      tags: ['Loyalty'],
      summary: 'Get redemption history',
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'] }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = await getCustomerId(request);
      const { status } = request.query as any;
      
      let query = db
        .select()
        .from(loyaltyRedemptions)
        .where(eq(loyaltyRedemptions.customerId, customerId))
        .orderBy(desc(loyaltyRedemptions.redeemedAt));
      
      const redemptions = await query;
      
      let filtered = redemptions;
      if (status) {
        filtered = filtered.filter(r => r.status === status);
      }
      
      return {
        success: true,
        redemptions: filtered
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching redemptions');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch redemptions'
      });
    }
  });

  /**
   * GET /loyalty/notifications
   * Get customer's loyalty notifications
   */
  fastify.get('/loyalty/notifications', {
    schema: {
      tags: ['Loyalty'],
      summary: 'Get loyalty notifications',
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          unreadOnly: { type: 'boolean', default: false }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = await getCustomerId(request);
      const { unreadOnly = false } = request.query as any;
      
      const notifications = await loyaltyNotificationsService.getNotifications(
        customerId,
        unreadOnly === 'true' || unreadOnly === true
      );
      
      const unreadCount = await loyaltyNotificationsService.getUnreadCount(customerId);
      
      return {
        success: true,
        notifications,
        unreadCount
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching notifications');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch notifications'
      });
    }
  });

  /**
   * POST /loyalty/notifications/:id/read
   * Mark notification as read
   */
  fastify.post('/loyalty/notifications/:id/read', {
    schema: {
      tags: ['Loyalty'],
      summary: 'Mark notification as read',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { customerId } = request.body as { customerId: number };
      
      await loyaltyNotificationsService.markAsRead(customerId, id);
      
      return {
        success: true,
        message: 'Notification marked as read'
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error marking notification as read');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark notification as read'
      });
    }
  });

  /**
   * POST /loyalty/notifications/read-all
   * Mark all notifications as read
   */
  fastify.post('/loyalty/notifications/read-all', {
    schema: {
      tags: ['Loyalty'],
      summary: 'Mark all notifications as read',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.body as { customerId: number };
      
      await loyaltyNotificationsService.markAsRead(customerId);
      
      return {
        success: true,
        message: 'All notifications marked as read'
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error marking all notifications as read');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark notifications as read'
      });
    }
  });

  /**
   * GET /loyalty/stats
   * Get customer loyalty statistics and insights
   */
  fastify.get('/loyalty/stats', {
    schema: {
      tags: ['Loyalty'],
      summary: 'Get loyalty statistics',
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = await getCustomerId(request);
      
      const balance = await loyaltyPointsService.getBalance(customerId);
      const history = await loyaltyPointsService.getHistory(customerId, { limit: 100 });
      const redemptions = await db
        .select()
        .from(loyaltyRedemptions)
        .where(eq(loyaltyRedemptions.customerId, customerId));
      
      // Calculate statistics
      const totalEarned = history
        .filter(h => h.type === 'EARNED' || h.type === 'BONUS')
        .reduce((sum, h) => sum + h.points, 0);
      
      const totalRedeemed = redemptions
        .filter(r => r.status === 'COMPLETED')
        .reduce((sum, r) => sum + r.pointsSpent, 0);
      
      const mostCommonOperation = history
        .reduce((acc, h) => {
          if (h.operationType) {
            acc[h.operationType] = (acc[h.operationType] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>);
      
      const topOperation = Object.entries(mostCommonOperation)
        .sort(([, a], [, b]) => b - a)[0];
      
      return {
        success: true,
        stats: {
          currentBalance: balance.currentBalance, // Use currentBalance
          totalEarned,
          totalRedeemed,
          totalTransactions: history.length,
          totalRedemptions: redemptions.length,
          mostCommonOperation: topOperation ? {
            type: topOperation[0],
            count: topOperation[1]
          } : null,
          recentActivity: history.slice(0, 5)
        }
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching stats');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch statistics'
      });
    }
  });
}
