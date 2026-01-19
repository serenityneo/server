/**
 * Billing Cron Service
 * Automatic billing for notification services and account maintenance fees
 * Runs monthly on the 1st of each month
 * 
 * Architecture: Server-side only with Drizzle ORM for performance
 */

import { db } from '../../../db';
import { billingHistory, accounts, customers } from '../../../db/schema';
import { eq, and, lte, or, sql, not } from 'drizzle-orm';
import { BillingService } from './billing.service';

interface CustomerAccountService {
  id: number;
  customer_id: number;
  account_id: number;
  sms_enabled: boolean;
  email_enabled: boolean;
  push_notification_enabled: boolean;
  monthly_total_fee_usd: string;
  monthly_total_fee_cdf: string;
  next_billing_date: string | null;
}

interface AccountTypeConfig {
  account_type_code: string;
  account_type_name: string;
  monthly_fee_usd: string;
  monthly_fee_cdf: string;
  is_active: boolean;
}

export class BillingCronService {
  /**
   * Execute the monthly billing cron job
   */
  static async executeBillingCron() {
    console.log('=== Starting billing cron job ===', new Date().toISOString());
    
    const start = Date.now();
    
    try {
      // 1. Bill notification services
      const notificationResults = await this.billNotificationServices();
      
      // 2. Bill account maintenance fees
      const maintenanceResults = await this.billAccountMaintenance();
      
      console.log('=== Billing cron job completed ===', new Date().toISOString());
      console.log('Duration:', Date.now() - start, 'ms');
      console.log('Notification services billed:', notificationResults);
      console.log('Account maintenance billed:', maintenanceResults);
      
      return {
        success: true,
        message: 'Billing completed successfully',
        notificationBilled: notificationResults,
        maintenanceBilled: maintenanceResults,
      };
    } catch (error: any) {
      console.error('Error in billing cron job:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Bill monthly notification services
   */
  private static async billNotificationServices(): Promise<number> {
    console.log('Billing notification services...');
    
    // Note: Since customer_account_services doesn't exist in Drizzle schema yet,
    // we'll use raw SQL for now. This should be added to the schema later.
    const customersWithServices = await db.execute(sql`
      SELECT 
        id, 
        customer_id, 
        account_id, 
        sms_enabled, 
        email_enabled, 
        push_notification_enabled,
        monthly_total_fee_usd,
        monthly_total_fee_cdf,
        next_billing_date
      FROM customer_account_services
      WHERE (email_enabled = true OR sms_enabled = true OR push_notification_enabled = true)
        AND next_billing_date <= CURRENT_DATE
    `);

    const services = (customersWithServices as any).rows || [];
    console.log(`Found ${services.length} customers with services to bill`);

    let billedCount = 0;
    for (const service of services) {
      try {
        await this.processNotificationBilling(service);
        billedCount++;
      } catch (error) {
        console.error(`Error billing customer ${service.customer_id}:`, error);
        // Continue with other customers even if one fails
      }
    }

    return billedCount;
  }

  /**
   * Bill account maintenance fees
   */
  private static async billAccountMaintenance(): Promise<number> {
    console.log('Billing account maintenance fees...');
    
    // Get account type configurations with monthly fees
    const accountTypesWithFees = await db.execute(sql`
      SELECT 
        account_type_code, 
        account_type_name, 
        monthly_fee_usd, 
        monthly_fee_cdf, 
        is_active
      FROM account_type_configs
      WHERE monthly_fee_usd != 0 AND is_active = true
    `);

    const configs = (accountTypesWithFees as any).rows || [];
    console.log(`Found ${configs.length} account types with monthly fees`);

    let billedCount = 0;
    for (const config of configs) {
      const count = await this.billAccountTypeFees(config);
      billedCount += count;
    }

    return billedCount;
  }

  /**
   * Process billing for a notification service
   */
  private static async processNotificationBilling(service: CustomerAccountService) {
    const { customer_id, account_id, monthly_total_fee_usd, monthly_total_fee_cdf } = service;
    
    const feeUsd = parseFloat(monthly_total_fee_usd);
    const feeCdf = parseFloat(monthly_total_fee_cdf);
    
    if (feeUsd === 0 && feeCdf === 0) {
      // No fees to charge, just update the billing date
      await this.updateNextBillingDate(service.id);
      return;
    }

    // Calculate billing period
    const billingPeriod = this.calculateBillingPeriod(
      service.next_billing_date ? new Date(service.next_billing_date) : new Date()
    );

    // Create billing record using BillingService
    await BillingService.createBillingRecord({
      customerId: customer_id,
      accountId: account_id,
      billingType: 'NOTIFICATION_SERVICE',
      description: `Frais de services de notification (${billingPeriod.start.toLocaleDateString('fr-FR')} - ${billingPeriod.end.toLocaleDateString('fr-FR')})`,
      amountUsd: feeUsd,
      amountCdf: feeCdf,
      currencyCharged: 'USD',
      billingPeriodStart: billingPeriod.start,
      billingPeriodEnd: billingPeriod.end,
      status: 'COMPLETED',
    });

    // Update next billing date
    await this.updateNextBillingDate(service.id);

    console.log(`Billed notification services for customer ${customer_id} - Amount: $${feeUsd} USD`);
  }

  /**
   * Bill account maintenance fees for a specific account type
   */
  private static async billAccountTypeFees(config: AccountTypeConfig): Promise<number> {
    // Get all active accounts of this type
    const activeAccounts = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.accountTypeCode, config.account_type_code),
          eq(accounts.status, 'ACTIVE')
        )
      );

    console.log(`Billing fees for ${activeAccounts.length} accounts of type ${config.account_type_code}`);

    for (const account of activeAccounts) {
      await this.billSingleAccountMaintenance(account, config);
    }

    return activeAccounts.length;
  }

  /**
   * Bill maintenance fees for a single account
   */
  private static async billSingleAccountMaintenance(account: any, config: AccountTypeConfig) {
    const now = new Date();
    const billingPeriod = this.calculateBillingPeriod(now);

    const feeUsd = parseFloat(config.monthly_fee_usd);
    const feeCdf = parseFloat(config.monthly_fee_cdf);

    await BillingService.createBillingRecord({
      customerId: account.customerId,
      accountId: account.id,
      billingType: 'ACCOUNT_MAINTENANCE',
      serviceType: config.account_type_code,
      description: `Frais de tenue de compte ${config.account_type_name} (${billingPeriod.start.toLocaleDateString('fr-FR')} - ${billingPeriod.end.toLocaleDateString('fr-FR')})`,
      amountUsd: feeUsd,
      amountCdf: feeCdf,
      currencyCharged: 'USD',
      billingPeriodStart: billingPeriod.start,
      billingPeriodEnd: billingPeriod.end,
      status: 'COMPLETED',
    });

    console.log(`Billed maintenance fee for account ${account.accountNumber} - $${feeUsd} USD`);
  }

  /**
   * Update next billing date
   */
  private static async updateNextBillingDate(serviceId: number) {
    const nextBillingDate = new Date();
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    nextBillingDate.setDate(1);
    nextBillingDate.setHours(0, 0, 0, 0);

    await db.execute(sql`
      UPDATE customer_account_services
      SET next_billing_date = ${nextBillingDate.toISOString()},
          last_billing_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${serviceId}
    `);
  }

  /**
   * Calculate billing period (first day of previous month to last day of previous month)
   */
  private static calculateBillingPeriod(referenceDate: Date): { start: Date; end: Date } {
    const start = new Date(referenceDate);
    start.setMonth(start.getMonth() - 1);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(referenceDate);
    end.setDate(0); // Last day of previous month
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }
}
