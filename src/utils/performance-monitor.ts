/**
 * PERFORMANCE MONITORING - Track P95/P99 latency
 * In-memory metrics without Redis
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface RequestMetric {
  route: string;
  method: string;
  duration: number;
  timestamp: number;
  statusCode: number;
}

interface RouteStats {
  count: number;
  totalDuration: number;
  durations: number[]; // For percentile calculation
  slowestRequest: number;
  fastestRequest: number;
}

class PerformanceMonitor {
  private metrics: Map<string, RouteStats> = new Map();
  private readonly MAX_SAMPLES_PER_ROUTE = 1000; // Keep last 1000 requests per route
  private readonly SLOW_THRESHOLD_MS = 200; // Alert if >200ms

  /**
   * Record a request metric
   */
  recordRequest(metric: RequestMetric): void {
    const key = `${metric.method}:${metric.route}`;
    let stats = this.metrics.get(key);

    if (!stats) {
      stats = {
        count: 0,
        totalDuration: 0,
        durations: [],
        slowestRequest: 0,
        fastestRequest: Infinity,
      };
      this.metrics.set(key, stats);
    }

    // Update stats
    stats.count++;
    stats.totalDuration += metric.duration;
    stats.durations.push(metric.duration);
    stats.slowestRequest = Math.max(stats.slowestRequest, metric.duration);
    stats.fastestRequest = Math.min(stats.fastestRequest, metric.duration);

    // Keep only last N samples (sliding window)
    if (stats.durations.length > this.MAX_SAMPLES_PER_ROUTE) {
      const removed = stats.durations.shift()!;
      stats.totalDuration -= removed;
    }

    // Alert if slow
    if (metric.duration > this.SLOW_THRESHOLD_MS) {
      console.warn('[PERF_SLOW_REQUEST]', {
        route: metric.route,
        method: metric.method,
        duration: `${metric.duration}ms`,
        threshold: `${this.SLOW_THRESHOLD_MS}ms`,
        statusCode: metric.statusCode,
        timestamp: new Date(metric.timestamp).toISOString(),
      });
    }
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(durations: number[], percentile: number): number {
    if (durations.length === 0) return 0;
    
    const sorted = [...durations].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get statistics for a route
   */
  getRouteStats(method: string, route: string): {
    count: number;
    avgDuration: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    slowest: number;
    fastest: number;
  } | null {
    const key = `${method}:${route}`;
    const stats = this.metrics.get(key);

    if (!stats || stats.count === 0) return null;

    return {
      count: stats.count,
      avgDuration: Math.round(stats.totalDuration / stats.count),
      p50: Math.round(this.calculatePercentile(stats.durations, 50)),
      p90: Math.round(this.calculatePercentile(stats.durations, 90)),
      p95: Math.round(this.calculatePercentile(stats.durations, 95)),
      p99: Math.round(this.calculatePercentile(stats.durations, 99)),
      slowest: Math.round(stats.slowestRequest),
      fastest: Math.round(stats.fastestRequest),
    };
  }

  /**
   * Get all routes statistics
   */
  getAllStats(): Map<string, any> {
    const result = new Map();
    
    for (const [key, stats] of this.metrics.entries()) {
      const [method, route] = key.split(':');
      result.set(key, this.getRouteStats(method, route));
    }

    return result;
  }

  /**
   * Get summary report
   */
  getSummary(): {
    totalRequests: number;
    slowRoutes: Array<{ route: string; p95: number; p99: number }>;
    avgLatency: number;
  } {
    let totalRequests = 0;
    let totalDuration = 0;
    const slowRoutes: Array<{ route: string; p95: number; p99: number }> = [];

    for (const [key, stats] of this.metrics.entries()) {
      totalRequests += stats.count;
      totalDuration += stats.totalDuration;

      const p95 = this.calculatePercentile(stats.durations, 95);
      const p99 = this.calculatePercentile(stats.durations, 99);

      if (p95 > this.SLOW_THRESHOLD_MS) {
        slowRoutes.push({
          route: key,
          p95: Math.round(p95),
          p99: Math.round(p99),
        });
      }
    }

    return {
      totalRequests,
      slowRoutes: slowRoutes.sort((a, b) => b.p95 - a.p95),
      avgLatency: totalRequests > 0 ? Math.round(totalDuration / totalRequests) : 0,
    };
  }

  /**
   * Clear all metrics (for testing)
   */
  clear(): void {
    this.metrics.clear();
  }
}

// Singleton instance
const monitor = new PerformanceMonitor();

/**
 * Fastify plugin for performance monitoring
 */
export async function performanceMonitoringPlugin(fastify: FastifyInstance, opts: any, done: () => void) {
  // Add startTime to request
  fastify.addHook('onRequest', async (request: FastifyRequest & { startTime?: number }, reply: FastifyReply) => {
    request.startTime = Date.now();
  });

  // Record metrics on response
  fastify.addHook('onResponse', async (request: FastifyRequest & { startTime?: number }, reply: FastifyReply) => {
    if (!request.startTime) return;

    const duration = Date.now() - request.startTime;
    const route = request.routeOptions?.url || request.url;

    monitor.recordRequest({
      route,
      method: request.method,
      duration,
      timestamp: request.startTime,
      statusCode: reply.statusCode,
    });
  });

  // Expose metrics endpoint
  fastify.get('/metrics/performance', async (request: FastifyRequest, reply: FastifyReply) => {
    const summary = monitor.getSummary();
    const allStats = Object.fromEntries(monitor.getAllStats());

    return reply.send({
      summary,
      routes: allStats,
      timestamp: new Date().toISOString(),
    });
  });

  // Health check with performance data
  fastify.get('/health/performance', async (request: FastifyRequest, reply: FastifyReply) => {
    const summary = monitor.getSummary();
    
    const status = summary.avgLatency < 200 && summary.slowRoutes.length === 0 
      ? 'healthy' 
      : 'degraded';

    return reply.send({
      status,
      avgLatency: `${summary.avgLatency}ms`,
      totalRequests: summary.totalRequests,
      slowRoutesCount: summary.slowRoutes.length,
      threshold: '200ms',
    });
  });
  
  done();
}

export { monitor as performanceMonitor };
