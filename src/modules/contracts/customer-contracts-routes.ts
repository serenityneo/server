/**
 * Customer Contracts Routes
 * Handles contract retrieval and signing for authenticated customers
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db';
import { contracts, contractNotifications, contractSignatories } from '../../db/contracts-schema';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * Customer Authentication Middleware
 * Verifies Bearer token from cookies (customer-token)
 */
const requireCustomerAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = request.cookies['customer-token'];
  
  if (!token) {
    return reply.status(401).send({
      success: false,
      error: 'Authentication required',
      message: 'Veuillez vous connecter pour accéder à vos contrats'
    });
  }

  // Extract customer ID from token (format: "customer_{id}_{timestamp}")
  const match = token.match(/^customer_(\d+)_/);
  if (!match) {
    return reply.status(401).send({
      success: false,
      error: 'Invalid session',
      message: 'Session invalide. Veuillez vous reconnecter.'
    });
  }

  const customerId = parseInt(match[1]);
  if (isNaN(customerId) || customerId <= 0) {
    return reply.status(401).send({
      success: false,
      error: 'Invalid customer ID',
      message: 'Session invalide'
    });
  }

  // Attach customerId to request for use in route handlers
  (request as any).customerId = customerId;
};

export default async function customerContractsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/contracts/my-contracts
   * Retrieve all contracts for the authenticated customer
   */
  fastify.get('/contracts/my-contracts', {
    preHandler: requireCustomerAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = (request as any).customerId;

    try {
      console.log(`[Contracts] Fetching contracts for customer ${customerId}`);

      // Fetch all contracts for this customer with notification status
      const customerContracts = await db
        .select({
          // Contract details
          id: contracts.id,
          contractNumber: contracts.contractNumber,
          type: contracts.type,
          category: contracts.category,
          status: contracts.status,
          title: contracts.title,
          terms: contracts.terms,
          startDate: contracts.startDate,
          endDate: contracts.endDate,
          signedDate: contracts.signedDate,
          amount: contracts.amount,
          currency: contracts.currency,
          interestRate: contracts.interestRate,
          documentUrl: contracts.documentUrl,
          createdAt: contracts.createdAt,
          
          // Notification details
          notificationId: contractNotifications.id,
          isRead: contractNotifications.isRead,
          isSigned: contractNotifications.isSigned,
          notificationCreatedAt: contractNotifications.createdAt,
          notificationMessage: contractNotifications.message,
          priority: contractNotifications.priority,
        })
        .from(contracts)
        .leftJoin(
          contractNotifications,
          and(
            eq(contractNotifications.contractId, contracts.id),
            eq(contractNotifications.customerId, customerId)
          )
        )
        .where(eq(contracts.customerId, customerId))
        .orderBy(desc(contracts.createdAt));

      console.log(`[Contracts] Found ${customerContracts.length} contracts for customer ${customerId}`);

      // Count unread notifications
      const unreadCount = customerContracts.filter(c => 
        c.notificationId && !c.isRead && !c.isSigned
      ).length;

      // Group by status
      const statusBreakdown = {
        PENDING: customerContracts.filter(c => c.status === 'PENDING').length,
        ACTIVE: customerContracts.filter(c => c.status === 'ACTIVE').length,
        EXPIRED: customerContracts.filter(c => c.status === 'EXPIRED').length,
        CANCELLED: customerContracts.filter(c => c.status === 'CANCELLED').length,
      };

      return reply.send({
        success: true,
        contracts: customerContracts,
        summary: {
          total: customerContracts.length,
          unreadNotifications: unreadCount,
          statusBreakdown
        }
      });

    } catch (error: any) {
      console.error('[Contracts] Error fetching customer contracts:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch contracts',
        message: process.env.NODE_ENV === 'production' 
          ? 'Une erreur est survenue lors de la récupération de vos contrats'
          : error.message
      });
    }
  });

  /**
   * GET /api/v1/contracts/:id
   * Get detailed information about a specific contract
   */
  fastify.get('/contracts/:id', {
    preHandler: requireCustomerAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = (request as any).customerId;
    const { id } = request.params as { id: string };
    const contractId = parseInt(id);

    if (isNaN(contractId)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid contract ID'
      });
    }

    try {
      console.log(`[Contracts] Fetching contract ${contractId} for customer ${customerId}`);

      // Fetch contract details
      const [contract] = await db
        .select()
        .from(contracts)
        .where(
          and(
            eq(contracts.id, contractId),
            eq(contracts.customerId, customerId)
          )
        );

      if (!contract) {
        return reply.status(404).send({
          success: false,
          error: 'Contract not found',
          message: 'Ce contrat n\'existe pas ou ne vous appartient pas'
        });
      }

      // Fetch notification status
      const [notification] = await db
        .select()
        .from(contractNotifications)
        .where(
          and(
            eq(contractNotifications.contractId, contractId),
            eq(contractNotifications.customerId, customerId)
          )
        );

      // Fetch signatories
      const signatories = await db
        .select()
        .from(contractSignatories)
        .where(eq(contractSignatories.contractId, contractId));

      // Mark notification as read if not already
      if (notification && !notification.isRead) {
        await db
          .update(contractNotifications)
          .set({ 
            isRead: true,
            readAt: new Date()
          })
          .where(eq(contractNotifications.id, notification.id));

        console.log(`[Contracts] Marked notification ${notification.id} as read`);
      }

      return reply.send({
        success: true,
        contract: {
          ...contract,
          notification,
          signatories
        }
      });

    } catch (error: any) {
      console.error('[Contracts] Error fetching contract details:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch contract',
        message: process.env.NODE_ENV === 'production'
          ? 'Une erreur est survenue'
          : error.message
      });
    }
  });

  /**
   * POST /api/v1/contracts/:id/sign
   * Sign a contract using KYC signature
   */
  fastify.post('/contracts/:id/sign', {
    preHandler: requireCustomerAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = (request as any).customerId;
    const { id } = request.params as { id: string };
    const contractId = parseInt(id);
    const { accepted } = request.body as { accepted?: boolean };

    if (isNaN(contractId)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid contract ID'
      });
    }

    if (accepted !== true) {
      return reply.status(400).send({
        success: false,
        error: 'Vous devez accepter les termes du contrat'
      });
    }

    try {
      console.log(`[Contracts] Customer ${customerId} signing contract ${contractId}`);

      // Verify contract belongs to customer and is PENDING
      const [contract] = await db
        .select()
        .from(contracts)
        .where(
          and(
            eq(contracts.id, contractId),
            eq(contracts.customerId, customerId)
          )
        );

      if (!contract) {
        return reply.status(404).send({
          success: false,
          error: 'Contract not found'
        });
      }

      if (contract.status !== 'PENDING') {
        return reply.status(400).send({
          success: false,
          error: 'Contract cannot be signed',
          message: contract.status === 'ACTIVE' 
            ? 'Ce contrat est déjà signé'
            : `Statut actuel: ${contract.status}`
        });
      }

      // Get customer's KYC signature
      const [customer] = await db
        .select({
          signaturePhotoUrl: sql<string>`signature_photo_url`,
          firstName: sql<string>`first_name`,
          lastName: sql<string>`last_name`
        })
        .from(sql`customers`)
        .where(sql`id = ${customerId}`);

      if (!customer || !customer.signaturePhotoUrl) {
        return reply.status(400).send({
          success: false,
          error: 'Signature not available',
          message: 'Votre signature KYC n\'est pas disponible. Veuillez compléter votre KYC.'
        });
      }

      // Get IP and User Agent for audit
      const ipAddress = request.headers['x-forwarded-for'] || request.ip || 'unknown';
      const userAgent = request.headers['user-agent'] || 'unknown';

      // Update contract status to ACTIVE
      await db
        .update(contracts)
        .set({
          status: 'ACTIVE',
          signedDate: new Date(),
          updatedAt: new Date()
        })
        .where(eq(contracts.id, contractId));

      // Create or update signatory record
      await db.execute(sql`
        INSERT INTO contract_signatories (
          contract_id,
          signatory_type,
          signatory_name,
          signed,
          signed_date,
          signature_url,
          ip_address,
          created_at,
          updated_at
        ) VALUES (
          ${contractId},
          'CUSTOMER',
          ${`${customer.firstName} ${customer.lastName}`},
          TRUE,
          ${new Date().toISOString()},
          ${customer.signaturePhotoUrl},
          ${ipAddress},
          ${new Date().toISOString()},
          ${new Date().toISOString()}
        )
        ON CONFLICT (contract_id, signatory_type) 
        DO UPDATE SET
          signed = TRUE,
          signed_date = EXCLUDED.signed_date,
          signature_url = EXCLUDED.signature_url,
          ip_address = EXCLUDED.ip_address,
          updated_at = EXCLUDED.updated_at
      `);

      // Update notification as signed
      await db
        .update(contractNotifications)
        .set({
          isSigned: true,
          signedAt: new Date(),
          isRead: true,
          readAt: new Date()
        })
        .where(
          and(
            eq(contractNotifications.contractId, contractId),
            eq(contractNotifications.customerId, customerId)
          )
        );

      // Log to contract history
      await db.execute(sql`
        INSERT INTO contract_history (
          contract_id,
          action,
          changed_by,
          reason,
          created_at
        ) VALUES (
          ${contractId},
          'SIGNED',
          ${customerId},
          'Contract signed by customer using KYC signature',
          ${new Date().toISOString()}
        )
      `);

      console.log(`[Contracts] Contract ${contractId} successfully signed by customer ${customerId}`);

      return reply.send({
        success: true,
        message: 'Contrat signé avec succès',
        contract: {
          id: contractId,
          status: 'ACTIVE',
          signedDate: new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error('[Contracts] Error signing contract:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to sign contract',
        message: process.env.NODE_ENV === 'production'
          ? 'Une erreur est survenue lors de la signature'
          : error.message
      });
    }
  });

  /**
   * GET /api/v1/contracts/notifications/unread-count
   * Get count of unread contract notifications
   */
  fastify.get('/contracts/notifications/unread-count', {
    preHandler: requireCustomerAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = (request as any).customerId;

    try {
      const [result] = await db
        .select({
          count: sql<number>`COUNT(*)::int`
        })
        .from(contractNotifications)
        .where(
          and(
            eq(contractNotifications.customerId, customerId),
            eq(contractNotifications.isRead, false),
            eq(contractNotifications.isSigned, false)
          )
        );

      return reply.send({
        success: true,
        unreadCount: result?.count || 0
      });

    } catch (error: any) {
      console.error('[Contracts] Error fetching unread count:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch unread count',
        unreadCount: 0
      });
    }
  });
}
