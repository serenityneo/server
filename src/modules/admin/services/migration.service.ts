/**
 * MIGRATION SERVICE
 * 
 * Handles customer migration from paper records to digital system
 * - Only for MEMBER customers
 * - Manager creates migration → Admin validates
 * - Admin creates migration → Super Admin validates
 */

import { db } from '../../../db';
import { customers, accounts } from '../../../db/schema';
import { migrationRequests, approvalRequests } from '../../../db/migration-schema';
import { eq, and, sql } from 'drizzle-orm';

type UserRole = 'Manager' | 'Admin' | 'Super Admin';

interface CreateMigrationParams {
  customerId: number;
  createdBy: {
    userId: number;
    role: UserRole;
    name: string;
  };
  deposits: {
    s01Cdf: number;
    s01Usd: number;
    s02Cdf: number;
    s02Usd: number;
    s03Cdf: number;
    s03Usd: number;
    s04Cdf: number;
    s04Usd: number;
    s05Cdf: number;
    s05Usd: number;
    s06Cdf: number;
    s06Usd: number;
  };
  kycData?: any;
  missingKycFields?: string[];
  requestedServices?: string[];
}

export class MigrationService {
  /**
   * Create a migration request (Manager or Admin)
   */
  static async createMigrationRequest(params: CreateMigrationParams) {
    const { customerId, createdBy, deposits, kycData, missingKycFields, requestedServices } = params;

    return await db.transaction(async (tx: any) => {
      // 1. Verify customer is MEMBER type
      const [customer] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, customerId));

      if (!customer) {
        throw new Error('Customer not found');
      }

      if (customer.customerType !== 'MEMBER') {
        throw new Error('Migration is only available for MEMBER customers');
      }

      // 2. Check if customer already has accounts
      const existingAccounts = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.customerId, customerId));

      if (existingAccounts.length === 0) {
        throw new Error('Customer must have accounts created before migration');
      }

      // 3. Determine who needs to validate
      const requiresValidationByRole = createdBy.role === 'Manager' ? 'Admin' : 'Super Admin';

      // 4. Create migration request
      const [migrationReq] = await tx.insert(migrationRequests).values({
        customerId,
        createdByUserId: createdBy.userId,
        depositS01Cdf: deposits.s01Cdf.toString(),
        depositS01Usd: deposits.s01Usd.toString(),
        depositS02Cdf: deposits.s02Cdf.toString(),
        depositS02Usd: deposits.s02Usd.toString(),
        depositS03Cdf: deposits.s03Cdf.toString(),
        depositS03Usd: deposits.s03Usd.toString(),
        depositS04Cdf: deposits.s04Cdf.toString(),
        depositS04Usd: deposits.s04Usd.toString(),
        depositS05Cdf: deposits.s05Cdf.toString(),
        depositS05Usd: deposits.s05Usd.toString(),
        depositS06Cdf: deposits.s06Cdf.toString(),
        depositS06Usd: deposits.s06Usd.toString(),
        kycData: kycData ? JSON.parse(JSON.stringify(kycData)) : null,
        missingKycFields: missingKycFields ? JSON.parse(JSON.stringify(missingKycFields)) : null,
        requestedServices: requestedServices ? JSON.parse(JSON.stringify(requestedServices)) : null,
        createdAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }).returning();

      // 5. Create approval request
      const [approvalReq] = await tx.insert(approvalRequests).values({
        requestType: 'MIGRATION',
        referenceId: migrationReq.id,
        customerId,
        createdByUserId: createdBy.userId,
        createdByRole: createdBy.role,
        createdByName: createdBy.name,
        requiresValidationByRole,
        status: 'PENDING',
        requestData: JSON.parse(JSON.stringify({
          deposits,
          kycData,
          missingKycFields,
          requestedServices,
          customerName: `${customer.firstName} ${customer.lastName}`,
          customerCif: customer.cif,
        })),
        createdAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }).returning();

      // 6. Link migration request to approval request
      await tx
        .update(migrationRequests)
        .set({ approvalRequestId: approvalReq.id })
        .where(eq(migrationRequests.id, migrationReq.id));

      return {
        success: true,
        message: `Migration request created. Awaiting ${requiresValidationByRole} validation.`,
        migrationRequest: migrationReq,
        approvalRequest: approvalReq,
      };
    });
  }

  /**
   * Get migration request details
   */
  static async getMigrationRequest(migrationId: number) {
    try {
      const [migration] = await db
        .select({
          id: migrationRequests.id,
          customerId: migrationRequests.customerId,
          createdByUserId: migrationRequests.createdByUserId,
          depositS01Cdf: migrationRequests.depositS01Cdf,
          depositS01Usd: migrationRequests.depositS01Usd,
          depositS02Cdf: migrationRequests.depositS02Cdf,
          depositS02Usd: migrationRequests.depositS02Usd,
          depositS03Cdf: migrationRequests.depositS03Cdf,
          depositS03Usd: migrationRequests.depositS03Usd,
          depositS04Cdf: migrationRequests.depositS04Cdf,
          depositS04Usd: migrationRequests.depositS04Usd,
          depositS05Cdf: migrationRequests.depositS05Cdf,
          depositS05Usd: migrationRequests.depositS05Usd,
          depositS06Cdf: migrationRequests.depositS06Cdf,
          depositS06Usd: migrationRequests.depositS06Usd,
          kycData: migrationRequests.kycData,
          missingKycFields: migrationRequests.missingKycFields,
          requestedServices: migrationRequests.requestedServices,
          approvalRequestId: migrationRequests.approvalRequestId,
          createdAt: migrationRequests.createdAt,
          updatedAt: migrationRequests.updatedAt,
          customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
          customerCif: customers.cif,
        })
        .from(migrationRequests)
        .leftJoin(customers, eq(migrationRequests.customerId, customers.id))
        .where(eq(migrationRequests.id, migrationId));

      if (!migration) {
        throw new Error('Migration request not found');
      }

      return {
        success: true,
        migration,
      };
    } catch (error) {
      throw new Error(`Failed to fetch migration request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all migration requests for a customer
   */
  static async getCustomerMigrations(customerId: number) {
    try {
      const migrations = await db
        .select()
        .from(migrationRequests)
        .where(eq(migrationRequests.customerId, customerId))
        .orderBy(sql`${migrationRequests.createdAt} DESC`);

      return {
        success: true,
        migrations,
      };
    } catch (error) {
      throw new Error(`Failed to fetch customer migrations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
