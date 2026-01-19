import { db } from '../../../db';
import { partnerPoints, partnerOperations, mobileAppInstalls, partnerApprovals, customers, systemSettings } from '../../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Partner Points Configuration - DYNAMIC from system_settings
 * Default values used if not configured in database
 */
export const PARTNER_POINTS_DEFAULT = {
    CLIENT_CREATION: 50,
    KYC_SUBMISSION: 25,
    DEPOSIT: 5,
    WITHDRAWAL: 5,
    PAYMENT: 10,
    CREDIT_APPLICATION: 30,
    APP_INSTALL: 100,
    CARD_REQUEST: 15,
} as const;

export type PartnerOperationType = keyof typeof PARTNER_POINTS_DEFAULT;

/**
 * Partner Points Service
 * Manages point allocation, tracking, and operations
 * Points are configured dynamically in system_settings table
 */
export class PartnerPointsService {
    private pointsCache: Map<string, number> = new Map();
    private cacheTimestamp: number = 0;
    private CACHE_TTL = 60000; // 1 minute cache

    /**
     * Get points configuration from database (with caching)
     */
    private async getPointsConfig(): Promise<Record<string, number>> {
        const now = Date.now();
        
        // Return cache if still valid
        if (now - this.cacheTimestamp < this.CACHE_TTL && this.pointsCache.size > 0) {
            return Object.fromEntries(this.pointsCache);
        }

        // Fetch from database
        const settings = await db
            .select()
            .from(systemSettings)
            .where(sql`${systemSettings.category} = 'PARTNER_POINTS'`);

        // Build config from database or use defaults
        const config: Record<string, number> = {};
        
        for (const [key, defaultValue] of Object.entries(PARTNER_POINTS_DEFAULT)) {
            const settingKey = `PARTNER_POINTS_${key}`;
            const dbSetting = settings.find(s => s.key === settingKey);
            
            if (dbSetting) {
                config[key] = parseInt(dbSetting.value, 10);
            } else {
                config[key] = defaultValue;
            }
        }

        // Update cache
        this.pointsCache = new Map(Object.entries(config));
        this.cacheTimestamp = now;

        return config;
    }

    /**
     * Get points for a specific operation type
     */
    async getPointsForOperation(operationType: PartnerOperationType): Promise<number> {
        const config = await this.getPointsConfig();
        return config[operationType] || PARTNER_POINTS_DEFAULT[operationType];
    }

    /**
     * Get all points configuration (for admin/partner dashboard)
     */
    async getAllPointsConfig(): Promise<Record<string, number>> {
        return await this.getPointsConfig();
    }

    /**
     * Update points configuration (admin only)
     */
    async updatePointsConfig(operationType: PartnerOperationType, points: number, adminId: number): Promise<void> {
        const settingKey = `PARTNER_POINTS_${operationType}`;
        
        // Check if setting exists
        const [existing] = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.key, settingKey));

        if (existing) {
            // Update existing
            await db
                .update(systemSettings)
                .set({
                    value: points.toString(),
                    lastModifiedBy: adminId,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                    history: sql`
                        COALESCE(${systemSettings.history}, '[]'::jsonb) || 
                        jsonb_build_array(jsonb_build_object(
                            'previousValue', ${existing.value},
                            'newValue', ${points.toString()},
                            'modifiedBy', ${adminId},
                            'modifiedAt', CURRENT_TIMESTAMP
                        ))
                    `
                })
                .where(eq(systemSettings.key, settingKey));
        } else {
            // Create new
            await db.insert(systemSettings).values({
                key: settingKey,
                category: 'PARTNER_POINTS',
                value: points.toString(),
                dataType: 'INTEGER',
                description: `Points awarded for ${operationType} operation`,
                isSystem: false,
                isEncrypted: false,
                defaultValue: PARTNER_POINTS_DEFAULT[operationType].toString(),
                lastModifiedBy: adminId,
            });
        }

        // Clear cache to force refresh
        this.pointsCache.clear();
        this.cacheTimestamp = 0;
    }
    /**
     * Award points to a partner for an operation
     */
    async awardPoints(
        partnerId: number,
        operationType: PartnerOperationType,
        description: string,
        metadata?: any,
        operationId?: number
    ) {
        // Get dynamic points from config
        const points = await this.getPointsForOperation(operationType);

        const [pointRecord] = await db.insert(partnerPoints).values({
            partnerId,
            points,
            operationType,
            operationId,
            description,
            metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        }).returning();

        return pointRecord;
    }

    /**
     * Get total points for a partner
     */
    async getPartnerTotalPoints(partnerId: number): Promise<number> {
        const result = await db
            .select({
                totalPoints: sql<number>`COALESCE(SUM(${partnerPoints.points}), 0)::int`
            })
            .from(partnerPoints)
            .where(eq(partnerPoints.partnerId, partnerId));

        return result[0]?.totalPoints || 0;
    }

    /**
     * Get partner points breakdown by operation type
     */
    async getPartnerPointsBreakdown(partnerId: number) {
        const result = await db
            .select({
                operationType: partnerPoints.operationType,
                totalPoints: sql<number>`SUM(${partnerPoints.points})::int`,
                count: sql<number>`COUNT(*)::int`
            })
            .from(partnerPoints)
            .where(eq(partnerPoints.partnerId, partnerId))
            .groupBy(partnerPoints.operationType);

        return result;
    }

    /**
     * Get recent partner points history
     */
    async getPartnerPointsHistory(partnerId: number, limit: number = 20) {
        return await db
            .select()
            .from(partnerPoints)
            .where(eq(partnerPoints.partnerId, partnerId))
            .orderBy(desc(partnerPoints.createdAt))
            .limit(limit);
    }

    /**
     * Create a partner operation record
     */
    async createOperation(data: {
        partnerId: number;
        operationType: string;
        targetCustomerId?: number;
        amount?: number;
        currency?: 'CDF' | 'USD';
        description: string;
        metadata?: any;
    }) {
        const [operation] = await db.insert(partnerOperations).values({
            partnerId: data.partnerId,
            operationType: data.operationType,
            targetCustomerId: data.targetCustomerId,
            amount: data.amount?.toString(),
            currency: data.currency || 'CDF',
            description: data.description,
            status: 'PENDING',
            pointsAwarded: 0,
            metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : null,
        }).returning();

        return operation;
    }

    /**
     * Approve a partner operation and award points
     */
    async approveOperation(operationId: number, approvedBy: number) {
        // Get the operation
        const [operation] = await db
            .select()
            .from(partnerOperations)
            .where(eq(partnerOperations.id, operationId));

        if (!operation) {
            throw new Error('Operation not found');
        }

        if (operation.status !== 'PENDING') {
            throw new Error('Operation is not pending');
        }

        // Get dynamic points based on operation type
        const operationType = operation.operationType as PartnerOperationType;
        const points = await this.getPointsForOperation(operationType);

        // Update operation status
        const [updatedOperation] = await db
            .update(partnerOperations)
            .set({
                status: 'APPROVED',
                approvedBy,
                approvalDate: sql`CURRENT_TIMESTAMP`,
                pointsAwarded: points,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(partnerOperations.id, operationId))
            .returning();

        // Award points if applicable
        if (points > 0) {
            await this.awardPoints(
                operation.partnerId,
                operationType,
                `Points for ${operation.description}`,
                { operationId },
                operationId
            );
        }

        return updatedOperation;
    }

    /**
     * Get partner operations with filtering
     */
    async getPartnerOperations(partnerId: number, filters?: {
        status?: string;
        operationType?: string;
        limit?: number;
    }) {
        const results = await db
            .select()
            .from(partnerOperations)
            .where(eq(partnerOperations.partnerId, partnerId))
            .orderBy(desc(partnerOperations.createdAt))
            .limit(filters?.limit || 100);

        return results;
    }

    /**
     * Track mobile app installation
     */
    async trackAppInstall(data: {
        partnerId: number;
        customerId: number;
        referralCode: string;
        deviceInfo?: any;
    }) {
        // Check if customer already has an install record
        const existing = await db
            .select()
            .from(mobileAppInstalls)
            .where(eq(mobileAppInstalls.customerId, data.customerId));

        if (existing.length > 0) {
            throw new Error('App already installed for this customer');
        }

        // Create install record
        const [install] = await db.insert(mobileAppInstalls).values({
            partnerId: data.partnerId,
            customerId: data.customerId,
            referralCode: data.referralCode,
            deviceInfo: data.deviceInfo ? JSON.parse(JSON.stringify(data.deviceInfo)) : null,
            pointsAwarded: 0, // Will be awarded after verification
            verified: false,
        }).returning();

        return install;
    }

    /**
     * Verify and award points for app installation
     */
    async verifyAppInstall(installId: number, verifiedBy: number) {
        const [install] = await db
            .select()
            .from(mobileAppInstalls)
            .where(eq(mobileAppInstalls.id, installId));

        if (!install) {
            throw new Error('Install record not found');
        }

        if (install.verified) {
            throw new Error('Install already verified');
        }

        // Get dynamic points for app install
        const points = await this.getPointsForOperation('APP_INSTALL');

        // Update install record
        const [updatedInstall] = await db
            .update(mobileAppInstalls)
            .set({
                verified: true,
                verifiedBy,
                verifiedAt: sql`CURRENT_TIMESTAMP`,
                pointsAwarded: points,
            })
            .where(eq(mobileAppInstalls.id, installId))
            .returning();

        // Award points
        await this.awardPoints(
            install.partnerId,
            'APP_INSTALL',
            `Mobile app installation for customer ${install.customerId}`,
            { installId, customerId: install.customerId }
        );

        return updatedInstall;
    }

    /**
     * Get partner approval status
     */
    async getPartnerApprovalStatus(partnerId: number) {
        const [approval] = await db
            .select()
            .from(partnerApprovals)
            .where(eq(partnerApprovals.partnerId, partnerId));

        return approval;
    }

    /**
     * Check if partner is approved
     */
    async isPartnerApproved(partnerId: number): Promise<boolean> {
        const approval = await this.getPartnerApprovalStatus(partnerId);
        return approval?.status === 'APPROVED';
    }

    /**
     * Get partner dashboard statistics
     */
    async getPartnerDashboardStats(partnerId: number) {
        const [totalPoints, pointsBreakdown, approval, recentOperations] = await Promise.all([
            this.getPartnerTotalPoints(partnerId),
            this.getPartnerPointsBreakdown(partnerId),
            this.getPartnerApprovalStatus(partnerId),
            this.getPartnerOperations(partnerId, { limit: 10 }),
        ]);

        // Count operations by status
        const operationsByStatus = await db
            .select({
                status: partnerOperations.status,
                count: sql<number>`COUNT(*)::int`
            })
            .from(partnerOperations)
            .where(eq(partnerOperations.partnerId, partnerId))
            .groupBy(partnerOperations.status);

        // Count app installs
        const appInstalls = await db
            .select({
                total: sql<number>`COUNT(*)::int`,
                verified: sql<number>`SUM(CASE WHEN ${mobileAppInstalls.verified} THEN 1 ELSE 0 END)::int`
            })
            .from(mobileAppInstalls)
            .where(eq(mobileAppInstalls.partnerId, partnerId));

        return {
            totalPoints,
            pointsBreakdown,
            approval: {
                status: approval?.status || 'PENDING',
                agencyId: approval?.agencyId,
                approvalDate: approval?.approvalDate,
                notes: approval?.notes,
            },
            operations: {
                recent: recentOperations,
                byStatus: operationsByStatus,
            },
            appInstalls: appInstalls[0] || { total: 0, verified: 0 },
        };
    }

    /**
     * Assign an agency to a partner
     */
    async assignAgency(data: {
        partnerId: number;
        agencyId: number;
    }) {
        // First check if there's already an approval record
        const [existingApproval] = await db
            .select()
            .from(partnerApprovals)
            .where(eq(partnerApprovals.partnerId, data.partnerId));

        if (existingApproval) {
            // Update existing approval record
            const [updatedApproval] = await db
                .update(partnerApprovals)
                .set({
                    agencyId: data.agencyId,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(partnerApprovals.partnerId, data.partnerId))
                .returning();

            // Also update the customer's agency
            await db
                .update(customers)
                .set({
                    agencyId: data.agencyId,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(customers.id, data.partnerId));

            return updatedApproval;
        } else {
            // Create new approval record
            const [newApproval] = await db
                .insert(partnerApprovals)
                .values({
                    partnerId: data.partnerId,
                    agencyId: data.agencyId,
                    status: 'PENDING', // Default to PENDING until admin approves
                    createdAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .returning();

            // Also update the customer's agency
            await db
                .update(customers)
                .set({
                    agencyId: data.agencyId,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(customers.id, data.partnerId));

            return newApproval;
        }
    }
}

export const partnerPointsService = new PartnerPointsService();
