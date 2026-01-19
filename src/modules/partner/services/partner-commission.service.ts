import { db } from '../../../db';
import { 
  partnerCommissions, 
  commissionConfigurations, 
  commissionNotifications,
  partnerOperations,
  customers 
} from '../../../db/schema';
import { eq, and, sql, desc, gte, lte, isNull, or } from 'drizzle-orm';

/**
 * Partner Commission Service
 * 
 * Handles commission calculations, tracking, and notifications
 * - Multi-currency support (USD & CDF)
 * - Validity period management
 * - Real-time notifications to partners
 */

export interface CommissionConfig {
  id: number;
  operationType: string;
  commissionAmountUsd: string;
  commissionAmountCdf: string;
  commissionPercentage?: string | null;
  validFrom: string;
  validUntil?: string | null;
  isActive: boolean;
  description?: string | null;
  conditions?: any;
}

export interface CommissionEarned {
  id: number;
  partnerId: number;
  operationId: number;
  amountUsd: string;
  amountCdf: string;
  status: string;
  createdAt: string;
  operationType?: string | null;
  calculationBasis?: any;
}

export interface CommissionSummary {
  totalUsd: string;
  totalCdf: string;
  pendingUsd: string;
  pendingCdf: string;
  approvedUsd: string;
  approvedCdf: string;
  paidUsd: string;
  paidCdf: string;
  commissionCount: number;
}

export class PartnerCommissionService {
  /**
   * Get active commission configuration for a specific operation type
   */
  async getActiveConfig(operationType: string): Promise<CommissionConfig | null> {
    const now = new Date().toISOString();

    const [config] = await db
      .select()
      .from(commissionConfigurations)
      .where(and(
        eq(commissionConfigurations.operationType, operationType),
        eq(commissionConfigurations.isActive, true),
        lte(commissionConfigurations.validFrom, now),
        or(
          isNull(commissionConfigurations.validUntil),
          gte(commissionConfigurations.validUntil, now)
        )
      ))
      .orderBy(desc(commissionConfigurations.createdAt))
      .limit(1);

    return config || null;
  }

  /**
   * Calculate commission for an operation
   */
  async calculateCommission(
    operationType: string,
    transactionAmount?: number,
    transactionCurrency?: 'USD' | 'CDF'
  ): Promise<{ amountUsd: number; amountCdf: number; basis: any } | null> {
    const config = await this.getActiveConfig(operationType);

    if (!config) {
      console.warn(`[Commission] No active config found for: ${operationType}`);
      return null;
    }

    let amountUsd = parseFloat(config.commissionAmountUsd);
    let amountCdf = parseFloat(config.commissionAmountCdf);
    const basis: any = {
      configId: config.id,
      method: 'fixed'
    };

    // If percentage-based and transaction amount provided
    if (config.commissionPercentage && transactionAmount && transactionCurrency) {
      const percentage = parseFloat(config.commissionPercentage) / 100;
      const commissionAmount = transactionAmount * percentage;

      if (transactionCurrency === 'USD') {
        amountUsd = Math.max(amountUsd, commissionAmount);
      } else {
        amountCdf = Math.max(amountCdf, commissionAmount);
      }

      basis.method = 'percentage';
      basis.percentage = config.commissionPercentage;
      basis.transactionAmount = transactionAmount;
      basis.transactionCurrency = transactionCurrency;
    }

    // Check additional conditions
    if (config.conditions) {
      const conditions = config.conditions as any;
      
      // Minimum transaction amount
      if (conditions.minAmount && transactionAmount && transactionAmount < conditions.minAmount) {
        console.log(`[Commission] Transaction amount ${transactionAmount} below minimum ${conditions.minAmount}`);
        return null;
      }

      // Partner level requirements
      // TODO: Check partner level if needed
    }

    return {
      amountUsd,
      amountCdf,
      basis
    };
  }

  /**
   * Award commission for a completed operation
   */
  async awardCommission(
    partnerId: number,
    operationId: number,
    operationType: string,
    transactionAmount?: number,
    transactionCurrency?: 'USD' | 'CDF'
  ): Promise<CommissionEarned | null> {
    try {
      const commission = await this.calculateCommission(
        operationType,
        transactionAmount,
        transactionCurrency
      );

      if (!commission) {
        console.log(`[Commission] No commission calculated for operation ${operationId}`);
        return null;
      }

      const config = await this.getActiveConfig(operationType);
      if (!config) return null;

      // Create commission record
      const [created] = await db
        .insert(partnerCommissions)
        .values({
          partnerId,
          operationId,
          configurationId: config.id,
          amountUsd: commission.amountUsd.toString(),
          amountCdf: commission.amountCdf.toString(),
          calculationBasis: commission.basis,
          status: 'APPROVED', // Auto-approve or set to PENDING based on business rules
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .returning();

      // Send notification to partner
      await this.notifyPartner(partnerId, {
        type: 'COMMISSION_EARNED',
        title: 'Commission Earned',
        message: `You earned $${commission.amountUsd} USD / ${commission.amountCdf} CDF for ${operationType}`,
        data: {
          operationType,
          amountUsd: commission.amountUsd,
          amountCdf: commission.amountCdf,
          operationId
        }
      });

      console.log(`[Commission] Awarded to partner ${partnerId}: $${commission.amountUsd} USD / ${commission.amountCdf} CDF`);

      return created;
    } catch (error) {
      console.error('[Commission] Error awarding commission:', error);
      throw error;
    }
  }

  /**
   * Get partner commission summary
   */
  async getPartnerSummary(partnerId: number): Promise<CommissionSummary> {
    const results = await db
      .select({
        status: partnerCommissions.status,
        totalUsd: sql<string>`COALESCE(SUM(${partnerCommissions.amountUsd}), 0)`,
        totalCdf: sql<string>`COALESCE(SUM(${partnerCommissions.amountCdf}), 0)`,
        count: sql<number>`COUNT(*)`
      })
      .from(partnerCommissions)
      .where(eq(partnerCommissions.partnerId, partnerId))
      .groupBy(partnerCommissions.status);

    const summary: CommissionSummary = {
      totalUsd: '0',
      totalCdf: '0',
      pendingUsd: '0',
      pendingCdf: '0',
      approvedUsd: '0',
      approvedCdf: '0',
      paidUsd: '0',
      paidCdf: '0',
      commissionCount: 0
    };

    results.forEach(row => {
      const status = row.status.toLowerCase();
      if (status === 'pending') {
        summary.pendingUsd = row.totalUsd;
        summary.pendingCdf = row.totalCdf;
      } else if (status === 'approved') {
        summary.approvedUsd = row.totalUsd;
        summary.approvedCdf = row.totalCdf;
      } else if (status === 'paid') {
        summary.paidUsd = row.totalUsd;
        summary.paidCdf = row.totalCdf;
      }
      summary.commissionCount += Number(row.count);
    });

    // Calculate totals
    const totalUsd = parseFloat(summary.pendingUsd) + 
                     parseFloat(summary.approvedUsd) + 
                     parseFloat(summary.paidUsd);
    const totalCdf = parseFloat(summary.pendingCdf) + 
                     parseFloat(summary.approvedCdf) + 
                     parseFloat(summary.paidCdf);

    summary.totalUsd = totalUsd.toFixed(2);
    summary.totalCdf = totalCdf.toFixed(2);

    return summary;
  }

  /**
   * Get partner commission history with pagination
   */
  async getPartnerHistory(
    partnerId: number,
    filters?: {
      status?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<CommissionEarned[]> {
    let query = db
      .select({
        id: partnerCommissions.id,
        partnerId: partnerCommissions.partnerId,
        operationId: partnerCommissions.operationId,
        amountUsd: partnerCommissions.amountUsd,
        amountCdf: partnerCommissions.amountCdf,
        status: partnerCommissions.status,
        createdAt: partnerCommissions.createdAt,
        calculationBasis: partnerCommissions.calculationBasis,
        operationType: partnerOperations.operationType
      })
      .from(partnerCommissions)
      .leftJoin(partnerOperations, eq(partnerCommissions.operationId, partnerOperations.id))
      .where(eq(partnerCommissions.partnerId, partnerId))
      .$dynamic();

    if (filters?.status) {
      query = query.where(eq(partnerCommissions.status, filters.status));
    }

    if (filters?.startDate) {
      query = query.where(gte(partnerCommissions.createdAt, filters.startDate));
    }

    if (filters?.endDate) {
      query = query.where(lte(partnerCommissions.createdAt, filters.endDate));
    }

    const results = await query
      .orderBy(desc(partnerCommissions.createdAt))
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    return results;
  }

  /**
   * Get commission evolution data for charts (monthly aggregation)
   */
  async getCommissionEvolution(
    partnerId: number,
    months: number = 12
  ): Promise<Array<{ month: string; usd: string; cdf: string; count: number }>> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const results = await db.execute(sql`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COALESCE(SUM(amount_usd), 0) as usd,
        COALESCE(SUM(amount_cdf), 0) as cdf,
        COUNT(*) as count
      FROM partner_commissions
      WHERE partner_id = ${partnerId}
        AND created_at >= ${startDate.toISOString()}
        AND status IN ('APPROVED', 'PAID')
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT ${months}
    `);

    return results as any[];
  }

  /**
   * Send notification to partner
   */
  async notifyPartner(
    partnerId: number,
    notification: {
      type: string;
      title: string;
      message: string;
      data?: any;
      configurationId?: number;
    }
  ): Promise<void> {
    try {
      await db.insert(commissionNotifications).values({
        partnerId,
        configurationId: notification.configurationId,
        notificationType: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        isRead: false,
        createdAt: new Date().toISOString()
      });

      console.log(`[Commission] Notification sent to partner ${partnerId}: ${notification.title}`);
    } catch (error) {
      console.error('[Commission] Error sending notification:', error);
    }
  }

  /**
   * Get partner notifications
   */
  async getPartnerNotifications(
    partnerId: number,
    filters?: {
      unreadOnly?: boolean;
      limit?: number;
    }
  ): Promise<any[]> {
    let query = db
      .select()
      .from(commissionNotifications)
      .where(eq(commissionNotifications.partnerId, partnerId))
      .$dynamic();

    if (filters?.unreadOnly) {
      query = query.where(eq(commissionNotifications.isRead, false));
    }

    const results = await query
      .orderBy(desc(commissionNotifications.createdAt))
      .limit(filters?.limit || 50);

    return results;
  }

  /**
   * Mark notification as read
   */
  async markNotificationRead(notificationId: number): Promise<void> {
    await db
      .update(commissionNotifications)
      .set({
        isRead: true,
        readAt: new Date().toISOString()
      })
      .where(eq(commissionNotifications.id, notificationId));
  }

  /**
   * Get all active commission configurations
   */
  async getAllActiveConfigs(): Promise<CommissionConfig[]> {
    const now = new Date().toISOString();

    const configs = await db
      .select()
      .from(commissionConfigurations)
      .where(and(
        eq(commissionConfigurations.isActive, true),
        lte(commissionConfigurations.validFrom, now),
        or(
          isNull(commissionConfigurations.validUntil),
          gte(commissionConfigurations.validUntil, now)
        )
      ))
      .orderBy(commissionConfigurations.operationType);

    return configs;
  }

  /**
   * Notify all active partners about commission config changes
   */
  async notifyAllPartners(
    notification: {
      type: string;
      title: string;
      message: string;
      data?: any;
      configurationId?: number;
    }
  ): Promise<void> {
    // Get all active partners
    const partners = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(
        eq(customers.customerType, 'PARTNER'),
        eq(customers.isActive, true)
      ));

    // Send notification to each partner
    for (const partner of partners) {
      await this.notifyPartner(partner.id, notification);
    }

    console.log(`[Commission] Sent ${notification.type} notification to ${partners.length} partners`);
  }
}

export const partnerCommissionService = new PartnerCommissionService();
