/**
 * Account Notification Service
 * Manages notification service subscriptions for customer accounts
 * Uses Drizzle ORM for optimal performance
 */

import { db } from '../../../db';
import { customerAccountServices, notificationServiceFees } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';

export interface AccountService {
  id: number;
  customerId: number;
  accountId: number;
  smsEnabled: boolean;
  emailEnabled: boolean;
  pushNotificationEnabled: boolean;
  inAppNotificationEnabled: boolean;
  servicesActivatedAt: string;
  monthlyTotalFeeUsd: string;
  monthlyTotalFeeCdf: string;
  lastBillingDate: string | null;
  nextBillingDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateServicesParams {
  customerId: number;
  accountId: number;
  smsEnabled?: boolean;
  emailEnabled?: boolean;
  pushNotificationEnabled?: boolean;
  inAppNotificationEnabled?: boolean;
  monthlyTotalFeeUsd?: number;
  monthlyTotalFeeCdf?: number;
}

export class AccountNotificationService {
  /**
   * Get notification service subscription for a customer account
   */
  static async getSubscription(customerId: number, accountId: number): Promise<AccountService | null> {
    const [subscription] = await db
      .select()
      .from(customerAccountServices)
      .where(
        and(
          eq(customerAccountServices.customerId, customerId),
          eq(customerAccountServices.accountId, accountId)
        )
      )
      .limit(1);

    return subscription as AccountService || null;
  }

  /**
   * Create or update notification service subscription
   */
  static async upsertSubscription(params: UpdateServicesParams): Promise<AccountService> {
    const {
      customerId,
      accountId,
      smsEnabled = false,
      emailEnabled = false,
      pushNotificationEnabled = false,
      inAppNotificationEnabled = true,
      monthlyTotalFeeUsd = 0,
      monthlyTotalFeeCdf = 0,
    } = params;

    // Calculate next billing date (30 days from now)
    const nextBillingDate = new Date();
    nextBillingDate.setDate(nextBillingDate.getDate() + 30);

    // Check if subscription exists
    const existing = await this.getSubscription(customerId, accountId);

    if (existing) {
      // Update existing subscription
      const [updated] = await db
        .update(customerAccountServices)
        .set({
          smsEnabled,
          emailEnabled,
          pushNotificationEnabled,
          inAppNotificationEnabled,
          monthlyTotalFeeUsd: monthlyTotalFeeUsd.toString(),
          monthlyTotalFeeCdf: monthlyTotalFeeCdf.toString(),
          nextBillingDate: nextBillingDate.toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(customerAccountServices.customerId, customerId),
            eq(customerAccountServices.accountId, accountId)
          )
        )
        .returning();

      return updated as AccountService;
    } else {
      // Create new subscription
      const [created] = await db
        .insert(customerAccountServices)
        .values({
          customerId,
          accountId,
          smsEnabled,
          emailEnabled,
          pushNotificationEnabled,
          inAppNotificationEnabled,
          monthlyTotalFeeUsd: monthlyTotalFeeUsd.toString(),
          monthlyTotalFeeCdf: monthlyTotalFeeCdf.toString(),
          nextBillingDate: nextBillingDate.toISOString(),
        })
        .returning();

      return created as AccountService;
    }
  }

  /**
   * Cancel subscription (disable all paid services, keep in-app free)
   */
  static async cancelSubscription(customerId: number, accountId: number): Promise<AccountService> {
    const [updated] = await db
      .update(customerAccountServices)
      .set({
        smsEnabled: false,
        emailEnabled: false,
        pushNotificationEnabled: false,
        inAppNotificationEnabled: true, // Free, always active
        monthlyTotalFeeUsd: '0',
        monthlyTotalFeeCdf: '0',
        nextBillingDate: null, // Cancel next billing
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(customerAccountServices.customerId, customerId),
          eq(customerAccountServices.accountId, accountId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error('Subscription not found');
    }

    return updated as AccountService;
  }

  /**
   * Get notification service fees configuration
   */
  static async getServiceFees(): Promise<any[]> {
    return await db
      .select()
      .from(notificationServiceFees)
      .where(eq(notificationServiceFees.isActive, true));
  }

  /**
   * Calculate total monthly fees based on enabled services
   */
  static async calculateMonthlyFees(
    smsEnabled: boolean,
    emailEnabled: boolean,
    pushNotificationEnabled: boolean
  ): Promise<{ feeUsd: number; feeCdf: number }> {
    const fees = await this.getServiceFees();

    let totalUsd = 0;
    let totalCdf = 0;

    for (const fee of fees) {
      const enabled =
        (fee.serviceType === 'SMS' && smsEnabled) ||
        (fee.serviceType === 'EMAIL' && emailEnabled) ||
        (fee.serviceType === 'PUSH_NOTIFICATION' && pushNotificationEnabled);

      if (enabled && !fee.isFree) {
        totalUsd += parseFloat(fee.monthlyFeeUsd);
        totalCdf += parseFloat(fee.monthlyFeeCdf);
      }
    }

    return { feeUsd: totalUsd, feeCdf: totalCdf };
  }

  /**
   * Activate a specific service
   */
  static async activateService(
    customerId: number,
    accountId: number,
    serviceType: 'SMS' | 'EMAIL' | 'PUSH'
  ): Promise<AccountService> {
    const subscription = await this.getSubscription(customerId, accountId);
    
    if (!subscription) {
      throw new Error('No subscription found. Please create one first.');
    }

    const updateData: any = { updatedAt: new Date().toISOString() };

    switch (serviceType) {
      case 'SMS':
        updateData.smsEnabled = true;
        break;
      case 'EMAIL':
        updateData.emailEnabled = true;
        break;
      case 'PUSH':
        updateData.pushNotificationEnabled = true;
        break;
    }

    // Recalculate fees
    const fees = await this.calculateMonthlyFees(
      serviceType === 'SMS' ? true : subscription.smsEnabled,
      serviceType === 'EMAIL' ? true : subscription.emailEnabled,
      serviceType === 'PUSH' ? true : subscription.pushNotificationEnabled
    );

    updateData.monthlyTotalFeeUsd = fees.feeUsd.toString();
    updateData.monthlyTotalFeeCdf = fees.feeCdf.toString();

    const [updated] = await db
      .update(customerAccountServices)
      .set(updateData)
      .where(
        and(
          eq(customerAccountServices.customerId, customerId),
          eq(customerAccountServices.accountId, accountId)
        )
      )
      .returning();

    return updated as AccountService;
  }

  /**
   * Deactivate a specific service
   */
  static async deactivateService(
    customerId: number,
    accountId: number,
    serviceType: 'SMS' | 'EMAIL' | 'PUSH'
  ): Promise<AccountService> {
    const subscription = await this.getSubscription(customerId, accountId);
    
    if (!subscription) {
      throw new Error('No subscription found');
    }

    const updateData: any = { updatedAt: new Date().toISOString() };

    switch (serviceType) {
      case 'SMS':
        updateData.smsEnabled = false;
        break;
      case 'EMAIL':
        updateData.emailEnabled = false;
        break;
      case 'PUSH':
        updateData.pushNotificationEnabled = false;
        break;
    }

    // Recalculate fees
    const fees = await this.calculateMonthlyFees(
      serviceType === 'SMS' ? false : subscription.smsEnabled,
      serviceType === 'EMAIL' ? false : subscription.emailEnabled,
      serviceType === 'PUSH' ? false : subscription.pushNotificationEnabled
    );

    updateData.monthlyTotalFeeUsd = fees.feeUsd.toString();
    updateData.monthlyTotalFeeCdf = fees.feeCdf.toString();

    const [updated] = await db
      .update(customerAccountServices)
      .set(updateData)
      .where(
        and(
          eq(customerAccountServices.customerId, customerId),
          eq(customerAccountServices.accountId, accountId)
        )
      )
      .returning();

    return updated as AccountService;
  }
}
