/**
 * CUSTOMER ACCOUNTS SUMMARY SERVICE
 * Dashboard admin: vue consolidée comptes/services par client
 */

import { db } from '../../db';
import { eq, sql, and, desc, or } from 'drizzle-orm';
import { customers, accounts, transactions, bwakisaServices, agencies, users, quartiers, communes, postalCodes } from '../../db/schema';
import { creditApplications, mopaoSponsorships, creditVirtualPrison } from '../../db/credit-products-schema';
import { likElementbaGroups, likelembaMembers } from '../../db/likelemba-groups-schema';

export interface AccountDetail {
  id: number;
  accountType: string;
  accountNumber: string;
  balanceUsd: string;
  balanceCdf: string;
  currency: string
  status: string;
  createdAt: string;
  lastActivity?: string;
}

export interface CustomerAccountsSummary {
  customer: {
    id: number;
    fullName: string;
    email: string;
    category: string;
    customerType: string;
    businessType?: string;
    cif: string;
    registrationDate: string;
    // Enhanced personal info
    mobileMoneyNumber: string;
    dateOfBirth: string | null;
    placeOfBirth: string | null;
    gender: string | null;
    nationality: string | null;
    civilStatus: string | null;
    address: string | null;
    profession: string | null;
    employer: string | null;
    monthlyIncome: string | null;
    // Geography
    quartierName: string | null;
    communeName: string | null;
    postalCode: string | null;
    // Banking structure
    agencyName: string | null;
    agencyCode: string | null;
    agentName: string | null;
    agentCode: string | null;
    // Status
    status: string;
    kycStatus: string;
    kycStep: number | null;
    isActive: boolean | null;
    mfaEnabled: boolean | null;
    // Security
    maxTransactionAmount: string | null;
    maxDailyOperations: number | null;
    requiresDualApproval: boolean | null;
    isPoliticalPerson: boolean | null;
    // Reference
    referenceName: string | null;
    referencePhone: string | null;
    referenceRelationship: string | null;
    // Dates
    createdAt: string;
    accountCreationDate: string | null;
    firstDepositDate: string | null;
    lastLogin: string | null;
  };
  // NEW: Return all accounts as array instead of summarized object
  allAccounts: AccountDetail[];
  accounts: {
    s01: { balance: number; transactionCount: number; lastActivity?: string };
    s02: { balance: number; lockedAmount: number; lastDeposit?: string; depositDays: number };
    s03: { balance: number; purpose: string };
    s04: { balance: number; creditCount: number; totalDisbursed: number };
    s05: { balance: number };
    s06: { balance: number; totalFines: number };
    totalBalanceUSD: number;
    totalBalanceCDF: number;
  };
  creditServices: {
    totalCredits: number;
    activeCredits: number;
    completedCredits: number;
    defaultedCredits: number;
    totalDisbursed: number;
    totalRepaid: number;
    currentDebt: number;
    applications: any[];
  };
  activityStats: {
    totalTransactions: number;
    lastTransactionDate?: string;
    avgMonthlyTransactions: number;
    accountAge: number;
  };
  sponsorshipActivity?: {
    asSponsor: { active: number; total: number; totalLocked: number; sponsorships: any[] };
    asSponsored: { active: number; total: number; sponsorships: any[] };
  };
  bwakisaService?: {
    id: number;
    targetAmount: number;
    periodicity: string;
    maturityDate: string;
    startDate: string;
    status: string;
    currentBalance: number;
  } | null;
  likelembaGroups?: Array<{
    id: number;
    groupName: string;
    memberCount: number;
    monthlyContribution: number;
    customerRole: string;
    joinedAt: string;
    status: string;
  }>;
  virtualPrison?: {
    isInPrison: boolean;
    blockedReason: string | null;
    blockedSince: string | null;
    daysBlocked: number;
    outstandingAmount: number;
  } | null;
}

export class CustomerAccountsSummaryService {
  /**
   * Get complete customer accounts summary
   */
  static async getCustomerSummary(customerId: number): Promise<CustomerAccountsSummary> {
    try {
      // 1. Customer info with all related data via LEFT JOINs
      const customerResult = await db
        .select({
          // Customer fields
          customer: customers,
          // Agency info
          agencyName: agencies.name,
          agencyCode: agencies.code,
          // Agent info (from users table - agent_id references users)
          agentEmail: users.email,
          agentUsername: users.username,
          // Geography info
          quartierName: quartiers.name,
          communeName: communes.name,
          postalCode: postalCodes.code,
        })
        .from(customers)
        .leftJoin(agencies, eq(customers.agencyId, agencies.id))
        .leftJoin(users, eq(customers.agentId, users.id))
        .leftJoin(quartiers, eq(customers.quartierId, quartiers.id))
        .leftJoin(communes, eq(quartiers.communeId, communes.id))
        .leftJoin(postalCodes, eq(customers.postalCodeId, postalCodes.id))
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customerResult || customerResult.length === 0) {
        throw new Error('Customer not found');
      }

      const customerData = customerResult[0];
      const customer = customerData.customer;

    // 2. All accounts
    const allAccounts = await db.query.accounts.findMany({
      where: eq(accounts.customerId, customerId),
    });

    const accountMap: Record<string, typeof allAccounts[0]> = {};
    allAccounts.forEach((acc) => {
      accountMap[acc.accountType] = acc;
    });

    // 3. Credit summary (using credits table, not credit_applications)
    let creditData = {
      totalCredits: 0,
      activeCredits: 0,
      completedCredits: 0,
      defaultedCredits: 0,
      totalDisbursed: 0,
      totalRepaid: 0,
    };
    
    try {
      const creditStats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_credits,
          SUM(CASE WHEN credit_status IN ('DISBURSED', 'ACTIVE') THEN 1 ELSE 0 END) as active_credits,
          SUM(CASE WHEN credit_status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_credits,
          SUM(CASE WHEN credit_status = 'DEFAULTED' THEN 1 ELSE 0 END) as defaulted_credits,
          COALESCE(SUM(CAST(amount_usd AS NUMERIC)), 0) as total_disbursed
        FROM credits
        WHERE customer_id = ${customerId}
      `);
      
      const stats = (creditStats as any)[0];
      if (stats) {
        creditData = {
          totalCredits: parseInt(stats.total_credits || '0', 10),
          activeCredits: parseInt(stats.active_credits || '0', 10),
          completedCredits: parseInt(stats.completed_credits || '0', 10),
          defaultedCredits: parseInt(stats.defaulted_credits || '0', 10),
          totalDisbursed: parseFloat(stats.total_disbursed || '0'),
          totalRepaid: 0, // Not available in current schema
        };
      }
    } catch (error) {
      console.error('[CustomerAccountsSummary] Error fetching credit stats:', error);
    }

    // 4. Transaction stats
    const transactionStats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_transactions,
        MAX(created_at) as last_transaction_date,
        EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 86400 as account_age_days
      FROM transactions
      WHERE account_id IN (
        SELECT id FROM accounts WHERE customer_id = ${customerId}
      )
    `);

    const txData = (transactionStats as any)[0] || {};
    const accountAgeDays = Math.floor(parseFloat(txData.account_age_days || '0'));
    const totalTransactions = parseInt(txData.total_transactions || '0', 10);
    const avgMonthlyTransactions = accountAgeDays > 30 
      ? Math.round((totalTransactions / accountAgeDays) * 30)
      : 0;

    // 5. S02 locked amount (from MOPAO sponsorships - table may not exist)
    let s02Locked = 0;
    try {
      const s02LockedResult = await db.execute(sql`
        SELECT COALESCE(SUM(CAST(sponsor_s02_locked_amount_usd AS NUMERIC)), 0) as locked
        FROM mopao_sponsorships
        WHERE sponsor_customer_id = ${customerId}
          AND is_active = true
      `);
      s02Locked = parseFloat((s02LockedResult as any)[0]?.locked || '0');
    } catch (error) {
      // Table doesn't exist, skip
    }

    // 6. S04 stats (using credits table)
    let s04Stats = { credit_count: '0', total_disbursed: '0' };
    try {
      const s04StatsResult = await db.execute(sql`
        SELECT 
          COUNT(*) as credit_count,
          COALESCE(SUM(CAST(amount_usd AS NUMERIC)), 0) as total_disbursed
        FROM credits
        WHERE customer_id = ${customerId}
          AND credit_status IN ('DISBURSED', 'ACTIVE', 'COMPLETED')
      `);
      s04Stats = (s04StatsResult as any)[0] || s04Stats;
    } catch (error) {
      console.error('[CustomerAccountsSummary] Error fetching S04 stats:', error);
    }

    // 7. S06 total fines
    const s06FinesResult = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(amount_usd AS NUMERIC)), 0) as total_fines
      FROM transactions
      WHERE account_id = (
        SELECT id FROM accounts 
        WHERE customer_id = ${customerId} 
          AND account_type = 'S06_FINES'
      )
      AND transaction_type = 'FEE'
    `);
    const totalFines = parseFloat((s06FinesResult as any)[0]?.total_fines || '0');

    // 8. Sponsorship activity with details (table may not exist)
    let sponsorshipData: any = {
      sponsor_active: 0,
      sponsor_total: 0,
      total_locked: 0,
      sponsored_active: 0,
      sponsored_total: 0
    };
    
    try {
      const sponsorshipResult = await db.execute(sql`
        SELECT 
          SUM(CASE WHEN sponsor_customer_id = ${customerId} AND is_active = true THEN 1 ELSE 0 END) as sponsor_active,
          SUM(CASE WHEN sponsor_customer_id = ${customerId} THEN 1 ELSE 0 END) as sponsor_total,
          SUM(CASE WHEN sponsor_customer_id = ${customerId} AND is_active = true THEN CAST(sponsor_s02_locked_amount_usd AS NUMERIC) ELSE 0 END) as total_locked,
          SUM(CASE WHEN sponsored_customer_id = ${customerId} AND is_active = true THEN 1 ELSE 0 END) as sponsored_active,
          SUM(CASE WHEN sponsored_customer_id = ${customerId} THEN 1 ELSE 0 END) as sponsored_total
        FROM mopao_sponsorships
        WHERE sponsor_customer_id = ${customerId} OR sponsored_customer_id = ${customerId}
      `);
      sponsorshipData = (sponsorshipResult as any)[0] || sponsorshipData;
    } catch (error) {
      // Table doesn't exist, skip
    }

    // 9. Get detailed sponsorships (table may not exist)
    let sponsorships: any[] = [];
    try {
      sponsorships = await db.query.mopaoSponsorships.findMany({
        where: or(
          eq(mopaoSponsorships.sponsorCustomerId, customerId),
          eq(mopaoSponsorships.sponsoredCustomerId, customerId)
        ),
      });
    } catch (error) {
      // Table doesn't exist, skip
    }

    // 10. Get credit applications details (using credits table)
    let creditApps: any[] = [];
    try {
      const creditsResult = await db.execute(sql`
        SELECT *
        FROM credits
        WHERE customer_id = ${customerId}
        ORDER BY created_at DESC
        LIMIT 20
      `);
      creditApps = (creditsResult as any) || [];
    } catch (error) {
      console.error('[CustomerAccountsSummary] Error fetching credits:', error);
    }

    // 11. S02 deposit tracking (table may not exist)
    let s02DepositDays = 0;
    try {
      const s02TrackingResult = await db.execute(sql`
        SELECT 
          MAX(consecutive_days_count) as max_consecutive_days
        FROM s02_deposit_tracking
        WHERE customer_id = ${customerId}
      `);
      s02DepositDays = parseInt((s02TrackingResult as any)[0]?.max_consecutive_days || '0', 10);
    } catch (error) {
      // Table doesn't exist, skip
    }

    // 12. Bwakisa Service (table may not exist)
    let bwakisa: any = null;
    try {
      bwakisa = await db.query.bwakisaServices.findFirst({
        where: and(
          eq(bwakisaServices.customerId, customerId),
          eq(bwakisaServices.status, 'ACTIVE')
        ),
      });
    } catch (error) {
      // Table doesn't exist, skip
    }

    // 13. Likelemba Groups
    let likelembaGroupMemberships: any[] = [];
    try {
      likelembaGroupMemberships = await db.query.likelembaMembers.findMany({
        where: eq(likelembaMembers.customerId, customerId),
      });
    } catch (error) {
      // Table doesn't exist or error occurred
    }

    // 14. Virtual Prison status (table may not exist)
    let prisonRecord: any = null;
    try {
      prisonRecord = await db.query.creditVirtualPrison.findFirst({
        where: and(
          eq(creditVirtualPrison.customerId, customerId),
          eq(creditVirtualPrison.isActive, true)
        ),
      });
    } catch (error) {
      // Table doesn't exist, skip
    }

    // Build response
    const totalBalanceUSD = allAccounts.reduce(
      (sum, acc) => sum + parseFloat(acc.balanceUsd || '0'),
      0
    );
    const totalBalanceCDF = allAccounts.reduce(
      (sum, acc) => sum + parseFloat(acc.balanceCdf || '0'),
      0
    );

    return {
      customer: {
        id: customer.id,
        fullName: `${customer.firstName} ${customer.lastName}`,
        email: customer.email || '',
        category: customer.category || 'CATEGORY_1',
        customerType: customer.customerType,
        cif: customer.cif || customer.cifCode || '',
        registrationDate: customer.createdAt || '',
        // Enhanced personal info
        mobileMoneyNumber: customer.mobileMoneyNumber || '',
        dateOfBirth: customer.dateOfBirth,
        placeOfBirth: customer.placeOfBirth,
        gender: customer.gender,
        nationality: customer.nationality,
        civilStatus: customer.civilStatus,
        address: customer.address,
        profession: customer.profession,
        employer: customer.employer,
        monthlyIncome: customer.monthlyIncome,
        // Geography (via LEFT JOIN)
        quartierName: customerData.quartierName || null,
        communeName: customerData.communeName || null,
        postalCode: customerData.postalCode || null,
        // Banking structure (via LEFT JOIN)
        agencyName: customerData.agencyName || null,
        agencyCode: customerData.agencyCode || null,
        agentName: customerData.agentUsername || customerData.agentEmail || null,
        agentCode: customerData.agentEmail || null,
        // Status
        status: customer.status || '',
        kycStatus: customer.kycStatus || '',
        kycStep: customer.kycStep,
        isActive: customer.isActive,
        mfaEnabled: customer.mfaEnabled,
        // Security
        maxTransactionAmount: customer.maxTransactionAmount,
        maxDailyOperations: customer.maxDailyOperations,
        requiresDualApproval: customer.requiresDualApproval,
        isPoliticalPerson: customer.isPoliticalPerson,
        // Reference
        referenceName: customer.referenceName,
        referencePhone: customer.referencePhone,
        referenceRelationship: customer.referenceRelationship,
        // Dates
        createdAt: customer.createdAt || '',
        accountCreationDate: customer.accountCreationDate,
        firstDepositDate: customer.firstDepositDate,
        lastLogin: customer.lastLogin,
      },
      // NEW: Return ALL accounts with complete details
      allAccounts: allAccounts.map(acc => ({
        id: acc.id,
        accountType: acc.accountType,
        accountNumber: acc.accountNumber,
        balanceUsd: acc.balanceUsd || '0.00',
        balanceCdf: acc.balanceCdf || '0.00',
        currency: acc.currency || 'USD',
        status: acc.status || 'INACTIVE',
        createdAt: acc.createdAt || '',
        lastActivity: undefined, // Could be enhanced with last transaction date
      })),
      accounts: {
        s01: {
          balance: parseFloat(accountMap['S01_STANDARD']?.balanceUsd || '0'),
          transactionCount: 0, // Would need join
          lastActivity: undefined,
        },
        s02: {
          balance: parseFloat(accountMap['S02_MANDATORY_SAVINGS']?.balanceUsd || '0'),
          lockedAmount: s02Locked,
          lastDeposit: undefined,
          depositDays: s02DepositDays,
        },
        s03: {
          balance: parseFloat(accountMap['S03_CAUTION']?.balanceUsd || '0'),
          purpose: 'Caution crédit',
        },
        s04: {
          balance: parseFloat(accountMap['S04_CREDIT']?.balanceUsd || '0'),
          creditCount: parseInt(s04Stats.credit_count || '0', 10),
          totalDisbursed: parseFloat(s04Stats.total_disbursed || '0'),
        },
        s05: {
          balance: parseFloat(accountMap['S05_BWAKISA_CARTE']?.balanceUsd || '0'),
        },
        s06: {
          balance: parseFloat(accountMap['S06_FINES']?.balanceUsd || '0'),
          totalFines,
        },
        totalBalanceUSD,
        totalBalanceCDF,
      },
      creditServices: {
        totalCredits: Number(creditData.totalCredits),
        activeCredits: Number(creditData.activeCredits),
        completedCredits: Number(creditData.completedCredits),
        defaultedCredits: Number(creditData.defaultedCredits),
        totalDisbursed: Number(creditData.totalDisbursed),
        totalRepaid: Number(creditData.totalRepaid),
        currentDebt: Number(creditData.totalDisbursed) - Number(creditData.totalRepaid),
        applications: creditApps,
      },
      activityStats: {
        totalTransactions,
        lastTransactionDate: txData.last_transaction_date || undefined,
        avgMonthlyTransactions,
        accountAge: accountAgeDays,
      },
      sponsorshipActivity: (sponsorshipData.sponsor_total > 0 || sponsorshipData.sponsored_total > 0)
        ? {
            asSponsor: {
              active: parseInt(sponsorshipData.sponsor_active || '0', 10),
              total: parseInt(sponsorshipData.sponsor_total || '0', 10),
              totalLocked: parseFloat(sponsorshipData.total_locked || '0'),
              sponsorships: sponsorships.filter(s => s.sponsorCustomerId === customerId),
            },
            asSponsored: {
              active: parseInt(sponsorshipData.sponsored_active || '0', 10),
              total: parseInt(sponsorshipData.sponsored_total || '0', 10),
              sponsorships: sponsorships.filter(s => s.sponsoredCustomerId === customerId),
            },
          }
        : undefined,
      bwakisaService: bwakisa ? {
        id: bwakisa.id,
        targetAmount: parseFloat(bwakisa.targetAmount || '0'),
        periodicity: bwakisa.periodicity || '',
        maturityDate: bwakisa.maturityDate?.toString() || '',
        startDate: bwakisa.startDate?.toString() || '',
        status: bwakisa.status || '',
        currentBalance: parseFloat(accountMap['S05_BWAKISA_CARTE']?.balanceUsd || '0'),
      } : null,
      likelembaGroups: likelembaGroupMemberships.map(membership => ({
        id: membership.id,
        groupName: '', // Will need join with likElementbaGroups
        memberCount: 0,
        monthlyContribution: 0,
        customerRole: membership.isCreator ? 'CREATOR' : 'MEMBER',
        joinedAt: membership.joinedAt || '',
        status: membership.status || '',
      })),
      virtualPrison: prisonRecord ? {
        isInPrison: true,
        blockedReason: prisonRecord.blockedReason || null,
        blockedSince: prisonRecord.blockedSince || null,
        daysBlocked: prisonRecord.daysBlocked || 0,
        outstandingAmount: parseFloat(prisonRecord.outstandingPrincipalUsd || '0') + parseFloat(prisonRecord.outstandingInterestUsd || '0'),
      } : null,
    };
    } catch (error) {
      console.error(`[CustomerAccountsSummaryService] Error fetching customer ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Get summary for all customers (paginated)
   */
  static async getAllCustomersSummary(page: number = 1, limit: number = 50) {
    const offset = (page - 1) * limit;

    const allCustomers = await db
      .select({ id: customers.id })
      .from(customers)
      .limit(limit)
      .offset(offset);

    const summaries: CustomerAccountsSummary[] = [];

    for (const cust of allCustomers) {
      try {
        const summary = await this.getCustomerSummary(cust.id);
        summaries.push(summary);
      } catch (error) {
        console.error(`Error fetching summary for customer ${cust.id}:`, error);
      }
    }

    // Get total count
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers);

    return {
      data: summaries,
      pagination: {
        page,
        limit,
        total: Number(totalResult[0].count),
        totalPages: Math.ceil(Number(totalResult[0].count) / limit),
      },
    };
  }
}
