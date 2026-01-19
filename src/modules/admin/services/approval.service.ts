/**
 * UNIFIED APPROVAL SERVICE
 * 
 * Hierarchical approval system:
 * - Manager → Admin validates
 * - Admin → Super Admin validates
 * - Super Admin → Auto-approved (no validation needed)
 */

import { db } from '../../../db';
import { customers, users, accounts, transactions } from '../../../db/schema';
import { approvalRequests, migrationRequests, serviceActivationRequests } from '../../../db/migration-schema';
import { eq, and, or, sql, desc } from 'drizzle-orm';
import { creditServicesService } from './credit-services.service';

type UserRole = 'Manager' | 'Admin' | 'Super Admin';
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type ApprovalRequestType = 'MIGRATION' | 'SERVICE_ACTIVATION' | 'BALANCE_UPDATE';

export class ApprovalService {
  /**
   * Get approvals by role - Returns requests filtered by user's role
   */
  static async getApprovalsByRole(userId: number, userRole: UserRole) {
    try {
      let myRequests: any[] = [];
      let toValidate: any[] = [];

      if (userRole === 'Manager') {
        // Manager voit UNIQUEMENT ses propres requêtes
        myRequests = await db
          .select({
            id: approvalRequests.id,
            requestType: approvalRequests.requestType,
            referenceId: approvalRequests.referenceId,
            customerId: approvalRequests.customerId,
            createdByUserId: approvalRequests.createdByUserId,
            createdByRole: approvalRequests.createdByRole,
            createdByName: approvalRequests.createdByName,
            requiresValidationByRole: approvalRequests.requiresValidationByRole,
            validatedByUserId: approvalRequests.validatedByUserId,
            validatedByRole: approvalRequests.validatedByRole,
            validatedByName: approvalRequests.validatedByName,
            validatedAt: approvalRequests.validatedAt,
            status: approvalRequests.status,
            rejectionReason: approvalRequests.rejectionReason,
            requestData: approvalRequests.requestData,
            createdAt: approvalRequests.createdAt,
            updatedAt: approvalRequests.updatedAt,
            // Join customer info
            customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
            customerCif: customers.cif,
          })
          .from(approvalRequests)
          .leftJoin(customers, eq(approvalRequests.customerId, customers.id))
          .where(eq(approvalRequests.createdByUserId, userId))
          .orderBy(desc(approvalRequests.createdAt));

        toValidate = []; // Manager ne valide rien
      } else if (userRole === 'Admin') {
        // Admin: Ses requêtes → Super Admin
        myRequests = await db
          .select({
            id: approvalRequests.id,
            requestType: approvalRequests.requestType,
            referenceId: approvalRequests.referenceId,
            customerId: approvalRequests.customerId,
            createdByUserId: approvalRequests.createdByUserId,
            createdByRole: approvalRequests.createdByRole,
            createdByName: approvalRequests.createdByName,
            requiresValidationByRole: approvalRequests.requiresValidationByRole,
            validatedByUserId: approvalRequests.validatedByUserId,
            validatedByRole: approvalRequests.validatedByRole,
            validatedByName: approvalRequests.validatedByName,
            validatedAt: approvalRequests.validatedAt,
            status: approvalRequests.status,
            rejectionReason: approvalRequests.rejectionReason,
            requestData: approvalRequests.requestData,
            createdAt: approvalRequests.createdAt,
            updatedAt: approvalRequests.updatedAt,
            customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
            customerCif: customers.cif,
          })
          .from(approvalRequests)
          .leftJoin(customers, eq(approvalRequests.customerId, customers.id))
          .where(eq(approvalRequests.createdByUserId, userId))
          .orderBy(desc(approvalRequests.createdAt));

        // Requêtes Manager → Admin doit valider
        toValidate = await db
          .select({
            id: approvalRequests.id,
            requestType: approvalRequests.requestType,
            referenceId: approvalRequests.referenceId,
            customerId: approvalRequests.customerId,
            createdByUserId: approvalRequests.createdByUserId,
            createdByRole: approvalRequests.createdByRole,
            createdByName: approvalRequests.createdByName,
            requiresValidationByRole: approvalRequests.requiresValidationByRole,
            status: approvalRequests.status,
            requestData: approvalRequests.requestData,
            createdAt: approvalRequests.createdAt,
            customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
            customerCif: customers.cif,
          })
          .from(approvalRequests)
          .leftJoin(customers, eq(approvalRequests.customerId, customers.id))
          .where(
            and(
              eq(approvalRequests.status, 'PENDING'),
              eq(approvalRequests.requiresValidationByRole, 'Admin')
            )
          )
          .orderBy(desc(approvalRequests.createdAt));
      } else if (userRole === 'Super Admin') {
        // Super Admin: Pas de requêtes en attente (validation auto)
        myRequests = [];

        // Requêtes Admin → Super Admin doit valider
        toValidate = await db
          .select({
            id: approvalRequests.id,
            requestType: approvalRequests.requestType,
            referenceId: approvalRequests.referenceId,
            customerId: approvalRequests.customerId,
            createdByUserId: approvalRequests.createdByUserId,
            createdByRole: approvalRequests.createdByRole,
            createdByName: approvalRequests.createdByName,
            requiresValidationByRole: approvalRequests.requiresValidationByRole,
            status: approvalRequests.status,
            requestData: approvalRequests.requestData,
            createdAt: approvalRequests.createdAt,
            customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
            customerCif: customers.cif,
          })
          .from(approvalRequests)
          .leftJoin(customers, eq(approvalRequests.customerId, customers.id))
          .where(
            and(
              eq(approvalRequests.status, 'PENDING'),
              eq(approvalRequests.requiresValidationByRole, 'Super Admin')
            )
          )
          .orderBy(desc(approvalRequests.createdAt));
      }

      return {
        success: true,
        myRequests,
        toValidate,
      };
    } catch (error) {
      throw new Error(`Failed to fetch approvals: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate (Approve or Reject) an approval request
   */
  static async validateApprovalRequest(params: {
    approvalId: number;
    validatedBy: {
      userId: number;
      role: UserRole;
      name: string;
    };
    action: 'APPROVE' | 'REJECT';
    rejectionReason?: string;
  }) {
    const { approvalId, validatedBy, action, rejectionReason } = params;

    return await db.transaction(async (tx: any) => {
      // 1. Get approval request
      const [approval] = await tx
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, approvalId));

      if (!approval) {
        throw new Error('Approval request not found');
      }

      if (approval.status !== 'PENDING') {
        throw new Error(`Request already ${approval.status}`);
      }

      // 2. Security: Verify role can validate
      if (validatedBy.role === 'Manager') {
        throw new Error('Manager cannot validate requests');
      }

      if (validatedBy.role === 'Admin' && approval.requiresValidationByRole !== 'Admin') {
        throw new Error('Admin can only validate Manager requests');
      }

      // 3. Update approval request
      const newStatus: ApprovalStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

      await tx
        .update(approvalRequests)
        .set({
          status: newStatus,
          validatedByUserId: validatedBy.userId,
          validatedByRole: validatedBy.role,
          validatedByName: validatedBy.name,
          validatedAt: sql`CURRENT_TIMESTAMP`,
          rejectionReason: action === 'REJECT' ? rejectionReason : null,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(approvalRequests.id, approvalId));

      // 4. Execute business logic if APPROVED
      if (action === 'APPROVE') {
        if (approval.requestType === 'MIGRATION') {
          await this.executeMigrationApproval(tx, approval);
        } else if (approval.requestType === 'SERVICE_ACTIVATION') {
          await this.executeServiceActivation(tx, approval);
        }
      }

      return {
        success: true,
        message: action === 'APPROVE' ? 'Request approved successfully' : 'Request rejected',
        approval: {
          id: approvalId,
          status: newStatus,
          validatedBy: validatedBy.name,
          validatedAt: new Date().toISOString(),
        },
      };
    });
  }

  /**
   * Execute migration approval - Create transactions for S01-S06 and activate services
   */
  private static async executeMigrationApproval(tx: any, approval: any) {
    // Get migration request details
    const [migrationReq] = await tx
      .select()
      .from(migrationRequests)
      .where(eq(migrationRequests.id, approval.referenceId));

    if (!migrationReq) {
      throw new Error('Migration request not found');
    }

    const customerId = approval.customerId;

    // Get customer's accounts (S01-S06)
    const customerAccounts = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.customerId, customerId));

    // Create transactions for each deposit
    const deposits = [
      { type: 'S01_STANDARD', cdf: parseFloat(migrationReq.depositS01Cdf), usd: parseFloat(migrationReq.depositS01Usd) },
      { type: 'S02_MANDATORY_SAVINGS', cdf: parseFloat(migrationReq.depositS02Cdf), usd: parseFloat(migrationReq.depositS02Usd) },
      { type: 'S03_CAUTION', cdf: parseFloat(migrationReq.depositS03Cdf), usd: parseFloat(migrationReq.depositS03Usd) },
      { type: 'S04_CREDIT', cdf: parseFloat(migrationReq.depositS04Cdf), usd: parseFloat(migrationReq.depositS04Usd) },
      { type: 'S05_BWAKISA_CARTE', cdf: parseFloat(migrationReq.depositS05Cdf), usd: parseFloat(migrationReq.depositS05Usd) },
      { type: 'S06_FINES', cdf: parseFloat(migrationReq.depositS06Cdf), usd: parseFloat(migrationReq.depositS06Usd) },
    ];

    for (const deposit of deposits) {
      const account = customerAccounts.find((acc: any) => acc.accountType === deposit.type);
      
      if (!account) continue;

      // CDF transaction
      if (deposit.cdf !== 0) {
        const transactionType = deposit.cdf > 0 ? 'DEPOSIT' : 'WITHDRAWAL';
        const amount = Math.abs(deposit.cdf);

        await tx.insert(transactions).values({
          customerId,
          accountId: account.id,
          transactionType,
          amount: amount.toString(),
          currency: 'CDF',
          balanceBefore: account.balanceCdf,
          balanceAfter: (parseFloat(account.balanceCdf) + deposit.cdf).toString(),
          status: 'COMPLETED',
          description: `Migration - ${deposit.type}`,
          createdAt: sql`CURRENT_TIMESTAMP`,
        });

        // Update account balance
        await tx
          .update(accounts)
          .set({
            balanceCdf: (parseFloat(account.balanceCdf) + deposit.cdf).toString(),
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(accounts.id, account.id));
      }

      // USD transaction
      if (deposit.usd !== 0) {
        const transactionType = deposit.usd > 0 ? 'DEPOSIT' : 'WITHDRAWAL';
        const amount = Math.abs(deposit.usd);

        await tx.insert(transactions).values({
          customerId,
          accountId: account.id,
          transactionType,
          amount: amount.toString(),
          currency: 'USD',
          balanceBefore: account.balanceUsd,
          balanceAfter: (parseFloat(account.balanceUsd) + deposit.usd).toString(),
          status: 'COMPLETED',
          description: `Migration - ${deposit.type}`,
          createdAt: sql`CURRENT_TIMESTAMP`,
        });

        // Update account balance
        await tx
          .update(accounts)
          .set({
            balanceUsd: (parseFloat(account.balanceUsd) + deposit.usd).toString(),
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(accounts.id, account.id));
      }
    }

    // ✨ NEW: Activate credit services if specified in migration request
    if (migrationReq.requestedServices && Array.isArray(migrationReq.requestedServices)) {
      const serviceCodes = migrationReq.requestedServices as string[];
      
      if (serviceCodes.length > 0) {
        console.log('[ApprovalService] 🎱 Activating services for customer:', customerId, serviceCodes);
        
        try {
          // Use the credit services service to activate services
          // Pass the transaction context for database consistency
          const { customerServices } = await import('../../../db/migration-schema');
          
          for (const serviceCode of serviceCodes) {
            // Check if service already exists
            const [existing] = await tx
              .select()
              .from(customerServices)
              .where(
                and(
                  eq(customerServices.customerId, customerId),
                  eq(customerServices.serviceCode, serviceCode)
                )
              )
              .limit(1);
            
            if (existing) {
              // If exists and inactive, reactivate it
              if (!existing.isActive) {
                await tx
                  .update(customerServices)
                  .set({
                    isActive: true,
                    activatedByUserId: approval.validatedByUserId,
                    activatedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`
                  })
                  .where(eq(customerServices.id, existing.id));
                
                console.log('[ApprovalService] ✅ Service reactivated:', serviceCode);
              }
            } else {
              // Insert new service
              await tx.insert(customerServices).values({
                customerId,
                serviceCode,
                isActive: true,
                activatedByUserId: approval.validatedByUserId,
                activatedAt: sql`CURRENT_TIMESTAMP`,
                createdAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`
              });
              
              console.log('[ApprovalService] ✅ Service activated:', serviceCode);
            }
          }
          
          console.log('[ApprovalService] 🎉 All services activated successfully');
        } catch (error) {
          console.error('[ApprovalService] ⚠️  Error activating services:', error);
          // Don't throw - we don't want to block migration if service activation fails
        }
      }
    }
  }

  /**
   * Execute service activation
   */
  private static async executeServiceActivation(tx: any, approval: any) {
    // Get service activation request
    const [serviceReq] = await tx
      .select()
      .from(serviceActivationRequests)
      .where(eq(serviceActivationRequests.id, approval.referenceId));

    if (!serviceReq) {
      throw new Error('Service activation request not found');
    }

    // TODO: Implement service activation logic
    // This will activate services for the customer
  }

  /**
   * Get approval request details by ID
   */
  static async getApprovalById(approvalId: number) {
    try {
      const [approval] = await db
        .select({
          id: approvalRequests.id,
          requestType: approvalRequests.requestType,
          referenceId: approvalRequests.referenceId,
          customerId: approvalRequests.customerId,
          createdByUserId: approvalRequests.createdByUserId,
          createdByRole: approvalRequests.createdByRole,
          createdByName: approvalRequests.createdByName,
          requiresValidationByRole: approvalRequests.requiresValidationByRole,
          validatedByUserId: approvalRequests.validatedByUserId,
          validatedByRole: approvalRequests.validatedByRole,
          validatedByName: approvalRequests.validatedByName,
          validatedAt: approvalRequests.validatedAt,
          status: approvalRequests.status,
          rejectionReason: approvalRequests.rejectionReason,
          requestData: approvalRequests.requestData,
          createdAt: approvalRequests.createdAt,
          updatedAt: approvalRequests.updatedAt,
          customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
          customerCif: customers.cif,
        })
        .from(approvalRequests)
        .leftJoin(customers, eq(approvalRequests.customerId, customers.id))
        .where(eq(approvalRequests.id, approvalId));

      if (!approval) {
        throw new Error('Approval request not found');
      }

      return {
        success: true,
        approval,
      };
    } catch (error) {
      throw new Error(`Failed to fetch approval: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get pending approvals count by role
   */
  static async getPendingCount(userId: number, userRole: UserRole) {
    try {
      let count = 0;

      if (userRole === 'Admin') {
        // Count Manager requests awaiting Admin validation
        const result = await db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(approvalRequests)
          .where(
            and(
              eq(approvalRequests.status, 'PENDING'),
              eq(approvalRequests.requiresValidationByRole, 'Admin')
            )
          );
        count = result[0]?.count || 0;
      } else if (userRole === 'Super Admin') {
        // Count Admin requests awaiting Super Admin validation
        const result = await db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(approvalRequests)
          .where(
            and(
              eq(approvalRequests.status, 'PENDING'),
              eq(approvalRequests.requiresValidationByRole, 'Super Admin')
            )
          );
        count = result[0]?.count || 0;
      }

      return {
        success: true,
        count,
      };
    } catch (error) {
      throw new Error(`Failed to get pending count: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
