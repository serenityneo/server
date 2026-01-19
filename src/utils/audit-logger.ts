/**
 * AUDIT LOGGER - Track all critical operations
 * Logs to PostgreSQL audit_logs table
 */

import { db } from '../db';
import { auditLogs } from '../db/schema';
import { FastifyRequest } from 'fastify';

export interface AuditLogEntry {
  userId?: number;
  customerId?: number;
  action: string;
  resourceType: string;
  resourceId?: number;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status?: 'SUCCESS' | 'FAILURE' | 'PENDING';
  errorMessage?: string;
}

export class AuditLogger {
  /**
   * Log any critical operation
   */
  static async log(entry: AuditLogEntry, request?: FastifyRequest): Promise<void> {
    try {
      const ipAddress = entry.ipAddress || request?.ip || 'unknown';
      const userAgent = entry.userAgent || request?.headers['user-agent'] || 'unknown';

      await db.insert(auditLogs).values({
        userId: entry.userId || null,
        action: entry.action,
        tableName: entry.resourceType,
        recordId: entry.resourceId?.toString() || null,
        oldValues: entry.oldValues || null,
        newValues: entry.newValues || null,
        ipAddress,
        userAgent,
        createdAt: new Date().toISOString(),
      });

      // Log to console for immediate visibility
      console.log('[AUDIT]', {
        timestamp: new Date().toISOString(),
        action: entry.action,
        resourceType: entry.resourceType,
        userId: entry.userId,
        customerId: entry.customerId,
        status: entry.status || 'SUCCESS',
        ip: ipAddress,
      });
    } catch (error) {
      // CRITICAL: Never fail operation due to audit logging
      console.error('[AUDIT_ERROR] Failed to log:', error);
    }
  }

  /**
   * Log credit application request
   */
  static async logCreditRequest(
    customerId: number,
    productType: string,
    amount: number,
    approved: boolean,
    request?: FastifyRequest
  ): Promise<void> {
    await this.log({
      customerId,
      action: 'CREDIT_REQUEST',
      resourceType: 'CREDIT_APPLICATION',
      newValues: { productType, amount, approved },
      status: approved ? 'SUCCESS' : 'FAILURE',
    }, request);
  }

  /**
   * Log account balance change
   */
  static async logBalanceChange(
    customerId: number,
    accountId: number,
    accountType: string,
    oldBalance: number,
    newBalance: number,
    operation: string,
    request?: FastifyRequest
  ): Promise<void> {
    await this.log({
      customerId,
      action: 'BALANCE_CHANGE',
      resourceType: 'ACCOUNT',
      resourceId: accountId,
      oldValues: { balance: oldBalance, accountType },
      newValues: { balance: newBalance, operation },
    }, request);
  }

  /**
   * Log credit disbursement
   */
  static async logCreditDisbursement(
    customerId: number,
    creditId: number,
    amount: number,
    s04AccountId: number,
    request?: FastifyRequest
  ): Promise<void> {
    await this.log({
      customerId,
      action: 'CREDIT_DISBURSEMENT',
      resourceType: 'CREDIT_APPLICATION',
      resourceId: creditId,
      newValues: { amount, s04AccountId, timestamp: new Date().toISOString() },
      status: 'SUCCESS',
    }, request);
  }

  /**
   * Log payment (repayment)
   */
  static async logPayment(
    customerId: number,
    creditId: number,
    amount: number,
    paymentType: 'MANUAL' | 'AUTO_DEBIT',
    success: boolean,
    request?: FastifyRequest
  ): Promise<void> {
    await this.log({
      customerId,
      action: 'CREDIT_REPAYMENT',
      resourceType: 'CREDIT_REPAYMENT',
      resourceId: creditId,
      newValues: { amount, paymentType, timestamp: new Date().toISOString() },
      status: success ? 'SUCCESS' : 'FAILURE',
    }, request);
  }

  /**
   * Log suspicious activity
   */
  static async logSuspiciousActivity(
    customerId: number,
    activityType: string,
    details: Record<string, any>,
    request?: FastifyRequest
  ): Promise<void> {
    await this.log({
      customerId,
      action: 'SUSPICIOUS_ACTIVITY',
      resourceType: 'SECURITY',
      newValues: { activityType, ...details },
      status: 'PENDING',
    }, request);

    // Additional alert for security team
    console.warn('[SECURITY_ALERT]', {
      customerId,
      activityType,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log admin action (validation, approval, etc.)
   */
  static async logAdminAction(
    adminId: number,
    action: string,
    targetCustomerId: number,
    resourceType: string,
    resourceId: number,
    details: Record<string, any>,
    request?: FastifyRequest
  ): Promise<void> {
    await this.log({
      userId: adminId,
      customerId: targetCustomerId,
      action: `ADMIN_${action.toUpperCase()}`,
      resourceType,
      resourceId,
      newValues: details,
      status: 'SUCCESS',
    }, request);
  }
}
