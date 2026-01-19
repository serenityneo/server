/**
 * RATE LIMITER - Sliding window in-memory
 * Prevents abuse without Redis
 */

import { FastifyRequest, FastifyReply } from 'fastify';

interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

interface RequestRecord {
  timestamps: number[];
}

class RateLimiter {
  private records: Map<string, RequestRecord> = new Map();
  private readonly CLEANUP_INTERVAL_MS = 60000; // Cleanup every 1 minute

  constructor() {
    // Periodic cleanup of old records
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Check if request is allowed under rate limit
   */
  isAllowed(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get or create record
    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    // Remove timestamps outside current window (sliding window)
    record.timestamps = record.timestamps.filter(ts => ts > windowStart);

    // Check limit
    const allowed = record.timestamps.length < config.maxRequests;
    
    if (allowed) {
      record.timestamps.push(now);
    }

    const remaining = Math.max(0, config.maxRequests - record.timestamps.length);
    const resetAt = record.timestamps.length > 0 
      ? record.timestamps[0] + config.windowMs 
      : now + config.windowMs;

    return { allowed, remaining, resetAt };
  }

  /**
   * Cleanup old records to prevent memory leak
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    for (const [key, record] of this.records.entries()) {
      // Remove if no recent activity
      if (record.timestamps.length === 0 || 
          record.timestamps[record.timestamps.length - 1] < now - maxAge) {
        this.records.delete(key);
      }
    }

    // ✅ FIX: Only log if there are active keys (reduce noise)
    if (this.records.size > 0) {
      console.debug(`[RATE_LIMITER] Cleanup completed. Active keys: ${this.records.size}`);
    }
  }

  /**
   * Get current stats
   */
  getStats(): { totalKeys: number; memoryUsage: string } {
    return {
      totalKeys: this.records.size,
      memoryUsage: `~${Math.round(this.records.size * 0.1)}KB`, // Rough estimate
    };
  }

  /**
   * Clear all records (for testing)
   */
  clear(): void {
    this.records.clear();
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

/**
 * Rate limit configurations per endpoint type
 */
export const RATE_LIMITS = {
  // Credit operations - 5 requests per minute per customer
  CREDIT_REQUEST: {
    windowMs: 60000,  // 1 minute
    maxRequests: 5,
  },
  
  // Eligibility checks - 10 requests per minute
  ELIGIBILITY_CHECK: {
    windowMs: 60000,
    maxRequests: 10,
  },

  // General API - 100 requests per minute
  GENERAL_API: {
    windowMs: 60000,
    maxRequests: 100,
  },

  // Auth endpoints - 3 requests per 5 minutes (prevent brute force)
  AUTH: {
    windowMs: 300000, // 5 minutes
    maxRequests: 3,
  },
} as const;

/**
 * Rate limiting middleware factory
 */
export function rateLimitMiddleware(config: RateLimitConfig, keyExtractor?: (req: FastifyRequest) => string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Extract key (default: IP address)
    const key = keyExtractor 
      ? keyExtractor(request) 
      : `ip:${request.ip}`;

    const result = rateLimiter.isAllowed(key, config);

    // Add headers
    reply.header('X-RateLimit-Limit', config.maxRequests);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', result.resetAt);

    if (!result.allowed) {
      console.warn('[RATE_LIMIT_EXCEEDED]', {
        key,
        limit: config.maxRequests,
        window: `${config.windowMs / 1000}s`,
        ip: request.ip,
        url: request.url,
      });

      return reply.status(429).send({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((result.resetAt - Date.now()) / 1000)} seconds.`,
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      });
    }
  };
}

/**
 * Customer-specific rate limiter (by customerId)
 */
export function customerRateLimitMiddleware(config: RateLimitConfig) {
  return rateLimitMiddleware(config, (req) => {
    // Extract customerId from body or query
    const body = req.body as any;
    const customerId = body?.customerId || (req.params as any)?.customerId;
    
    return customerId ? `customer:${customerId}` : `ip:${req.ip}`;
  });
}

export { rateLimiter };
