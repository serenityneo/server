import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export function registerSwagger(app: FastifyInstance) {
  app.register(swagger, {
    mode: 'dynamic',
    openapi: {
      info: {
        title: 'KYC Validator API',
        version: '0.1.0'
      },
      servers: [{ url: '/' }]
    },
    exposeRoute: true,
    hideUntagged: false
  });
  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true
    }
  });
}