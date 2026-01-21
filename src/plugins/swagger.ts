import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

/**
 * Register Swagger Documentation
 * 
 * SECURITY: Swagger is ONLY enabled in:
 * 1. Development environment (NODE_ENV !== 'production')
 * 2. Production requests from localhost/internal IPs (for admin debugging)
 * 
 * This prevents exposing API structure to external attackers.
 */
export function registerSwagger(app: FastifyInstance) {
  const isProduction = process.env.NODE_ENV === 'production';

  // In production, only register if explicitly enabled
  if (isProduction && process.env.ENABLE_SWAGGER !== 'true') {
    app.log.info('Swagger documentation DISABLED in production (security)');
    return;
  }

  app.register(swagger, {
    mode: 'dynamic',
    openapi: {
      info: {
        title: 'Serenity Neo Banking API',
        description: 'Internal API documentation - Restricted access',
        version: '1.0.0'
      },
      servers: [
        { url: '/', description: 'Current server' }
      ],
      tags: [
        { name: 'system', description: 'System health and monitoring' },
        { name: 'admin', description: 'Admin operations (authentication required)' },
        { name: 'partner', description: 'Partner operations' },
        { name: 'client', description: 'Client operations' }
      ]
    },
    exposeRoute: true,
    hideUntagged: false
  });

  // Swagger UI with access control
  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true
    },
    uiHooks: {
      onRequest: async (request, reply) => {
        // In production, restrict to localhost/internal IPs only
        if (isProduction) {
          const allowedIPs = ['127.0.0.1', '::1', 'localhost'];
          const clientIP = request.ip;

          if (!allowedIPs.includes(clientIP)) {
            app.log.warn({ ip: clientIP }, 'Unauthorized Swagger access attempt');
            return reply.status(403).send({
              error: 'Forbidden',
              message: 'API documentation is not publicly accessible in production'
            });
          }
        }
      }
    }
  });

  app.log.info('Swagger documentation enabled at /docs');
}