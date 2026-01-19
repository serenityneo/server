import { db } from '../../../db';
import { customers, partnerOperations } from '../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { partnerCommissionService } from './partner-commission.service';
import { partnerPointsService } from './partner-points.service';

/**
 * Deposit Tracking Service
 * 
 * Handles first deposit detection and commission award for partners
 * When a member makes their FIRST deposit, the partner who created
 * that member account becomes eligible for a commission
 */

export class DepositTrackingService {
  /**
   * Check if this is a customer's first deposit
   */
  async isFirstDeposit(customerId: number): Promise<boolean> {
    const [customer] = await db
      .select({ 
        firstDepositDate: customers.firstDepositDate,
        firstDepositCommissionAwarded: customers.firstDepositCommissionAwarded
      })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customer) {
      throw new Error('Customer not found');
    }

    // First deposit if no deposit date recorded yet
    return !customer.firstDepositDate;
  }

  /**
   * Record first deposit and award commission to managing partner
   */
  async recordFirstDeposit(data: {
    customerId: number;
    depositAmount: number;
    currency: 'USD' | 'CDF';
    partnerId: number; // Partner who is performing the deposit
  }): Promise<{
    isFirstDeposit: boolean;
    commissionAwarded: boolean;
    commissionDetails?: any;
  }> {
    try {
      // Check if this is the first deposit
      const isFirst = await this.isFirstDeposit(data.customerId);

      if (!isFirst) {
        return {
          isFirstDeposit: false,
          commissionAwarded: false
        };
      }

      // Get the customer to find the partner who created them
      const [customer] = await db
        .select({
          id: customers.id,
          managedByPartnerId: customers.managedByPartnerId,
          firstDepositCommissionAwarded: customers.firstDepositCommissionAwarded
        })
        .from(customers)
        .where(eq(customers.id, data.customerId))
        .limit(1);

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Partner who created the member (not necessarily the one performing deposit)
      const creatorPartnerId = customer.managedByPartnerId;

      // Update customer record with first deposit info
      await db
        .update(customers)
        .set({
          firstDepositDate: new Date().toISOString(),
          firstDepositAmount: data.depositAmount.toString(),
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, data.customerId));

      // If customer was created by a partner, award commission
      let commissionDetails = null;
      let commissionAwarded = false;

      if (creatorPartnerId && !customer.firstDepositCommissionAwarded) {
        // Create a partner operation for the first deposit commission
        const [operation] = await db.insert(partnerOperations).values({
          partnerId: creatorPartnerId,
          operationType: 'FIRST_DEPOSIT',
          targetCustomerId: data.customerId,
          amount: data.depositAmount.toString(),
          currency: data.currency,
          description: `First deposit commission for member #${data.customerId}`,
          status: 'APPROVED', // Auto-approve first deposit commissions
          pointsAwarded: 0,
          metadata: {
            firstDeposit: true,
            depositAmount: data.depositAmount,
            depositCurrency: data.currency,
            performedByPartnerId: data.partnerId
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }).returning();

        // Award commission using the commission service
        commissionDetails = await partnerCommissionService.awardCommission(
          creatorPartnerId,
          operation.id,
          'DEPOSIT', // Use DEPOSIT operation type for commission configuration
          data.depositAmount,
          data.currency
        );

        // Award points as well
        await partnerPointsService.awardPoints(
          creatorPartnerId,
          'DEPOSIT',
          `First deposit by member #${data.customerId}`,
          {
            firstDeposit: true,
            depositAmount: data.depositAmount,
            operationId: operation.id
          },
          operation.id
        );

        // Mark commission as awarded
        await db
          .update(customers)
          .set({
            firstDepositCommissionAwarded: true,
            updatedAt: new Date().toISOString()
          })
          .where(eq(customers.id, data.customerId));

        commissionAwarded = true;

        console.log(`[FirstDeposit] Commission awarded to partner ${creatorPartnerId} for member ${data.customerId}'s first deposit`);
      }

      return {
        isFirstDeposit: true,
        commissionAwarded,
        commissionDetails
      };

    } catch (error) {
      console.error('[FirstDeposit] Error recording first deposit:', error);
      throw error;
    }
  }

  /**
   * Get first deposit statistics for a partner
   */
  async getPartnerFirstDepositStats(partnerId: number): Promise<{
    totalFirstDeposits: number;
    totalCommissionsEarned: { usd: string; cdf: string };
    recentFirstDeposits: Array<{
      customerId: number;
      depositDate: string;
      depositAmount: string;
      commissionAwarded: boolean;
    }>;
  }> {
    // Count members created by this partner who made first deposit
    const stats = await db
      .select({
        totalFirstDeposits: sql<number>`COUNT(*)::int`,
        totalCommissionsAwarded: sql<number>`SUM(CASE WHEN ${customers.firstDepositCommissionAwarded} THEN 1 ELSE 0 END)::int`
      })
      .from(customers)
      .where(and(
        eq(customers.managedByPartnerId, partnerId),
        sql`${customers.firstDepositDate} IS NOT NULL`
      ));

    // Get recent first deposits
    const recentDeposits = await db
      .select({
        customerId: customers.id,
        depositDate: customers.firstDepositDate,
        depositAmount: customers.firstDepositAmount,
        commissionAwarded: customers.firstDepositCommissionAwarded
      })
      .from(customers)
      .where(and(
        eq(customers.managedByPartnerId, partnerId),
        sql`${customers.firstDepositDate} IS NOT NULL`
      ))
      .orderBy(sql`${customers.firstDepositDate} DESC`)
      .limit(10);

    // Calculate total commissions (approximate from first deposit operation type)
    const commissions = await db.execute(sql`
      SELECT 
        COALESCE(SUM(pc.amount_usd), 0) as total_usd,
        COALESCE(SUM(pc.amount_cdf), 0) as total_cdf
      FROM partner_commissions pc
      JOIN partner_operations po ON pc.operation_id = po.id
      WHERE po.partner_id = ${partnerId}
        AND po.operation_type = 'FIRST_DEPOSIT'
        AND pc.status IN ('APPROVED', 'PAID')
    `);

    return {
      totalFirstDeposits: stats[0]?.totalFirstDeposits || 0,
      totalCommissionsEarned: {
        usd: (commissions[0] as any)?.total_usd || '0',
        cdf: (commissions[0] as any)?.total_cdf || '0'
      },
      recentFirstDeposits: recentDeposits.map(d => ({
        customerId: d.customerId,
        depositDate: d.depositDate || '',
        depositAmount: d.depositAmount || '0',
        commissionAwarded: d.commissionAwarded
      }))
    };
  }
}

export const depositTrackingService = new DepositTrackingService();
