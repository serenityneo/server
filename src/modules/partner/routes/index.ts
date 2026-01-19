import { FastifyInstance } from 'fastify';
import partnerRoutes from './partner.routes';
import { partnerTwoFactorRoutes } from './partner-2fa.routes';
import { partnerPhoneChangeRoutes } from './partner-phone-change.routes';
import { partnerCommissionRoutes } from './partner-commission.routes';
import { commissionAdminRoutes } from './commission-admin.routes';
import { partnerDepositRoutes } from './partner-deposit.routes';

/**
 * Register all Partner routes
 * 
 * ROUTES INCLUDED:
 * - Partner dashboard and operations (partner.routes.ts)
 * - Partner 2FA management (partner-2fa.routes.ts)
 * - Partner phone change requests (partner-phone-change.routes.ts)
 * - Partner commission viewing (partner-commission.routes.ts)
 * - Admin commission configuration (commission-admin.routes.ts)
 * - Partner deposit operations (partner-deposit.routes.ts)
 */
export async function registerPartnerRoutes(fastify: FastifyInstance) {
  // Core partner routes (dashboard, operations, points)
  await partnerRoutes(fastify);

  // Partner 2FA management routes
  // SECURITY: Partners CAN activate/deactivate 2FA
  await partnerTwoFactorRoutes(fastify);

  // Partner phone change routes
  // SECURITY: Partners CANNOT change phone without admin approval
  await partnerPhoneChangeRoutes(fastify);

  // Partner commission routes
  // Partners can view their commission earnings and history
  await partnerCommissionRoutes(fastify);

  // Admin commission configuration routes
  // Admins can create/update commission rates for operations
  await commissionAdminRoutes(fastify);

  // Partner deposit routes
  // Partners can process deposits with automatic first deposit commission
  await partnerDepositRoutes(fastify);
}
