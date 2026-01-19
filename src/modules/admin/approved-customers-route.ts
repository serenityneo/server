/**
 * Admin Approved Customers Route
 * Get all approved customers for contract creation
 * 
 * SECURITY: Requires admin authentication
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db';
import { customers } from '../../db/schema';
import { eq, and, ne, or } from 'drizzle-orm';
import { AUTH_COOKIE_NAME, extractUserIdFromCookie } from '../../config/auth';

// Security helper - Require admin authentication
const requireAdminAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = String(request.headers['authorization'] || '');
  const expectedToken = process.env.ADMIN_API_TOKEN || process.env.CORE_BANKING_API_TOKEN || '';
  
  if (authHeader.startsWith('Bearer ') && expectedToken) {
    const isValid = authHeader.slice(7) === expectedToken;
    if (isValid) {
      return;
    }
  }
  
  const adminTokenCookie = request.cookies[AUTH_COOKIE_NAME];
  
  if (adminTokenCookie) {
    const userId = extractUserIdFromCookie(adminTokenCookie);
    
    if (userId === null) {
      console.error('[AdminAuth] Invalid cookie format:', adminTokenCookie);
      return reply.status(401).send({ success: false, error: 'Session invalide' });
    }
    
    console.log('[AdminAuth] Cookie-based auth successful for userId:', userId);
    return;
  }
  
  console.error('[AdminAuth] No valid authentication');
  reply.status(401).send({ success: false, error: 'Authentication required' });
};

export async function registerApprovedCustomersRoute(fastify: FastifyInstance) {
  /**
   * GET /admin/customers/approved
   * Get all approved customers for contract creation
   * Includes: Members and Physical Partners ONLY
   * Excludes: Virtual Partners (system agents)
   * 
   * SECURITY: Protected by admin authentication
   */
  fastify.get('/admin/customers/approved', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Customers'],
      summary: 'Get approved customers for contracts',
      security: [{ apiKey: [] }, { cookieAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            customers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  customerType: { type: 'string' },
                  kycStatus: { type: 'string' },
                  displayName: { type: 'string' }
                }
              }
            },
            total: { type: 'number' }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('[Admin] Fetching approved customers for contracts');

      // Fetch all approved customers (KYC approved, active status)
      // Query for approved customers
      // Note: KYC status uses enum values, customer status uses enum ['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']
      const approvedCustomers = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          mobileMoneyNumber: customers.mobileMoneyNumber,
          customerType: customers.customerType,
          partnerLevel: customers.partnerLevel,
          kycStatus: customers.kycStatus,
          status: customers.status,
        })
        .from(customers)
        .where(
          and(
            // Accept multiple KYC verification levels as "approved"
            or(
              eq(customers.kycStatus, 'KYC1_VERIFIED' as any),
              eq(customers.kycStatus, 'KYC2_VERIFIED' as any),
              eq(customers.kycStatus, 'KYC3_VERIFIED' as any)
            ),
            // Only active customers (enum: PENDING, ACTIVE, SUSPENDED, CLOSED)
            eq(customers.status, 'ACTIVE' as any)
          )
        )
        .orderBy(customers.firstName, customers.lastName)
        .limit(1000);

      console.log(`[Admin] Found ${approvedCustomers.length} approved customers`);
      
      // ✅ For contracts, we ONLY accept:
      // 1. MEMBER customers (all members can sign contracts)
      // 2. PARTNER with partnerLevel = 'PHYSICAL' (physical partners only)
      // ❌ EXCLUDE: PARTNER with partnerLevel = 'VIRTUAL' (virtual agents cannot sign contracts)
      const filteredCustomers = approvedCustomers.filter((c: any) => {
        // Accept all MEMBER customers
        if (c.customerType === 'MEMBER') {
          return true;
        }
        // Accept only PHYSICAL partners (exclude VIRTUAL partners)
        if (c.customerType === 'PARTNER' && c.partnerLevel === 'PHYSICAL') {
          return true;
        }
        // Reject all others (VIRTUAL partners, etc.)
        return false;
      });
      
      // Log breakdown by type for debugging
      const breakdown = {
        MEMBER: filteredCustomers.filter((c: any) => c.customerType === 'MEMBER').length,
        PARTNER_PHYSICAL: filteredCustomers.filter((c: any) => c.customerType === 'PARTNER' && c.partnerLevel === 'PHYSICAL').length,
        EXCLUDED_VIRTUAL: approvedCustomers.filter((c: any) => c.customerType === 'PARTNER' && c.partnerLevel === 'VIRTUAL').length,
      };
      console.log('[Admin] Customer breakdown for contracts:', breakdown);
      console.log(`[Admin] Filtered to ${filteredCustomers.length} eligible customers (excluded ${breakdown.EXCLUDED_VIRTUAL} virtual partners)`);

      // Format customer data with clear type indication
      const formattedCustomers = filteredCustomers.map((customer: any) => {
        // Determine display type
        let displayType = customer.customerType || 'CUSTOMER';
        if (customer.customerType === 'PARTNER' && customer.partnerLevel === 'PHYSICAL') {
          displayType = 'PARTNER_PHYSIQUE';
        }
        
        return {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email || '',
          phone: customer.mobileMoneyNumber || '',
          customerType: displayType,
          kycStatus: customer.kycStatus,
          displayName: `${customer.firstName} ${customer.lastName} (${displayType}) - ${customer.email || customer.mobileMoneyNumber || 'N/A'}`,
        };
      });

      return {
        success: true,
        customers: formattedCustomers,
        total: formattedCustomers.length
      };
    } catch (error: any) {
      console.error('[Admin] Error fetching approved customers:', error);
      console.error('[Admin] Error stack:', error.stack);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch approved customers',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
}
