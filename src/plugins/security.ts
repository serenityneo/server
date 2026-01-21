import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Security Plugin - Enterprise Grade
 * 
 * Implements:
 * - Security headers (OWASP recommendations)
 * - Request correlation
 * - Security event logging
 * - Attack detection
 */
export function registerSecurity(app: FastifyInstance) {
  const isProduction = process.env.NODE_ENV === 'production';

  // ============================================================================
  // SECURITY HEADERS (OWASP Best Practices)
  // ============================================================================
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // Request correlation ID
    const reqId = (req as any).id;
    reply.header('X-Request-Id', String(reqId));

    // Security headers
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // HSTS - Force HTTPS (only in production)
    if (isProduction) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Content Security Policy
    reply.header('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Swagger needs unsafe-inline
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'"
    ].join('; '));

    // Remove server identification headers
    reply.removeHeader('X-Powered-By');
    reply.removeHeader('Server');
  });

  // ============================================================================
  // REQUEST LOGGING (Security Monitoring)
  // ============================================================================
  app.addHook('onRequest', async (req: FastifyRequest) => {
    const sensitiveRoutes = ['/admin', '/api/v1/admin', '/partner'];
    const isSensitive = sensitiveRoutes.some(route => req.url.startsWith(route));

    if (isSensitive || isProduction) {
      req.log.info({
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        referer: req.headers['referer'],
        // Don't log body for security
      }, 'Security: Incoming request');
    }
  });

  // ============================================================================
  // SUSPICIOUS ACTIVITY DETECTION
  // ============================================================================
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const suspiciousPatterns = [
      /(\.\.|\/etc\/|\/proc\/|\/sys\/)/i,  // Path traversal
      /(union.*select|script|javascript:|onerror=)/i,  // SQL injection / XSS
      /(<script|<iframe|<object)/i,  // HTML injection
    ];

    const urlAndQuery = req.url + JSON.stringify(req.query);

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(urlAndQuery)) {
        req.log.warn({
          ip: req.ip,
          url: req.url,
          pattern: pattern.source,
          userAgent: req.headers['user-agent']
        }, 'SECURITY ALERT: Suspicious request pattern detected');

        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid request format'
        });
      }
    }
  });

  // ============================================================================
  // ERROR HANDLING (Don't leak internal details)
  // ============================================================================
  app.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    request.log.error({
      err: error,
      ip: request.ip,
      url: request.url,
      method: request.method
    }, 'Request error');

    // In production, don't expose error details
    if (isProduction && reply.statusCode === 500) {
      reply.send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please contact support.',
        requestId: (request as any).id
      });
    }
  });

  app.log.info('Security plugin registered (enterprise mode)');
}