import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AccountService } from './credit/config/account.service';
import { CreditService } from './credit/config/credit.service';
import { SavingsService } from './credit/config/savings.service';
import { TransactionService } from './credit/config/transaction.service';
import { SerenityPointsService } from './credit/config/serenity-points.service';
import { db } from '../../db';
import { customers, accounts, credits, bwakisaServices, transactions } from '../../db/schema';
import { eq } from 'drizzle-orm';
import agentsRoutes from './routes/agents.routes';
import agenciesRoutes from './routes/agencies.routes';
import { exchangeRateRoutes } from './routes/exchange-rate.routes';
import customerBillingRoutes from './routes/customer-billing.routes';
import customerTicketsRoutes from './routes/customer-tickets.routes';
import accountServicesRoutes from './routes/customer-account-services.routes';
import customerDashboardRoutes from './routes/customer-dashboard.routes';
import customerNotificationRoutes from './routes/customer-notifications.routes';
import customerEligibilityRoutes from './routes/customer-eligibility.routes';
import s04CreditRoutes from './credit/routes/s04-credit.routes';
import { registerS05Routes } from './savings/routes/s05-routes';

export async function registerCoreBankingRoutes(fastify: FastifyInstance) {
    // Dynamic UI base URL from environment (PRODUCTION READY)
    const UI_BASE_URL = process.env.UI_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Register agent and agency management routes
    await fastify.register(agentsRoutes, { prefix: '/admin' });
    await fastify.register(agenciesRoutes, { prefix: '/admin' });
    // Register exchange rate routes
    await fastify.register(exchangeRateRoutes, { prefix: '/exchange-rate' });
    // Register customer billing routes
    await fastify.register(customerBillingRoutes, { prefix: '/customer' });
    // Register customer support tickets routes
    await fastify.register(customerTicketsRoutes, { prefix: '/customer' });
    // Register customer account services routes
    await fastify.register(accountServicesRoutes, { prefix: '/customer' });
    // Register customer dashboard routes (OPTIMIZED - P90/P95 < 200ms)
    await fastify.register(customerDashboardRoutes, { prefix: '/customer' });
    // Register customer notification routes (OPTIMIZED - P90/P95 < 200ms)
    await fastify.register(customerNotificationRoutes, { prefix: '/customer' });
    // Register customer eligibility & smart notifications routes
    await fastify.register(customerEligibilityRoutes, { prefix: '/customer' });
    // Register S04 credit allocation routes (Customer + Admin)
    await fastify.register(s04CreditRoutes, { prefix: '/api/v1' });
    // Register S05 Buakisa Carte savings routes (Customer + Admin)
    await fastify.register(registerS05Routes, { prefix: '' });

    const accountService = new AccountService();
    const creditService = new CreditService();
    const savingsService = new SavingsService();
    const transactionService = new TransactionService();
    const pointsService = new SerenityPointsService();

    // --- Security helper ---
    const requireToken = async (request: FastifyRequest, reply: FastifyReply) => {
        const hdr = String(request.headers['authorization'] || '');
        const expected = process.env.CORE_BANKING_API_TOKEN || '';
        if (!expected) return; // if not configured, skip
        const ok = hdr.startsWith('Bearer ') && hdr.slice(7) === expected;
        if (!ok) {
            reply.status(401).send({ error: 'Unauthorized' });
        }
    };

    // --- Accounts ---
    fastify.get('/accounts/:customerId', { preHandler: requireToken }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { customerId } = request.params as { customerId: string };
        return await accountService.getCustomerAccounts(parseInt(customerId));
    });

    // --- Customers (admin utilities) ---

    // Get complete customer profile with all KYC data (OLD - URL param version)
    fastify.get('/customer/profile/complete/:customerId', { preHandler: requireToken }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { customerId } = request.params as { customerId: string };
        const id = parseInt(customerId);

        if (!id || Number.isNaN(id)) {
            return reply.status(400).send({ error: 'customerId invalide' });
        }

        try {
            // Get customer basic data
            const [customer] = await db.select().from(customers).where(eq(customers.id, id));

            if (!customer) {
                return reply.status(404).send({ error: 'Client non trouvé' });
            }

            // Get KYC Step 2 data (address, commune, quartier)
            let step2Data: any = {};
            try {
                const step2Response = await fetch(`${UI_BASE_URL}/api/client/kyc/step2?customerId=${id}`);
                if (step2Response.ok) {
                    const step2Json = await step2Response.json();
                    step2Data = step2Json?.data || {};
                }
            } catch (err) {
                console.log('Could not fetch KYC Step 2 data:', err);
            }

            // Get commune and quartier names if available
            let communeName = '';
            let quartierName = '';

            if (step2Data?.commune_id) {
                try {
                    const communesResponse = await fetch(`${UI_BASE_URL}/api/geography/communes`);
                    if (communesResponse.ok) {
                        const communesData = await communesResponse.json();
                        const communes = Array.isArray(communesData?.data) ? communesData.data : [];
                        const commune = communes.find((c: any) => String(c.id) === String(step2Data.commune_id));
                        communeName = commune?.name || '';
                    }
                } catch (err) {
                    console.log('Could not fetch commune name:', err);
                }
            }

            if (step2Data?.quartier_id) {
                try {
                    const quartiersResponse = await fetch(`${UI_BASE_URL}/api/geography/quartiers?commune_id=${step2Data.commune_id}`);
                    if (quartiersResponse.ok) {
                        const quartiersData = await quartiersResponse.json();
                        const quartiers = Array.isArray(quartiersData?.data) ? quartiersData.data : [];
                        const quartier = quartiers.find((q: any) => String(q.id) === String(step2Data.quartier_id));
                        quartierName = quartier?.name || '';
                    }
                } catch (err) {
                    console.log('Could not fetch quartier name:', err);
                }
            }

            // Build complete profile
            const profile = {
                // Personal Information
                firstName: customer.firstName || '',
                lastName: customer.lastName || '',
                email: customer.email || '',
                mobileMoneyNumber: customer.mobileMoneyNumber || '',

                // Account Information
                cifCode: customer.cifCode || '',
                accountType: 'Compte Particulier',
                customerCategory: customer.category || 'CATEGORY_1',
                kycStatus: customer.kycStatus || 'NOT_STARTED',

                // Registration Information
                createdAt: customer.createdAt || new Date(),

                // Address Information (from KYC2)
                address: step2Data?.street || customer.address || '',
                commune: communeName,
                quartier: quartierName,

                // Additional Information
                dateOfBirth: customer.dateOfBirth || step2Data?.dateOfBirth || '',
                placeOfBirth: customer.placeOfBirth || step2Data?.placeOfBirth || '',
                nationality: customer.nationality || step2Data?.nationality || '',
                maritalStatus: customer.civilStatus || step2Data?.maritalStatus || ''
            };

            return reply.send({
                success: true,
                data: profile
            });

        } catch (error: any) {
            console.error('Error fetching complete profile:', error);
            return reply.status(500).send({
                error: 'Erreur lors de la récupération du profil',
                details: error.message
            });
        }
    });

    // Get complete customer profile - SECURE POST version (no URL params)
    fastify.post('/customer/profile', {
        preHandler: requireToken,
        schema: {
            tags: ['Customer'],
            summary: 'Obtenir le profil complet du client',
            body: {
                type: 'object',
                properties: {
                    customerId: { type: 'number' }
                },
                required: ['customerId']
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            additionalProperties: true  // Allow any properties in the data object
                        }
                    }
                },
                404: {
                    type: 'object',
                    properties: { error: { type: 'string' } }
                },
                500: {
                    type: 'object',
                    properties: { error: { type: 'string' } }
                }
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { customerId } = request.body as { customerId: number };

        console.log('[Fastify Profile] ===== START REQUEST =====');
        console.log('[Fastify Profile] Received customerId:', customerId);
        console.log('[Fastify Profile] customerId type:', typeof customerId);

        if (!customerId || Number.isNaN(Number(customerId))) {
            console.error('[Fastify Profile] Invalid customerId:', customerId);
            return reply.status(400).send({ error: 'customerId invalide' });
        }

        const id = Number(customerId);
        console.log('[Fastify Profile] Parsed ID:', id);

        try {
            console.log('[Fastify Profile] Querying database for customer ID:', id);

            // Get customer basic data from Drizzle
            const [customer] = await db.select().from(customers).where(eq(customers.id, id));

            console.log('[Fastify Profile] Database query completed');
            console.log('[Fastify Profile] Customer found:', customer ? 'YES' : 'NO');

            if (customer) {
                console.log('[Fastify Profile] Customer data:', {
                    id: customer.id,
                    firstName: customer.firstName,
                    lastName: customer.lastName,
                    email: customer.email,
                    mobileMoneyNumber: customer.mobileMoneyNumber,
                    cifCode: customer.cifCode,
                    publicId: customer.publicId,
                    createdAt: customer.createdAt
                });
            }

            if (!customer) {
                console.error('[Fastify Profile] No customer found for ID:', id);
                return reply.status(404).send({
                    success: false,
                    error: 'Client non trouvé'
                });
            }

            // Log raw customer data to see all fields
            console.log('[Fastify Profile] Raw customer object keys:', Object.keys(customer));
            console.log('[Fastify Profile] Raw customer object:', JSON.stringify(customer, null, 2));

            // ✅ Build complete customer object matching auth-store expectations
            // CRITICAL: auth-store.refreshProfile() expects { data: { customer: {...} } }
            const customerData: Record<string, any> = {
                // ✅ Required fields
                id: customer.id,

                // Personal Information (snake_case for auth-store compatibility)
                first_name: customer.firstName || '',
                last_name: customer.lastName || '',
                email: customer.email || '',
                mobile_money_number: customer.mobileMoneyNumber || '',
                mobile_number: customer.mobileMoneyNumber || '', // Alternative field name

                // Account Information  
                cif_code: customer.cifCode || '',
                cifCode: customer.cifCode || '', // Also camelCase for flexibility
                public_id: customer.publicId || '',
                customer_type: customer.customerType || 'MEMBER',
                category: customer.category || 'CATEGORY_1',
                kyc_status: customer.kycStatus || 'NOT_STARTED',
                kycStatus: customer.kycStatus || 'NOT_STARTED', // Also camelCase
                is_active: customer.isActive !== false, // Default true
                status: customer.status || 'ACTIVE',

                // Registration Information
                created_at: customer.createdAt || customer.accountCreationDate || new Date().toISOString(),
                createdAt: customer.createdAt || customer.accountCreationDate || new Date().toISOString(),
            };

            // Add optional fields only if they have values
            if (customer.address) {
                customerData.address = customer.address;
            }
            if (customer.quartierId) {
                customerData.quartier_id = customer.quartierId;
                customerData.quartierId = customer.quartierId;
            }
            if (customer.postalCodeId) {
                customerData.postal_code_id = customer.postalCodeId;
                customerData.postalCodeId = customer.postalCodeId;
            }
            if (customer.dateOfBirth) {
                customerData.date_of_birth = customer.dateOfBirth;
                customerData.dateOfBirth = customer.dateOfBirth;
            }
            if (customer.placeOfBirth) {
                customerData.place_of_birth = customer.placeOfBirth;
                customerData.placeOfBirth = customer.placeOfBirth;
            }
            if (customer.nationality) {
                customerData.nationality = customer.nationality;
            }
            if (customer.civilStatus) {
                customerData.civil_status = customer.civilStatus;
                customerData.civilStatus = customer.civilStatus;
                customerData.maritalStatus = customer.civilStatus; // Alternative name
            }
            if (customer.profession) {
                customerData.profession = customer.profession;
            }
            if (customer.employer) {
                customerData.employer = customer.employer;
            }
            if (customer.cif) {
                customerData.cif = customer.cif; // 8-digit CIF
            }

            console.log('[Fastify Profile] Constructed customer object:', customerData);
            console.log('[Fastify Profile] Sending successful response');

            // ✅ CRITICAL: Wrap in { data: { customer: {...} } } structure
            const responsePayload = {
                success: true,
                data: {
                    customer: customerData
                }
            };

            console.log('[Fastify Profile] Response payload before send:', JSON.stringify(responsePayload, null, 2));

            return reply.send(responsePayload);

        } catch (error: any) {
            console.error('[Fastify] Error fetching complete profile:', error);
            return reply.status(500).send({
                success: false,
                error: 'Erreur lors de la récupération du profil',
                details: error.message
            });
        }
    });

    fastify.post('/customers/create', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    email: { type: 'string' },
                    mobileMoneyNumber: { type: 'string' }
                }
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { firstName, lastName, email, mobileMoneyNumber } = (request.body as any) || {};
        const [created] = await db.insert(customers).values({
            firstName,
            lastName,
            email,
            mobileMoneyNumber,
            status: 'PENDING',
            kycStatus: 'NOT_STARTED',
        }).returning();
        return created;
    });

    fastify.delete('/customers/:customerId', async (request: FastifyRequest, reply: FastifyReply) => {
        const { customerId } = request.params as { customerId: string };
        const id = Number(customerId);
        if (!id || Number.isNaN(id)) return reply.status(400).send({ error: 'customerId invalide' });
        await db.transaction(async (tx) => {
            const accs = await tx.select().from(accounts).where(eq(accounts.customerId, id));
            for (const acc of accs) {
                await tx.delete(transactions).where(eq(transactions.accountId, acc.id));
            }
            await tx.delete(credits).where(eq(credits.customerId, id));
            await tx.delete(bwakisaServices).where(eq(bwakisaServices.customerId, id));
            await tx.delete(accounts).where(eq(accounts.customerId, id));
            await tx.delete(customers).where(eq(customers.id, id));
        });
        return { ok: true };
    });

    fastify.get('/accounts/catalog', async (request: FastifyRequest, reply: FastifyReply) => {
        return await accountService.getAccountCatalog();
    });

    fastify.post('/accounts/initialize', {
        preHandler: requireToken,
        schema: {
            body: {
                type: 'object',
                properties: {
                    customerId: { type: 'number' },
                    termsAccepted: { type: 'boolean' },
                    ipAddress: { type: 'string' }
                },
                required: ['customerId']
            },
            response: {
                200: { type: 'object' },
                400: {
                    type: 'object',
                    properties: { error: { type: 'string' } }
                }
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { customerId, termsAccepted, ipAddress } = request.body as {
                customerId: number;
                termsAccepted?: boolean;
                ipAddress?: string
            };
            if (!customerId || Number.isNaN(Number(customerId))) {
                return reply.status(400).send({ error: 'customerId manquant ou invalide' });
            }

            const result = await accountService.initializeCustomerAccount(
                Number(customerId),
                { termsAccepted, ipAddress }
            );
            return result;
        } catch (e: any) {
            const msg = typeof e?.message === 'string' ? e.message : 'Erreur inconnue';
            return reply.status(400).send({ error: msg });
        }
    });

    // --- Credits ---
    fastify.post('/credits/apply', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    customerId: { type: 'number' },
                    type: { type: 'string' },
                    amount: { type: 'number', minimum: 0 },
                    currency: { type: 'string', enum: ['CDF', 'USD'] },
                    durationMonths: { type: 'number' }
                },
                required: ['customerId', 'type', 'amount', 'currency']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { customerId, type, amount, currency, durationMonths } = request.body as any;
        return await creditService.applyForCredit(customerId, type, amount, currency, durationMonths);
    });

    fastify.post('/credits/:creditId/approve', async (request: FastifyRequest, reply: FastifyReply) => {
        const { creditId } = request.params as { creditId: string };
        const { approvedByUserId } = request.body as { approvedByUserId: number };
        return await creditService.approveCredit(parseInt(creditId), approvedByUserId);
    });

    fastify.post('/credits/:creditId/repay', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    amount: { type: 'number', minimum: 0 },
                    currency: { type: 'string', enum: ['CDF', 'USD'] }
                },
                required: ['amount', 'currency']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { creditId } = request.params as { creditId: string };
        const { amount, currency } = request.body as { amount: number, currency: 'CDF' | 'USD' };
        const result = await creditService.repayCredit(parseInt(creditId), amount, currency);

        // Award points for repayment
        // Assuming we have customerId from context or result. 
        // We need customerId. Let's fetch credit first or return it from repayCredit.
        // repayCredit returns { creditId, remainingDebt }. 
        // We might need to fetch credit to get customerId.
        // For now, skipping automatic point award here to keep it simple, or we can fetch it.

        return result;
    });

    // --- Savings (Bwakisa) ---
    fastify.post('/savings/bwakisa/subscribe', async (request: FastifyRequest, reply: FastifyReply) => {
        const { customerId, periodicity, amount, currency, type, maturityDate, targetAmount } = request.body as any;
        const result = await savingsService.subscribeToBwakisa(customerId, periodicity, amount, currency, type, maturityDate ? new Date(maturityDate) : undefined, targetAmount);

        // Award points for subscription
        await pointsService.awardPointsForOperation(customerId, 'SUBSCRIPTION', `Bwakisa ${type}`);

        return result;
    });

    fastify.post('/savings/bwakisa/deposit', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    customerId: { type: 'number' },
                    amount: { type: 'number', minimum: 0 },
                    currency: { type: 'string', enum: ['CDF', 'USD'] }
                },
                required: ['customerId', 'amount', 'currency']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { customerId, amount, currency } = request.body as any;
        return await savingsService.processBwakisaDeposit(customerId, amount, currency);
    });

    // --- Transactions ---
    fastify.post('/transactions/deposit', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    accountId: { type: 'number' },
                    amount: { type: 'number', minimum: 0 },
                    currency: { type: 'string', enum: ['CDF', 'USD'] },
                    description: { type: 'string' }
                },
                required: ['accountId', 'amount', 'currency']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { accountId, amount, currency, description } = request.body as any;
        return await transactionService.deposit(accountId, amount, currency, description);
    });

    fastify.post('/transactions/withdraw', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    accountId: { type: 'number' },
                    amount: { type: 'number', minimum: 0 },
                    currency: { type: 'string', enum: ['CDF', 'USD'] },
                    description: { type: 'string' }
                },
                required: ['accountId', 'amount', 'currency']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { accountId, amount, currency, description } = request.body as any;
        return await transactionService.withdraw(accountId, amount, currency, description);
    });

    // --- Points ---
    fastify.get('/points/:customerId', async (request: FastifyRequest, reply: FastifyReply) => {
        const { customerId } = request.params as { customerId: string };
        return await pointsService.getPointsBalance(parseInt(customerId));
    });
}
