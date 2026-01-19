/**
 * Billing Service
 * Handles billing history, account fees, and notification service fees
 * Uses Drizzle ORM for optimal performance
 */

import { db } from '../../../db';
import { billingHistory, accounts, customers } from '../../../db/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

export interface BillingRecord {
  id: number;
  customerId: number;
  accountId: number | null;
  billingType: string;
  serviceType: string | null;
  description: string;
  amountUsd: string;
  amountCdf: string;
  currencyCharged: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  chargedAt: string;
  status: string;
  transactionId: number | null;
  createdAt: string;
}

export interface GetBillingHistoryParams {
  customerId: number;
  type?: string | null;
  status?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
  offset?: number;
}

export interface CreateBillingRecordParams {
  customerId: number;
  accountId?: number | null;
  billingType: 'NOTIFICATION_SERVICE' | 'ACCOUNT_MAINTENANCE' | 'OTHER';
  serviceType?: string | null;
  description: string;
  amountUsd: number;
  amountCdf: number;
  currencyCharged: 'USD' | 'CDF';
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  status?: 'COMPLETED' | 'PENDING' | 'FAILED';
  transactionId?: number | null;
}

export class BillingService {
  /**
   * Get billing history for a customer with optional filtering
   * Optimized with indexed queries for fast P90/P95 performance
   */
  static async getBillingHistory(params: GetBillingHistoryParams): Promise<BillingRecord[]> {
    const {
      customerId,
      type = null,
      status = null,
      dateFrom = null,
      dateTo = null,
      limit = 100,
      offset = 0,
    } = params;

    // Build WHERE conditions
    const conditions = [eq(billingHistory.customerId, customerId)];

    if (type) {
      conditions.push(eq(billingHistory.billingType, type));
    }

    if (status) {
      conditions.push(eq(billingHistory.status, status));
    }

    if (dateFrom || dateTo) {
      if (dateFrom) {
        conditions.push(gte(billingHistory.chargedAt, dateFrom));
      }
      if (dateTo) {
        conditions.push(lte(billingHistory.chargedAt, dateTo));
      }
    }

    // Execute optimized query with index usage
    const records = await db
      .select()
      .from(billingHistory)
      .where(and(...conditions))
      .orderBy(desc(billingHistory.chargedAt))
      .limit(limit)
      .offset(offset);

    return records as BillingRecord[];
  }

  /**
   * Create a new billing record
   */
  static async createBillingRecord(params: CreateBillingRecordParams): Promise<BillingRecord> {
    const {
      customerId,
      accountId = null,
      billingType,
      serviceType = null,
      description,
      amountUsd,
      amountCdf,
      currencyCharged,
      billingPeriodStart,
      billingPeriodEnd,
      status = 'COMPLETED',
      transactionId = null,
    } = params;

    const [record] = await db
      .insert(billingHistory)
      .values({
        customerId,
        accountId,
        billingType,
        serviceType,
        description,
        amountUsd: amountUsd.toString(),
        amountCdf: amountCdf.toString(),
        currencyCharged,
        billingPeriodStart: billingPeriodStart.toISOString(),
        billingPeriodEnd: billingPeriodEnd.toISOString(),
        status,
        transactionId,
      })
      .returning();

    return record as BillingRecord;
  }

  /**
   * Get billing summary statistics for a customer
   */
  static async getBillingSummary(customerId: number, year?: number) {
    const currentYear = year || new Date().getFullYear();
    const startDate = `${currentYear}-01-01`;
    const endDate = `${currentYear}-12-31`;

    const summary = await db
      .select({
        billingType: billingHistory.billingType,
        totalUsd: sql<string>`SUM(CAST(${billingHistory.amountUsd} AS DECIMAL))`,
        totalCdf: sql<string>`SUM(CAST(${billingHistory.amountCdf} AS DECIMAL))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(billingHistory)
      .where(
        and(
          eq(billingHistory.customerId, customerId),
          gte(billingHistory.chargedAt, startDate),
          lte(billingHistory.chargedAt, endDate)
        )
      )
      .groupBy(billingHistory.billingType);

    return summary;
  }

  /**
   * Bill notification services for a customer
   * Used by cron job for monthly billing
   */
  static async billNotificationServices(customerId: number, monthlyFeeUsd: number, monthlyFeeCdf: number) {
    const now = new Date();
    const billingPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const billingPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return await this.createBillingRecord({
      customerId,
      billingType: 'NOTIFICATION_SERVICE',
      description: `Frais de services de notification (${billingPeriodStart.toLocaleDateString('fr-FR')} - ${billingPeriodEnd.toLocaleDateString('fr-FR')})`,
      amountUsd: monthlyFeeUsd,
      amountCdf: monthlyFeeCdf,
      currencyCharged: 'USD',
      billingPeriodStart,
      billingPeriodEnd,
      status: 'COMPLETED',
    });
  }

  /**
   * Bill account maintenance fees
   * Used by cron job for monthly billing
   */
  static async billAccountMaintenance(
    customerId: number,
    accountId: number,
    accountTypeCode: string,
    monthlyFeeUsd: number,
    monthlyFeeCdf: number
  ) {
    const now = new Date();
    const billingPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const billingPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return await this.createBillingRecord({
      customerId,
      accountId,
      billingType: 'ACCOUNT_MAINTENANCE',
      description: `Frais de tenue de compte ${accountTypeCode} (${billingPeriodStart.toLocaleDateString('fr-FR')} - ${billingPeriodEnd.toLocaleDateString('fr-FR')})`,
      amountUsd: monthlyFeeUsd,
      amountCdf: monthlyFeeCdf,
      currencyCharged: 'USD',
      billingPeriodStart,
      billingPeriodEnd,
      status: 'COMPLETED',
    });
  }
}
