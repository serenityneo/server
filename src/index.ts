import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import underPressure from '@fastify/under-pressure';
import { registerSwagger } from './plugins/swagger';
import { registerSecurity } from './plugins/security';
import { registerPerformanceLogger } from './plugins/performance-logger';
import { performanceMonitoringPlugin } from './utils/performance-monitor';
import { registerKycRoutes } from './modules/kyc/index';
import { registerCoreBankingRoutes } from './modules/core-banking/routes';
import { registerSettingsRoutes } from './modules/settings/routes';
import { registerAdminRoutes } from './modules/admin/routes';
import { registerPartnerRoutes } from './modules/partner/routes';
import { errorReportsRoutes } from './modules/error-reports/routes';
import { creditRoutes, CORE_BANKING_CONFIG } from './modules/core-banking';
import { clientCardRoutes } from './modules/cards';
import partnerKycRoutes from './modules/partner/kyc-routes';
import partnerCardRoutes from './modules/partner/card-routes';
import adminKycRoutes from './modules/admin/partner-kyc-admin-routes';
import adminCardRoutes from './modules/admin/card-admin-routes';
import customerContractsRoutes from './modules/contracts/customer-contracts-routes';
import { registerLoyaltyRoutes } from './modules/loyalty/loyalty.routes';
import { registerLoyaltyAdminRoutes } from './modules/loyalty/loyalty-admin.routes';
import { initOCR } from './modules/kyc/services/ocr';
import { ensureDocumentHashesTable, verifyDb } from './services/db';
import { startEligibilityCronJobs } from './jobs/eligibility-cron-jobs';

const buildApp = () => {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'production'
      ? { level: process.env.LOG_LEVEL || 'info' }
      : true
  });

  // Core plugins
  app.register(cors, {
    origin: true, // Allow all origins in development
    credentials: true // CRITICAL: Allow cookies for authentication
  });
  app.register(helmet);
  app.register(cookie); // Cookie parsing middleware for admin authentication
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  app.register(underPressure, { maxEventLoopDelay: 1000, maxHeapUsedBytes: 200 * 1024 * 1024 });

  // Docs & security
  registerSwagger(app);
  registerSecurity(app);
  registerPerformanceLogger(app); // ✅ Performance monitoring
  app.register(performanceMonitoringPlugin); // ✅ P95/P99 metrics

  // Routes (prefix global /api/v1) - Register all at once
  app.register(async (api: FastifyInstance) => {
    registerKycRoutes(api); // Sync (module externe)
    await registerSettingsRoutes(api); // Module externe
    await registerAdminRoutes(api); // Module externe
    await registerPartnerRoutes(api); // Module externe
    await errorReportsRoutes(api); // Module externe

    // LOYALTY POINTS SYSTEM
    await registerLoyaltyRoutes(api); // Client loyalty endpoints
    await registerLoyaltyAdminRoutes(api); // Admin loyalty endpoints

    // CORE BANKING - Routes intégrées dans /api/v1
    await registerCoreBankingRoutes(api); // Anciennes routes
    api.register(creditRoutes, { prefix: '/credit' }); // /api/v1/credit/*
    api.register(adminCardRoutes, { prefix: '/admin/cards' }); // /api/v1/admin/cards/*
    api.register(partnerKycRoutes, { prefix: '/partner/kyc' }); // /api/v1/partner/kyc/*
    api.register(partnerCardRoutes, { prefix: '/partner/cards' }); // /api/v1/partner/cards/*
    api.register(adminKycRoutes, { prefix: '/admin/partner-kyc' }); // /api/v1/admin/partner-kyc/*
    api.register(clientCardRoutes, { prefix: '/client/cards' }); // /api/v1/client/cards/*
    api.register(customerContractsRoutes); // /api/v1/contracts/* (customer routes)
  }, { prefix: '/api/v1' });

  // Log Core Banking status
  app.log.info('Core Banking System:', CORE_BANKING_CONFIG);



  // Route test Swagger visibility
  app.get('/__swagger_test', {
    schema: {
      tags: ['system'],
      summary: 'Route de test Swagger',
      response: {
        200: { type: 'object', properties: { ok: { type: 'boolean' } } }
      }
    }
  }, async () => ({ ok: true }));

  app.get('/health', {
    schema: {
      tags: ['system'],
      summary: 'Santé du service',
      response: {
        200: {
          type: 'object',
          properties: { status: { type: 'string' } },
          examples: [{ summary: 'OK', value: { status: 'ok' } }]
        }
      }
    }
  }, async () => ({ status: 'ok' }));

  app.get('/health/db', {
    schema: {
      tags: ['system'],
      summary: 'Santé de la base de données',
      response: {
        200: {
          type: 'object',
          properties: { connected: { type: 'boolean' } },
          examples: [{ summary: 'Base connectée', value: { connected: true } }]
        }
      }
    }
  }, async () => ({ connected: await verifyDb() }));

  // ✅ SERENITY NEO: Global Error Handler (Internal Observability)
  app.setErrorHandler(require('./utils/global-error-handler').globalErrorHandler);

  // Routes API
  app.register(require('./routes/otp-email.routes').otpEmailRoutes, { prefix: '/api/v1' });

  return app;
};

const start = async () => {
  const app = buildApp();
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '0.0.0.0';
  try {
    app.log.info('Starting server initialization...');
    // Préchargement OCR pour améliorer la latence des premières requêtes
    app.log.info('Initializing OCR...');
    await initOCR();
    app.log.info('OCR initialized successfully');
    // Vérifier la base de données et créer la table de déduplication si possible
    app.log.info('Verifying database connection...');
    const dbOk = await verifyDb();
    if (dbOk) {
      await ensureDocumentHashesTable();
      app.log.info('database connected; document_hashes table ensured');
    } else {
      app.log.warn('database not configured or unreachable; duplicate checks disabled');
    }
    app.log.info({ port, host }, 'Starting server listen...');

    // Fastify calls app.ready() internally during listen()
    // No need to call it explicitly - that was causing a deadlock!
    await app.listen({ port, host });

    app.log.info({ port, host }, 'kyc-validator server started successfully');
    console.log(`\n✅ Server is running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(`📄 API Documentation: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/documentation\n`);

    // Start eligibility cron jobs for automatic evaluation
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_CRON_JOBS === 'true') {
      startEligibilityCronJobs();
      console.log('🔄 Eligibility cron jobs started');
    }
  } catch (err) {
    app.log.error(err, 'failed to start kyc-validator server');
    console.error('\n❌ Server startup failed:', err);
    process.exit(1);
  }
};

start();
// Docs already registered above