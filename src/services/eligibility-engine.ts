/**
 * EligibilityEngine - Core service for automatic eligibility evaluation
 * 
 * This service evaluates customer eligibility for:
 * - 6 Account Types (S01-S06)
 * - 5 Credit Services (BOMBÉ, TELEMA, MOPAO, VIMBISA, LIKÉLEMBA)
 * 
 * Features:
 * - Dynamic condition evaluation from database
 * - Progress tracking and scoring
 * - Auto-activation when conditions met
 * - Smart notification generation
 * - Audit logging for compliance
 */

import { db } from '../db';
import { 
  customers, 
  accounts, 
  accountTypeConditions, 
  serviceConditions,
  customerEligibilityStatus,
  customerNotifications,
  eligibilityEvaluationLogs,
  credits,
  transactions
} from '../db/schema';
import { eq, and, sql, desc, gte, lte, count } from 'drizzle-orm';

// Types
interface ConditionResult {
  conditionId: number;
  key: string;
  label: string;
  met: boolean;
  currentValue: any;
  requiredValue: any;
  weight: number;
  daysRemaining?: number;
}

interface EligibilityResult {
  customerId: number;
  targetType: 'ACCOUNT' | 'SERVICE';
  targetCode: string;
  isEligible: boolean;
  eligibilityScore: number;
  progressPercentage: number;
  conditionsMet: ConditionResult[];
  conditionsMissing: ConditionResult[];
  estimatedDaysToEligibility: number | null;
}

interface NotificationTemplate {
  type: 'CELEBRATION' | 'PROGRESS' | 'MOTIVATION' | 'ALERT' | 'REMINDER' | 'SYSTEM';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
  icon?: string;
  displayDurationSeconds: number;
  isRepeatable: boolean;
  repeatIntervalHours?: number;
}

// Account type display names
const ACCOUNT_NAMES: Record<string, string> = {
  'S01': 'Compte Standard',
  'S02': 'Épargne Obligatoire',
  'S03': 'Caution',
  'S04': 'Crédit',
  'S05': 'Bwakisa Carte',
  'S06': 'Amendes'
};

// Service display names
const SERVICE_NAMES: Record<string, string> = {
  'BOMBE': 'Crédit BOMBÉ',
  'TELEMA': 'Crédit TELEMA',
  'MOPAO': 'Crédit MOPAO',
  'VIMBISA': 'Crédit VIMBISA',
  'LIKELEMBA': 'Crédit LIKÉLEMBA'
};

export class EligibilityEngine {
  
  /**
   * Evaluate eligibility for a specific customer and target
   */
  async evaluateEligibility(
    customerId: number, 
    targetType: 'ACCOUNT' | 'SERVICE', 
    targetCode: string,
    triggerEvent: string = 'MANUAL'
  ): Promise<EligibilityResult> {
    
    // Get customer data
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer.length) {
      throw new Error(`Customer ${customerId} not found`);
    }
    
    // Get customer's accounts
    const customerAccounts = await db.select().from(accounts).where(eq(accounts.customerId, customerId));
    
    // Get conditions based on target type
    let conditions: any[];
    if (targetType === 'ACCOUNT') {
      conditions = await db.select()
        .from(accountTypeConditions)
        .where(and(
          eq(accountTypeConditions.accountTypeCode, targetCode),
          eq(accountTypeConditions.isActive, true)
        ))
        .orderBy(accountTypeConditions.displayOrder);
    } else {
      conditions = await db.select()
        .from(serviceConditions)
        .where(and(
          eq(serviceConditions.serviceCode, targetCode),
          eq(serviceConditions.isActive, true)
        ))
        .orderBy(serviceConditions.displayOrder);
    }
    
    // Evaluate each condition
    const conditionsMet: ConditionResult[] = [];
    const conditionsMissing: ConditionResult[] = [];
    let totalWeight = 0;
    let earnedWeight = 0;
    
    for (const condition of conditions) {
      const isMandatory = targetType === 'SERVICE' ? condition.isMandatory : true;
      const weight = condition.weight || 10;
      
      if (isMandatory) {
        totalWeight += weight;
      }
      
      const result = await this.evaluateCondition(
        condition,
        customer[0],
        customerAccounts,
        targetCode
      );
      
      if (result.met) {
        earnedWeight += weight;
        conditionsMet.push(result);
      } else {
        conditionsMissing.push(result);
      }
    }
    
    // Calculate scores
    const eligibilityScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
    const progressPercentage = eligibilityScore;
    const isEligible = conditionsMissing.filter(c => c.weight > 0).length === 0;
    
    // Estimate days to eligibility
    let estimatedDaysToEligibility: number | null = null;
    if (!isEligible) {
      const maxDays = Math.max(
        ...conditionsMissing.map(c => c.daysRemaining || 0),
        0
      );
      estimatedDaysToEligibility = maxDays > 0 ? maxDays : null;
    }
    
    const result: EligibilityResult = {
      customerId,
      targetType,
      targetCode,
      isEligible,
      eligibilityScore,
      progressPercentage,
      conditionsMet,
      conditionsMissing,
      estimatedDaysToEligibility
    };
    
    // Update customer_eligibility_status
    await this.updateEligibilityStatus(result, triggerEvent);
    
    return result;
  }
  
  /**
   * Evaluate a single condition
   */
  private async evaluateCondition(
    condition: any,
    customer: any,
    customerAccounts: any[],
    targetCode: string
  ): Promise<ConditionResult> {
    const key = condition.conditionKey;
    const requiredValue = condition.requiredValue as any;
    let currentValue: any = null;
    let met = false;
    let daysRemaining: number | undefined;
    
    // Get S02 account for common checks
    const s02Account = customerAccounts.find(a => 
      a.accountType === 'S02_MANDATORY_SAVINGS' || 
      a.accountTypeCode === 'S02'
    );
    
    // Evaluate based on condition key
    switch (key) {
      case 's02_min_balance':
        if (s02Account) {
          const balance = parseFloat(s02Account.balanceUsd || '0');
          currentValue = balance;
          // For percentage-based requirements, we need the requested amount
          // For now, use a fixed check
          const required = typeof requiredValue === 'object' ? requiredValue.value || 25 : requiredValue;
          met = balance >= required;
        }
        break;
        
      case 'deposit_days':
        // Count consecutive deposit days in S02
        if (s02Account) {
          const days = await this.countConsecutiveDepositDays(customer.id, s02Account.id);
          currentValue = days;
          const required = typeof requiredValue === 'object' ? requiredValue.days || 26 : requiredValue;
          met = days >= required;
          if (!met) {
            daysRemaining = required - days;
          }
        }
        break;
        
      case 'no_default':
        // Check for defaults in last 6 months
        const defaults = await this.countDefaults(customer.id, 6);
        currentValue = defaults;
        met = defaults === 0;
        break;
        
      case 'not_in_prison':
        // Check virtual prison status
        currentValue = false; // TODO: Implement virtual prison check
        met = true;
        break;
        
      case 'kyc_level':
        currentValue = customer.kycStatus;
        if (typeof requiredValue === 'object' && requiredValue.values) {
          met = requiredValue.values.includes(customer.kycStatus);
        } else {
          met = customer.kycStatus === 'KYC1_COMPLETED' || 
                customer.kycStatus === 'KYC2_VERIFIED' ||
                customer.kycStatus === 'KYC2_UNDER_REVIEW';
        }
        break;
        
      case 'credit_score':
        // Get credit score from customer_credit_eligibility
        const score = await this.getCreditScore(customer.id);
        currentValue = score;
        const requiredScore = typeof requiredValue === 'object' ? requiredValue.score || 70 : 70;
        met = score >= requiredScore;
        break;
        
      case 's02_history':
        // Check S02 deposit history in months
        if (s02Account) {
          const months = await this.getDepositHistoryMonths(customer.id, s02Account.id);
          currentValue = months;
          const required = typeof requiredValue === 'object' ? requiredValue.months || 3 : 3;
          met = months >= required;
        }
        break;
        
      case 'first_deposit':
        // Check if any deposit was made
        currentValue = customer.firstDepositDate !== null;
        met = customer.firstDepositDate !== null;
        break;
        
      case 'auto_on_registration':
        // S01 is always active on registration
        met = true;
        currentValue = true;
        break;
        
      default:
        // For unimplemented conditions, mark as met if not mandatory
        met = condition.conditionType === 'FEES' || 
              condition.conditionType === 'DURATION' || 
              condition.conditionType === 'AMOUNT_RANGE' ||
              condition.conditionType === 'INTEREST';
        currentValue = met ? 'N/A' : null;
    }
    
    return {
      conditionId: condition.id,
      key,
      label: condition.conditionLabel,
      met,
      currentValue,
      requiredValue,
      weight: condition.weight || 10,
      daysRemaining
    };
  }
  
  /**
   * Count consecutive deposit days for a customer account
   */
  private async countConsecutiveDepositDays(customerId: number, accountId: number): Promise<number> {
    try {
      // Get deposits in last 30 days, ordered by date
      const result = await db.execute(sql`
        SELECT DATE(created_at) as deposit_date
        FROM transactions
        WHERE account_id = ${accountId}
          AND transaction_type = 'DEPOSIT'
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY deposit_date DESC
      `);
      
      const rows = (result as any).rows || [];
      if (rows.length === 0) return 0;
      
      // Count consecutive days from today
      let consecutiveDays = 0;
      let expectedDate = new Date();
      expectedDate.setHours(0, 0, 0, 0);
      
      for (const row of rows) {
        const depositDate = new Date(row.deposit_date);
        depositDate.setHours(0, 0, 0, 0);
        
        const diffDays = Math.round((expectedDate.getTime() - depositDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 1) {
          consecutiveDays++;
          expectedDate = depositDate;
          expectedDate.setDate(expectedDate.getDate() - 1);
        } else {
          break;
        }
      }
      
      return consecutiveDays;
    } catch (error) {
      console.error('[EligibilityEngine] Error counting deposit days:', error);
      return 0;
    }
  }
  
  /**
   * Count payment defaults in last N months
   */
  private async countDefaults(customerId: number, months: number): Promise<number> {
    try {
      const result = await db.execute(sql`
        SELECT COUNT(*) as default_count
        FROM credits
        WHERE customer_id = ${customerId}
          AND credit_status = 'DEFAULTED'
          AND created_at >= NOW() - INTERVAL '${sql.raw(months.toString())} months'
      `);
      
      const rows = (result as any).rows || [];
      return parseInt(rows[0]?.default_count || '0', 10);
    } catch (error) {
      console.error('[EligibilityEngine] Error counting defaults:', error);
      return 0;
    }
  }
  
  /**
   * Get customer's credit score
   */
  private async getCreditScore(customerId: number): Promise<number> {
    try {
      const result = await db.execute(sql`
        SELECT credit_score
        FROM customer_credit_eligibility
        WHERE customer_id = ${customerId}
        LIMIT 1
      `);
      
      const rows = (result as any).rows || [];
      return parseInt(rows[0]?.credit_score || '50', 10);
    } catch (error) {
      // Default score for new customers
      return 50;
    }
  }
  
  /**
   * Get deposit history months
   */
  private async getDepositHistoryMonths(customerId: number, accountId: number): Promise<number> {
    try {
      const result = await db.execute(sql`
        SELECT MIN(created_at) as first_deposit
        FROM transactions
        WHERE account_id = ${accountId}
          AND transaction_type = 'DEPOSIT'
      `);
      
      const rows = (result as any).rows || [];
      if (!rows[0]?.first_deposit) return 0;
      
      const firstDeposit = new Date(rows[0].first_deposit);
      const now = new Date();
      const months = (now.getFullYear() - firstDeposit.getFullYear()) * 12 + 
                     (now.getMonth() - firstDeposit.getMonth());
      
      return Math.max(0, months);
    } catch (error) {
      console.error('[EligibilityEngine] Error getting deposit history:', error);
      return 0;
    }
  }
  
  /**
   * Update customer_eligibility_status table
   */
  private async updateEligibilityStatus(result: EligibilityResult, triggerEvent: string): Promise<void> {
    try {
      // Check if record exists
      const existing = await db.select()
        .from(customerEligibilityStatus)
        .where(and(
          eq(customerEligibilityStatus.customerId, result.customerId),
          eq(customerEligibilityStatus.targetType, result.targetType),
          eq(customerEligibilityStatus.targetCode, result.targetCode)
        ))
        .limit(1);
      
      const previousEligibility = existing.length > 0 ? existing[0].isEligible : null;
      const previousScore = existing.length > 0 ? parseFloat(existing[0].eligibilityScore.toString()) : null;
      
      const now = new Date().toISOString();
      
      if (existing.length > 0) {
        // Update existing record
        await db.update(customerEligibilityStatus)
          .set({
            isEligible: result.isEligible,
            eligibilityScore: result.eligibilityScore.toString(),
            progressPercentage: result.progressPercentage.toString(),
            conditionsMet: result.conditionsMet as any,
            conditionsMissing: result.conditionsMissing as any,
            estimatedDaysToEligibility: result.estimatedDaysToEligibility,
            lastEvaluatedAt: now,
            eligibleSince: result.isEligible && !previousEligibility ? now : existing[0].eligibleSince,
            updatedAt: now
          })
          .where(eq(customerEligibilityStatus.id, existing[0].id));
      } else {
        // Insert new record
        await db.insert(customerEligibilityStatus).values({
          customerId: result.customerId,
          targetType: result.targetType,
          targetCode: result.targetCode,
          isEligible: result.isEligible,
          isActivated: false,
          eligibilityScore: result.eligibilityScore.toString(),
          progressPercentage: result.progressPercentage.toString(),
          conditionsMet: result.conditionsMet as any,
          conditionsMissing: result.conditionsMissing as any,
          estimatedDaysToEligibility: result.estimatedDaysToEligibility,
          lastEvaluatedAt: now,
          eligibleSince: result.isEligible ? now : null,
          autoActivateWhenEligible: true
        });
      }
      
      // Log the evaluation
      await db.insert(eligibilityEvaluationLogs).values({
        customerId: result.customerId,
        targetType: result.targetType,
        targetCode: result.targetCode,
        previousEligibility,
        newEligibility: result.isEligible,
        previousScore: previousScore?.toString() || null,
        newScore: result.eligibilityScore.toString(),
        conditionsEvaluated: {
          met: result.conditionsMet,
          missing: result.conditionsMissing
        } as any,
        triggerEvent,
        actionTaken: result.isEligible && !previousEligibility ? 'NOTIFIED' : 'NONE'
      });
      
      // Generate notifications if eligibility changed
      if (result.isEligible && !previousEligibility) {
        await this.createCelebrationNotification(result);
      } else if (!result.isEligible && result.progressPercentage >= 50) {
        await this.createProgressNotification(result);
      }
      
    } catch (error) {
      console.error('[EligibilityEngine] Error updating eligibility status:', error);
    }
  }
  
  /**
   * Create celebration notification when user becomes eligible
   */
  private async createCelebrationNotification(result: EligibilityResult): Promise<void> {
    try {
      const targetName = result.targetType === 'ACCOUNT' 
        ? ACCOUNT_NAMES[result.targetCode] || result.targetCode
        : SERVICE_NAMES[result.targetCode] || result.targetCode;
      
      await db.insert(customerNotifications).values({
        customerId: result.customerId,
        notificationType: 'CELEBRATION',
        priority: 'HIGH',
        title: 'Félicitations!',
        message: `Votre ${result.targetType === 'ACCOUNT' ? 'compte' : 'service'} ${targetName} est maintenant débloqué! Vous remplissez toutes les conditions d'éligibilité.`,
        actionLabel: 'Découvrir',
        actionUrl: result.targetType === 'ACCOUNT' 
          ? `/dashboard/accounts/${result.targetCode}`
          : `/dashboard/credit/${result.targetCode.toLowerCase()}`,
        icon: 'trophy',
        targetType: result.targetType,
        targetCode: result.targetCode,
        displayDurationSeconds: 300, // 5 minutes
        isRepeatable: false,
        metadata: {
          eligibilityScore: result.eligibilityScore,
          conditionsMet: result.conditionsMet.length
        } as any
      });
    } catch (error) {
      console.error('[EligibilityEngine] Error creating celebration notification:', error);
    }
  }
  
  /**
   * Create progress notification when user is making progress
   */
  private async createProgressNotification(result: EligibilityResult): Promise<void> {
    try {
      const targetName = result.targetType === 'ACCOUNT' 
        ? ACCOUNT_NAMES[result.targetCode] || result.targetCode
        : SERVICE_NAMES[result.targetCode] || result.targetCode;
      
      const daysText = result.estimatedDaysToEligibility 
        ? `Plus que ${result.estimatedDaysToEligibility} jours!`
        : 'Continuez vos efforts!';
      
      await db.insert(customerNotifications).values({
        customerId: result.customerId,
        notificationType: 'PROGRESS',
        priority: 'MEDIUM',
        title: 'Progression en cours',
        message: `Vous êtes à ${result.progressPercentage}% pour débloquer ${targetName}. ${daysText}`,
        actionLabel: 'Voir les conditions',
        actionUrl: result.targetType === 'ACCOUNT' 
          ? `/dashboard/accounts/${result.targetCode}`
          : `/dashboard/credit/${result.targetCode.toLowerCase()}`,
        icon: 'trending-up',
        targetType: result.targetType,
        targetCode: result.targetCode,
        displayDurationSeconds: 240, // 4 minutes
        isRepeatable: true,
        repeatIntervalHours: 24, // Once per day
        metadata: {
          progressPercentage: result.progressPercentage,
          estimatedDays: result.estimatedDaysToEligibility,
          conditionsMissing: result.conditionsMissing.map(c => c.label)
        } as any
      });
    } catch (error) {
      console.error('[EligibilityEngine] Error creating progress notification:', error);
    }
  }
  
  /**
   * Evaluate all targets for a customer
   */
  async evaluateAllForCustomer(customerId: number, triggerEvent: string = 'MANUAL'): Promise<EligibilityResult[]> {
    const results: EligibilityResult[] = [];
    
    // Evaluate all accounts
    for (const code of ['S01', 'S02', 'S03', 'S04', 'S05', 'S06']) {
      try {
        const result = await this.evaluateEligibility(customerId, 'ACCOUNT', code, triggerEvent);
        results.push(result);
      } catch (error) {
        console.error(`[EligibilityEngine] Error evaluating account ${code}:`, error);
      }
    }
    
    // Evaluate all services
    for (const code of ['BOMBE', 'TELEMA', 'MOPAO', 'VIMBISA', 'LIKELEMBA']) {
      try {
        const result = await this.evaluateEligibility(customerId, 'SERVICE', code, triggerEvent);
        results.push(result);
      } catch (error) {
        console.error(`[EligibilityEngine] Error evaluating service ${code}:`, error);
      }
    }
    
    return results;
  }
  
  /**
   * Get eligibility status for a customer
   */
  async getCustomerEligibilityStatus(customerId: number): Promise<any[]> {
    try {
      const status = await db.select()
        .from(customerEligibilityStatus)
        .where(eq(customerEligibilityStatus.customerId, customerId))
        .orderBy(
          customerEligibilityStatus.targetType,
          customerEligibilityStatus.targetCode
        );
      
      return status;
    } catch (error) {
      console.error('[EligibilityEngine] Error getting eligibility status:', error);
      return [];
    }
  }
  
  /**
   * Get unread notifications for a customer
   */
  async getCustomerNotifications(customerId: number, limit: number = 10): Promise<any[]> {
    try {
      const notifications = await db.select()
        .from(customerNotifications)
        .where(and(
          eq(customerNotifications.customerId, customerId),
          eq(customerNotifications.isDismissed, false)
        ))
        .orderBy(desc(customerNotifications.createdAt))
        .limit(limit);
      
      return notifications;
    } catch (error) {
      console.error('[EligibilityEngine] Error getting notifications:', error);
      return [];
    }
  }
  
  /**
   * Mark notification as read
   */
  async markNotificationRead(notificationId: number): Promise<void> {
    try {
      await db.update(customerNotifications)
        .set({
          isRead: true,
          readAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .where(eq(customerNotifications.id, notificationId));
    } catch (error) {
      console.error('[EligibilityEngine] Error marking notification read:', error);
    }
  }
  
  /**
   * Dismiss notification
   */
  async dismissNotification(notificationId: number): Promise<void> {
    try {
      await db.update(customerNotifications)
        .set({
          isDismissed: true,
          dismissedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .where(eq(customerNotifications.id, notificationId));
    } catch (error) {
      console.error('[EligibilityEngine] Error dismissing notification:', error);
    }
  }
}

// Export singleton instance
export const eligibilityEngine = new EligibilityEngine();
