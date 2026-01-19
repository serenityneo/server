import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export function registerSecurity(app: FastifyInstance) {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // Basic request correlation
    const reqId = (req as any).id;
    reply.header('x-request-id', String(reqId));
  });

  app.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    request.log.error({ err: error }, 'unhandled error');
  });
}