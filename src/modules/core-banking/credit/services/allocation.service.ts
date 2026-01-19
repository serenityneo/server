/**
 * S04 ALLOCATION SERVICE
 * 
 * Manages S04 credit allocation buffer system:
 * - Automatic allocation creation when credit is approved
 * - Commission calculation and available balance
 * - Debt vs balance management
 * - Automatic distribution of repayments
 */

import { db } from '../../../../db';
import { 
  s04Allocations, 
  creditRequests,
  creditRepayments,
  accounts
} from '../../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { loyaltyPointsService } from '../../../loyalty/loyalty-points.service';

export interface CreateAllocationParams {
  customerId: number;
  s04AccountId: number;
  currency: 'CDF' | 'USD';
  commissionRate?: number; // Default 10% (0.10)
}

export interface CreditRequestParams {
  customerId: number;
  s04AccountId: number;
  allocationId: number;
  amountRequested: number;
  currency: 'CDF' | 'USD';
}

export interface RepaymentParams {
  creditRequestId: number;
  customerId: number;
  allocationId: number;
  amount: number;
  currency: 'CDF' | 'USD';
  paymentMethod?: string;
  sourceAccountId?: number;
  notes?: string;
}

export class AllocationService {
  /**
   * Get or create allocation for S04 account
   */
  static async getOrCreateAllocation(params: CreateAllocationParams) {
    const { customerId, s04AccountId, currency, commissionRate = 0.10 } = params;

    // Check if allocation already exists
    const [existing] = await db
      .select()
      .from(s04Allocations)
      .where(
        and(
          eq(s04Allocations.customerId, customerId),
          eq(s04Allocations.s04AccountId, s04AccountId),
          eq(s04Allocations.currency, currency)
        )
      );

    if (existing) {
      return existing;
    }

    // Create new allocation
    const [allocation] = await db
      .insert(s04Allocations)
      .values({
        customerId,
        s04AccountId,
        currency,
        commissionRate: commissionRate.toString(),
        totalAllocated: '0',
        totalDebt: '0',
        availableBalance: '0',
        commissionCollected: '0',
      })
      .returning();

    return allocation;
  }

  /**
   * Create credit request
   * 
   * Example: Request $100
   * - Commission 10%: $10 → stays in allocation
   * - Available in S04: $90
   * - Total debt: $100
   */
  static async createCreditRequest(params: CreditRequestParams) {
    const { customerId, s04AccountId, allocationId, amountRequested, currency } = params;

    return await db.transaction(async (tx) => {
      // 1. Get allocation
      const [allocation] = await tx
        .select()
        .from(s04Allocations)
        .where(eq(s04Allocations.id, allocationId));

      if (!allocation) {
        throw new Error('Allocation not found');
      }

      // 2. Calculate commission
      const commissionRate = parseFloat(allocation.commissionRate);
      const commissionAmount = amountRequested * commissionRate;
      const netAmount = amountRequested - commissionAmount;

      // 3. Generate unique request number
      const requestNumber = `CR-${Date.now()}-${customerId}`;

      // 4. Create credit request
      const [creditRequest] = await tx
        .insert(creditRequests)
        .values({
          customerId,
          s04AccountId,
          allocationId,
          requestNumber,
          amountRequested: amountRequested.toString(),
          commissionAmount: commissionAmount.toString(),
          netAmount: netAmount.toString(),
          currency,
          status: 'PENDING',
          repaymentStatus: 'UNPAID',
          amountRepaid: '0',
        })
        .returning();

      return {
        creditRequest,
        calculation: {
          requested: amountRequested,
          commission: commissionAmount,
          net: netAmount,
          currency,
        }
      };
    });
  }

  /**
   * Approve credit request and disburse to S04
   */
  static async approveCreditRequest(creditRequestId: number, approvedBy: number, dueDate: Date) {
    return await db.transaction(async (tx) => {
      // 1. Get credit request
      const [request] = await tx
        .select()
        .from(creditRequests)
        .where(eq(creditRequests.id, creditRequestId));

      if (!request) {
        throw new Error('Credit request not found');
      }

      if (request.status !== 'PENDING') {
        throw new Error(`Cannot approve request with status: ${request.status}`);
      }

      const amountApproved = parseFloat(request.amountRequested);
      const commissionAmount = parseFloat(request.commissionAmount);
      const netAmount = parseFloat(request.netAmount!);

      // 2. Update credit request
      await tx
        .update(creditRequests)
        .set({
          status: 'APPROVED',
          amountApproved: amountApproved.toString(),
          approvedAt: sql`CURRENT_TIMESTAMP`,
          approvedBy,
          disbursedAt: sql`CURRENT_TIMESTAMP`,
          dueDate: dueDate.toISOString(),
        })
        .where(eq(creditRequests.id, creditRequestId));

      // 3. Update allocation
      await tx.execute(sql`
        UPDATE ${s04Allocations}
        SET 
          total_allocated = total_allocated + ${commissionAmount},
          total_debt = total_debt + ${amountApproved},
          commission_collected = commission_collected + ${commissionAmount},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${request.allocationId}
      `);

      // 4. Update S04 account balance (add net amount - S04 operations are FREE)
      await tx.execute(sql`
        UPDATE ${accounts}
        SET 
          balance_cdf = balance_cdf + ${request.currency === 'CDF' ? netAmount : 0},
          balance_usd = balance_usd + ${request.currency === 'USD' ? netAmount : 0},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${request.s04AccountId}
      `);

      return {
        success: true,
        creditRequestId,
        amountDisbursed: netAmount,
        commissionCollected: commissionAmount,
      };
    });
  }

  /**
   * Process repayment
   * 
   * Logic:
   * 1. While debt > 0 → Money goes to allocation (reduces debt)
   * 2. If repayment >= debt → Surplus goes to S04 balance
   * 3. Auto-update debt and balance
   */
  static async processRepayment(params: RepaymentParams) {
    const {
      creditRequestId,
      customerId,
      allocationId,
      amount,
      currency,
      paymentMethod,
      sourceAccountId,
      notes
    } = params;

    return await db.transaction(async (tx) => {
      // 1. Get credit request
      const [request] = await tx
        .select()
        .from(creditRequests)
        .where(eq(creditRequests.id, creditRequestId));

      if (!request) {
        throw new Error('Credit request not found');
      }

      // 2. Get allocation
      const [allocation] = await tx
        .select()
        .from(s04Allocations)
        .where(eq(s04Allocations.id, allocationId));

      if (!allocation) {
        throw new Error('Allocation not found');
      }

      const amountApproved = parseFloat(request.amountApproved || request.amountRequested);
      const amountRepaid = parseFloat(request.amountRepaid);
      const remainingDebt = amountApproved - amountRepaid;

      // 3. Calculate distribution
      let amountToDebt = 0;
      let amountToBalance = 0;

      if (amount <= remainingDebt) {
        // Repayment <= Debt → All goes to reduce debt
        amountToDebt = amount;
        amountToBalance = 0;
      } else {
        // Repayment > Debt → Debt to 0, surplus to S04 balance
        amountToDebt = remainingDebt;
        amountToBalance = amount - remainingDebt;
      }

      const newAmountRepaid = amountRepaid + amount;
      const newRemainingDebt = amountApproved - newAmountRepaid;

      // 4. Record repayment
      const [repayment] = await tx
        .insert(creditRepayments)
        .values({
          creditRequestId,
          customerId,
          allocationId,
          amount: amount.toString(),
          currency,
          paymentMethod,
          sourceAccountId,
          notes,
        })
        .returning();

      // 5. Update credit request
      const updateData: any = {
        amountRepaid: newAmountRepaid.toString(),
      };

      if (newRemainingDebt <= 0) {
        updateData.repaymentStatus = 'PAID';
      } else if (amountRepaid > 0) {
        updateData.repaymentStatus = 'PARTIAL';
      }

      await tx
        .update(creditRequests)
        .set(updateData)
        .where(eq(creditRequests.id, creditRequestId));

      // 6. Update allocation (reduce debt)
      await tx.execute(sql`
        UPDATE ${s04Allocations}
        SET 
          total_debt = GREATEST(0, total_debt - ${amountToDebt}),
          available_balance = available_balance + ${amountToBalance},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${allocationId}
      `);

      // 7. If surplus, add to S04 account balance (FREE operation)
      if (amountToBalance > 0) {
        await tx.execute(sql`
          UPDATE ${accounts}
          SET 
            balance_cdf = balance_cdf + ${currency === 'CDF' ? amountToBalance : 0},
            balance_usd = balance_usd + ${currency === 'USD' ? amountToBalance : 0},
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${request.s04AccountId}
        `);
      }

      // 8. AWARD REPAYMENT POINT (after transaction completes)
      try {
        await loyaltyPointsService.awardPoints({
          customerId,
          pointTypeCode: 'CREDIT_REPAYMENT',
          operationId: repayment.id,
          metadata: {
            creditRequestId,
            amount,
            currency,
            isFullyRepaid: newRemainingDebt <= 0,
            remainingDebt: newRemainingDebt
          }
        });
        console.log(`🎉 Repayment point awarded to customer ${customerId}`);
      } catch (error) {
        console.error(`⚠️  Failed to award repayment point:`, error);
        // Don't fail the repayment if point award fails
      }

      return {
        repayment,
        summary: {
          repaymentAmount: amount,
          amountToDebt,
          amountToBalance,
          newDebt: newRemainingDebt,
          isFullyRepaid: newRemainingDebt <= 0,
          currency,
        }
      };
    });
  }

  /**
   * Get allocation details
   */
  static async getAllocation(allocationId: number) {
    const [allocation] = await db
      .select()
      .from(s04Allocations)
      .where(eq(s04Allocations.id, allocationId));

    return allocation;
  }

  /**
   * Get customer allocation summary
   */
  static async getCustomerAllocationSummary(customerId: number) {
    const allocations = await db
      .select()
      .from(s04Allocations)
      .where(eq(s04Allocations.customerId, customerId));

    let totalAllocatedCdf = 0;
    let totalAllocatedUsd = 0;
    let totalDebtCdf = 0;
    let totalDebtUsd = 0;
    let availableBalanceCdf = 0;
    let availableBalanceUsd = 0;

    for (const allocation of allocations) {
      if (allocation.currency === 'CDF') {
        totalAllocatedCdf += parseFloat(allocation.totalAllocated);
        totalDebtCdf += parseFloat(allocation.totalDebt);
        availableBalanceCdf += parseFloat(allocation.availableBalance);
      } else {
        totalAllocatedUsd += parseFloat(allocation.totalAllocated);
        totalDebtUsd += parseFloat(allocation.totalDebt);
        availableBalanceUsd += parseFloat(allocation.availableBalance);
      }
    }

    return {
      allocations,
      summary: {
        totalAllocatedCdf,
        totalAllocatedUsd,
        totalDebtCdf,
        totalDebtUsd,
        availableBalanceCdf,
        availableBalanceUsd,
      }
    };
  }

  /**
   * Get repayment history
   */
  static async getRepaymentHistory(allocationId: number) {
    const repayments = await db
      .select()
      .from(creditRepayments)
      .where(eq(creditRepayments.allocationId, allocationId))
      .orderBy(sql`${creditRepayments.repaidAt} DESC`);

    return repayments;
  }
}
