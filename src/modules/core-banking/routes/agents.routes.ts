/**
 * Agents Routes
 * Admin routes for managing agents (physical and virtual)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { customers, agencies, agents } from '../../../db/schema';
import { eq, sql, and } from 'drizzle-orm';
import { AUTH_COOKIE_NAME } from '../../../config/auth';

// Request body types
interface CreateAgentBody {
  code: string; // 5 digits: 00001-00199 (physical), 00200-99999 (virtual)
  type: 'PHYSICAL' | 'VIRTUAL';
  name: string;
  agencyId?: number; // Optional: physical agents can be assigned to agency
}

interface UpdateAgentBody {
  name?: string;
  agencyId?: number | null;
  isActive?: boolean;
}

interface AgentsQueryParams {
  type?: 'PHYSICAL' | 'VIRTUAL';
  agencyId?: string;
  isActive?: string;
}

export default async function agentsRoutes(fastify: FastifyInstance) {
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
   * GET /agents - List all agents with optional filters
   */
  fastify.get(
    '/agents',
    {
      preHandler: requireAdminAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { type, agencyId, isActive } = request.query as AgentsQueryParams;

        // Build query conditions - fetch virtual agents from customers table
        const conditions = [
          eq(customers.customerType, 'PARTNER'),
        ];
        
        if (type === 'VIRTUAL') {
          conditions.push(eq(customers.partnerLevel, 'VIRTUAL'));
        } else if (type === 'PHYSICAL') {
          conditions.push(eq(customers.partnerLevel, 'PHYSICAL'));
        }
        
        if (agencyId) {
          conditions.push(eq(customers.agencyId, parseInt(agencyId, 10)));
        }
        
        if (isActive !== undefined) {
          conditions.push(eq(customers.isActive, isActive === 'true'));
        }

        // Query virtual agents from customers table
        const agentsList = await db
          .select({
            id: customers.id,
            code: customers.partnerCode,
            type: customers.partnerLevel,
            name: sql<string>`CONCAT(${customers.firstName}, ' ', ${customers.lastName})`,
            agencyId: customers.agencyId,
            agencyName: agencies.name,
            agencyCode: agencies.code,
            isActive: customers.isActive,
            createdAt: customers.createdAt,
            updatedAt: customers.updatedAt,
          })
          .from(customers)
          .leftJoin(agencies, eq(customers.agencyId, agencies.id))
          .where(and(...conditions))
          .orderBy(customers.partnerCode);

        return reply.send({
          success: true,
          data: agentsList,
        });
      } catch (error: any) {
        fastify.log.error({ err: error }, 'Failed to fetch agents');
        return reply.status(500).send({
          error: 'Failed to fetch agents',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        });
      }
    }
  );

  /**
   * GET /agents/:id - Get single agent by ID
   */
  fastify.get(
    '/agents/:id',
    {
      preHandler: requireAdminAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const agentId = parseInt((request.params as { id: string }).id, 10);
        
        if (isNaN(agentId) || agentId <= 0) {
          return reply.status(400).send({ 
            error: 'Invalid agent ID',
            message: 'Agent ID must be a positive integer' 
          });
        }

        const agent = await db
          .select({
            id: agents.id,
            code: agents.code,
            type: agents.type,
            name: agents.name,
            agencyId: agents.agencyId,
            agencyName: agencies.name,
            agencyCode: agencies.code,
            isActive: agents.isActive,
            createdAt: agents.createdAt,
            updatedAt: agents.updatedAt,
          })
          .from(agents)
          .leftJoin(agencies, eq(agents.agencyId, agencies.id))
          .where(eq(agents.id, agentId))
          .limit(1);

        if (agent.length === 0) {
          return reply.status(404).send({ error: 'Agent not found' });
        }

        // Get customer count
        const customerCountResult = await db.execute(sql`
          SELECT COUNT(*)::int as count
          FROM customers
          WHERE agent_id = ${agentId}
        `);

        const customerRows = (customerCountResult as any)?.rows || [];
        const customerCount = Array.isArray(customerRows) && customerRows[0]?.count 
          ? Number(customerRows[0].count) 
          : 0;

        return reply.send({
          success: true,
          data: {
            ...agent[0],
            customerCount,
          },
        });
      } catch (error: any) {
        fastify.log.error({ err: error, agentId: (request.params as { id: string }).id }, 'Failed to fetch agent');
        return reply.status(500).send({
          error: 'Failed to fetch agent',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        });
      }
    }
  );

  /**
   * POST /agents - Create new agent
   */
  fastify.post(
    '/agents',
    {
      preHandler: requireAdminAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        let { code, type, name, agencyId } = request.body as CreateAgentBody;
        
        // Validate required fields (code is now optional - will be auto-generated)
        if (!type) {
          return reply.status(400).send({
            error: 'Validation failed',
            message: 'Type is required'
          });
        }
        
        // Validate type
        if (type !== 'PHYSICAL' && type !== 'VIRTUAL') {
          return reply.status(400).send({
            error: 'Invalid agent type',
            message: 'Agent type must be either PHYSICAL or VIRTUAL'
          });
        }

        // Auto-generate code if not provided
        if (!code) {
          // Find the highest existing agent code of the same type
          let startRange, endRange;
          if (type === 'PHYSICAL') {
            startRange = 1;
            endRange = 199;
          } else {
            startRange = 200;
            endRange = 99999;
          }

          // Get existing codes in the range for this type
          const existingAgents = await db
            .select({ code: agents.code })
            .from(agents)
            .where(eq(agents.type, type))
            .orderBy(sql`${agents.code}::int DESC`)
            .limit(1);

          if (existingAgents.length > 0) {
            const maxCode = parseInt(existingAgents[0].code, 10);
            const nextCode = maxCode + 1;
            
            if (nextCode > endRange) {
              return reply.status(400).send({
                error: 'Agent code limit reached',
                message: `Maximum number of ${type.toLowerCase()} agents has been reached`
              });
            }
            
            code = nextCode.toString().padStart(5, '0');
          } else {
            // First agent of this type
            code = startRange.toString().padStart(5, '0');
          }
          
          fastify.log.info({ generatedCode: code, type }, 'Auto-generated agent code');
        }

        // Validate code format (5 digits)
        const codeNum = parseInt(code, 10);
        if (!/^\d{5}$/.test(code) || isNaN(codeNum)) {
          return reply.status(400).send({
            error: 'Invalid agent code',
            message: 'Agent code must be exactly 5 digits (00001-99999)',
          });
        }

        // Validate code range based on type
        if (type === 'PHYSICAL' && (codeNum < 1 || codeNum > 199)) {
          return reply.status(400).send({
            error: 'Invalid physical agent code',
            message: 'Physical agent codes must be between 00001 and 00199',
          });
        }
        if (type === 'VIRTUAL' && (codeNum < 200 || codeNum > 99999)) {
          return reply.status(400).send({
            error: 'Invalid virtual agent code',
            message: 'Virtual agent codes must be between 00200 and 99999',
          });
        }
        
        // Enforce naming rules based on agent type
        let finalName: string;
        
        if (type === 'VIRTUAL') {
          // Virtual agents are always named 'nityBot' regardless of input
          finalName = 'nityBot';
          fastify.log.info({ code, inputName: name }, 'Virtual agent created with auto-assigned name: nityBot');
        } else {
          // Physical agents must have a valid human name
          if (!name) {
            return reply.status(400).send({
              error: 'Validation failed',
              message: 'Name is required for physical agents'
            });
          }
          
          const sanitizedName = name.trim();
          
          // Validate name length
          if (sanitizedName.length === 0 || sanitizedName.length > 200) {
            return reply.status(400).send({
              error: 'Invalid name',
              message: 'Name must be between 1 and 200 characters'
            });
          }
          
          // Validate human name format (letters, spaces, hyphens, apostrophes)
          const nameRegex = /^[a-zA-ZÀ-ÿ\s'-]+$/;
          if (!nameRegex.test(sanitizedName)) {
            return reply.status(400).send({
              error: 'Invalid name format',
              message: 'Physical agent names must contain only letters, spaces, hyphens, and apostrophes'
            });
          }
          
          // Validate minimum word count (at least first name)
          const words = sanitizedName.split(/\s+/).filter(w => w.length > 0);
          if (words.length < 1) {
            return reply.status(400).send({
              error: 'Invalid name',
              message: 'Please provide at least a first name'
            });
          }
          
          finalName = sanitizedName;
        }

        // Check if code already exists
        const existing = await db
          .select()
          .from(agents)
          .where(eq(agents.code, code))
          .limit(1);

        if (existing.length > 0) {
          return reply.status(409).send({
            error: 'Agent code already exists',
          });
        }

        // Validate agency exists if provided
        if (agencyId !== undefined && agencyId !== null) {
          if (typeof agencyId !== 'number' || agencyId <= 0) {
            return reply.status(400).send({ 
              error: 'Invalid agency ID',
              message: 'Agency ID must be a positive integer' 
            });
          }
          
          const agency = await db
            .select()
            .from(agencies)
            .where(eq(agencies.id, agencyId))
            .limit(1);

          if (agency.length === 0) {
            return reply.status(404).send({ 
              error: 'Agency not found',
              message: `No agency found with ID ${agencyId}` 
            });
          }
        }

        // Create agent
        const newAgent = await db
          .insert(agents)
          .values({
            code,
            type,
            name: finalName,
            agencyId: agencyId || null,
            isActive: true,
          })
          .returning();

        return reply.status(201).send({
          success: true,
          message: 'Agent created successfully',
          data: newAgent[0],
        });
      } catch (error: any) {
        fastify.log.error({ err: error, body: request.body }, 'Failed to create agent');
        
        // Handle duplicate key errors
        if (error.code === '23505' || error.message?.includes('duplicate')) {
          return reply.status(409).send({
            error: 'Agent code already exists',
            message: 'An agent with this code already exists'
          });
        }
        
        return reply.status(500).send({
          error: 'Failed to create agent',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        });
      }
    }
  );

  /**
   * PUT /agents/:id - Update agent
   */
  fastify.put(
    '/agents/:id',
    {
      preHandler: requireAdminAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const agentId = parseInt((request.params as { id: string }).id, 10);
        
        if (isNaN(agentId) || agentId <= 0) {
          return reply.status(400).send({ 
            error: 'Invalid agent ID',
            message: 'Agent ID must be a positive integer' 
          });
        }
        
        const { name, agencyId, isActive } = request.body as UpdateAgentBody;
        
        // Validate at least one field is being updated
        if (name === undefined && agencyId === undefined && isActive === undefined) {
          return reply.status(400).send({
            error: 'No update fields provided',
            message: 'At least one field must be provided for update'
          });
        }

        // Check if agent exists
        const existing = await db
          .select()
          .from(agents)
          .where(eq(agents.id, agentId))
          .limit(1);

        if (existing.length === 0) {
          return reply.status(404).send({ error: 'Agent not found' });
        }

        // Validate agency if provided
        if (agencyId !== undefined && agencyId !== null) {
          if (typeof agencyId !== 'number' || agencyId <= 0) {
            return reply.status(400).send({ 
              error: 'Invalid agency ID',
              message: 'Agency ID must be a positive integer' 
            });
          }
          
          const agency = await db
            .select()
            .from(agencies)
            .where(eq(agencies.id, agencyId))
            .limit(1);

          if (agency.length === 0) {
            return reply.status(404).send({ 
              error: 'Agency not found',
              message: `No agency found with ID ${agencyId}` 
            });
          }
        }

        // Build update object with validation
        const updateData: any = {
          updatedAt: sql`CURRENT_TIMESTAMP`,
        };
        
        if (name !== undefined) {
          // Get the current agent to check its type
          const currentAgent = existing[0];
          
          if (currentAgent.type === 'VIRTUAL') {
            // Virtual agents cannot have their name changed - it's always 'nityBot'
            return reply.status(400).send({
              error: 'Cannot update name',
              message: 'Virtual agent names are fixed as "nityBot" and cannot be modified'
            });
          }
          
          // For physical agents, validate the new name
          const sanitizedName = name.trim();
          if (sanitizedName.length === 0 || sanitizedName.length > 200) {
            return reply.status(400).send({
              error: 'Invalid name',
              message: 'Name must be between 1 and 200 characters'
            });
          }
          
          // Validate human name format
          const nameRegex = /^[a-zA-ZÀ-ÿ\s'-]+$/;
          if (!nameRegex.test(sanitizedName)) {
            return reply.status(400).send({
              error: 'Invalid name format',
              message: 'Physical agent names must contain only letters, spaces, hyphens, and apostrophes'
            });
          }
          
          // Validate minimum word count
          const words = sanitizedName.split(/\s+/).filter(w => w.length > 0);
          if (words.length < 1) {
            return reply.status(400).send({
              error: 'Invalid name',
              message: 'Please provide at least a first name'
            });
          }
          
          updateData.name = sanitizedName;
        }
        if (agencyId !== undefined) updateData.agencyId = agencyId;
        if (isActive !== undefined) updateData.isActive = Boolean(isActive);

        // Update agent
        const updated = await db
          .update(agents)
          .set(updateData)
          .where(eq(agents.id, agentId))
          .returning();

        return reply.send({
          success: true,
          message: 'Agent updated successfully',
          data: updated[0],
        });
      } catch (error: any) {
        const agentId = (request.params as { id: string }).id;
        fastify.log.error({ err: error, agentId, body: request.body }, 'Failed to update agent');
        return reply.status(500).send({
          error: 'Failed to update agent',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        });
      }
    }
  );

  /**
   * DELETE /agents/:id - Delete agent (only if no customers assigned)
   */
  fastify.delete(
    '/agents/:id',
    {
      preHandler: requireAdminAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const agentId = parseInt((request.params as { id: string }).id, 10);
        
        if (isNaN(agentId) || agentId <= 0) {
          return reply.status(400).send({ 
            error: 'Invalid agent ID',
            message: 'Agent ID must be a positive integer' 
          });
        }

        // Check if agent exists
        const existing = await db
          .select()
          .from(agents)
          .where(eq(agents.id, agentId))
          .limit(1);

        if (existing.length === 0) {
          return reply.status(404).send({ error: 'Agent not found' });
        }

        // Check if agent has customers
        const customerCountResult = await db.execute(sql`
          SELECT COUNT(*)::int as count
          FROM customers
          WHERE agent_id = ${agentId}
        `);

        const customerRows = (customerCountResult as any)?.rows || [];
        const customerCount = Array.isArray(customerRows) && customerRows[0]?.count 
          ? Number(customerRows[0].count) 
          : 0;

        if (customerCount > 0) {
          return reply.status(409).send({
            error: 'Cannot delete agent with assigned customers',
            message: `This agent has ${customerCount} customer(s) assigned`,
            customerCount,
          });
        }

        // Delete agent
        await db.delete(agents).where(eq(agents.id, agentId));

        return reply.send({
          success: true,
          message: 'Agent deleted successfully',
        });
      } catch (error: any) {
        const agentId = (request.params as { id: string }).id;
        fastify.log.error({ err: error, agentId }, 'Failed to delete agent');
        return reply.status(500).send({
          error: 'Failed to delete agent',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        });
      }
    }
  );

  /**
   * GET /agents/stats - Get agent statistics
   */
  fastify.get(
    '/agents/stats',
    {
      preHandler: requireAdminAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Count by type
        const typeCountsResult = await db.execute(sql`
          SELECT 
            type,
            COUNT(*)::int as count,
            COUNT(CASE WHEN is_active = true THEN 1 END)::int as active_count
          FROM agents
          GROUP BY type
        `);

        // Total customers per agent type
        const customerCountsResult = await db.execute(sql`
          SELECT 
            a.type,
            COUNT(c.id)::int as customer_count
          FROM agents a
          LEFT JOIN customers c ON c.agent_id = a.id
          GROUP BY a.type
        `);

        const typeRows = (typeCountsResult as any)?.rows || [];
        const typeCounts = Array.isArray(typeRows) ? typeRows : [];
        
        const customerRows = (customerCountsResult as any)?.rows || [];
        const customerCounts = Array.isArray(customerRows) ? customerRows : [];

        return reply.send({
          success: true,
          data: {
            byType: typeCounts,
            customersByType: customerCounts,
          },
        });
      } catch (error: any) {
        fastify.log.error({ err: error }, 'Failed to fetch agent statistics');
        return reply.status(500).send({
          error: 'Failed to fetch agent statistics',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        });
      }
    }
  );
}
