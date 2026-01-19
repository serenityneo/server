/**
 * CUSTOMER CREDIT ELIGIBILITY SERVICE
 * 
 * Manages whitelist/blacklist status and credit scoring:
 * - Automatic credit score calculation
 * - Blacklist/whitelist management
 * - Credit limit enforcement
 * - Repayment tracking
 */

import { db } from '../../../../db';
import { 
  customerCreditEligibility,
  creditRequests,
  creditRepayments,
  customers
} from '../../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface EligibilityCheckResult {
  isEligible: boolean;
  eligibilityStatus: 'WHITELISTED' | 'BLACKLISTED' | 'NEUTRAL';
  creditScore: number;
  maxCreditLimit: number;
  currentCreditUsed: number;
  availableCredit: number;
  reason?: string;
}

export class CreditEligibilityService {
  /**
   * Get or create eligibility record for customer
   */
  static async getOrCreateEligibility(customerId: number) {
    const [existing] = await db
      .select()
      .from(customerCreditEligibility)
      .where(eq(customerCreditEligibility.customerId, customerId));

    if (existing) {
      return existing;
    }

    // Create new eligibility record with default values
    const [eligibility] = await db
      .insert(customerCreditEligibility)
      .values({
        customerId,
        eligibilityStatus: 'NEUTRAL',
        creditScore: 50, // Start with neutral score
        maxCreditLimit: '1000', // Default $1000 USD or CDF equivalent
        currentCreditUsed: '0',
        totalLoansCompleted: 0,
        totalLoansDefaulted: 0,
        onTimeRepaymentRate: '0',
      })
      .returning();

    return eligibility;
  }

  /**
   * Check if customer is eligible for credit
   */
  static async checkEligibility(customerId: number, requestedAmount: number): Promise<EligibilityCheckResult> {
    const eligibility = await this.getOrCreateEligibility(customerId);

    const maxCreditLimit = parseFloat(eligibility.maxCreditLimit);
    const currentCreditUsed = parseFloat(eligibility.currentCreditUsed);
    const availableCredit = maxCreditLimit - currentCreditUsed;

    // Check blacklist
    if (eligibility.eligibilityStatus === 'BLACKLISTED') {
      return {
        isEligible: false,
        eligibilityStatus: 'BLACKLISTED',
        creditScore: eligibility.creditScore,
        maxCreditLimit,
        currentCreditUsed,
        availableCredit: 0,
        reason: eligibility.blacklistReason || 'Customer is blacklisted',
      };
    }

    // Check if requested amount exceeds available credit
    if (requestedAmount > availableCredit) {
      return {
        isEligible: false,
        eligibilityStatus: eligibility.eligibilityStatus as any,
        creditScore: eligibility.creditScore,
        maxCreditLimit,
        currentCreditUsed,
        availableCredit,
        reason: `Requested amount ($${requestedAmount}) exceeds available credit ($${availableCredit})`,
      };
    }

    // Check credit score (minimum 30)
    if (eligibility.creditScore < 30) {
      return {
        isEligible: false,
        eligibilityStatus: eligibility.eligibilityStatus as any,
        creditScore: eligibility.creditScore,
        maxCreditLimit,
        currentCreditUsed,
        availableCredit,
        reason: `Credit score too low (${eligibility.creditScore}/100). Minimum required: 30`,
      };
    }

    return {
      isEligible: true,
      eligibilityStatus: eligibility.eligibilityStatus as any,
      creditScore: eligibility.creditScore,
      maxCreditLimit,
      currentCreditUsed,
      availableCredit,
    };
  }

  /**
   * Blacklist a customer
   */
  static async blacklistCustomer(customerId: number, reason: string, blacklistedBy: number) {
    await db
      .update(customerCreditEligibility)
      .set({
        eligibilityStatus: 'BLACKLISTED',
        blacklistReason: reason,
        blacklistedAt: sql`CURRENT_TIMESTAMP`,
        blacklistedBy,
        creditScore: 0, // Set score to 0 when blacklisted
        lastReviewDate: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(customerCreditEligibility.customerId, customerId));

    return { success: true, message: 'Customer blacklisted successfully' };
  }

  /**
   * Whitelist a customer
   */
  static async whitelistCustomer(customerId: number, reason: string, whitelistedBy: number, newCreditLimit?: number) {
    const updateData: any = {
      eligibilityStatus: 'WHITELISTED',
      whitelistReason: reason,
      whitelistedAt: sql`CURRENT_TIMESTAMP`,
      whitelistedBy,
      blacklistReason: null,
      blacklistedAt: null,
      lastReviewDate: sql`CURRENT_TIMESTAMP`,
    };

    if (newCreditLimit) {
      updateData.maxCreditLimit = newCreditLimit.toString();
    }

    await db
      .update(customerCreditEligibility)
      .set(updateData)
      .where(eq(customerCreditEligibility.customerId, customerId));

    return { success: true, message: 'Customer whitelisted successfully' };
  }

  /**
   * Remove from blacklist/whitelist (set to NEUTRAL)
   */
  static async resetEligibilityStatus(customerId: number) {
    // Recalculate credit score based on history
    const newScore = await this.calculateCreditScore(customerId);

    await db
      .update(customerCreditEligibility)
      .set({
        eligibilityStatus: 'NEUTRAL',
        blacklistReason: null,
        blacklistedAt: null,
        whitelistReason: null,
        whitelistedAt: null,
        creditScore: newScore,
        lastReviewDate: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(customerCreditEligibility.customerId, customerId));

    return { success: true, creditScore: newScore };
  }

  /**
   * Update credit usage (called when credit is approved/repaid)
   */
  static async updateCreditUsage(customerId: number, amountChange: number) {
    await db.execute(sql`
      UPDATE ${customerCreditEligibility}
      SET current_credit_used = GREATEST(0, current_credit_used + ${amountChange})
      WHERE customer_id = ${customerId}
    `);
  }

  /**
   * Calculate credit score based on repayment history
   * Score: 0-100
   */
  static async calculateCreditScore(customerId: number): Promise<number> {
    // Get all credit requests for customer
    const requests = await db
      .select()
      .from(creditRequests)
      .where(eq(creditRequests.customerId, customerId));

    if (requests.length === 0) {
      return 50; // Default score for new customers
    }

    let totalRequests = requests.length;
    let completedLoans = 0;
    let onTimePayments = 0;
    let latePayments = 0;
    let defaultedLoans = 0;

    for (const request of requests) {
      if (request.repaymentStatus === 'PAID') {
        completedLoans++;
        
        // Check if paid on time
        if (request.dueDate) {
          const repayments = await db
            .select()
            .from(creditRepayments)
            .where(eq(creditRepayments.creditRequestId, request.id));

          const lastRepayment = repayments[repayments.length - 1];
          if (lastRepayment && lastRepayment.repaidAt) {
            const dueDate = new Date(request.dueDate);
            const repaidDate = new Date(lastRepayment.repaidAt);
            
            if (repaidDate <= dueDate) {
              onTimePayments++;
            } else {
              latePayments++;
            }
          }
        }
      } else if (request.dueDate && new Date() > new Date(request.dueDate) && request.repaymentStatus !== 'PAID') {
        defaultedLoans++;
      }
    }

    // Calculate score
    let score = 50; // Base score

    // Completed loans bonus (+30 max)
    score += Math.min(30, (completedLoans / totalRequests) * 30);

    // On-time payment bonus (+20 max)
    if (completedLoans > 0) {
      score += (onTimePayments / completedLoans) * 20;
    }

    // Penalties
    // Late payment penalty (-10 per late payment, max -30)
    score -= Math.min(30, latePayments * 10);

    // Default penalty (-50 per default)
    score -= defaultedLoans * 50;

    // Ensure score is between 0-100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Update credit statistics after loan completion/default
   */
  static async updateCreditStatistics(customerId: number) {
    const newScore = await this.calculateCreditScore(customerId);

    // Get loan statistics
    const requests = await db
      .select()
      .from(creditRequests)
      .where(eq(creditRequests.customerId, customerId));

    const completed = requests.filter(r => r.repaymentStatus === 'PAID').length;
    const defaulted = requests.filter(r => 
      r.dueDate && new Date() > new Date(r.dueDate) && r.repaymentStatus !== 'PAID'
    ).length;

    // Calculate on-time repayment rate
    let onTimeCount = 0;
    for (const request of requests) {
      if (request.repaymentStatus === 'PAID' && request.dueDate) {
        const repayments = await db
          .select()
          .from(creditRepayments)
          .where(eq(creditRepayments.creditRequestId, request.id));

        const lastRepayment = repayments[repayments.length - 1];
        if (lastRepayment && lastRepayment.repaidAt) {
          const dueDate = new Date(request.dueDate);
          const repaidDate = new Date(lastRepayment.repaidAt);
          if (repaidDate <= dueDate) {
            onTimeCount++;
          }
        }
      }
    }

    const onTimeRate = completed > 0 ? (onTimeCount / completed) * 100 : 0;

    // Auto-adjust credit limit based on score
    let newLimit = 1000; // Default
    if (newScore >= 80) {
      newLimit = 5000; // Excellent
    } else if (newScore >= 60) {
      newLimit = 3000; // Good
    } else if (newScore >= 40) {
      newLimit = 1500; // Fair
    }

    await db
      .update(customerCreditEligibility)
      .set({
        creditScore: newScore,
        totalLoansCompleted: completed,
        totalLoansDefaulted: defaulted,
        onTimeRepaymentRate: onTimeRate.toFixed(2),
        maxCreditLimit: newLimit.toString(),
        lastReviewDate: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(customerCreditEligibility.customerId, customerId));

    return {
      creditScore: newScore,
      totalLoansCompleted: completed,
      totalLoansDefaulted: defaulted,
      onTimeRepaymentRate: onTimeRate,
      maxCreditLimit: newLimit,
    };
  }

  /**
   * Get customer eligibility details
   */
  static async getCustomerEligibility(customerId: number) {
    const eligibility = await this.getOrCreateEligibility(customerId);

    // Also get current outstanding credits
    const outstanding = await db
      .select()
      .from(creditRequests)
      .where(
        and(
          eq(creditRequests.customerId, customerId),
          eq(creditRequests.status, 'APPROVED')
        )
      );

    const totalOutstanding = outstanding.reduce((sum, req) => {
      const approved = parseFloat(req.amountApproved || req.amountRequested);
      const repaid = parseFloat(req.amountRepaid);
      return sum + (approved - repaid);
    }, 0);

    return {
      ...eligibility,
      totalOutstandingDebt: totalOutstanding,
      activeLoans: outstanding.length,
    };
  }
}
