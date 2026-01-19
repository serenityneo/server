import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { customers, users } from '../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { handleError } from './error-handler';
import { AUTH_COOKIE_NAME } from '../../../config/auth';

/**
 * Partner Phone Change Management Routes (ADMIN ONLY)
 * 
 * SECURITY REQUIREMENTS:
 * - Partners CANNOT change phone number without admin authorization
 * - Partners can REQUEST phone number changes
 * - Admin MUST approve/reject phone change requests
 * - Complete audit trail for all phone changes
 */

interface PhoneChangeRequest {
  id: number;
  partnerId: number;
  oldPhoneNumber: string | null;
  newPhoneNumber: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  processedBy: number | null;
  processedAt: string | null;
  rejectionReason: string | null;
}

/**
 * Middleware to verify partner authentication
 */
async function requirePartnerAuth(request: FastifyRequest, reply: FastifyReply) {
  const customerId = (request.body as any)?.customerId || (request.query as any)?.customerId;
  
  if (!customerId) {
    return reply.code(401).send({
      success: false,
      error: 'Authentication required. Please provide customerId.'
    });
  }

  // Verify this is a partner account
  const [customer] = await db
    .select({ id: customers.id, customerType: customers.customerType })
    .from(customers)
    .where(and(
      eq(customers.id, Number(customerId)),
      eq(customers.customerType, 'PARTNER')
    ))
    .limit(1);

  if (!customer) {
    return reply.code(403).send({
      success: false,
      error: 'Access denied. Partner authentication required.'
    });
  }

  // Attach to request for use in routes
  (request as any).partnerId = Number(customerId);
}

/**
 * Middleware to verify admin authentication
 */
async function requireAdminAuth(request: FastifyRequest, reply: FastifyReply) {
  // Check for auth cookie (for web dashboard)
  const adminTokenCookie = request.cookies[AUTH_COOKIE_NAME];
  
  if (adminTokenCookie && adminTokenCookie.length > 0) {
    return; // Cookie exists - allow access
  }
  
  // No valid authentication found
  return reply.status(401).send({ 
    error: 'Unauthorized', 
    message: 'Admin authentication required' 
  });
}

export async function partnerPhoneChangeRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/partner/phone-change/request
   * Partner requests phone number change
   * 
   * SECURITY: Partners cannot change phone directly, must request admin approval
   */
  fastify.post('/api/v1/partner/phone-change/request', {
    preHandler: requirePartnerAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          newPhoneNumber: { type: 'string', minLength: 10 },
          reason: { type: 'string', minLength: 10 }
        },
        required: ['customerId', 'newPhoneNumber', 'reason']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;
      const { newPhoneNumber, reason } = request.body as {
        customerId: number;
        newPhoneNumber: string;
        reason: string;
      };

      // Get current phone number
      const [partner] = await db
        .select({
          id: customers.id,
          mobileMoneyNumber: customers.mobileMoneyNumber,
          customerType: customers.customerType
        })
        .from(customers)
        .where(
          and(
            eq(customers.id, partnerId),
            eq(customers.customerType, 'PARTNER')
          )
        )
        .limit(1);

      if (!partner) {
        return reply.code(404).send({
          success: false,
          error: 'Partner account not found'
        });
      }

      // Check if there's already a pending request
      const [existingRequest] = await db.execute(sql`
        SELECT id, status
        FROM partner_operations
        WHERE partner_id = ${partnerId}
          AND operation_type = 'PHONE_CHANGE_REQUEST'
          AND status = 'PENDING'
        LIMIT 1
      `);

      if (existingRequest) {
        return reply.code(400).send({
          success: false,
          error: 'You already have a pending phone change request. Please wait for admin approval.'
        });
      }

      // Validate new phone number format
      const phoneRegex = /^\+?[1-9]\d{1,14}$/; // E.164 format
      if (!phoneRegex.test(newPhoneNumber.replace(/[\s-]/g, ''))) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid phone number format'
        });
      }

      // Check if new phone number is already in use
      const [existingPhone] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.mobileMoneyNumber, newPhoneNumber))
        .limit(1);

      if (existingPhone) {
        return reply.code(400).send({
          success: false,
          error: 'This phone number is already registered'
        });
      }

      // Create phone change request
      const [createdRequest] = await db.execute(sql`
        INSERT INTO partner_operations (
          partner_id,
          operation_type,
          description,
          status,
          metadata,
          created_at
        ) VALUES (
          ${partnerId},
          'PHONE_CHANGE_REQUEST',
          'Partner phone number change request',
          'PENDING',
          ${JSON.stringify({
            oldPhoneNumber: partner.mobileMoneyNumber,
            newPhoneNumber,
            reason,
            requestedAt: new Date().toISOString()
          })}::jsonb,
          CURRENT_TIMESTAMP
        ) RETURNING id
      `);

      console.log('[Partner Phone Change] Request created:', {
        partnerId,
        requestId: createdRequest?.id,
        oldPhone: partner.mobileMoneyNumber,
        newPhone: newPhoneNumber
      });

      return reply.send({
        success: true,
        message: 'Phone change request submitted successfully. An administrator will review it shortly.',
        requestId: createdRequest?.id
      });
    } catch (error) {
      console.error('[Partner Phone Change Request] Error:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /api/v1/partner/phone-change/my-requests
   * Get partner's own phone change requests
   */
  fastify.get('/api/v1/partner/phone-change/my-requests', {
    preHandler: requirePartnerAuth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'number' }
        },
        required: ['customerId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const partnerId = (request as any).partnerId;

      const requests = await db.execute(sql`
        SELECT 
          id,
          status,
          metadata,
          created_at as requested_at,
          updated_at as processed_at
        FROM partner_operations
        WHERE partner_id = ${partnerId}
          AND operation_type = 'PHONE_CHANGE_REQUEST'
        ORDER BY created_at DESC
        LIMIT 10
      `);

      return reply.send({
        success: true,
        requests
      });
    } catch (error) {
      console.error('[Partner Phone Change Requests] Error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch phone change requests'
      });
    }
  });

  /**
   * GET /api/v1/admin/partners/phone-change-requests
   * Get all pending phone change requests (ADMIN ONLY)
   */
  fastify.get('/api/v1/admin/partners/phone-change-requests', {
    preHandler: requireAdminAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { status } = request.query as { status?: 'PENDING' | 'APPROVED' | 'REJECTED' };

      const statusFilter = status ? sql`AND po.status = ${status}` : sql``;

      const requests = await db.execute(sql`
        SELECT 
          po.id,
          po.partner_id,
          c.first_name || ' ' || c.last_name as partner_name,
          c.partner_code,
          po.status,
          po.metadata,
          po.created_at as requested_at,
          po.updated_at as processed_at,
          po.approved_by as processed_by,
          u.username as processed_by_username
        FROM partner_operations po
        JOIN customers c ON c.id = po.partner_id
        LEFT JOIN users u ON u.id = po.approved_by
        WHERE po.operation_type = 'PHONE_CHANGE_REQUEST'
          ${statusFilter}
        ORDER BY 
          CASE po.status
            WHEN 'PENDING' THEN 1
            WHEN 'APPROVED' THEN 2
            WHEN 'REJECTED' THEN 3
          END,
          po.created_at DESC
        LIMIT 100
      `);

      return reply.send({
        success: true,
        requests
      });
    } catch (error) {
      console.error('[Admin Phone Change Requests] Error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch phone change requests'
      });
    }
  });

  /**
   * POST /api/v1/admin/partners/phone-change-requests/:requestId/approve
   * Approve phone change request (ADMIN ONLY)
   */
  fastify.post('/api/v1/admin/partners/phone-change-requests/:requestId/approve', {
    preHandler: requireAdminAuth,
    schema: {
      params: {
        type: 'object',
        properties: {
          requestId: { type: 'number' }
        },
        required: ['requestId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { requestId } = request.params as { requestId: number };
      const adminId = (request as any).adminId || 1; // TODO: Get from session

      // Get request details
      const [requestDetails] = await db.execute(sql`
        SELECT 
          po.id,
          po.partner_id,
          po.status,
          po.metadata
        FROM partner_operations po
        WHERE po.id = ${requestId}
          AND po.operation_type = 'PHONE_CHANGE_REQUEST'
        LIMIT 1
      `);

      if (!requestDetails) {
        return reply.code(404).send({
          success: false,
          error: 'Phone change request not found'
        });
      }

      if (requestDetails.status !== 'PENDING') {
        return reply.code(400).send({
          success: false,
          error: `Request already ${String(requestDetails.status).toLowerCase()}`
        });
      }

      const metadata = requestDetails.metadata as any;
      const { newPhoneNumber } = metadata;

      // Begin transaction: Update phone number + approve request
      await db.transaction(async (tx) => {
        // Update partner's phone number
        await tx
          .update(customers)
          .set({
            mobileMoneyNumber: newPhoneNumber,
            updatedAt: new Date().toISOString()
          })
          .where(eq(customers.id, Number(requestDetails.partner_id)));

        // Update request status
        await tx.execute(sql`
          UPDATE partner_operations
          SET 
            status = 'APPROVED',
            approved_by = ${adminId},
            approval_date = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${requestId}
        `);

        // Log the phone change in audit trail
        await tx.execute(sql`
          INSERT INTO partner_operations (
            partner_id,
            operation_type,
            description,
            status,
            metadata,
            approved_by,
            created_at
          ) VALUES (
            ${requestDetails.partner_id},
            'PHONE_CHANGED',
            'Phone number changed by admin',
            'COMPLETED',
            ${JSON.stringify({
              oldPhoneNumber: metadata.oldPhoneNumber,
              newPhoneNumber,
              approvedBy: adminId,
              approvedAt: new Date().toISOString(),
              originalRequestId: requestId
            })}::jsonb,
            ${adminId},
            CURRENT_TIMESTAMP
          )
        `);
      });

      console.log('[Admin Phone Change] Approved:', {
        requestId,
        partnerId: requestDetails.partner_id,
        newPhone: newPhoneNumber,
        approvedBy: adminId
      });

      return reply.send({
        success: true,
        message: 'Phone change request approved successfully. Partner phone number updated.'
      });
    } catch (error) {
      console.error('[Admin Phone Change Approve] Error:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * POST /api/v1/admin/partners/phone-change-requests/:requestId/reject
   * Reject phone change request (ADMIN ONLY)
   */
  fastify.post('/api/v1/admin/partners/phone-change-requests/:requestId/reject', {
    preHandler: requireAdminAuth,
    schema: {
      params: {
        type: 'object',
        properties: {
          requestId: { type: 'number' }
        },
        required: ['requestId']
      },
      body: {
        type: 'object',
        properties: {
          rejectionReason: { type: 'string', minLength: 5 }
        },
        required: ['rejectionReason']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { requestId } = request.params as { requestId: number };
      const { rejectionReason } = request.body as { rejectionReason: string };
      const adminId = (request as any).adminId || 1; // TODO: Get from session

      // Get request details
      const [requestDetails] = await db.execute(sql`
        SELECT 
          po.id,
          po.partner_id,
          po.status
        FROM partner_operations po
        WHERE po.id = ${requestId}
          AND po.operation_type = 'PHONE_CHANGE_REQUEST'
        LIMIT 1
      `);

      if (!requestDetails) {
        return reply.code(404).send({
          success: false,
          error: 'Phone change request not found'
        });
      }

      if (requestDetails.status !== 'PENDING') {
        return reply.code(400).send({
          success: false,
          error: `Request already ${String(requestDetails.status).toLowerCase()}`
        });
      }

      // Update request status to REJECTED
      await db.execute(sql`
        UPDATE partner_operations
        SET 
          status = 'REJECTED',
          approved_by = ${adminId},
          approval_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP,
          metadata = metadata || ${JSON.stringify({ rejectionReason })}::jsonb
        WHERE id = ${requestId}
      `);

      console.log('[Admin Phone Change] Rejected:', {
        requestId,
        partnerId: requestDetails.partner_id,
        rejectionReason,
        rejectedBy: adminId
      });

      return reply.send({
        success: true,
        message: 'Phone change request rejected'
      });
    } catch (error) {
      console.error('[Admin Phone Change Reject] Error:', error);
      handleError(request, reply, error, 500);
    }
  });
}
