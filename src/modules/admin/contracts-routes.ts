/**
 * Admin Contracts Routes
 * Manage customer contracts and agreements
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db';
import { eq, and, or, sql, desc, isNull } from 'drizzle-orm';
import { contracts, contractHistory } from '../../db/contracts-schema';
import { customers } from '../../db/schema';
import { AUTH_COOKIE_NAME, extractUserIdFromCookie as extractUserIdFromCookieUtil } from '../../config/auth';

/**
 * Generate unique contract number
 * Format: CTR-YYYYMMDD-XXXXX (e.g., CTR-20260104-00001)
 */
function generateContractNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  
  return `CTR-${year}${month}${day}-${random}`;
}

/**
 * Extract user ID from admin cookie - uses centralized utility
 */
function extractUserIdFromCookie(request: FastifyRequest): number | null {
  const adminTokenCookie = request.cookies[AUTH_COOKIE_NAME];
  
  if (!adminTokenCookie) {
    return null;
  }
  
  return extractUserIdFromCookieUtil(adminTokenCookie);
}

export async function contractsRoutes(fastify: FastifyInstance) {
  
  /**
   * GET /api/v1/admin/contracts
   * Get all contracts with optional filters
   */
  fastify.get('/admin/contracts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { status, customerId, type } = request.query as {
        status?: string;
        customerId?: string;
        type?: string;
      };

      console.log('[Contracts] Fetching contracts with filters:', { status, customerId, type });

      // Build query with filters
      const conditions = [
        isNull(contracts.deletedAt) // Exclude soft-deleted contracts
      ];
      
      if (status) conditions.push(eq(contracts.status, status));
      if (customerId) conditions.push(eq(contracts.customerId, parseInt(customerId)));
      if (type) conditions.push(eq(contracts.type, type));

      // Fetch contracts with customer information
      const contractsList = await db
        .select({
          id: contracts.id,
          contractNumber: contracts.contractNumber,
          customerId: contracts.customerId,
          customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
          type: contracts.type,
          category: contracts.category,
          status: contracts.status,
          title: contracts.title,
          startDate: contracts.startDate,
          endDate: contracts.endDate,
          amount: contracts.amount,
          currency: contracts.currency,
          interestRate: contracts.interestRate,
          documentUrl: contracts.documentUrl,
          autoRenew: contracts.autoRenew,
          createdAt: contracts.createdAt,
          updatedAt: contracts.updatedAt,
        })
        .from(contracts)
        .leftJoin(customers, eq(contracts.customerId, customers.id))
        .where(and(...conditions))
        .orderBy(desc(contracts.createdAt));

      console.log(`[Contracts] Found ${contractsList.length} contracts`);

      return reply.send({
        success: true,
        contracts: contractsList,
        total: contractsList.length
      });
    } catch (error: any) {
      console.error('[Contracts] Error fetching contracts:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch contracts',
        details: error.message
      });
    }
  });

  /**
   * GET /api/v1/admin/contracts/:id
   * Get a specific contract by ID
   */
  fastify.get('/admin/contracts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      console.log('[Contracts] Fetching contract:', id);

      const [contract] = await db
        .select({
          id: contracts.id,
          contractNumber: contracts.contractNumber,
          customerId: contracts.customerId,
          customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
          customerEmail: customers.email,
          customerPhone: customers.mobileMoneyNumber,
          type: contracts.type,
          category: contracts.category,
          status: contracts.status,
          title: contracts.title,
          terms: contracts.terms,
          notes: contracts.notes,
          startDate: contracts.startDate,
          endDate: contracts.endDate,
          signedDate: contracts.signedDate,
          approvedDate: contracts.approvedDate,
          amount: contracts.amount,
          currency: contracts.currency,
          interestRate: contracts.interestRate,
          documentUrl: contracts.documentUrl,
          autoRenew: contracts.autoRenew,
          renewalPeriodDays: contracts.renewalPeriodDays,
          renewalCount: contracts.renewalCount,
          createdAt: contracts.createdAt,
          updatedAt: contracts.updatedAt,
        })
        .from(contracts)
        .leftJoin(customers, eq(contracts.customerId, customers.id))
        .where(and(
          eq(contracts.id, parseInt(id)),
          isNull(contracts.deletedAt)
        ))
        .limit(1);
      
      if (!contract) {
        return reply.status(404).send({
          success: false,
          error: 'Contract not found'
        });
      }

      return reply.send({
        success: true,
        contract
      });
    } catch (error: any) {
      console.error('[Contracts] Error fetching contract:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch contract',
        details: error.message
      });
    }
  });

  /**
   * POST /api/v1/admin/contracts
   * Create a new contract
   */
  fastify.post('/admin/contracts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        customerId: number;
        type: string;
        category?: string;
        title: string;
        startDate: string;
        endDate?: string;
        amount?: number;
        currency?: string;
        interestRate?: number;
        terms?: string;
        notes?: string;
        autoRenew?: boolean;
        renewalPeriodDays?: number;
      };

      console.log('[Contracts] Creating contract:', body);

      // Validate required fields
      if (!body.customerId || !body.type || !body.title || !body.startDate) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required fields: customerId, type, title, startDate'
        });
      }

      // Verify customer exists
      const [customer] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, body.customerId))
        .limit(1);

      if (!customer) {
        return reply.status(404).send({
          success: false,
          error: 'Customer not found'
        });
      }

      // Extract user ID from cookie
      const userId = extractUserIdFromCookie(request);

      // Generate unique contract number
      const contractNumber = generateContractNumber();

      // Insert contract
      const [newContract] = await db
        .insert(contracts)
        .values({
          contractNumber,
          customerId: body.customerId,
          createdByUserId: userId || undefined,
          type: body.type,
          category: body.category || null,
          status: 'DRAFT',
          title: body.title,
          startDate: new Date(body.startDate),
          endDate: body.endDate ? new Date(body.endDate) : null,
          amount: body.amount ? String(body.amount) : null,
          currency: body.currency || 'CDF',
          interestRate: body.interestRate ? String(body.interestRate) : null,
          terms: body.terms || null,
          notes: body.notes || null,
          autoRenew: body.autoRenew || false,
          renewalPeriodDays: body.renewalPeriodDays || null,
          renewalCount: 0,
        })
        .returning();

      // Log contract creation in history
      await db.insert(contractHistory).values({
        contractId: newContract.id,
        action: 'CREATED',
        changedBy: userId || 0,
        changes: JSON.stringify({
          status: 'DRAFT',
          contractNumber,
          type: body.type,
        }),
        reason: 'Contract created by admin',
      });

      console.log('[Contracts] Contract created successfully:', newContract.id);

      return reply.status(201).send({
        success: true,
        contract: newContract,
        message: 'Contract created successfully'
      });
    } catch (error: any) {
      console.error('[Contracts] Error creating contract:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to create contract',
        details: error.message
      });
    }
  });

  /**
   * PUT /api/v1/admin/contracts/:id
   * Update a contract
   */
  fastify.put('/admin/contracts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<{
        status: string;
        title: string;
        startDate: string;
        endDate: string;
        amount: number;
        currency: string;
        interestRate: number;
        terms: string;
        notes: string;
        autoRenew: boolean;
        renewalPeriodDays: number;
      }>;

      console.log('[Contracts] Updating contract:', id, body);

      // Check if contract exists
      const [existing] = await db
        .select({ id: contracts.id, status: contracts.status })
        .from(contracts)
        .where(and(
          eq(contracts.id, parseInt(id)),
          isNull(contracts.deletedAt)
        ))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Contract not found'
        });
      }

      // Extract user ID
      const userId = extractUserIdFromCookie(request);

      // Prepare update data
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (body.status) updateData.status = body.status;
      if (body.title) updateData.title = body.title;
      if (body.startDate) updateData.startDate = new Date(body.startDate);
      if (body.endDate) updateData.endDate = new Date(body.endDate);
      if (body.amount !== undefined) updateData.amount = String(body.amount);
      if (body.currency) updateData.currency = body.currency;
      if (body.interestRate !== undefined) updateData.interestRate = String(body.interestRate);
      if (body.terms !== undefined) updateData.terms = body.terms;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.autoRenew !== undefined) updateData.autoRenew = body.autoRenew;
      if (body.renewalPeriodDays !== undefined) updateData.renewalPeriodDays = body.renewalPeriodDays;

      // If status changed to ACTIVE, set approvedDate
      if (body.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
        updateData.approvedDate = new Date();
        updateData.approvedByUserId = userId || null;
      }

      // Update contract
      const [updated] = await db
        .update(contracts)
        .set(updateData)
        .where(eq(contracts.id, parseInt(id)))
        .returning();

      // Log update in history
      await db.insert(contractHistory).values({
        contractId: parseInt(id),
        action: 'UPDATED',
        changedBy: userId || 0,
        changes: JSON.stringify(body),
        reason: 'Contract updated by admin',
      });

      console.log('[Contracts] Contract updated successfully:', id);

      return reply.send({
        success: true,
        contract: updated,
        message: 'Contract updated successfully'
      });
    } catch (error: any) {
      console.error('[Contracts] Error updating contract:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update contract',
        details: error.message
      });
    }
  });

  /**
   * DELETE /api/v1/admin/contracts/:id
   * Soft delete a contract
   */
  fastify.delete('/admin/contracts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      console.log('[Contracts] Deleting contract:', id);

      // Check if contract exists
      const [existing] = await db
        .select({ id: contracts.id, status: contracts.status })
        .from(contracts)
        .where(and(
          eq(contracts.id, parseInt(id)),
          isNull(contracts.deletedAt)
        ))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: 'Contract not found'
        });
      }

      // Prevent deletion of active contracts
      if (existing.status === 'ACTIVE') {
        return reply.status(400).send({
          success: false,
          error: 'Cannot delete an active contract. Please cancel it first.'
        });
      }

      // Extract user ID
      const userId = extractUserIdFromCookie(request);

      // Soft delete
      await db
        .update(contracts)
        .set({ deletedAt: new Date() })
        .where(eq(contracts.id, parseInt(id)));

      // Log deletion in history
      await db.insert(contractHistory).values({
        contractId: parseInt(id),
        action: 'CANCELLED',
        changedBy: userId || 0,
        changes: JSON.stringify({ deletedAt: new Date() }),
        reason: 'Contract deleted by admin',
      });

      console.log('[Contracts] Contract deleted successfully:', id);

      return reply.send({
        success: true,
        message: 'Contract deleted successfully'
      });
    } catch (error: any) {
      console.error('[Contracts] Error deleting contract:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete contract',
        details: error.message
      });
    }
  });
}
