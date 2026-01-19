/**
 * Admin Contract Types Routes
 * Dynamic contract type management with CRUD operations
 * 
 * SECURITY: All routes require admin authentication
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
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

export async function registerContractTypesRoutes(fastify: FastifyInstance) {
  
  /**
   * GET /admin/contract-types
   * Get all contract types (active and inactive)
   */
  fastify.get('/admin/contract-types', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Contract Types'],
      summary: 'Get all contract types',
      querystring: {
        type: 'object',
        properties: {
          activeOnly: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { activeOnly } = request.query as { activeOnly?: boolean };
      
      console.log('[Admin] Fetching contract types, activeOnly:', activeOnly);
      
      let query = sql`
        SELECT 
          id, code, label, label_en, category, description,
          requires_amount, requires_interest_rate, requires_end_date,
          allows_auto_renewal, default_currency, default_duration_days,
          terms_template, display_order, icon, color, is_active,
          created_at, updated_at
        FROM contract_types
      `;
      
      if (activeOnly) {
        query = sql`
          SELECT 
            id, code, label, label_en, category, description,
            requires_amount, requires_interest_rate, requires_end_date,
            allows_auto_renewal, default_currency, default_duration_days,
            terms_template, display_order, icon, color, is_active,
            created_at, updated_at
          FROM contract_types
          WHERE is_active = true
        `;
      }
      
      query = sql`${query} ORDER BY display_order ASC, label ASC`;
      
      const contractTypes = await db.execute(query) as any[];
      
      console.log(`[Admin] Found ${contractTypes.length} contract types`);
      
      return {
        success: true,
        contractTypes,
        total: contractTypes.length
      };
    } catch (error: any) {
      console.error('[Admin] Error fetching contract types:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch contract types',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * GET /admin/contract-types/:id
   * Get a specific contract type by ID
   */
  fastify.get('/admin/contract-types/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Contract Types'],
      summary: 'Get contract type by ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      
      const result = await db.execute(sql`
        SELECT 
          id, code, label, label_en, category, description,
          requires_amount, requires_interest_rate, requires_end_date,
          allows_auto_renewal, default_currency, default_duration_days,
          terms_template, display_order, icon, color, is_active,
          created_at, updated_at
        FROM contract_types
        WHERE id = ${id}
      `) as any[];
      
      if (!result || result.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Contract type not found'
        });
      }
      
      return {
        success: true,
        contractType: result[0]
      };
    } catch (error: any) {
      console.error('[Admin] Error fetching contract type:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch contract type',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * POST /admin/contract-types
   * Create a new contract type
   */
  fastify.post('/admin/contract-types', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Contract Types'],
      summary: 'Create new contract type',
      body: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          label: { type: 'string' },
          labelEn: { type: 'string' },
          category: { type: 'string' },
          description: { type: 'string' },
          requiresAmount: { type: 'boolean' },
          requiresInterestRate: { type: 'boolean' },
          requiresEndDate: { type: 'boolean' },
          allowsAutoRenewal: { type: 'boolean' },
          defaultCurrency: { type: 'string', enum: ['CDF', 'USD'] },
          defaultDurationDays: { type: 'number' },
          termsTemplate: { type: 'string' },
          displayOrder: { type: 'number' },
          icon: { type: 'string' },
          color: { type: 'string' },
          isActive: { type: 'boolean' }
        },
        required: ['code', 'label', 'category']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request.body as any;
      
      console.log('[Admin] Creating new contract type:', data.code);
      
      const result = await db.execute(sql`
        INSERT INTO contract_types (
          code, label, label_en, category, description,
          requires_amount, requires_interest_rate, requires_end_date,
          allows_auto_renewal, default_currency, default_duration_days,
          terms_template, display_order, icon, color, is_active
        ) VALUES (
          ${data.code}, ${data.label}, ${data.labelEn || null}, ${data.category}, ${data.description || null},
          ${data.requiresAmount || false}, ${data.requiresInterestRate || false}, ${data.requiresEndDate || false},
          ${data.allowsAutoRenewal !== false}, ${data.defaultCurrency || 'CDF'}, ${data.defaultDurationDays || null},
          ${data.termsTemplate || null}, ${data.displayOrder || 0}, ${data.icon || null}, ${data.color || null}, ${data.isActive !== false}
        )
        RETURNING *
      `) as any[];
      
      console.log('[Admin] Contract type created successfully');
      
      return {
        success: true,
        contractType: result[0],
        message: 'Contract type created successfully'
      };
    } catch (error: any) {
      console.error('[Admin] Error creating contract type:', error);
      
      if (error.code === '23505') {
        return reply.status(409).send({
          success: false,
          error: 'Contract type with this code already exists'
        });
      }
      
      return reply.status(500).send({
        success: false,
        error: 'Failed to create contract type',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * PUT /admin/contract-types/:id
   * Update an existing contract type
   */
  fastify.put('/admin/contract-types/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Contract Types'],
      summary: 'Update contract type',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          labelEn: { type: 'string' },
          category: { type: 'string' },
          description: { type: 'string' },
          requiresAmount: { type: 'boolean' },
          requiresInterestRate: { type: 'boolean' },
          requiresEndDate: { type: 'boolean' },
          allowsAutoRenewal: { type: 'boolean' },
          defaultCurrency: { type: 'string', enum: ['CDF', 'USD'] },
          defaultDurationDays: { type: 'number' },
          termsTemplate: { type: 'string' },
          displayOrder: { type: 'number' },
          icon: { type: 'string' },
          color: { type: 'string' },
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const data = request.body as any;
      
      console.log('[Admin] Updating contract type ID:', id);
      
      const result = await db.execute(sql`
        UPDATE contract_types
        SET 
          label = COALESCE(${data.label}, label),
          label_en = COALESCE(${data.labelEn}, label_en),
          category = COALESCE(${data.category}, category),
          description = COALESCE(${data.description}, description),
          requires_amount = COALESCE(${data.requiresAmount}, requires_amount),
          requires_interest_rate = COALESCE(${data.requiresInterestRate}, requires_interest_rate),
          requires_end_date = COALESCE(${data.requiresEndDate}, requires_end_date),
          allows_auto_renewal = COALESCE(${data.allowsAutoRenewal}, allows_auto_renewal),
          default_currency = COALESCE(${data.defaultCurrency}, default_currency),
          default_duration_days = COALESCE(${data.defaultDurationDays}, default_duration_days),
          terms_template = COALESCE(${data.termsTemplate}, terms_template),
          display_order = COALESCE(${data.displayOrder}, display_order),
          icon = COALESCE(${data.icon}, icon),
          color = COALESCE(${data.color}, color),
          is_active = COALESCE(${data.isActive}, is_active),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `) as any[];
      
      if (!result || result.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Contract type not found'
        });
      }
      
      console.log('[Admin] Contract type updated successfully');
      
      return {
        success: true,
        contractType: result[0],
        message: 'Contract type updated successfully'
      };
    } catch (error: any) {
      console.error('[Admin] Error updating contract type:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update contract type',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * DELETE /admin/contract-types/:id
   * Delete a contract type (soft delete by setting is_active = false)
   */
  fastify.delete('/admin/contract-types/:id', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Contract Types'],
      summary: 'Delete contract type (soft delete)',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      
      console.log('[Admin] Soft deleting contract type ID:', id);
      
      const result = await db.execute(sql`
        UPDATE contract_types
        SET is_active = false, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `) as any[];
      
      if (!result || result.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Contract type not found'
        });
      }
      
      console.log('[Admin] Contract type soft deleted successfully');
      
      return {
        success: true,
        message: 'Contract type deleted successfully',
        contractType: result[0]
      };
    } catch (error: any) {
      console.error('[Admin] Error deleting contract type:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete contract type',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
}
