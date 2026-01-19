/**
 * LOYALTY POINTS SYSTEM - ADMIN API ROUTES
 * 
 * Endpoints for administrators to:
 * - Manage point type configurations
 * - Create and manage rewards
 * - View system statistics
 * - Approve/reject redemptions
 * - Award manual bonus points
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { loyaltyPointsService } from './loyalty-points.service';
import { db } from '../../db';
import { 
  loyaltyPointTypes, 
  loyaltyRewards, 
  loyaltyRedemptions,
  serenityPointsLedger,
  customers 
} from '../../db/schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';

/**
 * Middleware to require admin authentication
 * TODO: Implement proper admin JWT validation
 */
async function requireAdminAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = String(request.headers['authorization'] || '');
  const expectedToken = process.env.ADMIN_API_TOKEN || process.env.CORE_BANKING_API_TOKEN || '';
  
  if (authHeader.startsWith('Bearer ') && expectedToken) {
    const isValid = authHeader.slice(7) === expectedToken;
    if (isValid) {
      return;
    }
  }
  
  return reply.status(401).send({
    success: false,
    error: 'Admin authentication required'
  });
}

export async function registerLoyaltyAdminRoutes(fastify: FastifyInstance) {
  
  // ===== POINT TYPE CONFIGURATION =====
  
  /**
   * GET /admin/loyalty/point-types
   * Get all point type configurations
   */
  fastify.get('/admin/loyalty/point-types', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Loyalty'],
      summary: 'Get point type configurations',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            pointTypes: { type: 'array' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const pointTypes = await db
        .select()
        .from(loyaltyPointTypes)
        .orderBy(loyaltyPointTypes.applicableTo, loyaltyPointTypes.code);
      
      // Group by customer type
      const grouped = {
        MEMBER: pointTypes.filter(pt => pt.applicableTo === 'MEMBER'),
        PARTNER: pointTypes.filter(pt => pt.applicableTo === 'PARTNER'),
        ALL: pointTypes.filter(pt => pt.applicableTo === 'ALL')
      };
      
      return {
        success: true,
        pointTypes: pointTypes,
        grouped,
        total: pointTypes.length
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching point types');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch point types'
      });
    }
  });

  /**
   * PUT /admin/loyalty/point-types/:id
   * Update point type configuration
   */
  fastify.put('/admin/loyalty/point-types/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Loyalty'],
      summary: 'Update point type',
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
          points: { type: 'number', minimum: 0 },
          label: { type: 'string' },
          description: { type: 'string' },
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const updates = request.body as any;
      
      const [updated] = await db
        .update(loyaltyPointTypes)
        .set({
          ...updates,
          updatedAt: new Date().toISOString()
        })
        .where(eq(loyaltyPointTypes.id, id))
        .returning();
      
      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'Point type not found'
        });
      }
      
      return {
        success: true,
        message: 'Point type updated successfully',
        pointType: updated
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error updating point type');
      return reply.status(500).send({
        success: false,
        error: 'Failed to update point type'
      });
    }
  });

  /**
   * POST /admin/loyalty/point-types
   * Create new point type
   */
  fastify.post('/admin/loyalty/point-types', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Loyalty'],
      summary: 'Create point type',
      body: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          label: { type: 'string' },
          description: { type: 'string' },
          points: { type: 'number', minimum: 0 },
          applicableTo: { type: 'string', enum: ['MEMBER', 'PARTNER', 'ALL'] },
          isActive: { type: 'boolean', default: true }
        },
        required: ['code', 'label', 'points', 'applicableTo']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request.body as any;
      
      // Check if code already exists
      const [existing] = await db
        .select()
        .from(loyaltyPointTypes)
        .where(eq(loyaltyPointTypes.code, data.code))
        .limit(1);
      
      if (existing) {
        return reply.status(400).send({
          success: false,
          error: 'Point type code already exists'
        });
      }
      
      const [created] = await db
        .insert(loyaltyPointTypes)
        .values(data)
        .returning();
      
      return {
        success: true,
        message: 'Point type created successfully',
        pointType: created
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error creating point type');
      return reply.status(500).send({
        success: false,
        error: 'Failed to create point type'
      });
    }
  });

  // ===== REWARDS MANAGEMENT =====
  
  /**
   * GET /admin/loyalty/rewards
   * Get all rewards (including inactive)
   */
  fastify.get('/admin/loyalty/rewards', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Loyalty'],
      summary: 'Get all rewards',
      querystring: {
        type: 'object',
        properties: {
          includeInactive: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { includeInactive = false } = request.query as any;
      
      let query = db.select().from(loyaltyRewards);
      
      if (!includeInactive) {
        query = query.where(eq(loyaltyRewards.isActive, true)) as any;
      }
      
      const rewards = await query.orderBy(loyaltyRewards.category, loyaltyRewards.pointsRequired);
      
      // Get redemption counts for each reward
      const rewardsWithStats = await Promise.all(
        rewards.map(async (reward) => {
          const redemptions = await db
            .select()
            .from(loyaltyRedemptions)
            .where(eq(loyaltyRedemptions.rewardId, reward.id));
          
          const completedRedemptions = redemptions.filter(r => r.status === 'COMPLETED').length;
          
          return {
            ...reward,
            totalRedemptions: redemptions.length,
            completedRedemptions,
            pendingRedemptions: redemptions.filter(r => r.status === 'PENDING').length,
            remainingStock: reward.stockQuantity !== null 
              ? Math.max(0, reward.stockQuantity - completedRedemptions)
              : null
          };
        })
      );
      
      return {
        success: true,
        rewards: rewardsWithStats,
        total: rewards.length
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching rewards');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch rewards'
      });
    }
  });

  /**
   * POST /admin/loyalty/rewards
   * Create new reward
   */
  fastify.post('/admin/loyalty/rewards', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Loyalty'],
      summary: 'Create reward',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          pointsRequired: { type: 'number', minimum: 1 },
          imageUrl: { type: 'string' },
          stockQuantity: { type: 'number' },
          isActive: { type: 'boolean', default: true },
          metadata: { type: 'object' }
        },
        required: ['name', 'pointsRequired', 'category']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request.body as any;
      
      const [created] = await db
        .insert(loyaltyRewards)
        .values(data)
        .returning();
      
      return {
        success: true,
        message: 'Reward created successfully',
        reward: created
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error creating reward');
      return reply.status(500).send({
        success: false,
        error: 'Failed to create reward'
      });
    }
  });

  /**
   * PUT /admin/loyalty/rewards/:id
   * Update reward
   */
  fastify.put('/admin/loyalty/rewards/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Loyalty'],
      summary: 'Update reward',
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
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          pointsRequired: { type: 'number', minimum: 1 },
          imageUrl: { type: 'string' },
          stockQuantity: { type: 'number' },
          isActive: { type: 'boolean' },
          metadata: { type: 'object' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const updates = request.body as any;
      
      const [updated] = await db
        .update(loyaltyRewards)
        .set({
          ...updates,
          updatedAt: new Date().toISOString()
        })
        .where(eq(loyaltyRewards.id, id))
        .returning();
      
      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'Reward not found'
        });
      }
      
      return {
        success: true,
        message: 'Reward updated successfully',
        reward: updated
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error updating reward');
      return reply.status(500).send({
        success: false,
        error: 'Failed to update reward'
      });
    }
  });

  /**
   * DELETE /admin/loyalty/rewards/:id
   * Delete (deactivate) reward
   */
  fastify.delete('/admin/loyalty/rewards/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Loyalty'],
      summary: 'Delete reward',
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
      
      // Soft delete - just deactivate
      const [updated] = await db
        .update(loyaltyRewards)
        .set({
          isActive: false,
          updatedAt: new Date().toISOString()
        })
        .where(eq(loyaltyRewards.id, id))
        .returning();
      
      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'Reward not found'
        });
      }
      
      return {
        success: true,
        message: 'Reward deactivated successfully'
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error deleting reward');
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete reward'
      });
    }
  });

  // ===== REDEMPTIONS MANAGEMENT =====
  
  /**
   * GET /admin/loyalty/redemptions
   * Get all redemptions with filters
   */
  fastify.get('/admin/loyalty/redemptions', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Loyalty'],
      summary: 'Get all redemptions',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'] },
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { status, limit = 50, offset = 0 } = request.query as any;
      
      let query = db
        .select()
        .from(loyaltyRedemptions)
        .orderBy(desc(loyaltyRedemptions.redeemedAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));
      
      const redemptions = await query;
      
      let filtered = redemptions;
      if (status) {
        filtered = filtered.filter(r => r.status === status);
      }
      
      // Enrich with customer and reward data
      const enriched = await Promise.all(
        filtered.map(async (redemption) => {
          const [customer] = await db
            .select()
            .from(customers)
            .where(eq(customers.id, redemption.customerId))
            .limit(1);
          
          const [reward] = await db
            .select()
            .from(loyaltyRewards)
            .where(eq(loyaltyRewards.id, redemption.rewardId))
            .limit(1);
          
          return {
            ...redemption,
            customerName: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown',
            customerEmail: customer?.email,
            rewardName: reward?.name || 'Unknown Reward'
          };
        })
      );
      
      return {
        success: true,
        redemptions: enriched,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: redemptions.length === parseInt(limit)
        }
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching redemptions');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch redemptions'
      });
    }
  });

  /**
   * PUT /admin/loyalty/redemptions/:id/status
   * Update redemption status
   */
  fastify.put('/admin/loyalty/redemptions/:id/status', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Loyalty'],
      summary: 'Update redemption status',
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
          status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'] },
          notes: { type: 'string' }
        },
        required: ['status']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { status, notes } = request.body as any;
      
      const updates: any = {
        status,
        updatedAt: new Date().toISOString()
      };
      
      if (status === 'COMPLETED') {
        updates.fulfilledAt = new Date().toISOString();
      }
      
      if (notes) {
        updates.metadata = sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ adminNotes: notes })}::jsonb`;
      }
      
      const [updated] = await db
        .update(loyaltyRedemptions)
        .set(updates)
        .where(eq(loyaltyRedemptions.id, id))
        .returning();
      
      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'Redemption not found'
        });
      }
      
      return {
        success: true,
        message: 'Redemption status updated',
        redemption: updated
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error updating redemption');
      return reply.status(500).send({
        success: false,
        error: 'Failed to update redemption'
      });
    }
  });

  // ===== MANUAL POINT OPERATIONS =====
  
  /**
   * POST /admin/loyalty/award-bonus
   * Manually award bonus points to a customer
   */
  fastify.post('/admin/loyalty/award-bonus', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Loyalty'],
      summary: 'Award bonus points',
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          points: { type: 'number', minimum: 1 },
          reason: { type: 'string' },
          metadata: { type: 'object' }
        },
        required: ['customerId', 'points', 'reason']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, points, reason, metadata } = request.body as any;
      
      // Award bonus points
      const pointRecord = await db
        .insert(serenityPointsLedger)
        .values({
          customerId,
          points,
          type: 'BONUS',
          operationType: 'ADMIN_BONUS',
          description: reason,
          metadata: {
            ...metadata,
            awardedBy: 'admin',
            awardedAt: new Date().toISOString()
          } as any
        })
        .returning();
      
      return {
        success: true,
        message: 'Bonus points awarded successfully',
        pointRecord: pointRecord[0]
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error awarding bonus');
      return reply.status(500).send({
        success: false,
        error: 'Failed to award bonus points'
      });
    }
  });

  // ===== SYSTEM STATISTICS =====
  
  /**
   * GET /admin/loyalty/stats
   * Get system-wide loyalty statistics
   */
  fastify.get('/admin/loyalty/stats', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Loyalty'],
      summary: 'Get system statistics'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Total points in circulation
      const pointsStats = await db.execute(sql`
        SELECT 
          COUNT(DISTINCT customer_id) as total_customers,
          SUM(CASE WHEN type = 'EARNED' OR type = 'BONUS' THEN points ELSE 0 END) as total_earned,
          SUM(CASE WHEN type = 'REDEEMED' THEN ABS(points) ELSE 0 END) as total_redeemed,
          SUM(points) as current_circulation
        FROM serenity_points_ledger
      `);
      
      // Redemption stats
      const redemptionStats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_redemptions,
          COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_redemptions,
          COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_redemptions,
          SUM(points_spent) as total_points_redeemed
        FROM loyalty_redemptions
      `);
      
      // Most popular rewards
      const popularRewards = await db.execute(sql`
        SELECT 
          lr.name,
          lr.points_required,
          COUNT(lrd.id) as redemption_count
        FROM loyalty_rewards lr
        LEFT JOIN loyalty_redemptions lrd ON lr.id = lrd.reward_id
        WHERE lrd.status = 'COMPLETED'
        GROUP BY lr.id, lr.name, lr.points_required
        ORDER BY redemption_count DESC
        LIMIT 5
      `);
      
      // Recent activity (last 30 days)
      const recentActivity = await db.execute(sql`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as transactions,
          SUM(points) as points_moved
        FROM serenity_points_ledger
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);
      
      return {
        success: true,
        stats: {
          points: (pointsStats as any).rows[0],
          redemptions: (redemptionStats as any).rows[0],
          popularRewards: (popularRewards as any).rows,
          recentActivity: (recentActivity as any).rows
        }
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching stats');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch statistics'
      });
    }
  });

  /**
   * GET /admin/loyalty/leaderboard
   * Get top customers by points
   */
  fastify.get('/admin/loyalty/leaderboard', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Loyalty'],
      summary: 'Get points leaderboard',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 10 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = 10 } = request.query as any;
      
      const leaderboard = await db.execute(sql`
        SELECT 
          spl.customer_id,
          c.first_name || ' ' || c.last_name as customer_name,
          c.customer_type,
          SUM(spl.points) as total_points,
          COUNT(*) as total_transactions
        FROM serenity_points_ledger spl
        JOIN customers c ON c.id = spl.customer_id
        GROUP BY spl.customer_id, c.first_name, c.last_name, c.customer_type
        HAVING SUM(spl.points) > 0
        ORDER BY total_points DESC
        LIMIT ${parseInt(limit)}
      `);
      
      return {
        success: true,
        leaderboard: (leaderboard as any).rows
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error fetching leaderboard');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch leaderboard'
      });
    }
  });
}
