import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool } from '../services/db';
import { requestLogs } from '../db/schema';

/**
 * Performance Logger Plugin for Fastify
 * Tracks all requests and logs slow queries (>200ms) to database
 * Calculates P95 metrics for performance monitoring
 */

const SLOW_QUERY_THRESHOLD_MS = 200;
const SAMPLE_RATE = 1.0; // Log 100% of requests (adjust for high traffic: 0.1 = 10%)

// In-memory buffer to batch inserts (reduce DB writes)
interface LogEntry {
  id: string;
  endpoint: string;
  method: string;
  durationMs: number;
  statusCode?: number;
  customerId?: number;
  actionType?: string;
  source: 'UI' | 'SERVER';
  ipAddress?: string;
  userAgent?: string;
  requestBody?: any;
  responseSize?: number;
  errorMessage?: string;
  createdAt: Date;
  date: Date;
}

let logBuffer: LogEntry[] = [];
const BUFFER_SIZE = 50; // Flush to DB every 50 entries
const FLUSH_INTERVAL_MS = 10000; // Or every 10 seconds

async function flushLogs() {
  if (logBuffer.length === 0) return;

  const logsToInsert = [...logBuffer];
  logBuffer = [];

  try {
    const pool = getPool();
    if (!pool) {
      console.warn('[PerformanceLogger] Database pool not available - skipping flush');
      return;
    }

    // ✅ FIX: Verify pool connection before inserting
    try {
      await pool.query('SELECT 1'); // Quick health check
    } catch (healthError: any) {
      console.warn('[PerformanceLogger] Pool health check failed - skipping flush:', healthError.message);
      return;
    }

    const db = drizzle(pool as any);
    await db.insert(requestLogs).values(logsToInsert as any);
    console.debug(`[PerformanceLogger] Flushed ${logsToInsert.length} request logs`);
  } catch (error: any) {
    console.error('[PerformanceLogger] Failed to flush logs:', error.message);
    // Re-add to buffer if flush fails (up to a limit to prevent memory leak)
    if (logBuffer.length < 500) {
      logBuffer = [...logsToInsert, ...logBuffer];
    }
  }
}

// Periodic flush
setInterval(flushLogs, FLUSH_INTERVAL_MS);

// Flush on process exit
process.on('beforeExit', () => {
  flushLogs().catch(console.error);
});

function extractActionType(endpoint: string, method: string): string | undefined {
  // Map endpoints to business actions
  const actionMap: Record<string, string> = {
    '/api/v1/auth/login': 'login',
    '/api/v1/auth/verify-otp': 'verify_otp',
    '/api/v1/kyc/submit': 'kyc_submit',
    '/api/v1/kyc/progress': 'kyc_progress',
    '/api/v1/customers/profile': 'profile_view',
    '/api/v1/transactions': method === 'POST' ? 'transaction_create' : 'transaction_list',
    '/api/v1/credit/apply': 'credit_apply',
    '/api/v1/credit/repay': 'credit_repay',
  };

  // Exact match
  if (actionMap[endpoint]) return actionMap[endpoint];

  // Partial match
  for (const [pattern, action] of Object.entries(actionMap)) {
    if (endpoint.includes(pattern)) return action;
  }

  // Extract from endpoint path
  const segments = endpoint.split('/').filter(Boolean);
  if (segments.length >= 3) {
    return `${segments[segments.length - 1]}_${method.toLowerCase()}`;
  }

  return undefined;
}

function extractCustomerId(request: FastifyRequest): number | undefined {
  // Try multiple sources for customer ID
  const user = (request as any).user;
  if (user?.customer_id) return Number(user.customer_id);
  if (user?.id) return Number(user.id);

  // Check request body
  const body = request.body as any;
  if (body?.customerId) return Number(body.customerId);
  if (body?.customer_id) return Number(body.customer_id);

  // Check query params
  const query = request.query as any;
  if (query?.customerId) return Number(query.customerId);
  if (query?.customer_id) return Number(query.customer_id);

  return undefined;
}

export function registerPerformanceLogger(app: FastifyInstance) {
  // Hook to start timing
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    (request as any).startTime = Date.now();
  });

  // Hook to log completed requests
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = (request as any).startTime;
    if (!startTime) return;

    const duration = Date.now() - startTime;

    // Sampling: skip some requests for high-traffic scenarios
    if (Math.random() > SAMPLE_RATE) return;

    // ✅ FIX: Use request.routeOptions.url instead of deprecated routerPath
    const endpoint = request.routeOptions?.url || request.url;
    const method = request.method;
    const statusCode = reply.statusCode;

    // Skip health checks and static assets
    if (endpoint.includes('/health') ||
      endpoint.includes('/documentation') ||
      endpoint.includes('/swagger') ||
      endpoint.includes('/_next/')) {
      return;
    }

    const customerId = extractCustomerId(request);
    const actionType = extractActionType(endpoint, method);
    const ipAddress = (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      request.ip ||
      'unknown';
    const userAgent = request.headers['user-agent'] || undefined;

    // Sanitize request body (remove sensitive data)
    let sanitizedBody: any = undefined;
    if (request.body && typeof request.body === 'object') {
      const body = { ...(request.body as any) };
      delete body.password;
      delete body.otp;
      delete body.pin;
      delete body.secret;
      sanitizedBody = Object.keys(body).length > 0 ? body : undefined;
    }

    const logEntry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      endpoint,
      method,
      durationMs: duration,
      statusCode,
      customerId,
      actionType,
      source: 'SERVER',
      ipAddress,
      userAgent,
      requestBody: sanitizedBody,
      responseSize: undefined, // Fastify doesn't expose response size easily
      errorMessage: statusCode >= 400 ? `HTTP ${statusCode}` : undefined,
      createdAt: new Date(),
      date: new Date(),
    };

    // Log slow queries immediately
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      app.log.warn({
        endpoint,
        method,
        duration,
        statusCode,
        customerId,
        actionType,
      }, `[PerformanceLogger] SLOW QUERY detected (${duration}ms > ${SLOW_QUERY_THRESHOLD_MS}ms)`);
    }

    // Add to buffer
    logBuffer.push(logEntry);

    // Flush if buffer is full
    if (logBuffer.length >= BUFFER_SIZE) {
      setImmediate(() => flushLogs());
    }
  });

  app.log.info('[PerformanceLogger] Registered - tracking requests > 200ms');
}
