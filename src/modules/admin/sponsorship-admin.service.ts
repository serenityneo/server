/**
 * SPONSORSHIP ADMIN SERVICE
 * Gestion admin complète des parrainages MOPAO
 */

import { db } from '../../db';
import { and, eq, sql, desc, inArray } from 'drizzle-orm';
import { mopaoSponsorships, creditApplications } from '../../db/credit-products-schema';
import { customers, accounts } from '../../db/schema';
import { AuditLogger } from '../../utils/audit-logger';

export interface SponsorshipDetails {
  id: number;
  sponsor: {
    customerId: number;
    fullName: string;
    email: string;
    category: string;
    s02Balance: number;
  };
  sponsored: {
    customerId: number;
    fullName: string;
    email: string;
  };
  credit: {
    creditId: number;
    amount: number;
    status: string;
    disbursedAt?: string;
    completedAt?: string;
  };
  guarantee: {
    percentage: number;
    amountLocked: number;
    liabilityTriggered: boolean;
    sponsorPaid: number;
  };
  status: {
    isActive: boolean;
    createdAt: string;
    releasedAt?: string;
  };
}

export class SponsorshipAdminService {
  /**
   * Get all sponsorships with full details
   */
  static async getAllSponsorships(filters?: {
    sponsorId?: number;
    sponsoredId?: number;
    isActive?: boolean;
  }): Promise<SponsorshipDetails[]> {
    const conditions = [];
    
    if (filters?.sponsorId) {
      conditions.push(eq(mopaoSponsorships.sponsorCustomerId, filters.sponsorId));
    }
    if (filters?.sponsoredId) {
      conditions.push(eq(mopaoSponsorships.sponsoredCustomerId, filters.sponsoredId));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(mopaoSponsorships.isActive, filters.isActive));
    }

    const sponsorships = await db
      .select()
      .from(mopaoSponsorships)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(mopaoSponsorships.createdAt));

    // Enrich with full details
    const enriched: SponsorshipDetails[] = [];

    for (const sp of sponsorships) {
      // Get sponsor details
      const sponsor = await db.query.customers.findFirst({
        where: eq(customers.id, sp.sponsorCustomerId),
      });

      const sponsorS02 = await db.query.accounts.findFirst({
        where: and(
          eq(accounts.customerId, sp.sponsorCustomerId),
          eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')
        ),
      });

      // Get sponsored details
      const sponsored = await db.query.customers.findFirst({
        where: eq(customers.id, sp.sponsoredCustomerId),
      });

      // Get credit details
      const credit = await db.query.creditApplications.findFirst({
        where: eq(creditApplications.id, sp.creditId),
      });

      if (!sponsor || !sponsored || !credit) continue;

      enriched.push({
        id: sp.id,
        sponsor: {
          customerId: sponsor.id,
          fullName: `${sponsor.firstName} ${sponsor.lastName}`,
          email: sponsor.email || '',
          category: sponsor.category || 'CATEGORY_1',
          s02Balance: parseFloat(sponsorS02?.balanceUsd || '0'),
        },
        sponsored: {
          customerId: sponsored.id,
          fullName: `${sponsored.firstName} ${sponsored.lastName}`,
          email: sponsored.email || '',
        },
        credit: {
          creditId: credit.id,
          amount: parseFloat(credit.approvedAmountUsd || '0'),
          status: credit.status,
          disbursedAt: credit.disbursementDate || undefined,
          completedAt: credit.completionDate || undefined,
        },
        guarantee: {
          percentage: parseFloat(sp.sponsorGuaranteePercentage || '40'),
          amountLocked: parseFloat(sp.sponsorS02LockedAmountUsd || '0'),
          liabilityTriggered: sp.sponsorLiabilityTriggered || false,
          sponsorPaid: parseFloat(sp.sponsorPaidUsd || '0'),
        },
        status: {
          isActive: sp.isActive || false,
          createdAt: sp.createdAt,
          releasedAt: sp.releasedAt || undefined,
        },
      });
    }

    return enriched;
  }

  /**
   * Get sponsor statistics
   */
  static async getSponsorStats(sponsorId: number) {
    const [activeSponsorships, totalSponsored, totalLiability, successfulSponsorships] = await Promise.all([
      // Active sponsorships count
      db
        .select({ count: sql<number>`count(*)` })
        .from(mopaoSponsorships)
        .where(and(
          eq(mopaoSponsorships.sponsorCustomerId, sponsorId),
          eq(mopaoSponsorships.isActive, true)
        )),

      // Total sponsored count (all time)
      db
        .select({ count: sql<number>`count(*)` })
        .from(mopaoSponsorships)
        .where(eq(mopaoSponsorships.sponsorCustomerId, sponsorId)),

      // Total liability paid
      db
        .select({ total: sql<number>`COALESCE(SUM(CAST(sponsor_paid_usd AS NUMERIC)), 0)` })
        .from(mopaoSponsorships)
        .where(eq(mopaoSponsorships.sponsorCustomerId, sponsorId)),

      // Successful sponsorships (completed without liability)
      db
        .select({ count: sql<number>`count(*)` })
        .from(mopaoSponsorships)
        .where(and(
          eq(mopaoSponsorships.sponsorCustomerId, sponsorId),
          eq(mopaoSponsorships.isActive, false),
          eq(mopaoSponsorships.sponsorLiabilityTriggered, false)
        )),
    ]);

    return {
      activeSponsorships: Number(activeSponsorships[0].count),
      totalSponsored: Number(totalSponsored[0].count),
      totalLiabilityPaid: Number(totalLiability[0].total),
      successfulSponsorships: Number(successfulSponsorships[0].count),
      successRate: Number(totalSponsored[0].count) > 0
        ? (Number(successfulSponsorships[0].count) / Number(totalSponsored[0].count)) * 100
        : 0,
    };
  }

  /**
   * Remove sponsorship (admin only)
   * Releases guarantee and marks sponsorship as cancelled
   */
  static async removeSponsor(sponsorshipId: number, adminId: number, reason: string) {
    const sponsorship = await db.query.mopaoSponsorships.findFirst({
      where: eq(mopaoSponsorships.id, sponsorshipId),
    });

    if (!sponsorship) {
      throw new Error('Sponsorship not found');
    }

    if (!sponsorship.isActive) {
      throw new Error('Sponsorship already inactive');
    }

    // Get credit
    const credit = await db.query.creditApplications.findFirst({
      where: eq(creditApplications.id, sponsorship.creditId),
    });

    if (!credit) {
      throw new Error('Credit not found');
    }

    // Mark sponsorship as inactive
    await db
      .update(mopaoSponsorships)
      .set({
        isActive: false,
        releasedAt: new Date().toISOString(),
      })
      .where(eq(mopaoSponsorships.id, sponsorshipId));

    // Update credit status (convert to regular TELEMA or cancel)
    await db
      .update(creditApplications)
      .set({
        status: 'CANCELLED',
        notes: `Parrainage retiré par admin: ${reason}`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(creditApplications.id, sponsorship.creditId));

    // Audit log
    await AuditLogger.logAdminAction(
      adminId,
      'REMOVE_SPONSORSHIP',
      sponsorship.sponsoredCustomerId,
      'MOPAO_SPONSORSHIP',
      sponsorshipId,
      {
        sponsorId: sponsorship.sponsorCustomerId,
        creditId: sponsorship.creditId,
        reason,
        guaranteeReleased: sponsorship.sponsorS02LockedAmountUsd,
      }
    );

    console.log(`[ADMIN] Sponsorship ${sponsorshipId} removed by admin ${adminId}`);
  }

  /**
   * Get sponsorship history for a customer (as sponsor OR sponsored)
   */
  static async getCustomerSponsorshipHistory(customerId: number) {
    const [asSponsor, asSponsored] = await Promise.all([
      db
        .select()
        .from(mopaoSponsorships)
        .where(eq(mopaoSponsorships.sponsorCustomerId, customerId))
        .orderBy(desc(mopaoSponsorships.createdAt)),

      db
        .select()
        .from(mopaoSponsorships)
        .where(eq(mopaoSponsorships.sponsoredCustomerId, customerId))
        .orderBy(desc(mopaoSponsorships.createdAt)),
    ]);

    return {
      asSponsor,
      asSponsored,
    };
  }
}
