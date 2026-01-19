import type { FastifyInstance } from 'fastify';
import { registerValidateRoute } from './routes/validate';
import { registerLicenseVerifyRoute } from './routes/license';
import { registerKycStatusRoutes } from './routes/status';
import { registerKycConditionalRoutes } from './routes/conditional';
import { registerKyc2Routes } from './routes/kyc2';

// Point d'entrée du module KYC: regroupe l'enregistrement des routes
export function registerKycRoutes(app: FastifyInstance) {
  registerValidateRoute(app);
  registerLicenseVerifyRoute(app);
  registerKycStatusRoutes(app);
  registerKycConditionalRoutes(app);
  registerKyc2Routes(app);
}

export { initOCR } from './services/ocr';