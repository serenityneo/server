import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { partnerPointsService } from '../../partner/services/partner-points.service';
import { partnerApprovals, agencies, customers } from '../../../db/schema';
import { db } from '../../../db';
import { eq, and } from 'drizzle-orm';
import { AUTH_COOKIE_NAME } from '../../../config/auth';

/**
 * Admin routes for partner management
 * - Approve/reject partner accounts
 * - Assign agencies
 * - Configure points system
 * - Verify app installations
 */

/**
 * Security helper - Handle errors safely (BANKING SECURITY)
 */
function handleError(request: FastifyRequest, reply: FastifyReply, error: unknown, statusCode: number = 500) {
  request.log.error({ err: error }, 'Partner management error');
  reply.status(statusCode).send({
    success: false,
    error: 'Une erreur est survenue. Veuillez réessayer.'
  });
}

// Middleware: require admin authentication
async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    // TODO: Implement proper admin auth check
    const adminToken = request.headers.authorization || request.cookies[AUTH_COOKIE_NAME];
    
    if (!adminToken) {
        return reply.status(401).send({
            success: false,
            error: 'Admin authentication required'
        });
    }

    // Attach admin to request (simplified - in production verify JWT)
    (request as any).admin = { id: 1 }; // Placeholder
}

export default async function adminPartnerRoutes(fastify: FastifyInstance) {
    /**
     * GET /admin/partners/pending
     * Get all pending partner approvals
     */
    fastify.get('/admin/partners/pending', {
        preHandler: requireAdmin,
        schema: {
            tags: ['Admin - Partners'],
            summary: 'Get pending partner approvals'
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const pendingApprovals = await db
                .select({
                    approval: partnerApprovals,
                    partner: customers
                })
                .from(partnerApprovals)
                .leftJoin(customers, eq(partnerApprovals.partnerId, customers.id))
                .where(eq(partnerApprovals.status, 'PENDING'));

            return reply.send({
                success: true,
                data: pendingApprovals
            });
        } catch (error) {
            handleError(request, reply, error, 500);
        }
    });

    /**
     * POST /admin/partners/:partnerId/approve
     * Approve a partner and assign agency
     */
    fastify.post('/admin/partners/:partnerId/approve', {
        preHandler: requireAdmin,
        schema: {
            tags: ['Admin - Partners'],
            summary: 'Approve partner account',
            params: {
                type: 'object',
                properties: {
                    partnerId: { type: 'number' }
                },
                required: ['partnerId']
            },
            body: {
                type: 'object',
                properties: {
                    agencyId: { type: 'number' },
                    notes: { type: 'string' }
                },
                required: ['agencyId']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { partnerId } = request.params as { partnerId: number };
            const { agencyId, notes } = request.body as { agencyId: number; notes?: string };
            const adminId = (request as any).admin.id;

            // Verify agency exists
            const [agency] = await db
                .select()
                .from(agencies)
                .where(eq(agencies.id, agencyId));

            if (!agency) {
                return reply.status(404).send({
                    success: false,
                    error: 'Agency not found'
                });
            }

            // Update partner approval
            const [updatedApproval] = await db
                .update(partnerApprovals)
                .set({
                    status: 'APPROVED',
                    agencyId,
                    approvedBy: adminId,
                    approvalDate: new Date().toISOString(),
                    notes,
                    updatedAt: new Date().toISOString()
                })
                .where(eq(partnerApprovals.partnerId, partnerId))
                .returning();

            // Update customer agency
            await db
                .update(customers)
                .set({
                    agencyId,
                    updatedAt: new Date().toISOString()
                })
                .where(eq(customers.id, partnerId));

            return reply.send({
                success: true,
                data: updatedApproval,
                message: 'Partner approved and assigned to agency'
            });
        } catch (error) {
            handleError(request, reply, error, 500);
        }
    });

    /**
     * POST /admin/partners/:partnerId/reject
     * Reject a partner application
     */
    fastify.post('/admin/partners/:partnerId/reject', {
        preHandler: requireAdmin,
        schema: {
            tags: ['Admin - Partners'],
            summary: 'Reject partner account',
            params: {
                type: 'object',
                properties: {
                    partnerId: { type: 'number' }
                },
                required: ['partnerId']
            },
            body: {
                type: 'object',
                properties: {
                    rejectionReason: { type: 'string' }
                },
                required: ['rejectionReason']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { partnerId } = request.params as { partnerId: number };
            const { rejectionReason } = request.body as { rejectionReason: string };
            const adminId = (request as any).admin.id;

            const [updatedApproval] = await db
                .update(partnerApprovals)
                .set({
                    status: 'REJECTED',
                    approvedBy: adminId,
                    approvalDate: new Date().toISOString(),
                    rejectionReason,
                    updatedAt: new Date().toISOString()
                })
                .where(eq(partnerApprovals.partnerId, partnerId))
                .returning();

            return reply.send({
                success: true,
                data: updatedApproval,
                message: 'Partner application rejected'
            });
        } catch (error) {
            handleError(request, reply, error, 500);
        }
    });

    /**
     * GET /admin/partners/points-config
     * Get current points configuration
     */
    fastify.get('/admin/partners/points-config', {
        preHandler: requireAdmin,
        schema: {
            tags: ['Admin - Partners'],
            summary: 'Get partner points configuration'
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const config = await partnerPointsService.getAllPointsConfig();

            return reply.send({
                success: true,
                data: config
            });
        } catch (error) {
            handleError(request, reply, error, 500);
        }
    });

    /**
     * PUT /admin/partners/points-config
     * Update points configuration
     */
    fastify.put('/admin/partners/points-config', {
        preHandler: requireAdmin,
        schema: {
            tags: ['Admin - Partners'],
            summary: 'Update partner points configuration',
            body: {
                type: 'object',
                properties: {
                    operationType: { 
                        type: 'string',
                        enum: ['CLIENT_CREATION', 'KYC_SUBMISSION', 'DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'CREDIT_APPLICATION', 'APP_INSTALL', 'CARD_REQUEST']
                    },
                    points: { type: 'number', minimum: 0 }
                },
                required: ['operationType', 'points']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { operationType, points } = request.body as { operationType: any; points: number };
            const adminId = (request as any).admin.id;

            await partnerPointsService.updatePointsConfig(operationType, points, adminId);

            // Get updated config
            const updatedConfig = await partnerPointsService.getAllPointsConfig();

            return reply.send({
                success: true,
                data: updatedConfig,
                message: `Points for ${operationType} updated to ${points}`
            });
        } catch (error) {
            handleError(request, reply, error, 500);
        }
    });

    /**
     * POST /admin/partners/app-installs/:installId/verify
     * Verify mobile app installation and award points
     */
    fastify.post('/admin/partners/app-installs/:installId/verify', {
        preHandler: requireAdmin,
        schema: {
            tags: ['Admin - Partners'],
            summary: 'Verify app installation',
            params: {
                type: 'object',
                properties: {
                    installId: { type: 'number' }
                },
                required: ['installId']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { installId } = request.params as { installId: number };
            const adminId = (request as any).admin.id;

            const verifiedInstall = await partnerPointsService.verifyAppInstall(installId, adminId);

            return reply.send({
                success: true,
                data: verifiedInstall,
                message: 'App installation verified and points awarded'
            });
        } catch (error) {
            handleError(request, reply, error, 400);
        }
    });

    /**
     * POST /admin/partners/operations/:operationId/approve
     * Approve partner operation and award points
     */
    fastify.post('/admin/partners/operations/:operationId/approve', {
        preHandler: requireAdmin,
        schema: {
            tags: ['Admin - Partners'],
            summary: 'Approve partner operation',
            params: {
                type: 'object',
                properties: {
                    operationId: { type: 'number' }
                },
                required: ['operationId']
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { operationId } = request.params as { operationId: number };
            const adminId = (request as any).admin.id;

            const approvedOperation = await partnerPointsService.approveOperation(operationId, adminId);

            return reply.send({
                success: true,
                data: approvedOperation,
                message: 'Operation approved and points awarded'
            });
        } catch (error) {
            handleError(request, reply, error, 400);
        }
    });
}
