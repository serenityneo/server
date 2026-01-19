import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { partnerPointsService } from '../services/partner-points.service';
import { db } from '../../../db';
import { customers, partnerApprovals, agencies } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { handleError } from './error-handler';

/**
 * Middleware to check if user is a partner
 */
async function requirePartner(request: FastifyRequest, reply: FastifyReply) {
    // TODO: Implement proper auth check from token
    // For now, we'll assume customerId is in request.body or query
    const customerId = (request.body as any)?.customerId || (request.query as any)?.customerId;
    
    if (!customerId) {
        return reply.status(401).send({
            success: false,
            error: 'Authentication required'
        });
    }

    const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId));

    if (!customer || customer.customerType !== 'PARTNER') {
        return reply.status(403).send({
            success: false,
            error: 'Partner access required'
        });
    }

    // Attach partner to request for use in routes
    (request as any).partner = customer;
}

export default async function partnerRoutes(fastify: FastifyInstance) {
    /**
     * GET /partner/dashboard/stats
     * Get partner dashboard statistics
     */
    fastify.get('/partner/dashboard/stats', {
        preHandler: requirePartner,
        schema: {
            tags: ['Partner'],
            summary: 'Get partner dashboard statistics',
            querystring: {
                type: 'object',
                properties: {
                    customerId: { type: 'number' }
                },
                required: ['customerId']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { customerId } = request.query as { customerId: number };
            const stats = await partnerPointsService.getPartnerDashboardStats(customerId);

            return reply.send({
                success: true,
                data: stats
            });
        } catch (error) {
      console.error('[Partner] Error fetching dashboard:', error);
      handleError(request, reply, error, 500);
        }
    });

    /**
     * GET /partner/points/history
     * Get partner points history
     */
    fastify.get('/partner/points/history', {
        preHandler: requirePartner,
        schema: {
            tags: ['Partner'],
            summary: 'Get partner points history',
            querystring: {
                type: 'object',
                properties: {
                    customerId: { type: 'number' },
                    limit: { type: 'number', default: 20 }
                },
                required: ['customerId']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { customerId, limit } = request.query as { customerId: number; limit?: number };
            const history = await partnerPointsService.getPartnerPointsHistory(customerId, limit);

            return reply.send({
                success: true,
                data: history
            });
        } catch (error) {
      console.error('[Partner] Error fetching profile:', error);
      handleError(request, reply, error, 500);
        }
    });

    /**
     * GET /partner/points/breakdown
     * Get partner points breakdown by operation type
     */
    fastify.get('/partner/points/breakdown', {
        preHandler: requirePartner,
        schema: {
            tags: ['Partner'],
            summary: 'Get partner points breakdown',
            querystring: {
                type: 'object',
                properties: {
                    customerId: { type: 'number' }
                },
                required: ['customerId']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { customerId } = request.query as { customerId: number };
            const breakdown = await partnerPointsService.getPartnerPointsBreakdown(customerId);

            return reply.send({
                success: true,
                data: breakdown
            });
        } catch (error) {
      console.error('[Partner] Error fetching stats:', error);
      handleError(request, reply, error, 500);
        }
    });

    /**
     * POST /partner/operations
     * Create a new partner operation
     */
    fastify.post('/partner/operations', {
        preHandler: requirePartner,
        schema: {
            tags: ['Partner'],
            summary: 'Create a partner operation',
            body: {
                type: 'object',
                properties: {
                    customerId: { type: 'number' },
                    operationType: { type: 'string' },
                    targetCustomerId: { type: 'number' },
                    amount: { type: 'number' },
                    currency: { type: 'string', enum: ['CDF', 'USD'] },
                    description: { type: 'string' },
                    metadata: { type: 'object' }
                },
                required: ['customerId', 'operationType', 'description']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const data = request.body as {
                customerId: number;
                operationType: string;
                targetCustomerId?: number;
                amount?: number;
                currency?: 'CDF' | 'USD';
                description: string;
                metadata?: any;
            };

            // Check if partner is approved
            const isApproved = await partnerPointsService.isPartnerApproved(data.customerId);
            if (!isApproved) {
                return reply.status(403).send({
                    success: false,
                    error: 'Partner account not approved. Please wait for admin approval.'
                });
            }

            const operation = await partnerPointsService.createOperation({
                partnerId: data.customerId,
                operationType: data.operationType,
                targetCustomerId: data.targetCustomerId,
                amount: data.amount,
                currency: data.currency,
                description: data.description,
                metadata: data.metadata
            });

            return reply.send({
                success: true,
                data: operation
            });
        } catch (error) {
      console.error('[Partner] Error updating profile:', error);
      handleError(request, reply, error, 500);
        }
    });

    /**
     * GET /partner/operations
     * Get partner operations
     */
    fastify.get('/partner/operations', {
        preHandler: requirePartner,
        schema: {
            tags: ['Partner'],
            summary: 'Get partner operations',
            querystring: {
                type: 'object',
                properties: {
                    customerId: { type: 'number' },
                    status: { type: 'string' },
                    operationType: { type: 'string' },
                    limit: { type: 'number' }
                },
                required: ['customerId']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { customerId, status, operationType, limit } = request.query as {
                customerId: number;
                status?: string;
                operationType?: string;
                limit?: number;
            };

            const operations = await partnerPointsService.getPartnerOperations(customerId, {
                status,
                operationType,
                limit
            });

            return reply.send({
                success: true,
                data: operations
            });
        } catch (error) {
      console.error('[Partner] Error fetching points:', error);
      handleError(request, reply, error, 500);
        }
    });

    /**
     * POST /partner/app-install
     * Track mobile app installation
     */
    fastify.post('/partner/app-install', {
        preHandler: requirePartner,
        schema: {
            tags: ['Partner'],
            summary: 'Track mobile app installation',
            body: {
                type: 'object',
                properties: {
                    partnerId: { type: 'number' },
                    customerId: { type: 'number' },
                    referralCode: { type: 'string' },
                    deviceInfo: { type: 'object' }
                },
                required: ['partnerId', 'customerId', 'referralCode']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const data = request.body as {
                partnerId: number;
                customerId: number;
                referralCode: string;
                deviceInfo?: any;
            };

            const install = await partnerPointsService.trackAppInstall(data);

            return reply.send({
                success: true,
                data: install,
                message: 'App installation tracked. Awaiting admin verification for points.'
            });
        } catch (error) {
      console.error('[Partner] Error tracking installation:', error);
      handleError(request, reply, error, 500);
        }
    });

    /**
     * GET /partner/referral-code
     * Generate partner referral code for mobile app
     */
    fastify.get('/partner/referral-code', {
        preHandler: requirePartner,
        schema: {
            tags: ['Partner'],
            summary: 'Generate partner referral code',
            querystring: {
                type: 'object',
                properties: {
                    customerId: { type: 'number' }
                },
                required: ['customerId']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { customerId } = request.query as { customerId: number };

            // Get partner details
            const [partner] = await db
                .select()
                .from(customers)
                .where(eq(customers.id, customerId));

            if (!partner) {
                return reply.status(404).send({
                    success: false,
                    error: 'Partner not found'
                });
            }

            // Generate referral code: PCODE-YYYYMM-RANDOM
            const partnerCode = partner.partnerCode || `P${customerId}`;
            const date = new Date();
            const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
            const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            const referralCode = `${partnerCode}-${yearMonth}-${random}`;

            return reply.send({
                success: true,
                data: {
                    referralCode,
                    partnerId: customerId,
                    partnerCode,
                    expiresAt: null // Referral codes don't expire
                }
            });
        } catch (error) {
            fastify.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error'
            });
        }
    });

    /**
     * GET /partner/approval-status
     * Get partner approval status
     */
    fastify.get('/partner/approval-status', {
        preHandler: requirePartner,
        schema: {
            tags: ['Partner'],
            summary: 'Get partner approval status',
            querystring: {
                type: 'object',
                properties: {
                    customerId: { type: 'number' }
                },
                required: ['customerId']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { customerId } = request.query as { customerId: number };
            const approval = await partnerPointsService.getPartnerApprovalStatus(customerId);

            if (!approval) {
                return reply.send({
                    success: true,
                    data: {
                        status: 'PENDING',
                        message: 'Approval pending. An admin will review your account soon.'
                    }
                });
            }

            // Get agency details if approved
            let agencyDetails = null;
            if (approval.agencyId) {
                const [agency] = await db
                    .select()
                    .from(agencies)
                    .where(eq(agencies.id, approval.agencyId));
                agencyDetails = agency;
            }

            return reply.send({
                success: true,
                data: {
                    ...approval,
                    agency: agencyDetails
                }
            });
        } catch (error) {
      console.error('[Partner] Error fetching referrals:', error);
      handleError(request, reply, error, 500);
        }
    });

    /**
     * POST /partner/assign-agency
     * Assign an agency to a partner
     */
    fastify.post('/partner/assign-agency', {
        preHandler: requirePartner,
        schema: {
            tags: ['Partner'],
            summary: 'Assign an agency to a partner',
            body: {
                type: 'object',
                properties: {
                    partnerId: { type: 'number' },
                    agencyId: { type: 'number' }
                },
                required: ['partnerId', 'agencyId']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const data = request.body as {
                partnerId: number;
                agencyId: number;
            };

            const approval = await partnerPointsService.assignAgency(data);

            return reply.send({
                success: true,
                data: approval
            });
        } catch (error) {
      console.error('[Partner] Error assigning agency:', error);
      handleError(request, reply, error, 500);
        }

    });
}
