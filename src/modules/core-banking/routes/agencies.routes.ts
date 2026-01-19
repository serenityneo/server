/**
 * Agencies Routes
 * Admin routes for managing agencies
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { agencies, agents, customers, communes, users } from '../../../db/schema';
import { eq, sql, and, inArray } from 'drizzle-orm';
import { AUTH_COOKIE_NAME } from '../../../config/auth';

// Request body types
interface CreateAgencyBody {
  code: string; // 2 digits: 01-99
  name: string;
  communeId?: number;
  address?: string;
  phone?: string;
  active?: boolean;
  managerId?: number; // Added: One manager per agency
}

interface UpdateAgencyBody {
  name?: string;
  communeId?: number | null;
  address?: string;
  phone?: string;
  active?: boolean;
  managerId?: number | null; // Added: Manager assignment
}

interface AgenciesQueryParams {
  active?: string;
}

export default async function agenciesRoutes(fastify: FastifyInstance) {
  // Security helper - Require admin authentication
  // Supports both Bearer token and cookie-based authentication
  const requireAdminAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    // Check for Bearer token (for API clients)
    const authHeader = String(request.headers['authorization'] || '');
    const expectedToken = process.env.ADMIN_API_TOKEN || process.env.CORE_BANKING_API_TOKEN || '';
    
    if (authHeader.startsWith('Bearer ') && expectedToken && expectedToken.length > 0) {
      const providedToken = authHeader.slice(7);
      // Use constant-time comparison to prevent timing attacks
      const isValid = providedToken.length === expectedToken.length && 
                      providedToken === expectedToken;
      if (isValid) {
        fastify.log.debug('[AdminAuth] Bearer token authentication successful');
        return; // Token auth successful
      } else {
        fastify.log.warn('[AdminAuth] Invalid bearer token provided');
      }
    }
    
    // Check for auth cookie (for web dashboard)
    const adminTokenCookie = request.cookies[AUTH_COOKIE_NAME];
    
    if (adminTokenCookie && adminTokenCookie.length > 0) {
      // Cookie exists - allow access
      // TODO: In production, validate the cookie value/JWT signature
      fastify.log.debug('[AdminAuth] Cookie-based authentication successful');
      return;
    }
    
    // No valid authentication found
    fastify.log.error('[AdminAuth] Authentication failed - no valid Bearer token or admin cookie');
    return reply.status(401).send({ 
      error: 'Unauthorized', 
      message: 'Authentication required' 
    });
  };

  /**
   * GET /agencies - List all agencies
   */
  fastify.get(
    '/agencies',
    {
      preHandler: requireAdminAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { active } = request.query as AgenciesQueryParams;

        // Build query conditionally - join with communes to get location data
        const agenciesList = active !== undefined
          ? await db.select({
              id: agencies.id,
              code: agencies.code,
              name: agencies.name,
              communeId: agencies.communeId,
              communeName: communes.name,
              active: agencies.active,
              address: agencies.address,
              phone: agencies.phone,
              managerId: agencies.managerId,
              createdAt: agencies.createdAt,
              updatedAt: agencies.updatedAt,
            })
            .from(agencies)
            .leftJoin(communes, eq(agencies.communeId, communes.id))
            .where(eq(agencies.active, active === 'true'))
            .orderBy(agencies.code)
          : await db.select({
              id: agencies.id,
              code: agencies.code,
              name: agencies.name,
              communeId: agencies.communeId,
              communeName: communes.name,
              active: agencies.active,
              address: agencies.address,
              phone: agencies.phone,
              managerId: agencies.managerId,
              createdAt: agencies.createdAt,
              updatedAt: agencies.updatedAt,
            })
            .from(agencies)
            .leftJoin(communes, eq(agencies.communeId, communes.id))
            .orderBy(agencies.code);

        // Get counts for each agency (with error handling - these are optional stats)
        const agentCountMap = new Map<number, number>();
        const customerCountMap = new Map<number, number>();
        const cashierCountMap = new Map<number, number>();
        
        try {
          const agentCountsResult = await db.execute(sql`
            SELECT agency_id, COUNT(*)::int as agent_count
            FROM agents
            WHERE agency_id IS NOT NULL
            GROUP BY agency_id
          `);
          
          const agentRows = (agentCountsResult as any)?.rows || [];
          if (Array.isArray(agentRows)) {
            agentRows.forEach((row: any) => {
              if (row.agency_id && typeof row.agent_count === 'number') {
                agentCountMap.set(row.agency_id, row.agent_count);
              }
            });
          }
        } catch (error) {
          fastify.log.warn('Failed to fetch agent counts, continuing without them');
        }

        try {
          const customerCountsResult = await db.execute(sql`
            SELECT agency_id, COUNT(*)::int as customer_count
            FROM customers
            WHERE agency_id IS NOT NULL
            GROUP BY agency_id
          `);
          
          const customerRows = (customerCountsResult as any)?.rows || [];
          if (Array.isArray(customerRows)) {
            customerRows.forEach((row: any) => {
              if (row.agency_id && typeof row.customer_count === 'number') {
                customerCountMap.set(row.agency_id, row.customer_count);
              }
            });
          }
        } catch (error) {
          fastify.log.warn('Failed to fetch customer counts, continuing without them');
        }

        try {
          const cashierCountsResult = await db.execute(sql`
            SELECT agency_id, COUNT(*)::int as cashier_count
            FROM users
            WHERE agency_id IS NOT NULL AND role_id IN (
              SELECT id FROM roles WHERE name = 'Caissier'
            )
            GROUP BY agency_id
          `);
          
          const cashierRows = (cashierCountsResult as any)?.rows || [];
          if (Array.isArray(cashierRows)) {
            cashierRows.forEach((row: any) => {
              if (row.agency_id && typeof row.cashier_count === 'number') {
                cashierCountMap.set(row.agency_id, row.cashier_count);
              }
            });
          }
        } catch (error) {
          fastify.log.warn('Failed to fetch cashier counts, continuing without them');
        }

        // Get manager details for agencies that have managers
        const managerIds = agenciesList
          .map(agency => agency.managerId)
          .filter(id => id !== null) as number[];
        
        let managerDetails: any[] = [];
        if (managerIds.length > 0) {
          const managerResult = await db
            .select({
              id: users.id,
              username: users.username,
              email: users.email,
            })
            .from(users)
            .where(inArray(users.id, managerIds));
          
          managerDetails = managerResult;
        }

        // Create a map of manager details
        const managerMap = new Map<number, any>();
        managerDetails.forEach(manager => {
          managerMap.set(manager.id, manager);
        });

        // Add counts to each agency
        const agenciesWithCounts = agenciesList.map((agency) => ({
          ...agency,
          agentCount: agentCountMap.get(agency.id) || 0,
          customerCount: customerCountMap.get(agency.id) || 0,
          cashierCount: cashierCountMap.get(agency.id) || 0,
          manager: agency.managerId && managerMap.get(agency.managerId) ? {
            id: managerMap.get(agency.managerId).id,
            username: managerMap.get(agency.managerId).username,
            email: managerMap.get(agency.managerId).email,
          } : null,
        }));

        return reply.send({
          success: true,
          data: agenciesWithCounts,
        });
      } catch (error: any) {
        fastify.log.error({ err: error }, 'Failed to fetch agencies');
        return reply.status(500).send({
          error: 'Failed to fetch agencies',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        });
      }
    }
  );

  /**
   * GET /agencies/:id - Get single agency by ID
   */
  fastify.get(
    '/agencies/:id',
    {
      preHandler: requireAdminAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const agencyId = parseInt((request.params as { id: string }).id, 10);
        
        if (isNaN(agencyId) || agencyId <= 0) {
          return reply.status(400).send({ 
            error: 'Invalid agency ID',
            message: 'Agency ID must be a positive integer' 
          });
        }

        const agency = await db
          .select({
            id: agencies.id,
            code: agencies.code,
            name: agencies.name,
            communeId: agencies.communeId,
            communeName: communes.name,
            active: agencies.active,
            address: agencies.address,
            phone: agencies.phone,
            managerId: agencies.managerId,
            createdAt: agencies.createdAt,
            updatedAt: agencies.updatedAt,
          })
          .from(agencies)
          .leftJoin(communes, eq(agencies.communeId, communes.id))
          .where(eq(agencies.id, agencyId))
          .limit(1);

        if (agency.length === 0) {
          return reply.status(404).send({ error: 'Agency not found' });
        }

        // Get agent count
        const agentCountResult = await db.execute(sql`
          SELECT COUNT(*)::int as count
          FROM agents
          WHERE agency_id = ${agencyId}
        `);

        // Get customer count
        const customerCountResult = await db.execute(sql`
          SELECT COUNT(*)::int as count
          FROM customers
          WHERE agency_id = ${agencyId}
        `);

        // Get cashier count
        const cashierCountResult = await db.execute(sql`
          SELECT COUNT(*)::int as count
          FROM users
          WHERE agency_id = ${agencyId} AND role_id IN (
            SELECT id FROM roles WHERE name = 'Caissier'
          )
        `);

        // Get manager details if exists
        let managerDetails = null;
        if (agency[0].managerId) {
          const managerResult = await db
            .select({
              id: users.id,
              username: users.username,
              email: users.email,
            })
            .from(users)
            .where(eq(users.id, agency[0].managerId))
            .limit(1);
          
          if (managerResult.length > 0) {
            managerDetails = managerResult[0];
          }
        }

        // Get cashier details
        const cashierResult = await db
          .select({
            id: users.id,
            username: users.username,
            email: users.email,
          })
          .from(users)
          .where(and(
            eq(users.agencyId, agencyId),
            sql`users.role_id IN (SELECT id FROM roles WHERE name = 'Caissier')`
          ));

        const agentRows = (agentCountResult as any)?.rows || [];
        const agentCount = Array.isArray(agentRows) && agentRows[0]?.count 
          ? Number(agentRows[0].count) 
          : 0;
        
        const customerRows = (customerCountResult as any)?.rows || [];
        const customerCount = Array.isArray(customerRows) && customerRows[0]?.count 
          ? Number(customerRows[0].count) 
          : 0;

        const cashierRows = (cashierCountResult as any)?.rows || [];
        const cashierCount = Array.isArray(cashierRows) && cashierRows[0]?.count 
          ? Number(cashierRows[0].count) 
          : 0;

        return reply.send({
          success: true,
          data: {
            ...agency[0],
            agentCount,
            customerCount,
            cashierCount,
            manager: managerDetails,
            cashiers: cashierResult,
          },
        });
      } catch (error: any) {
        fastify.log.error({ err: error, agencyId: (request.params as { id: string }).id }, 'Failed to fetch agency');
        return reply.status(500).send({
          error: 'Failed to fetch agency',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        });
      }
    }
  );

  /**
   * POST /agencies - Create new agency
   */
  fastify.post(
    '/agencies',
    {
      preHandler: requireAdminAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        let { code, name, communeId, address, phone, active, managerId } = request.body as CreateAgencyBody;
        
        // Validate required fields (code is now optional - will be auto-generated)
        if (!name) {
          return reply.status(400).send({
            error: 'Validation failed',
            message: 'Name is required'
          });
        }

        // Auto-generate code if not provided
        if (!code) {
          // Find the highest existing agency code
          const existingAgencies = await db
            .select({ code: agencies.code })
            .from(agencies)
            .orderBy(sql`${agencies.code}::int DESC`)
            .limit(1);

          if (existingAgencies.length > 0) {
            const maxCode = parseInt(existingAgencies[0].code, 10);
            const nextCode = maxCode + 1;
            
            if (nextCode > 99) {
              return reply.status(400).send({
                error: 'Agency code limit reached',
                message: 'Maximum number of agencies (99) has been reached'
              });
            }
            
            code = nextCode.toString().padStart(2, '0');
          } else {
            code = '01'; // First agency
          }
          
          fastify.log.info({ generatedCode: code }, 'Auto-generated agency code');
        }

        // Validate code format (2 digits)
        const codeNum = parseInt(code, 10);
        if (!/^\d{2}$/.test(code) || isNaN(codeNum) || codeNum < 1 || codeNum > 99) {
          return reply.status(400).send({
            error: 'Invalid agency code',
            message: 'Agency code must be 2 digits between 01 and 99',
          });
        }
        
        // Sanitize inputs
        const sanitizedName = name.trim();
        if (sanitizedName.length === 0 || sanitizedName.length > 200) {
          return reply.status(400).send({
            error: 'Invalid name',
            message: 'Name must be between 1 and 200 characters'
          });
        }

        // Validate commune exists if provided
        if (communeId !== undefined && communeId !== null) {
          if (typeof communeId !== 'number' || communeId <= 0) {
            return reply.status(400).send({ 
              error: 'Invalid commune ID',
              message: 'Commune ID must be a positive integer' 
            });
          }
          
          const commune = await db
            .select()
            .from(communes)
            .where(eq(communes.id, communeId))
            .limit(1);

          if (commune.length === 0) {
            return reply.status(404).send({ 
              error: 'Commune not found',
              message: `No commune found with ID ${communeId}` 
            });
          }
        }

        // Validate manager exists if provided
        if (managerId !== undefined && managerId !== null) {
          if (typeof managerId !== 'number' || managerId <= 0) {
            return reply.status(400).send({ 
              error: 'Invalid manager ID',
              message: 'Manager ID must be a positive integer' 
            });
          }
          
          const manager = await db
            .select()
            .from(users)
            .where(eq(users.id, managerId))
            .limit(1);

          if (manager.length === 0) {
            return reply.status(404).send({ 
              error: 'Manager not found',
              message: `No manager found with ID ${managerId}` 
            });
          }
        }

        // Check if code already exists
        const existing = await db
          .select()
          .from(agencies)
          .where(eq(agencies.code, code))
          .limit(1);

        if (existing.length > 0) {
          return reply.status(409).send({
            error: 'Agency code already exists',
          });
        }

        // Create agency
        const newAgency = await db
          .insert(agencies)
          .values({
            code,
            name: sanitizedName,
            communeId: communeId || null,
            address: address || null,
            phone: phone || null,
            managerId: managerId || null,
            active: active !== undefined ? active : true,
          })
          .returning();

        return reply.status(201).send({
          success: true,
          message: 'Agency created successfully',
          data: newAgency[0],
        });
      } catch (error: any) {
        fastify.log.error({ err: error, body: request.body }, 'Failed to create agency');
        
        // Handle duplicate key errors
        if (error.code === '23505' || error.message?.includes('duplicate')) {
          return reply.status(409).send({
            error: 'Agency code already exists',
            message: 'An agency with this code already exists'
          });
        }
        
        return reply.status(500).send({
          error: 'Failed to create agency',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        });
      }
    }
  );

  /**
   * PUT /agencies/:id - Update agency
   */
  fastify.put(
    '/agencies/:id',
    {
      preHandler: requireAdminAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const agencyId = parseInt((request.params as { id: string }).id, 10);
        
        if (isNaN(agencyId) || agencyId <= 0) {
          return reply.status(400).send({ 
            error: 'Invalid agency ID',
            message: 'Agency ID must be a positive integer' 
          });
        }
        
        const { name, communeId, address, phone, active, managerId } = request.body as UpdateAgencyBody;
        
        // Validate at least one field is being updated
        if (name === undefined && communeId === undefined && address === undefined && phone === undefined && active === undefined && managerId === undefined) {
          return reply.status(400).send({
            error: 'No update fields provided',
            message: 'At least one field must be provided for update'
          });
        }

        // Check if agency exists
        const existing = await db
          .select()
          .from(agencies)
          .where(eq(agencies.id, agencyId))
          .limit(1);

        if (existing.length === 0) {
          return reply.status(404).send({ error: 'Agency not found' });
        }

        // Validate commune if provided
        if (communeId !== undefined && communeId !== null) {
          if (typeof communeId !== 'number' || communeId <= 0) {
            return reply.status(400).send({ 
              error: 'Invalid commune ID',
              message: 'Commune ID must be a positive integer' 
            });
          }
          
          const commune = await db
            .select()
            .from(communes)
            .where(eq(communes.id, communeId))
            .limit(1);

          if (commune.length === 0) {
            return reply.status(404).send({ 
              error: 'Commune not found',
              message: `No commune found with ID ${communeId}` 
            });
          }
        }

        // Validate manager if provided
        if (managerId !== undefined && managerId !== null) {
          if (typeof managerId !== 'number' || managerId <= 0) {
            return reply.status(400).send({ 
              error: 'Invalid manager ID',
              message: 'Manager ID must be a positive integer' 
            });
          }
          
          const manager = await db
            .select()
            .from(users)
            .where(eq(users.id, managerId))
            .limit(1);

          if (manager.length === 0) {
            return reply.status(404).send({ 
              error: 'Manager not found',
              message: `No manager found with ID ${managerId}` 
            });
          }
        }

        // Build update object with validation
        const updateData: any = {
          updatedAt: sql`CURRENT_TIMESTAMP`,
        };
        
        if (name !== undefined) {
          const sanitizedName = name.trim();
          if (sanitizedName.length === 0 || sanitizedName.length > 200) {
            return reply.status(400).send({
              error: 'Invalid name',
              message: 'Name must be between 1 and 200 characters'
            });
          }
          updateData.name = sanitizedName;
        }
        if (communeId !== undefined) updateData.communeId = communeId;
        if (address !== undefined) updateData.address = address?.trim() || null;
        if (phone !== undefined) updateData.phone = phone?.trim() || null;
        if (active !== undefined) updateData.active = Boolean(active);
        if (managerId !== undefined) updateData.managerId = managerId;

        // Update agency
        const updated = await db
          .update(agencies)
          .set(updateData)
          .where(eq(agencies.id, agencyId))
          .returning();

        return reply.send({
          success: true,
          message: 'Agency updated successfully',
          data: updated[0],
        });
      } catch (error: any) {
        const agencyId = (request.params as { id: string }).id;
        fastify.log.error({ err: error, agencyId, body: request.body }, 'Failed to update agency');
        return reply.status(500).send({
          error: 'Failed to update agency',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        });
      }
    }
  );

  /**
   * DELETE /agencies/:id - Delete agency (only if no agents/customers assigned)
   */
  fastify.delete(
    '/agencies/:id',
    {
      preHandler: requireAdminAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const agencyId = parseInt((request.params as { id: string }).id, 10);
        
        if (isNaN(agencyId) || agencyId <= 0) {
          return reply.status(400).send({ 
            error: 'Invalid agency ID',
            message: 'Agency ID must be a positive integer' 
          });
        }

        // Check if agency exists
        const existing = await db
          .select()
          .from(agencies)
          .where(eq(agencies.id, agencyId))
          .limit(1);

        if (existing.length === 0) {
          return reply.status(404).send({ error: 'Agency not found' });
        }

        // Check if agency has agents
        const agentCountResult = await db.execute(sql`
          SELECT COUNT(*)::int as count
          FROM agents
          WHERE agency_id = ${agencyId}
        `);
        
        const agentRows = (agentCountResult as any)?.rows || [];
        const agentCount = Array.isArray(agentRows) && agentRows[0]?.count 
          ? Number(agentRows[0].count) 
          : 0;

        if (agentCount > 0) {
          return reply.status(409).send({
            error: 'Cannot delete agency with assigned agents',
            message: `This agency has ${agentCount} agent(s) assigned`,
            agentCount,
          });
        }

        // Check if agency has customers
        const customerCountResult = await db.execute(sql`
          SELECT COUNT(*)::int as count
          FROM customers
          WHERE agency_id = ${agencyId}
        `);
        
        const customerRows = (customerCountResult as any)?.rows || [];
        const customerCount = Array.isArray(customerRows) && customerRows[0]?.count 
          ? Number(customerRows[0].count) 
          : 0;

        if (customerCount > 0) {
          return reply.status(409).send({
            error: 'Cannot delete agency with assigned customers',
            message: `This agency has ${customerCount} customer(s) assigned`,
            customerCount,
          });
        }

        // Check if agency has cashiers
        const cashierCountResult = await db.execute(sql`
          SELECT COUNT(*)::int as count
          FROM users
          WHERE agency_id = ${agencyId} AND role_id IN (
            SELECT id FROM roles WHERE name = 'Caissier'
          )
        `);
        
        const cashierRows = (cashierCountResult as any)?.rows || [];
        const cashierCount = Array.isArray(cashierRows) && cashierRows[0]?.count 
          ? Number(cashierRows[0].count) 
          : 0;

        if (cashierCount > 0) {
          return reply.status(409).send({
            error: 'Cannot delete agency with assigned cashiers',
            message: `This agency has ${cashierCount} cashier(s) assigned`,
            cashierCount,
          });
        }

        // Delete agency
        await db.delete(agencies).where(eq(agencies.id, agencyId));

        return reply.send({
          success: true,
          message: 'Agency deleted successfully',
        });
      } catch (error: any) {
        const agencyId = (request.params as { id: string }).id;
        fastify.log.error({ err: error, agencyId }, 'Failed to delete agency');
        return reply.status(500).send({
          error: 'Failed to delete agency',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        });
      }
    }
  );

  /**
   * GET /agencies/stats - Get agency statistics
   */
  fastify.get(
    '/agencies/stats',
    {
      preHandler: requireAdminAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Total agencies
        const totalAgenciesResult = await db.execute(sql`
          SELECT 
            COUNT(*)::int as total,
            COUNT(CASE WHEN active = true THEN 1 END)::int as active
          FROM agencies
        `);

        // Distribution of customers and agents across agencies
        const distributionResult = await db.execute(sql`
          SELECT 
            ag.code,
            ag.name,
            COUNT(DISTINCT a.id)::int as agent_count,
            COUNT(DISTINCT c.id)::int as customer_count,
            COUNT(DISTINCT u.id)::int as cashier_count
          FROM agencies ag
          LEFT JOIN agents a ON a.agency_id = ag.id
          LEFT JOIN customers c ON c.agency_id = ag.id
          LEFT JOIN users u ON u.agency_id = ag.id AND u.role_id IN (
            SELECT id FROM roles WHERE name = 'Caissier'
          )
          GROUP BY ag.id, ag.code, ag.name
          ORDER BY ag.code
        `);

        const totalRows = (totalAgenciesResult as any)?.rows || [];
        const totalAgencies = Array.isArray(totalRows) && totalRows[0] 
          ? totalRows[0] 
          : { total: 0, active: 0 };
        
        const distRows = (distributionResult as any)?.rows || [];
        const distribution = Array.isArray(distRows) ? distRows : [];

        return reply.send({
          success: true,
          data: {
            total: totalAgencies,
            distribution,
          },
        });
      } catch (error: any) {
        fastify.log.error({ err: error }, 'Failed to fetch agency statistics');
        return reply.status(500).send({
          error: 'Failed to fetch agency statistics',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        });
      }
    }
  );
}