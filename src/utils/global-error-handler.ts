import { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db';
import { systemErrors } from '../db/schema';
import { emailService } from '../services/email.service';

/**
 * Global Error Handler
 * 
 * Intercepts all unhandled errors in the application.
 * 1. Logs error to database (system_errors)
 * 2. Sends email alert to admins
 * 3. Returns safe error response to user
 */
export const globalErrorHandler = async (error: Error, request: FastifyRequest, reply: FastifyReply) => {
    const isProduction = process.env.NODE_ENV === 'production';

    // 1. Log to console (always)
    request.log.error({
        err: error,
        url: request.url,
        method: request.method,
        userId: (request.user as any)?.id // If authenticated
    }, 'Unhandled exception details');

    try {
        // 2. Persist to Database (Internal Audit)
        const [savedError] = await db.insert(systemErrors).values({
            message: error.message || 'Unknown error',
            stack: error.stack,
            path: request.url,
            method: request.method,
            userId: (request.user as any)?.id,
            severity: 'CRITICAL',
            metadata: {
                headers: request.headers,
                query: request.query,
                params: request.params,
                ip: request.ip
            }
        }).returning({ id: systemErrors.id });

        // 3. Send Alert (Async - non-blocking)
        // Don't await this to avoid delaying response
        emailService.sendSystemAlert({
            errorId: savedError.id,
            message: error.message || 'Unknown error',
            path: request.url,
            stack: error.stack
        }).catch(err => {
            request.log.error({ err }, 'Failed to send system alert email');
        });

        // 4. Send Response
        // In production, don't leak stack traces
        const statusCode = (error as any).statusCode || 500;

        reply.status(statusCode).send({
            success: false,
            error: 'Internal Server Error',
            message: isProduction ? 'Une erreur inattendue est survenue.' : error.message,
            reference: `#${savedError.id}` // User can give this ID to support
        });

    } catch (loggingError) {
        // If database logging fails, fallback to basic response
        request.log.error({ err: loggingError }, 'CRITICAL: Failed to log error to database');

        reply.status(500).send({
            success: false,
            error: 'Critical Internal Error',
            message: 'Service temporairement indisponible.'
        });
    }
};
