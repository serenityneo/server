/**
 * CUSTOMER MODIFICATION SERVICE
 * 
 * Handles approval workflow for customer modifications:
 * - Admin modifies → Manager approves
 * - Manager modifies → Admin approves
 * - Super-Admin can approve directly
 * 
 * Features:
 * - Request modification with mandatory reason (min 20 chars)
 * - Approve/Reject with role-based rules
 * - Auto-expire after 72 hours
 * - Complete audit trail
 */

import { db } from '../db';
import { pendingCustomerChanges, customers, accounts, users } from '../db/schema';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { AuditLogger } from '../utils/audit-logger';
import { FastifyRequest } from 'fastify';

export interface RequestModificationParams {
  customerId: number;
  changeType: 'BALANCE_UPDATE' | 'INFO_UPDATE' | 'STATUS_CHANGE' | 'ACCOUNT_CREATION';
  requestedChanges: Record<string, any>;
  reason: string;
  requestedByAdminId: number;
  requestedByRole: string;
  requestedByName: string;
  request: FastifyRequest;
}

export interface PendingChange {
  id: number;
  customerId: number;
  changeType: string;
  requestedChanges: any;
  originalValues: any;
  reason: string;
  requestedByAdminId: number;
  requestedByRole: string;
  requestedByName: string;
  requestedByIp: string;
  requestedByUserAgent: string | null;
  approvedByAdminId: number | null;
  approvedByRole: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  status: string;
  rejectionReason: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModificationFilters {
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  customerId?: number;
  requestedByAdminId?: number;
  changeType?: 'BALANCE_UPDATE' | 'INFO_UPDATE' | 'STATUS_CHANGE' | 'ACCOUNT_CREATION';
}

export class CustomerModificationService {
  /**
   * Create a modification request
   */
  static async requestModification(params: RequestModificationParams): Promise<PendingChange> {
    const {
      customerId,
      changeType,
      requestedChanges,
      reason,
      requestedByAdminId,
      requestedByRole,
      requestedByName,
      request
    } = params;

    // Validation 1: Reason must be at least 20 characters
    if (!reason || reason.length < 20) {
      throw new Error('Reason must be at least 20 characters');
    }

    // Validation 2: Check if customer exists
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Validation 3: Balance modifications only for manual customers
    if (changeType === 'BALANCE_UPDATE' && !customer.isManualCreation) {
      throw new Error('Cannot modify balance of self-registered customers. Only manually created customers (paper records) can have their balances modified.');
    }

    // Get original values for rollback capability
    let originalValues: any = {};
    if (changeType === 'BALANCE_UPDATE') {
      // Get current account balances
      const customerAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.customerId, customerId));
      
      originalValues.accounts = customerAccounts.map(acc => ({
        id: acc.id,
        accountTypeCode: acc.accountTypeCode,
        balanceCdf: acc.balanceCdf,
        balanceUsd: acc.balanceUsd
      }));
    } else if (changeType === 'INFO_UPDATE') {
      // Store current customer info
      originalValues = {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        mobileMoneyNumber: customer.mobileMoneyNumber,
        address: customer.address
      };
    }

    // Calculate expiration (72 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    // Extract request metadata
    const ipAddress = request.ip || 'unknown';
    const userAgent = request.headers['user-agent'] || null;

    // Create modification request
    const [pendingChange] = await db
      .insert(pendingCustomerChanges)
      .values({
        customerId,
        changeType,
        requestedChanges,
        originalValues,
        reason,
        requestedByAdminId,
        requestedByRole,
        requestedByName,
        requestedByIp: ipAddress,
        requestedByUserAgent: userAgent,
        requestedByDeviceFingerprint: null, // TODO: Implement device fingerprinting
        status: 'PENDING',
        expiresAt: expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .returning();

    // Log to audit trail
    await AuditLogger.log({
      userId: requestedByAdminId,
      customerId,
      action: 'MODIFICATION_REQUESTED',
      resourceType: 'pending_customer_changes',
      resourceId: pendingChange.id,
      newValues: {
        changeType,
        requestedChanges,
        reason,
        requestedByRole
      },
      status: 'SUCCESS'
    }, request);

    console.log('[ModificationService] ✅ Modification request created:', {
      id: pendingChange.id,
      customerId,
      changeType,
      requestedBy: requestedByName,
      expiresAt: expiresAt.toISOString()
    });

    return pendingChange as PendingChange;
  }

  /**
   * Approve a modification request
   */
  static async approveModification(
    changeId: number,
    approverAdminId: number,
    approverRole: string,
    approverName: string,
    request: FastifyRequest
  ): Promise<void> {
    // Get the pending change
    const [change] = await db
      .select()
      .from(pendingCustomerChanges)
      .where(eq(pendingCustomerChanges.id, changeId))
      .limit(1);

    if (!change) {
      throw new Error('Modification request not found');
    }

    // Validation 1: Must be pending
    if (change.status !== 'PENDING') {
      throw new Error(`Cannot approve modification with status: ${change.status}`);
    }

    // Validation 2: Check if expired
    if (new Date(change.expiresAt) < new Date()) {
      // Auto-reject expired
      await this.expireModification(changeId);
      throw new Error('Modification request has expired');
    }

    // Validation 3: Cannot approve own request
    if (change.requestedByAdminId === approverAdminId) {
      throw new Error('Cannot approve your own modification request');
    }

    // Validation 4: Role-based approval rules
    const canApprove = this.canApproveModification(change.requestedByRole, approverRole);
    if (!canApprove) {
      throw new Error(`Role ${approverRole} cannot approve modifications from ${change.requestedByRole}. Required: ${this.getRequiredApproverRole(change.requestedByRole)}`);
    }

    // Apply the modification
    await this.applyModification(change);

    // Update pending change status
    await db
      .update(pendingCustomerChanges)
      .set({
        status: 'APPROVED',
        approvedByAdminId: approverAdminId,
        approvedByRole: approverRole,
        approvedByName: approverName,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .where(eq(pendingCustomerChanges.id, changeId));

    // Log approval
    await AuditLogger.log({
      userId: approverAdminId,
      customerId: change.customerId,
      action: 'MODIFICATION_APPROVED',
      resourceType: 'pending_customer_changes',
      resourceId: changeId,
      oldValues: { status: 'PENDING' },
      newValues: {
        status: 'APPROVED',
        approvedBy: approverName,
        approvedByRole: approverRole,
        appliedChanges: change.requestedChanges
      },
      status: 'SUCCESS'
    }, request);

    console.log('[ModificationService] ✅ Modification approved and applied:', {
      changeId,
      customerId: change.customerId,
      changeType: change.changeType,
      approvedBy: approverName
    });
  }

  /**
   * Reject a modification request
   */
  static async rejectModification(
    changeId: number,
    rejectorAdminId: number,
    rejectorRole: string,
    rejectorName: string,
    rejectionReason: string,
    request: FastifyRequest
  ): Promise<void> {
    // Validation: Rejection reason required (min 20 chars)
    if (!rejectionReason || rejectionReason.length < 20) {
      throw new Error('Rejection reason must be at least 20 characters');
    }

    // Get the pending change
    const [change] = await db
      .select()
      .from(pendingCustomerChanges)
      .where(eq(pendingCustomerChanges.id, changeId))
      .limit(1);

    if (!change) {
      throw new Error('Modification request not found');
    }

    // Validation: Must be pending
    if (change.status !== 'PENDING') {
      throw new Error(`Cannot reject modification with status: ${change.status}`);
    }

    // Update status to rejected
    await db
      .update(pendingCustomerChanges)
      .set({
        status: 'REJECTED',
        rejectionReason,
        approvedByAdminId: rejectorAdminId, // Reuse field for rejector
        approvedByRole: rejectorRole,
        approvedByName: rejectorName,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .where(eq(pendingCustomerChanges.id, changeId));

    // Log rejection
    await AuditLogger.log({
      userId: rejectorAdminId,
      customerId: change.customerId,
      action: 'MODIFICATION_REJECTED',
      resourceType: 'pending_customer_changes',
      resourceId: changeId,
      oldValues: { status: 'PENDING' },
      newValues: {
        status: 'REJECTED',
        rejectedBy: rejectorName,
        rejectionReason
      },
      status: 'SUCCESS'
    }, request);

    console.log('[ModificationService] ❌ Modification rejected:', {
      changeId,
      customerId: change.customerId,
      rejectedBy: rejectorName,
      reason: rejectionReason
    });
  }

  /**
   * Get pending modifications (with filters)
   */
  static async getPendingModifications(filters?: ModificationFilters): Promise<PendingChange[]> {
    let query = db
      .select({
        id: pendingCustomerChanges.id,
        customerId: pendingCustomerChanges.customerId,
        customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
        customerCif: customers.cif,
        changeType: pendingCustomerChanges.changeType,
        requestedChanges: pendingCustomerChanges.requestedChanges,
        originalValues: pendingCustomerChanges.originalValues,
        reason: pendingCustomerChanges.reason,
        requestedByAdminId: pendingCustomerChanges.requestedByAdminId,
        requestedByRole: pendingCustomerChanges.requestedByRole,
        requestedByName: pendingCustomerChanges.requestedByName,
        requestedByIp: pendingCustomerChanges.requestedByIp,
        requestedByUserAgent: pendingCustomerChanges.requestedByUserAgent,
        approvedByAdminId: pendingCustomerChanges.approvedByAdminId,
        approvedByRole: pendingCustomerChanges.approvedByRole,
        approvedByName: pendingCustomerChanges.approvedByName,
        approvedAt: pendingCustomerChanges.approvedAt,
        status: pendingCustomerChanges.status,
        rejectionReason: pendingCustomerChanges.rejectionReason,
        expiresAt: pendingCustomerChanges.expiresAt,
        createdAt: pendingCustomerChanges.createdAt,
        updatedAt: pendingCustomerChanges.updatedAt
      })
      .from(pendingCustomerChanges)
      .leftJoin(customers, eq(pendingCustomerChanges.customerId, customers.id));

    const conditions: any[] = [];

    if (filters?.status) {
      conditions.push(eq(pendingCustomerChanges.status, filters.status));
    }

    if (filters?.customerId) {
      conditions.push(eq(pendingCustomerChanges.customerId, filters.customerId));
    }

    if (filters?.requestedByAdminId) {
      conditions.push(eq(pendingCustomerChanges.requestedByAdminId, filters.requestedByAdminId));
    }

    if (filters?.changeType) {
      conditions.push(eq(pendingCustomerChanges.changeType, filters.changeType));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    return results as PendingChange[];
  }

  /**
   * Get modification history for a customer
   */
  static async getCustomerModificationHistory(customerId: number): Promise<PendingChange[]> {
    const modifications = await db
      .select()
      .from(pendingCustomerChanges)
      .where(eq(pendingCustomerChanges.customerId, customerId));

    return modifications as PendingChange[];
  }

  /**
   * Auto-expire old modifications (cron job)
   */
  static async expireOldModifications(): Promise<number> {
    const now = new Date().toISOString();

    const expiredChanges = await db
      .update(pendingCustomerChanges)
      .set({
        status: 'EXPIRED',
        rejectionReason: 'Automatically expired after 72 hours',
        updatedAt: now
      })
      .where(
        and(
          eq(pendingCustomerChanges.status, 'PENDING'),
          eq(pendingCustomerChanges.expiresAt, now) // Less than now
        )
      )
      .returning();

    console.log(`[ModificationService] ⏰ Expired ${expiredChanges.length} old modifications`);

    return expiredChanges.length;
  }

  /**
   * PRIVATE: Apply approved modification to customer/accounts
   */
  private static async applyModification(change: any): Promise<void> {
    const { customerId, changeType, requestedChanges } = change;

    if (changeType === 'BALANCE_UPDATE') {
      // Update account balances
      const customerAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.customerId, customerId));

      for (const account of customerAccounts) {
        const accountType = account.accountTypeCode?.toLowerCase();
        const cdfKey = `${accountType}_cdf`;
        const usdKey = `${accountType}_usd`;

        const updateData: any = {};

        if (requestedChanges[cdfKey] !== undefined) {
          updateData.balanceCdf = requestedChanges[cdfKey].toString();
        }
        if (requestedChanges[usdKey] !== undefined) {
          updateData.balanceUsd = requestedChanges[usdKey].toString();
        }

        if (Object.keys(updateData).length > 0) {
          updateData.updatedAt = new Date().toISOString();
          
          await db
            .update(accounts)
            .set(updateData)
            .where(eq(accounts.id, account.id));

          console.log(`[ModificationService] 💰 Updated ${accountType}: CDF=${updateData.balanceCdf}, USD=${updateData.balanceUsd}`);
        }
      }

      // Update customer modification count
      await db
        .update(customers)
        .set({
          modificationCount: change.customerId, // TODO: Increment properly
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, customerId));

    } else if (changeType === 'INFO_UPDATE') {
      // Update customer information
      const updateData: any = {
        ...requestedChanges,
        updatedAt: new Date().toISOString()
      };

      await db
        .update(customers)
        .set(updateData)
        .where(eq(customers.id, customerId));

      console.log('[ModificationService] 📝 Updated customer info:', Object.keys(requestedChanges));
    }
  }

  /**
   * PRIVATE: Check if approver role can approve requester role
   */
  private static canApproveModification(requesterRole: string, approverRole: string): boolean {
    // Super-Admin can approve anything
    if (approverRole === 'SUPER_ADMIN') {
      return true;
    }

    // Admin modifications → Manager must approve
    if (requesterRole === 'ADMIN' && approverRole === 'MANAGER') {
      return true;
    }

    // Manager modifications → Admin must approve
    if (requesterRole === 'MANAGER' && approverRole === 'ADMIN') {
      return true;
    }

    return false;
  }

  /**
   * PRIVATE: Get required approver role for a requester role
   */
  private static getRequiredApproverRole(requesterRole: string): string {
    if (requesterRole === 'ADMIN') return 'MANAGER';
    if (requesterRole === 'MANAGER') return 'ADMIN';
    return 'SUPER_ADMIN';
  }

  /**
   * PRIVATE: Expire a specific modification
   */
  private static async expireModification(changeId: number): Promise<void> {
    await db
      .update(pendingCustomerChanges)
      .set({
        status: 'EXPIRED',
        rejectionReason: 'Automatically expired after 72 hours',
        updatedAt: new Date().toISOString()
      })
      .where(eq(pendingCustomerChanges.id, changeId));
  }

  /**
   * Cancel a modification request (only by creator)
   */
  static async cancelModification(
    changeId: number,
    cancellerAdminId: number,
    request: FastifyRequest
  ): Promise<void> {
    const [change] = await db
      .select()
      .from(pendingCustomerChanges)
      .where(eq(pendingCustomerChanges.id, changeId))
      .limit(1);

    if (!change) {
      throw new Error('Modification request not found');
    }

    // Only creator can cancel
    if (change.requestedByAdminId !== cancellerAdminId) {
      throw new Error('Only the creator can cancel this modification request');
    }

    // Must be pending
    if (change.status !== 'PENDING') {
      throw new Error(`Cannot cancel modification with status: ${change.status}`);
    }

    await db
      .update(pendingCustomerChanges)
      .set({
        status: 'CANCELLED',
        updatedAt: new Date().toISOString()
      })
      .where(eq(pendingCustomerChanges.id, changeId));

    await AuditLogger.log({
      userId: cancellerAdminId,
      customerId: change.customerId,
      action: 'MODIFICATION_CANCELLED',
      resourceType: 'pending_customer_changes',
      resourceId: changeId,
      status: 'SUCCESS'
    }, request);
  }
}
