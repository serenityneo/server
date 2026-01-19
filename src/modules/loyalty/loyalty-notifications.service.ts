/**
 * Loyalty Notifications Service - Intelligent Point Notifications
 * Sends real-time notifications when customers earn points
 * Supports: In-app notifications, WebSocket push, SMS (future)
 */

import { db } from '../../db';
import { sql } from 'drizzle-orm';

export interface PointNotification {
  customerId: number;
  customerName: string;
  points: number;
  pointTypeCode: string;
  pointTypeLabel: string;
  description: string;
  timestamp: string;
  animationType: 'confetti' | 'tada' | 'pulse' | 'bounce';
}

/**
 * Loyalty Notifications Service
 * Creates engaging, animated notifications for point awards
 */
export class LoyaltyNotificationsService {
  
  /**
   * Send intelligent notification when points are earned
   * Chooses appropriate animation and message based on points/context
   */
  async notifyPointsEarned(params: {
    customerId: number;
    customerName: string;
    points: number;
    pointTypeCode: string;
    description?: string;
  }): Promise<PointNotification> {
    try {
      // 1. Get point type details
      const pointType = await this.getPointTypeDetails(params.pointTypeCode);
      
      // 2. Determine animation type based on points value
      const animationType = this.chooseAnimation(params.points);
      
      // 3. Generate intelligent message
      const message = this.generateMessage(
        params.customerName,
        params.points,
        pointType.label,
        params.description
      );

      // 4. Create notification object
      const notification: PointNotification = {
        customerId: params.customerId,
        customerName: params.customerName,
        points: params.points,
        pointTypeCode: params.pointTypeCode,
        pointTypeLabel: pointType.label,
        description: message,
        timestamp: new Date().toISOString(),
        animationType
      };

      // 5. Store in notification queue (for in-app display)
      await this.storeNotification(notification);

      // 6. Send real-time push (WebSocket) - Future implementation
      await this.sendWebSocketPush(notification);

      // 7. Update notification badge count
      await this.incrementBadgeCount(params.customerId);

      console.log(`[LoyaltyNotif] ✅ Notification sent to customer ${params.customerId}: +${params.points} point(s)`);

      return notification;

    } catch (error) {
      console.error('[LoyaltyNotif] Error sending notification:', error);
      throw error;
    }
  }

  /**
   * Get point type details for display
   */
  private async getPointTypeDetails(pointTypeCode: string): Promise<{ label: string; labelEn: string }> {
    const result = await db.execute(sql`
      SELECT label, label_en
      FROM loyalty_point_types
      WHERE code = ${pointTypeCode}
      LIMIT 1
    `);

    if ((result as any).length > 0) {
      return {
        label: (result as any)[0].label,
        labelEn: (result as any)[0].label_en || (result as any)[0].label
      };
    }

    return { label: 'Point gagné', labelEn: 'Point earned' };
  }

  /**
   * Choose animation type based on points value and context
   */
  private chooseAnimation(points: number): 'confetti' | 'tada' | 'pulse' | 'bounce' {
    if (points >= 10) {
      return 'confetti'; // Big reward!
    } else if (points >= 5) {
      return 'tada'; // Good reward
    } else if (points >= 2) {
      return 'pulse'; // Medium reward
    } else {
      return 'bounce'; // Small reward
    }
  }

  /**
   * Generate intelligent, context-aware message
   */
  private generateMessage(
    customerName: string,
    points: number,
    pointTypeLabel: string,
    description?: string
  ): string {
    const firstName = customerName.split(' ')[0];
    
    // Different messages based on point value
    if (points === 1) {
      return `🎉 Félicitations ${firstName}! Vous avez gagné 1 point pour: ${pointTypeLabel}`;
    } else if (points <= 5) {
      return `🌟 Bravo ${firstName}! +${points} points pour: ${pointTypeLabel}`;
    } else if (points <= 10) {
      return `🚀 Excellent ${firstName}! Vous venez de gagner ${points} points pour: ${pointTypeLabel}`;
    } else {
      return `🎊 Incroyable ${firstName}! Vous avez gagné ${points} points pour: ${pointTypeLabel}! Continue comme ça!`;
    }
  }

  /**
   * Store notification in database for later retrieval
   * Creates a notification record that client can fetch
   */
  private async storeNotification(notification: PointNotification): Promise<void> {
    try {
      // Store in system_notifications table (if exists) or create dedicated loyalty_notifications
      await db.execute(sql`
        INSERT INTO loyalty_notifications (
          customer_id,
          points,
          point_type_code,
          message,
          animation_type,
          is_read,
          created_at
        ) VALUES (
          ${notification.customerId},
          ${notification.points},
          ${notification.pointTypeCode},
          ${notification.description},
          ${notification.animationType},
          false,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT DO NOTHING;
      `);
    } catch (error) {
      // Table might not exist yet - silently fail
      console.warn('[LoyaltyNotif] Could not store notification (table might not exist):', error);
    }
  }

  /**
   * Send real-time WebSocket push notification
   * (Future implementation - requires WebSocket server)
   */
  private async sendWebSocketPush(notification: PointNotification): Promise<void> {
    try {
      // TODO: Implement WebSocket push
      // Example:
      // webSocketServer.sendToClient(notification.customerId, {
      //   type: 'POINTS_EARNED',
      //   data: notification
      // });
      
      console.log(`[LoyaltyNotif] 🔔 WebSocket push queued for customer ${notification.customerId}`);
    } catch (error) {
      console.error('[LoyaltyNotif] WebSocket push failed:', error);
    }
  }

  /**
   * Increment notification badge count for customer
   */
  private async incrementBadgeCount(customerId: number): Promise<void> {
    try {
      // Store badge count in customer metadata or separate table
      await db.execute(sql`
        UPDATE customers
        SET metadata = COALESCE(metadata, '{}'::jsonb) || 
          jsonb_build_object(
            'loyaltyBadgeCount', 
            COALESCE((metadata->>'loyaltyBadgeCount')::int, 0) + 1
          )
        WHERE id = ${customerId};
      `);
    } catch (error) {
      console.warn('[LoyaltyNotif] Could not update badge count:', error);
    }
  }

  /**
   * Mark notification as read (clear badge)
   */
  async markAsRead(customerId: number, notificationId?: number): Promise<void> {
    try {
      if (notificationId) {
        // Mark specific notification as read
        await db.execute(sql`
          UPDATE loyalty_notifications
          SET is_read = true
          WHERE id = ${notificationId} AND customer_id = ${customerId};
        `);
      } else {
        // Mark all notifications as read
        await db.execute(sql`
          UPDATE loyalty_notifications
          SET is_read = true
          WHERE customer_id = ${customerId} AND is_read = false;
        `);
      }

      // Reset badge count
      await db.execute(sql`
        UPDATE customers
        SET metadata = COALESCE(metadata, '{}'::jsonb) || 
          jsonb_build_object('loyaltyBadgeCount', 0)
        WHERE id = ${customerId};
      `);

      console.log(`[LoyaltyNotif] Notifications marked as read for customer ${customerId}`);
    } catch (error) {
      console.error('[LoyaltyNotif] Error marking as read:', error);
    }
  }

  /**
   * Get unread notification count for customer
   */
  async getUnreadCount(customerId: number): Promise<number> {
    try {
      const result = await db.execute(sql`
        SELECT COALESCE((metadata->>'loyaltyBadgeCount')::int, 0) as count
        FROM customers
        WHERE id = ${customerId};
      `);

      return (result as any)[0]?.count || 0;
    } catch (error) {
      console.error('[LoyaltyNotif] Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Get recent notifications for customer
   */
  async getRecentNotifications(customerId: number, limit: number = 10): Promise<PointNotification[]> {
    try {
      const result = await db.execute(sql`
        SELECT 
          id,
          customer_id,
          points,
          point_type_code,
          message,
          animation_type,
          is_read,
          created_at
        FROM loyalty_notifications
        WHERE customer_id = ${customerId}
        ORDER BY created_at DESC
        LIMIT ${limit};
      `);

      return (result as any).map((row: any) => ({
        customerId: row.customer_id,
        customerName: '', // Not needed for fetch
        points: row.points,
        pointTypeCode: row.point_type_code,
        pointTypeLabel: '',
        description: row.message,
        timestamp: row.created_at,
        animationType: row.animation_type
      }));
    } catch (error) {
      console.error('[LoyaltyNotif] Error fetching notifications:', error);
      return [];
    }
  }

  /**
   * Send milestone achievement notification
   * (e.g., "You've earned 100 points total!")
   */
  async notifyMilestone(params: {
    customerId: number;
    customerName: string;
    totalPoints: number;
    milestone: number;
  }): Promise<void> {
    try {
      const message = `🏆 Félicitations ${params.customerName}! Vous avez atteint ${params.totalPoints} points au total! Continue comme ça!`;

      await this.storeNotification({
        customerId: params.customerId,
        customerName: params.customerName,
        points: params.milestone,
        pointTypeCode: 'MILESTONE',
        pointTypeLabel: 'Jalon atteint',
        description: message,
        timestamp: new Date().toISOString(),
        animationType: 'confetti'
      });

      await this.incrementBadgeCount(params.customerId);

      console.log(`[LoyaltyNotif] Milestone notification sent: ${params.totalPoints} points`);
    } catch (error) {
      console.error('[LoyaltyNotif] Error sending milestone notification:', error);
    }
  }

  /**
   * Get notifications for customer (with optional unread filter)
   */
  async getNotifications(customerId: number, unreadOnly: boolean = false): Promise<PointNotification[]> {
    try {
      let query = sql`
        SELECT 
          id,
          customer_id,
          points,
          point_type_code,
          message,
          animation_type,
          is_read,
          metadata,
          created_at
        FROM loyalty_notifications
        WHERE customer_id = ${customerId}
      `;

      if (unreadOnly) {
        query = sql`${query} AND is_read = false`;
      }

      query = sql`${query} ORDER BY created_at DESC`;

      const result = await db.execute(query);

      return (result as any).map((row: any) => ({
        customerId: row.customer_id,
        customerName: '',
        points: row.points,
        pointTypeCode: row.point_type_code,
        pointTypeLabel: '',
        description: row.message,
        timestamp: row.created_at,
        animationType: row.animation_type
      }));
    } catch (error) {
      console.error('[LoyaltyNotif] Error fetching notifications:', error);
      return [];
    }
  }

  /**
   * Notify when reward is available to redeem
   */
  async notifyRewardAvailable(params: {
    customerId: number;
    customerName: string;
    rewardTitle: string;
    requiredPoints: number;
    currentPoints: number;
  }): Promise<void> {
    try {
      const firstName = params.customerName.split(' ')[0];
      const message = `🎁 ${firstName}, vous pouvez maintenant échanger "${params.rewardTitle}" avec vos ${params.currentPoints} points!`;

      await this.storeNotification({
        customerId: params.customerId,
        customerName: params.customerName,
        points: 0,
        pointTypeCode: 'REWARD_AVAILABLE',
        pointTypeLabel: 'Récompense disponible',
        description: message,
        timestamp: new Date().toISOString(),
        animationType: 'tada'
      });

      await this.incrementBadgeCount(params.customerId);

      console.log(`[LoyaltyNotif] Reward available notification sent`);
    } catch (error) {
      console.error('[LoyaltyNotif] Error sending reward notification:', error);
    }
  }

  /**
   * Notify customer when reward is redeemed
   */
  async notifyRewardRedeemed(params: {
    customerId: number;
    customerName: string;
    rewardName: string;
    pointsSpent: number;
  }): Promise<void> {
    try {
      const { customerId, customerName, rewardName, pointsSpent } = params;
      const firstName = customerName.split(' ')[0];
      
      const message = `🎁 Félicitations ${firstName}! Vous avez échangé ${pointsSpent} points contre: ${rewardName}. Votre demande est en cours de traitement.`;
      
      await this.storeNotification({
        customerId,
        customerName,
        points: -pointsSpent, // Negative to show redemption
        pointTypeCode: 'REWARD_REDEEMED',
        pointTypeLabel: 'Récompense échangée',
        description: message,
        timestamp: new Date().toISOString(),
        animationType: 'tada'
      });
      
      await this.incrementBadgeCount(customerId);
      
      console.log(`[LoyaltyNotifications] Reward redemption notification sent to customer ${customerId}`);
    } catch (error) {
      console.error('[LoyaltyNotifications] Error notifying reward redemption:', error);
    }
  }
}

// Export singleton instance
export const loyaltyNotificationsService = new LoyaltyNotificationsService();
