import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * BANKING SECURITY - Centralized Error Handler
 * 
 * CRITICAL: Never expose SQL queries, database schema, or internal errors to clients
 * This is a CORE BANKING SYSTEM - security is paramount
 */

export function handleError(
  request: FastifyRequest, 
  reply: FastifyReply, 
  error: unknown, 
  statusCode: number = 500
): void {
  // Log full error server-side ONLY for debugging
  request.log.error({ err: error }, 'Partner route error');
  
  // Send ONLY generic error message to client (NEVER expose SQL/internal details)
  reply.status(statusCode).send({
    success: false,
    error: statusCode === 401 ? 'Non autorisé' : 
           statusCode === 403 ? 'Accès refusé' : 
           statusCode === 404 ? 'Resource introuvable' :
           'Une erreur est survenue. Veuillez réessayer.'
  });
}
