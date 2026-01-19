/**
 * Loyalty Points Service - Unified Point Management
 * Replaces old SerenityPointsService
 * Uses serenity_points_ledger for tracking all customer points (MEMBER & PARTNER)
 */

import { db } from '../../db';
import { serenityPointsLedger, customers } from '../../db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { loyaltyNotificationsService } from './loyalty-notifications.service';

export interface AwardPointsParams {
  customerId: number;
  pointTypeCode: string;
  points?: number; // Optional: will lookup from loyalty_point_types if not provided
  description?: string;
  operationId?: number; // Reference to operation (credit_id, transaction_id, etc)
  metadata?: any;
}

export interface PointBalance {
  totalEarned: number;
  totalRedeemed: number;
  currentBalance: number;
}

export interface PointRecord {
  id: number;
  points: number;
  type: string;
  operationType: string;
  description: string;
  metadata: any;
  createdAt: string;
}

/**
 * Unified Loyalty Points Service
 * Handles ALL point operations for MEMBER and PARTNER customers
 */
export class LoyaltyPointsService {
  
  /**
   * Award points to a customer
   * @param params Award parameters
   * @returns Point record created
   */
  async awardPoints(params: AwardPointsParams): Promise<PointRecord> {
    try {
      console.log('[LoyaltyPoints] Awarding points:', params);

      // 1. Get point configuration if points not provided
      let pointsToAward: number;
      
      if (params.points) {
        pointsToAward = params.points;
      } else {
        const pointTypeConfig = await db.execute(sql`
          SELECT points FROM loyalty_point_types
          WHERE code = ${params.pointTypeCode}
          AND is_active = true
          LIMIT 1
        `);
        
        if ((pointTypeConfig as any).length > 0) {
          pointsToAward = (pointTypeConfig as any)[0].points;
        } else {
          console.warn(`[LoyaltyPoints] Point type ${params.pointTypeCode} not found, using default 1 point`);
          pointsToAward = 1;
        }
      }

      // 2. Check for duplicate (anti-fraud)
      if (params.operationId) {
        const isDuplicate = await this.checkDuplicate(
          params.customerId,
          params.pointTypeCode,
          params.operationId
        );
        
        if (isDuplicate) {
          console.warn(`[LoyaltyPoints] Duplicate detected for customer ${params.customerId}, operation ${params.operationId}`);
          throw new Error('Points already awarded for this operation');
        }
      }

      // 3. Get customer info for notification
      const [customer] = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          customerType: customers.customerType
        })
        .from(customers)
        .where(eq(customers.id, params.customerId))
        .limit(1);

      if (!customer) {
        throw new Error(`Customer ${params.customerId} not found`);
      }

      // 4. Insert point record
      const [pointRecord] = await db
        .insert(serenityPointsLedger)
        .values({
          customerId: params.customerId,
          points: pointsToAward,
          type: 'EARNED',
          operationType: params.pointTypeCode,
          operationId: params.operationId,
          description: params.description || `Points earned for ${params.pointTypeCode}`,
          metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : null,
        })
        .returning();

      console.log(`[LoyaltyPoints] ✅ Awarded ${pointsToAward} point(s) to customer ${params.customerId}`);

      // 5. Send notification (async, don't wait)
      this.sendPointsNotification(customer, pointsToAward, params.pointTypeCode).catch(err => {
        console.error('[LoyaltyPoints] Notification failed:', err);
      });

      return {
        id: pointRecord.id,
        points: pointsToAward,
        type: 'EARNED',
        operationType: params.pointTypeCode,
        description: pointRecord.description || '',
        metadata: pointRecord.metadata,
        createdAt: pointRecord.createdAt
      };

    } catch (error) {
      console.error('[LoyaltyPoints] Error awarding points:', error);
      throw error;
    }
  }

  /**
   * Check if points already awarded for this operation (anti-fraud)
   */
  private async checkDuplicate(
    customerId: number,
    pointTypeCode: string,
    operationId: number
  ): Promise<boolean> {
    const existing = await db
      .select({ id: serenityPointsLedger.id })
      .from(serenityPointsLedger)
      .where(
        and(
          eq(serenityPointsLedger.customerId, customerId),
          eq(serenityPointsLedger.operationType, pointTypeCode),
          eq(serenityPointsLedger.operationId, operationId)
        )
      )
      .limit(1);

    return existing.length > 0;
  }

  /**
   * Get customer's point balance
   */
  async getBalance(customerId: number): Promise<PointBalance> {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0)::int as total_earned,
        COALESCE(SUM(CASE WHEN points < 0 THEN ABS(points) ELSE 0 END), 0)::int as total_redeemed,
        COALESCE(SUM(points), 0)::int as current_balance
      FROM serenity_points_ledger
      WHERE customer_id = ${customerId}
    `);

    const data = (result as any)[0];
    
    return {
      totalEarned: data.total_earned || 0,
      totalRedeemed: data.total_redeemed || 0,
      currentBalance: data.current_balance || 0
    };
  }

  /**
   * Get point history with pagination
   */
  async getHistory(
    customerId: number,
    options: {
      limit?: number;
      offset?: number;
      type?: 'EARNED' | 'REDEEMED';
    } = {}
  ): Promise<PointRecord[]> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    // Build where conditions
    const whereConditions = options.type
      ? and(
          eq(serenityPointsLedger.customerId, customerId),
          eq(serenityPointsLedger.type, options.type)
        )
      : eq(serenityPointsLedger.customerId, customerId);

    const records = await db
      .select({
        id: serenityPointsLedger.id,
        points: serenityPointsLedger.points,
        type: serenityPointsLedger.type,
        operationType: serenityPointsLedger.operationType,
        description: serenityPointsLedger.description,
        metadata: serenityPointsLedger.metadata,
        createdAt: serenityPointsLedger.createdAt
      })
      .from(serenityPointsLedger)
      .where(whereConditions)
      .orderBy(desc(serenityPointsLedger.createdAt))
      .limit(limit)
      .offset(offset);

    return records.map(r => ({
      id: r.id,
      points: r.points,
      type: r.type || 'EARNED',
      operationType: r.operationType || 'UNKNOWN',
      description: r.description || '',
      metadata: r.metadata,
      createdAt: r.createdAt
    }));
  }

  /**
   * Redeem points (for reward exchange)
   */
  async redeemPoints(
    customerId: number,
    pointsToRedeem: number,
    description: string,
    metadata?: any
  ): Promise<PointRecord> {
    try {
      // Check balance
      const balance = await this.getBalance(customerId);
      
      if (balance.currentBalance < pointsToRedeem) {
        throw new Error(`Insufficient points. Balance: ${balance.currentBalance}, Required: ${pointsToRedeem}`);
      }

      // Deduct points (negative value)
      const [pointRecord] = await db
        .insert(serenityPointsLedger)
        .values({
          customerId,
          points: -pointsToRedeem,
          type: 'REDEEMED',
          operationType: 'REWARD_REDEMPTION',
          description,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        })
        .returning();

      console.log(`[LoyaltyPoints] ✅ Redeemed ${pointsToRedeem} points from customer ${customerId}`);

      return {
        id: pointRecord.id,
        points: -pointsToRedeem,
        type: 'REDEEMED',
        operationType: 'REWARD_REDEMPTION',
        description: pointRecord.description || '',
        metadata: pointRecord.metadata,
        createdAt: pointRecord.createdAt
      };

    } catch (error) {
      console.error('[LoyaltyPoints] Error redeeming points:', error);
      throw error;
    }
  }

  /**
   * Check if customer is eligible for a specific point type
   * (Business rules validation)
   */
  async checkEligibility(
    customerId: number,
    pointTypeCode: string
  ): Promise<{ eligible: boolean; reason?: string }> {
    try {
      // Get point type configuration
      const pointTypeConfig = await db.execute(sql`
        SELECT code, customer_type, conditions, is_active
        FROM loyalty_point_types
        WHERE code = ${pointTypeCode}
        LIMIT 1
      `);

      if ((pointTypeConfig as any).length === 0) {
        return { eligible: false, reason: 'Point type not found' };
      }

      const config = (pointTypeConfig as any)[0];

      if (!config.is_active) {
        return { eligible: false, reason: 'Point type is inactive' };
      }

      // Get customer type
      const [customer] = await db
        .select({ customerType: customers.customerType })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer) {
        return { eligible: false, reason: 'Customer not found' };
      }

      // Check customer type match
      if (config.customer_type !== 'BOTH' && config.customer_type !== customer.customerType) {
        return { eligible: false, reason: `Point type is only for ${config.customer_type} customers` };
      }

      // Additional business rules can be checked here based on conditions JSON

      return { eligible: true };

    } catch (error) {
      console.error('[LoyaltyPoints] Error checking eligibility:', error);
      return { eligible: false, reason: 'Internal error' };
    }
  }

  /**
   * Send notification to customer about points earned
   * (To be implemented with notification system)
   */
  private async sendPointsNotification(
    customer: any,
    points: number,
    pointTypeCode: string
  ): Promise<void> {
    // TODO: Implement with notification service
    console.log(`[LoyaltyPoints] 🔔 Notification: ${customer.firstName} earned ${points} point(s) for ${pointTypeCode}`);
    
    // Future implementation:
    // - WebSocket push notification
    // - SMS notification
    // - In-app notification badge
    // - Email notification (optional)
  }

  /**
   * Get total points awarded system-wide (admin stats)
   */
  async getSystemStats(): Promise<{
    totalPointsAwarded: number;
    totalPointsRedeemed: number;
    activeCustomers: number;
  }> {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0)::int as total_awarded,
        COALESCE(SUM(CASE WHEN points < 0 THEN ABS(points) ELSE 0 END), 0)::int as total_redeemed,
        COUNT(DISTINCT customer_id)::int as active_customers
      FROM serenity_points_ledger
    `);

    const data = (result as any)[0];

    return {
      totalPointsAwarded: data.total_awarded || 0,
      totalPointsRedeemed: data.total_redeemed || 0,
      activeCustomers: data.active_customers || 0
    };
  }
}

// Export singleton instance
export const loyaltyPointsService = new LoyaltyPointsService();
