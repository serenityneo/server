import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { creditServicesService } from './services/credit-services.service';
import { AUTH_COOKIE_NAME, extractUserIdFromCookie } from '../../config/auth';

/**
 * Credit Services Routes
 * Handles credit services management (BOMBE, TELEMA, MOPAO, etc.)
 */

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

const handleError = (request: FastifyRequest, reply: FastifyReply, error: unknown, statusCode: number = 500) => {
  request.log.error({ err: error }, 'Request error');
  
  const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
  
  reply.status(statusCode).send({
    success: false,
    error: statusCode === 401 ? 'Non autorisé' : 
           statusCode === 404 ? 'Resource introuvable' : 
           statusCode === 400 ? errorMessage :
           'Une erreur est survenue. Veuillez réessayer.'
  });
};

export async function registerCreditServicesRoutes(fastify: FastifyInstance) {
  /**
   * GET /admin/credit-services/available
   * Get all available credit services from credit_types table
   */
  fastify.get('/admin/credit-services/available', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Credit Services'],
      summary: 'Get available credit services',
      description: 'Returns all active credit services that can be activated for customers (BOMBE, TELEMA, MOPAO, etc.)',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            services: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  code: { type: 'string' },
                  label: { type: 'string' },
                  description: { type: 'string' },
                  status: { type: 'string' },
                  allowedCurrencies: { type: 'array' },
                  repaymentFrequency: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const services = await creditServicesService.getAvailableServices();
      
      return {
        success: true,
        services
      };
    } catch (error) {
      console.error('[Admin] Error fetching available credit services:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /admin/customers/:id/services
   * Get services activated for a specific customer
   */
  fastify.get('/admin/customers/:id/services', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Credit Services'],
      summary: 'Get customer services',
      description: 'Returns all services activated for this customer',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            services: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  serviceCode: { type: 'string' },
                  label: { type: 'string' },
                  description: { type: 'string' },
                  isActive: { type: 'boolean' },
                  activatedAt: { type: 'string' },
                  activatedByUserId: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      
      const services = await creditServicesService.getCustomerServices(id);
      
      return {
        success: true,
        services
      };
    } catch (error) {
      console.error('[Admin] Error fetching customer services:', error);
      if (error instanceof Error && error.message === 'Customer not found') {
        handleError(request, reply, error, 404);
      } else {
        handleError(request, reply, error, 500);
      }
    }
  });

  /**
   * POST /admin/customers/:id/services/activate
   * Activate credit services for a customer (direct activation, no approval)
   */
  fastify.post('/admin/customers/:id/services/activate', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Credit Services'],
      summary: 'Activate services for customer',
      description: 'Directly activate credit services for a customer (ADMIN ACTION)',
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
          serviceCodes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of service codes to activate (e.g., ["BOMBE", "TELEMA"])'
          },
          activatedByUserId: { type: 'number' }
        },
        required: ['serviceCodes', 'activatedByUserId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            services: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  action: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { serviceCodes, activatedByUserId } = request.body as {
        serviceCodes: string[];
        activatedByUserId: number;
      };
      
      const activatedServices = await creditServicesService.activateServices(
        id,
        serviceCodes,
        activatedByUserId
      );
      
      return {
        success: true,
        message: 'Services activated successfully',
        services: activatedServices
      };
    } catch (error) {
      console.error('[Admin] Error activating services:', error);
      if (error instanceof Error && error.message === 'Customer not found') {
        handleError(request, reply, error, 404);
      } else if (error instanceof Error && error.message.startsWith('Invalid service codes')) {
        handleError(request, reply, error, 400);
      } else {
        handleError(request, reply, error, 500);
      }
    }
  });

  /**
   * POST /admin/customers/:id/services/deactivate
   * Deactivate a service for a customer
   */
  fastify.post('/admin/customers/:id/services/deactivate', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Credit Services'],
      summary: 'Deactivate service for customer',
      description: 'Deactivate a credit service for a customer',
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
          serviceCode: { type: 'string' },
          deactivatedByUserId: { type: 'number' },
          reason: { type: 'string' }
        },
        required: ['serviceCode', 'deactivatedByUserId']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { serviceCode, deactivatedByUserId, reason } = request.body as {
        serviceCode: string;
        deactivatedByUserId: number;
        reason?: string;
      };
      
      const result = await creditServicesService.deactivateService(
        id,
        serviceCode,
        deactivatedByUserId,
        reason
      );
      
      return result;
    } catch (error) {
      console.error('[Admin] Error deactivating service:', error);
      if (error instanceof Error && error.message === 'Active service not found for this customer') {
        handleError(request, reply, error, 404);
      } else {
        handleError(request, reply, error, 500);
      }
    }
  });
}
