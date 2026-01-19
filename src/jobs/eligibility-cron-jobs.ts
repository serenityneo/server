/**
 * Eligibility Cron Jobs
 * 
 * Background jobs for automatic eligibility evaluation:
 * - Daily eligibility check for all active customers
 * - Motivation notifications for inactive customers
 * - Auto-activation when conditions are met
 * 
 * Schedule:
 * - DAILY_CHECK: Every day at 06:00 AM
 * - INACTIVITY_CHECK: Every day at 10:00 AM
 * - NOTIFICATION_CLEANUP: Every day at 02:00 AM
 */

import { CronJob } from 'cron';
import { db } from '../db';
import { 
  customers, 
  accounts,
  customerEligibilityStatus,
  customerNotifications,
  transactions
} from '../db/schema';
import { eligibilityEngine } from '../services/eligibility-engine';
import { eq, and, sql, lt, gte, desc, isNull, or, ne } from 'drizzle-orm';

// Track job status
let isRunning = false;

/**
 * Daily eligibility check for all active customers
 * Runs at 06:00 AM every day
 */
export const dailyEligibilityCheckJob = new CronJob(
  '0 6 * * *', // At 06:00 every day
  async () => {
    if (isRunning) {
      console.log('[EligibilityCron] Job already running, skipping...');
      return;
    }
    
    isRunning = true;
    console.log('[EligibilityCron] Starting daily eligibility check...');
    const startTime = Date.now();
    
    try {
      // Get all active customers
      const activeCustomers = await db.select({ id: customers.id })
        .from(customers)
        .where(and(
          eq(customers.status, 'ACTIVE'),
          eq(customers.isActive, true)
        ));
      
      console.log(`[EligibilityCron] Processing ${activeCustomers.length} customers...`);
      
      let processed = 0;
      let errors = 0;
      
      for (const customer of activeCustomers) {
        try {
          await eligibilityEngine.evaluateAllForCustomer(customer.id, 'DAILY_CHECK');
          processed++;
          
          // Log progress every 100 customers
          if (processed % 100 === 0) {
            console.log(`[EligibilityCron] Progress: ${processed}/${activeCustomers.length}`);
          }
        } catch (error) {
          errors++;
          console.error(`[EligibilityCron] Error processing customer ${customer.id}:`, error);
        }
      }
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`[EligibilityCron] ✅ Completed: ${processed} processed, ${errors} errors, ${duration}s`);
      
    } catch (error) {
      console.error('[EligibilityCron] Fatal error in daily check:', error);
    } finally {
      isRunning = false;
    }
  },
  null,
  false, // Don't start automatically
  'Africa/Kinshasa' // WAT timezone
);

/**
 * Inactivity notification job
 * Sends motivation notifications to customers who haven't been active
 * Runs at 10:00 AM every day
 */
export const inactivityNotificationJob = new CronJob(
  '0 10 * * *', // At 10:00 every day
  async () => {
    console.log('[EligibilityCron] Starting inactivity notification check...');
    
    try {
      // Find customers with no transactions in last 3 days
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      
      const inactiveCustomers = await db.execute(sql`
        SELECT DISTINCT c.id, c.first_name, c.last_name
        FROM customers c
        WHERE c.status = 'ACTIVE'
          AND c.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE a.customer_id = c.id
              AND t.created_at >= ${threeDaysAgo.toISOString()}
          )
          AND NOT EXISTS (
            SELECT 1 FROM customer_notifications cn
            WHERE cn.customer_id = c.id
              AND cn.notification_type = 'MOTIVATION'
              AND cn.created_at >= NOW() - INTERVAL '24 hours'
          )
        LIMIT 100
      `);
      
      const rows = (inactiveCustomers as any).rows || [];
      console.log(`[EligibilityCron] Found ${rows.length} inactive customers`);
      
      for (const customer of rows) {
        try {
          // Get their current eligibility status
          const status = await eligibilityEngine.getCustomerEligibilityStatus(customer.id);
          
          // Find the closest to eligibility
          const bestProgress = status
            .filter(s => !s.isEligible && parseFloat(s.progressPercentage) > 0)
            .sort((a, b) => parseFloat(b.progressPercentage) - parseFloat(a.progressPercentage))[0];
          
          if (bestProgress) {
            const targetName = bestProgress.targetType === 'ACCOUNT' 
              ? `compte ${bestProgress.targetCode}`
              : `crédit ${bestProgress.targetCode}`;
            
            const daysText = bestProgress.estimatedDaysToEligibility
              ? `Plus que ${bestProgress.estimatedDaysToEligibility} jours!`
              : 'Un petit effort!';
            
            await db.insert(customerNotifications).values({
              customerId: customer.id,
              notificationType: 'MOTIVATION',
              priority: 'MEDIUM',
              title: 'On vous attend!',
              message: `Nous avons remarqué aucune activité depuis 3 jours. Vous êtes à ${Math.round(parseFloat(bestProgress.progressPercentage))}% pour débloquer ${targetName}. ${daysText}`,
              actionLabel: 'Faire un dépôt',
              actionUrl: '/dashboard/deposit',
              icon: 'zap',
              targetType: bestProgress.targetType,
              targetCode: bestProgress.targetCode,
              displayDurationSeconds: 300,
              isRepeatable: true,
              repeatIntervalHours: 48, // Every 2 days
              metadata: {
                progressPercentage: parseFloat(bestProgress.progressPercentage),
                daysInactive: 3
              } as any
            });
          }
        } catch (error) {
          console.error(`[EligibilityCron] Error creating motivation notification for ${customer.id}:`, error);
        }
      }
      
      console.log(`[EligibilityCron] ✅ Sent ${rows.length} motivation notifications`);
      
    } catch (error) {
      console.error('[EligibilityCron] Error in inactivity check:', error);
    }
  },
  null,
  false,
  'Africa/Kinshasa'
);

/**
 * Notification cleanup job
 * Removes old notifications and marks expired ones as dismissed
 * Runs at 02:00 AM every day
 */
export const notificationCleanupJob = new CronJob(
  '0 2 * * *', // At 02:00 every day
  async () => {
    console.log('[EligibilityCron] Starting notification cleanup...');
    
    try {
      // Mark expired notifications as dismissed
      const now = new Date().toISOString();
      
      const expiredResult = await db.update(customerNotifications)
        .set({
          isDismissed: true,
          dismissedAt: now,
          updatedAt: now
        })
        .where(and(
          eq(customerNotifications.isDismissed, false),
          lt(customerNotifications.expiresAt, now)
        ));
      
      // Delete old dismissed notifications (older than 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const deleteResult = await db.execute(sql`
        DELETE FROM customer_notifications
        WHERE is_dismissed = true
          AND dismissed_at < ${thirtyDaysAgo.toISOString()}
      `);
      
      console.log(`[EligibilityCron] ✅ Cleanup complete`);
      
    } catch (error) {
      console.error('[EligibilityCron] Error in notification cleanup:', error);
    }
  },
  null,
  false,
  'Africa/Kinshasa'
);

/**
 * Auto-activation check job
 * Activates accounts and services for eligible customers
 * Runs every hour
 */
export const autoActivationJob = new CronJob(
  '0 * * * *', // Every hour
  async () => {
    console.log('[EligibilityCron] Starting auto-activation check...');
    
    try {
      // Find eligible but not activated targets
      const eligibleTargets = await db.select()
        .from(customerEligibilityStatus)
        .where(and(
          eq(customerEligibilityStatus.isEligible, true),
          eq(customerEligibilityStatus.isActivated, false),
          eq(customerEligibilityStatus.autoActivateWhenEligible, true)
        ))
        .limit(100);
      
      console.log(`[EligibilityCron] Found ${eligibleTargets.length} targets to auto-activate`);
      
      for (const target of eligibleTargets) {
        try {
          if (target.targetType === 'ACCOUNT') {
            // Activate the account
            await db.execute(sql`
              UPDATE accounts
              SET status = 'ACTIVE', updated_at = NOW()
              WHERE customer_id = ${target.customerId}
                AND (account_type_code = ${target.targetCode} OR account_type = ${target.targetCode + '_' + 'MANDATORY_SAVINGS'})
            `);
          }
          
          // Mark as activated
          const now = new Date().toISOString();
          await db.update(customerEligibilityStatus)
            .set({
              isActivated: true,
              activatedAt: now,
              updatedAt: now
            })
            .where(eq(customerEligibilityStatus.id, target.id));
          
          console.log(`[EligibilityCron] ✅ Auto-activated ${target.targetType} ${target.targetCode} for customer ${target.customerId}`);
          
        } catch (error) {
          console.error(`[EligibilityCron] Error auto-activating target ${target.id}:`, error);
        }
      }
      
      console.log(`[EligibilityCron] ✅ Auto-activation complete`);
      
    } catch (error) {
      console.error('[EligibilityCron] Error in auto-activation:', error);
    }
  },
  null,
  false,
  'Africa/Kinshasa'
);

/**
 * Start all eligibility cron jobs
 */
export function startEligibilityCronJobs(): void {
  console.log('[EligibilityCron] Starting eligibility cron jobs...');
  
  dailyEligibilityCheckJob.start();
  console.log('  ✅ Daily eligibility check job started (06:00 daily)');
  
  inactivityNotificationJob.start();
  console.log('  ✅ Inactivity notification job started (10:00 daily)');
  
  notificationCleanupJob.start();
  console.log('  ✅ Notification cleanup job started (02:00 daily)');
  
  autoActivationJob.start();
  console.log('  ✅ Auto-activation job started (hourly)');
  
  console.log('[EligibilityCron] All jobs started successfully');
}

/**
 * Stop all eligibility cron jobs
 */
export function stopEligibilityCronJobs(): void {
  console.log('[EligibilityCron] Stopping eligibility cron jobs...');
  
  dailyEligibilityCheckJob.stop();
  inactivityNotificationJob.stop();
  notificationCleanupJob.stop();
  autoActivationJob.stop();
  
  console.log('[EligibilityCron] All jobs stopped');
}

/**
 * Run eligibility check for a specific customer (for testing)
 */
export async function runEligibilityCheckForCustomer(customerId: number): Promise<void> {
  console.log(`[EligibilityCron] Running eligibility check for customer ${customerId}...`);
  
  try {
    const results = await eligibilityEngine.evaluateAllForCustomer(customerId, 'MANUAL');
    
    console.log('\n📊 Eligibility Results:');
    for (const result of results) {
      const icon = result.isEligible ? '✅' : '⏳';
      console.log(`  ${icon} ${result.targetType} ${result.targetCode}: ${result.eligibilityScore}%`);
      if (!result.isEligible && result.conditionsMissing.length > 0) {
        console.log(`     Missing: ${result.conditionsMissing.map(c => c.label).join(', ')}`);
      }
    }
    
  } catch (error) {
    console.error('[EligibilityCron] Error running check:', error);
  }
}

/**
 * Run daily check manually (for testing)
 */
export async function runDailyCheckManually(): Promise<void> {
  console.log('[EligibilityCron] Running daily check manually...');
  await dailyEligibilityCheckJob.fireOnTick();
}
