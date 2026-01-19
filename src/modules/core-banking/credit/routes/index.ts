/**
 * CREDIT MODULE - Routes
 * 
 * Routes API pour:
 * - Gestion des comptes S01-S06
 * - Gestion des produits crédit (BOMBÉ, TELEMA, MOPAO, VIMBISA, LIKELEMBA)
 * - Demandes de crédit
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CreditAccountService } from '../services';
import { AccountTypeCode, Currency } from '../types';
import { BombeService } from '../services/products/bombe.service';
import { TelemaService } from '../services/products/telema.service';
import { MopaoService } from '../services/products/mopao.service';
import { VimbisaService } from '../services/products/vimbisa.service';
import { LikélembaService as LikélembaService } from '../services/products/likelemba.service';
import { AuditLogger } from '../../../../utils/audit-logger';
import { customerRateLimitMiddleware, RATE_LIMITS } from '../../../../utils/rate-limiter';
import { db } from '../../../../db';
import { accounts, customers } from '../../../../db/schema';
import { creditApplications } from '../../../../db/credit-products-schema';
import { eq, and, sql } from 'drizzle-orm';

// Services instances
const bombeService = new BombeService();
const telemaService = new TelemaService();
const mopaoService = new MopaoService();
const vimbisaService = new VimbisaService();
const likélembaService = new LikélembaService();

interface ConfigParams {
  code: AccountTypeCode;
}

interface CustomerParams {
  customerId: string;
}

interface WithdrawalBody {
  account_type: AccountTypeCode;
  amount: number;
  currency: Currency;
  current_balance: number;
}

interface DepositBody {
  account_type: AccountTypeCode;
  amount: number;
  currency: Currency;
}

interface TransferBody {
  from_account_type: AccountTypeCode;
  to_account_type: AccountTypeCode;
  amount: number;
  currency: Currency;
  current_balance: number;
}

export async function creditRoutes(fastify: FastifyInstance) {
  
  // ===== ROUTES COMPTES =====
  
  /**
   * GET /credit/accounts/configs
   * Récupérer toutes les configurations de comptes
   */
  fastify.get('/accounts/configs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const configs = await Promise.all(
        Object.values(AccountTypeCode).map(code => 
          CreditAccountService.getAccountConfig(code)
        )
      );
      
      return reply.send({
        success: true,
        data: configs.filter(c => c !== null),
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /credit/accounts/configs/:code
   * Récupérer la configuration d'un type de compte
   */
  fastify.get('/accounts/configs/:code', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { code: AccountTypeCode };
      const config = await CreditAccountService.getAccountConfig(params.code);
      
      if (!config) {
        return reply.status(404).send({
          success: false,
          error: 'Configuration non trouvée',
        });
      }
      
      return reply.send({
        success: true,
        data: config,
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /credit/accounts/validate-withdrawal
   * Valider un retrait
   */
  fastify.post('/accounts/validate-withdrawal', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { account_type: AccountTypeCode; amount: number; currency: Currency; current_balance: number };
      const { account_type, amount, currency, current_balance } = body;
      
      const validation = await CreditAccountService.validateWithdrawal(
        account_type,
        amount,
        currency,
        current_balance
      );
      
      return reply.send({
        success: true,
        data: validation,
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /credit/accounts/validate-deposit
   * Valider un dépôt
   */
  fastify.post('/accounts/validate-deposit', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { account_type: AccountTypeCode; amount: number; currency: Currency };
      const { account_type, amount, currency } = body;
      
      const validation = await CreditAccountService.validateDeposit(
        account_type,
        amount,
        currency
      );
      
      return reply.send({
        success: true,
        data: validation,
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /credit/accounts/validate-transfer
   * Valider un transfert
   */
  fastify.post('/accounts/validate-transfer', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { from_account_type: AccountTypeCode; to_account_type: AccountTypeCode; amount: number; currency: Currency; current_balance: number };
      const { from_account_type, to_account_type, amount, currency, current_balance } = body;
      
      const validation = await CreditAccountService.validateTransferOut(
        from_account_type,
        to_account_type,
        amount,
        currency,
        current_balance
      );
      
      return reply.send({
        success: true,
        data: validation,
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /credit/accounts/customer/:customerId
   * Récupérer tous les comptes d'un client
   */
  fastify.get('/accounts/customer/:customerId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { customerId: string };
      const accounts = await CreditAccountService.getCustomerAccounts(parseInt(params.customerId));
      
      return reply.send({
        success: true,
        data: accounts,
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // ===== ROUTES PRODUITS CRÉDIT =====
  
  /**
   * GET /credit/products
   * Récupérer tous les produits crédit
   */
  fastify.get('/products', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send({
        success: true,
        data: [
          { code: 'BOMBE', name: 'BOMBÉ', description: 'Crédit découvert renouvelable 0% (10-100$)', minAmount: 10, maxAmount: 100, currency: 'USD' },
          { code: 'TELEMA', name: 'TELEMA', description: 'Crédit individuel 6/9/12 mois (200-1500$)', minAmount: 200, maxAmount: 1500, currency: 'USD' },
          { code: 'MOPAO', name: 'MOPAO', description: 'Crédit parrainage GOLD (1-1.5%)', minAmount: 200, maxAmount: 1500, currency: 'USD', goldOnly: true },
          { code: 'VIMBISA', name: 'VIMBISA', description: 'Crédit saisonnier CDF (50k-200k FC)', allowedAmounts: [50000, 100000, 150000, 200000], currency: 'CDF' },
          { code: 'LIKELEMBA', name: 'LIKÉLEMBA', description: 'Crédit épargne de groupe', currency: 'USD', groupRequired: true },
        ],
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // ===== BOMBÉ ROUTES =====
  
  // ✅ Rate limiting: 10 eligibility checks per minute per customer
  fastify.post('/bombe/eligibility', {
    preHandler: customerRateLimitMiddleware(RATE_LIMITS.ELIGIBILITY_CHECK)
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { customerId: number; amount: number };
      const result = await bombeService.checkEligibility(body.customerId, body.amount);
      
      // ✅ Audit logging
      await AuditLogger.logCreditRequest(
        body.customerId,
        'BOMBE',
        body.amount,
        result.eligible,
        request
      );
      
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  // ✅ Rate limiting: 5 credit requests per minute per customer
  fastify.post('/bombe/request', {
    preHandler: customerRateLimitMiddleware(RATE_LIMITS.CREDIT_REQUEST)
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { customerId: number; amount: number; documents: any };
      const credit = await bombeService.requestCredit(body.customerId, body.amount, body.documents);
      
      // ✅ Audit logging
      await AuditLogger.logCreditRequest(
        body.customerId,
        'BOMBE',
        body.amount,
        true,
        request
      );
      
      return reply.send({ success: true, data: credit });
    } catch (error: any) {
      // ✅ Log failed attempt
      const body = request.body as { customerId: number; amount: number };
      await AuditLogger.logCreditRequest(
        body.customerId,
        'BOMBE',
        body.amount,
        false,
        request
      );
      
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  fastify.post('/bombe/validate-documents', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { creditId: number; adminId: number; approved: boolean; comments?: string };
      await bombeService.validateDocuments(body.creditId, body.adminId, body.approved, body.comments);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  fastify.post('/bombe/disburse', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { creditId: number };
      await bombeService.disburseCredit(body.creditId);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  fastify.get('/bombe/active/:customerId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { customerId: string };
      const credit = await bombeService.getActiveCredit(parseInt(params.customerId));
      return reply.send({ success: true, data: credit });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // ===== TELEMA ROUTES =====
  
  fastify.post('/telema/eligibility', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { customerId: number; amount: number };
      const result = await telemaService.checkEligibility(body.customerId, body.amount);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  fastify.post('/telema/maturity-options', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { amount: number };
      const options = telemaService.calculateMaturityOptions(body.amount);
      return reply.send({ success: true, data: options });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  fastify.post('/telema/request', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { customerId: number; amount: number; duration: 6 | 9 | 12; documents: any };
      const credit = await telemaService.requestCredit(body.customerId, body.amount, body.duration, body.documents);
      return reply.send({ success: true, data: credit });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  // ===== VIMBISA ROUTES =====
  
  fastify.post('/vimbisa/eligibility', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { customerId: number; amountCdf: number };
      const result = await vimbisaService.checkEligibility(body.customerId, body.amountCdf);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  fastify.post('/vimbisa/request', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { customerId: number; amountCdf: number; documents: any };
      const credit = await vimbisaService.requestCredit(body.customerId, body.amountCdf, body.documents);
      return reply.send({ success: true, data: credit });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  // ===== MOPAO & LIKELEMBA (routes simplifiées) =====
  
  // MOPAO - Éligibilité bénéficiaire
  fastify.post('/mopao/eligibility', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { customerId: number; amount: number; sponsorCustomerId?: number };
      const result = await mopaoService.checkEligibility(body.customerId, body.amount, body.sponsorCustomerId);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  // MOPAO - Éligibilité sponsor
  fastify.post('/mopao/sponsor-eligibility', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { sponsorCustomerId: number; numberOfSponsored: number };
      const result = await mopaoService.checkSponsorEligibility(body.sponsorCustomerId, body.numberOfSponsored);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  fastify.post('/likelemba/eligibility', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { customerId: number; groupId: number; amount: number };
      const result = await likélembaService.checkEligibility(body.customerId, body.groupId, body.amount);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  // ===== RÉCAPITULATIF SERVICES + COMPTES =====
  /**
   * GET /credit/services/all/:customerId
   * Retourne l'état de tous les services (BOMBÉ, TELEMA, MOPAO, VIMBISA, LIKELEMBA)
   * + état des 6 comptes (S01-S06) avec conditions d'activation
   */
  fastify.get('/services/all/:customerId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { customerId: string };
      const customerId = parseInt(params.customerId);

      // 1. Récupérer info client
      const customer = await db.query.customers.findFirst({
        where: eq(customers.id, customerId)
      });

      if (!customer) {
        return reply.status(404).send({ success: false, error: 'Client introuvable' });
      }

      // 2. Récupérer tous les comptes
      const allAccounts = await db.query.accounts.findMany({
        where: eq(accounts.customerId, customerId)
      });

      // 3. Récupérer crédits actifs
      const activeCredits = await db.query.creditApplications.findMany({
        where: and(
          eq(creditApplications.customerId, customerId),
          sql`${creditApplications.status} IN ('ACTIVE', 'DISBURSED', 'DOCUMENTS_PENDING', 'CAUTION_PENDING')`
        )
      });

      // 4. Vérifier éligibilité de chaque service (montant par défaut pour test)
      const [bombeElig, telemaElig, mopaoElig, vimbisaElig] = await Promise.all([
        bombeService.checkEligibility(customerId, 50).catch(() => ({ eligible: false, reasons: ['Erreur vérification'], s02Balance: 0, consecutiveDepositDays: 0 })),
        telemaService.checkEligibility(customerId, 500).catch(() => ({ eligible: false, reasons: ['Erreur vérification'], s02Balance: 0 })),
        mopaoService.checkEligibility(customerId, 500).catch(() => ({ eligible: false, reasons: ['Erreur vérification'], kycLevel: 0, s02Balance: 0, hasSponsor: false, sponsorAvailable: false, cautionRequired: 50 })),
        vimbisaService.checkEligibility(customerId, 100000).catch(() => ({ eligible: false, reasons: ['Erreur vérification'], s02BalanceCdf: 0 }))
      ]);

      // 5. Construire réponse services
      const services = [
        {
          serviceCode: 'BOMBE',
          serviceName: 'Crédit Découvert Quotidien',
          description: '10-100 USD, 1 jour, 0% intérêt',
          isActive: activeCredits.some(c => c.productType === 'BOMBE'),
          isEligible: bombeElig.eligible,
          eligibilityReasons: bombeElig.reasons,
          currentCredit: activeCredits.find(c => c.productType === 'BOMBE') || null,
          conditions: {
            s02Balance: {
              label: 'Solde S02 ≥ 50% montant',
              required: 25,
              current: bombeElig.s02Balance,
              met: bombeElig.s02Balance >= 25
            },
            depositDays: {
              label: '26 jours de dépôts consécutifs',
              required: 26,
              current: bombeElig.consecutiveDepositDays || 0,
              met: (bombeElig.consecutiveDepositDays || 0) >= 26
            },
            kycLevel: {
              label: 'KYC Niveau 1 minimum',
              required: 1,
              current: customer.kycStatus?.includes('KYC2') ? 2 : (customer.kycStatus?.includes('KYC1') ? 1 : 0),
              met: customer.kycStatus?.includes('KYC') || false
            }
          }
        },
        {
          serviceCode: 'TELEMA',
          serviceName: 'Crédit Individuel Mensuel',
          description: '200-1500 USD, 6-12 mois, 1.2-1.5% intérêt',
          isActive: activeCredits.some(c => c.productType === 'TELEMA'),
          isEligible: telemaElig.eligible,
          eligibilityReasons: telemaElig.reasons,
          currentCredit: activeCredits.find(c => c.productType === 'TELEMA') || null,
          conditions: {
            s02Balance: {
              label: 'Solde S02 ≥ 30% montant',
              required: 150,
              current: telemaElig.s02Balance,
              met: telemaElig.s02Balance >= 150
            },
            kycLevel: {
              label: 'KYC Niveau 2 requis',
              required: 2,
              current: customer.kycStatus?.includes('KYC2') ? 2 : (customer.kycStatus?.includes('KYC1') ? 1 : 0),
              met: customer.kycStatus?.includes('KYC2') || false
            }
          }
        },
        {
          serviceCode: 'MOPAO',
          serviceName: 'Crédit Parrainage GOLD',
          description: '200-1500 USD, 3-12 mois, 1-1.5% intérêt',
          isActive: activeCredits.some(c => c.productType === 'MOPAO'),
          isEligible: mopaoElig.eligible,
          eligibilityReasons: mopaoElig.reasons,
          currentCredit: activeCredits.find(c => c.productType === 'MOPAO') || null,
          conditions: {
            kycLevel: {
              label: 'KYC Niveau 1 minimum',
              required: 1,
              current: mopaoElig.kycLevel,
              met: mopaoElig.kycLevel >= 1
            },
            sponsor: {
              label: 'Parrain GOLD requis',
              required: true,
              current: mopaoElig.hasSponsor,
              met: mopaoElig.sponsorAvailable
            },
            caution: {
              label: 'Caution 10% bénéficiaire',
              required: mopaoElig.cautionRequired,
              current: mopaoElig.s02Balance,
              met: mopaoElig.s02Balance >= mopaoElig.cautionRequired
            }
          }
        },
        {
          serviceCode: 'VIMBISA',
          serviceName: 'Crédit Saisonnier Agricole',
          description: '50k-200k CDF, 10 semaines, 0% intérêt',
          isActive: activeCredits.some(c => c.productType === 'VIMBISA'),
          isEligible: vimbisaElig.eligible,
          eligibilityReasons: vimbisaElig.reasons,
          currentCredit: activeCredits.find(c => c.productType === 'VIMBISA') || null,
          conditions: {
            s02BalanceCdf: {
              label: 'Solde S02 CDF ≥ 30% montant',
              required: 30000,
              current: vimbisaElig.s02BalanceCdf || 0,
              met: (vimbisaElig.s02BalanceCdf || 0) >= 30000
            },
            activity: {
              label: 'Activité agricole prouvée',
              required: true,
              current: false,
              met: false
            }
          }
        },
        {
          serviceCode: 'LIKELEMBA',
          serviceName: 'Crédit Épargne de Groupe',
          description: 'Variable, 12 mois, 0.5% intérêt',
          isActive: activeCredits.some(c => c.productType === 'LIKELEMBA'),
          isEligible: false,
          eligibilityReasons: ['Groupe requis (5-20 membres)'],
          currentCredit: activeCredits.find(c => c.productType === 'LIKELEMBA') || null,
          conditions: {
            group: {
              label: 'Groupe constitué (5-20 membres)',
              required: 5,
              current: 0,
              met: false
            }
          }
        }
      ];

      // 6. Construire réponse comptes avec conditions d'activation
      const accountConditions: Record<string, string> = {
        'S01_STANDARD': 'Automatique à l\'inscription',
        'S02_MANDATORY_SAVINGS': 'Premier dépôt dans le compte',
        'S03_CAUTION': 'Automatique lors demande crédit (caution bloquée)',
        'S04_CREDIT': 'Automatique lors décaissement crédit',
        'S05_BWAKISA_CARTE': 'Configuration manuelle (périodicité + montant cible)',
        'S06_FINES': 'Automatique si retard paiement crédit'
      };

      const accountsStatus = allAccounts.map(acc => ({
        accountType: acc.accountType,
        accountTypeCode: acc.accountTypeCode,
        currency: acc.currency,
        status: acc.status,
        balanceCdf: acc.balanceCdf,
        balanceUsd: acc.balanceUsd,
        activationCondition: accountConditions[acc.accountType] || 'Condition non définie',
        isActive: acc.status === 'ACTIVE'
      }));

      return reply.send({
        success: true,
        data: {
          customerId,
          customerName: `${customer.firstName} ${customer.lastName}`,
          kycStatus: customer.kycStatus,
          category: customer.category,
          services,
          accounts: accountsStatus
        }
      });
    } catch (error: any) {
      console.error('[Credit Services All Error]', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * POST /credit/applications
   * Créer une demande de crédit
   */
  fastify.post('/applications', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // TODO: Implémenter avec services produits
      return reply.send({
        success: true,
        message: 'Demande de crédit créée (TODO: implémenter)',
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /credit/applications/:customerId
   * Récupérer les demandes de crédit d'un client
   */
  fastify.get('/applications/:customerId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // TODO: Implémenter avec base de données
      return reply.send({
        success: true,
        data: [],
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });
}
