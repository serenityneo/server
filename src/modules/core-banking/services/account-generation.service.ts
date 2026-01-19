/**
 * Account Generation Service
 * 
 * Handles automatic generation of:
 * - CIF (8 digits, globally unique sequential)
 * - Account Number (8 digits, unique per agency, sequential)
 * - Public ID (12 characters alphanumeric, globally unique)
 * - Agency assignment (round-robin rotation)
 * - Virtual agent assignment (next available)
 */

import { randomBytes } from 'crypto';
import { db } from '../../../db';
import { customers, agents, agencies } from '../../../db/schema';
import { sql, desc, eq, and, lt } from 'drizzle-orm';

/**
 * Générateur de Public ID unique (12 caractères alphanumériques)
 * Format: 2WN28L3PZ435 (sans caractères ambigus: 0, O, 1, I, L)
 * 
 */
function generatePublicId(): string {
  // Alphabet sans caractères ambigus (32 caractères)
  // Exclut: 0 (zéro), O (lettre O), 1 (un), I (lettre I), L (lettre L)
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ID_LENGTH = 12;
  
  // Génération cryptographiquement sécurisée
  const randomBuffer = randomBytes(ID_LENGTH);
  
  let publicId = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    // Utilise le modulo pour mapper les bytes aléatoires sur l'alphabet
    const index = randomBuffer[i] % ALPHABET.length;
    publicId += ALPHABET[index];
  }
  
  return publicId;
}

/**
 * Vérifie l'unicité du Public ID dans la base de données
 * Regénère jusqu'à obtenir un ID unique (probabilité de collision: ~1/10^18)
 */
async function generateUniquePublicId(maxAttempts: number = 10): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const publicId = generatePublicId();
    
    // Vérifier l'unicité dans la base de données
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.publicId, publicId))
      .limit(1);
    
    if (!existing) {
      console.log(`[AccountGeneration] Public ID unique généré: ${publicId} (tentative ${attempt + 1})`);
      return publicId;
    }
    
    console.warn(`[AccountGeneration] Collision détectée pour ${publicId}, nouvelle tentative...`);
  }
  
  throw new Error(`Échec de génération d'un Public ID unique après ${maxAttempts} tentatives`);
}

export class AccountGenerationService {
  /**
   * Generate next CIF number (8 digits, globally unique)
   * Format: 00000001, 00000002, etc.
   */
  async generateCIF(): Promise<string> {
    // Get the highest existing CIF
    const result = await db
      .select({ maxCif: sql<string>`MAX(${customers.cif})` })
      .from(customers)
      .where(sql`${customers.cif} IS NOT NULL`);

    const maxCif = result[0]?.maxCif;
    
    if (!maxCif) {
      // First CIF
      return '00000001';
    }

    // Increment and pad to 8 digits
    const nextCif = parseInt(maxCif, 10) + 1;
    return nextCif.toString().padStart(8, '0');
  }

  /**
   * Generate next account number for a specific agency (8 digits, unique per agency)
   * Format: 00000001, 00000002, etc.
   */
  async generateAccountNumber(agencyId: number): Promise<string> {
    // Get the highest existing account number for this agency
    const result = await db
      .select({ maxAccountNumber: sql<string>`MAX(${customers.accountNumber})` })
      .from(customers)
      .where(
        and(
          eq(customers.agencyId, agencyId),
          sql`${customers.accountNumber} IS NOT NULL`
        )
      );

    const maxAccountNumber = result[0]?.maxAccountNumber;
    
    if (!maxAccountNumber) {
      // First account number for this agency
      return '00000001';
    }

    // Increment and pad to 8 digits
    const nextAccountNumber = parseInt(maxAccountNumber, 10) + 1;
    return nextAccountNumber.toString().padStart(8, '0');
  }

  /**
   * Generate individual account number for a specific account type
   * Format: S01-CIF-YYYYMMDD-SEQ
   * Example: S01-00001234-20260108-001
   * 
   * @param cif - Customer CIF (8 digits)
   * @param accountTypeCode - Account type code (S01, S02, S03, S04, S05, S06)
   * @param sequence - Sequence number (1-12 for the 12 accounts)
   * @returns Formatted account number
   */
  generateIndividualAccountNumber(
    cif: string,
    accountTypeCode: string,
    sequence: number
  ): string {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const sequenceStr = sequence.toString().padStart(3, '0');
    return `${accountTypeCode}-${cif}-${dateStr}-${sequenceStr}`;
  }

  /**
   * Assign agency using round-robin rotation (01, 02, 03, 04, 01, 02, ...)
   * Returns the agency ID to assign to next customer
   */
  async assignAgencyRotation(): Promise<number> {
    // Get all active agencies ordered by code
    const activeAgencies = await db
      .select()
      .from(agencies)
      .where(eq(agencies.active, true))
      .orderBy(agencies.code);

    if (activeAgencies.length === 0) {
      throw new Error('No active agencies found');
    }

    // Count customers per agency
    const agencyCounts = await db
      .select({
        agencyId: customers.agencyId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(customers)
      .where(sql`${customers.agencyId} IS NOT NULL`)
      .groupBy(customers.agencyId);

    // Create a map of agency counts
    const countMap = new Map<number, number>();
    agencyCounts.forEach((ac) => {
      if (ac.agencyId) {
        countMap.set(ac.agencyId, ac.count);
      }
    });

    // Find agency with lowest count
    let minCount = Infinity;
    let selectedAgency = activeAgencies[0];

    for (const agency of activeAgencies) {
      const count = countMap.get(agency.id) || 0;
      if (count < minCount) {
        minCount = count;
        selectedAgency = agency;
      }
    }

    return selectedAgency.id;
  }

  /**
   * Assign next available virtual agent
   * Virtual agents have codes 00200-99999
   * Returns agent ID
   */
  async assignVirtualAgent(): Promise<number> {
    // Get all active virtual agents
    const virtualAgents = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.type, 'VIRTUAL'),
          eq(agents.isActive, true)
        )
      )
      .orderBy(agents.code);

    if (virtualAgents.length === 0) {
      throw new Error('No active virtual agents found');
    }

    // Count customers per virtual agent
    const agentCounts = await db
      .select({
        agentId: customers.agentId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(customers)
      .where(sql`${customers.agentId} IS NOT NULL`)
      .groupBy(customers.agentId);

    // Create a map of agent counts
    const countMap = new Map<number, number>();
    agentCounts.forEach((ac) => {
      if (ac.agentId) {
        countMap.set(ac.agentId, ac.count);
      }
    });

    // Find virtual agent with lowest count (load balancing)
    let minCount = Infinity;
    let selectedAgent = virtualAgents[0];

    for (const agent of virtualAgents) {
      const count = countMap.get(agent.id) || 0;
      if (count < minCount) {
        minCount = count;
        selectedAgent = agent;
      }
    }

    return selectedAgent.id;
  }

  /**
   * Generate complete account structure for a new customer
   * 
   * @param options.createdByPartnerId - ID of partner creating the customer (optional)
   * @param options.partnerAgentId - Specific agent ID if created by partner (optional)
   * 
   * Returns: { publicId, cif, agencyId, agentId, agencyCode, agentCode, accountNumber }
   */
  async generateCompleteAccount(options?: {
    createdByPartnerId?: number;
    partnerAgentId?: number;
  }): Promise<{
    publicId: string;
    cif: string;
    agencyId: number;
    agentId: number;
    agencyCode: string;
    agentCode: string;
    accountNumber: string;
  }> {
    // Generate Public ID first (12 characters alphanumeric)
    const publicId = await generateUniquePublicId();
    console.log(`[AccountGeneration] Generated Public ID: ${publicId}`);

    // Generate CIF
    const cif = await this.generateCIF();

    // Assign agency (round-robin)
    const agencyId = await this.assignAgencyRotation();

    // Assign agent based on creation context
    let agentId: number;
    
    if (options?.partnerAgentId) {
      // Case 1: Created by partner with specific agent
      agentId = options.partnerAgentId;
      console.log(`[AccountGeneration] Customer created by partner - using partner agent ID: ${agentId}`);
    } else if (options?.createdByPartnerId) {
      // Case 2: Created by partner but no specific agent - find partner's agent
      const partner = await db
        .select({ agentId: customers.agentId })
        .from(customers)
        .where(eq(customers.id, options.createdByPartnerId))
        .limit(1);
      
      if (partner[0]?.agentId) {
        agentId = partner[0].agentId;
        console.log(`[AccountGeneration] Customer created by partner - using partner's agent ID: ${agentId}`);
      } else {
        // Fallback to virtual agent if partner has no agent
        agentId = await this.assignVirtualAgent();
        console.log(`[AccountGeneration] Partner has no agent - using virtual agent ID: ${agentId}`);
      }
    } else {
      // Case 3: Self-registration - use virtual agent (load balanced)
      agentId = await this.assignVirtualAgent();
      console.log(`[AccountGeneration] Self-registration - using virtual agent ID: ${agentId}`);
    }

    // Generate account number for this agency
    const accountNumber = await this.generateAccountNumber(agencyId);

    // Fetch agency and agent codes for complete info
    const [agencyInfo] = await db
      .select({ code: agencies.code })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1);

    const [agentInfo] = await db
      .select({ code: agents.code })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    const agencyCode = agencyInfo?.code || '01';
    const agentCode = agentInfo?.code || 'N/A';

    console.log(`[AccountGeneration] Complete account generated:`, {
      publicId,
      cif,
      agencyId,
      agencyCode,
      agentId,
      agentCode,
      accountNumber,
    });

    return {
      publicId,
      cif,
      agencyId,
      agentId,
      agencyCode,
      agentCode,
      accountNumber,
    };
  }

  /**
   * Format account display string
   * Format: CIF-AGENCE+AGENT-ACCOUNT_NUMBER-CATEGORY CURRENCY
   * Example: 12345678-01200-87654321-001 USD
   */
  async formatAccountDisplay(
    customerId: number,
    accountTypeCode: string,
    currency: 'USD' | 'CDF'
  ): Promise<string> {
    // Get customer with agency and agent info
    const customer = await db
      .select({
        cif: customers.cif,
        accountNumber: customers.accountNumber,
        agencyCode: agencies.code,
        agentCode: agents.code,
      })
      .from(customers)
      .leftJoin(agencies, eq(customers.agencyId, agencies.id))
      .leftJoin(agents, eq(customers.agentId, agents.id))
      .where(eq(customers.id, customerId))
      .limit(1);

    if (customer.length === 0 || !customer[0].cif) {
      throw new Error('Customer not found or missing CIF');
    }

    const { cif, accountNumber, agencyCode, agentCode } = customer[0];

    if (!agencyCode || !agentCode || !accountNumber) {
      throw new Error('Customer missing required account information');
    }

    // Format: CIF-AGENCE+AGENT-ACCOUNT_NUMBER-CATEGORY CURRENCY
    // Example: 12345678-01200-87654321-001 USD
    return `${cif}-${agencyCode}${agentCode}-${accountNumber}-${accountTypeCode} ${currency}`;
  }
}

export const accountGenerationService = new AccountGenerationService();

/**
 * Helper function to generate formatted account number for individual accounts
 * Format: S01-CIF-YYYYMMDD-SEQ
 * 
 * This function is exported separately for use in account creation logic
 * to ensure consistency across all account creation flows.
 */
export function generateFormattedAccountNumber(
  cif: string,
  accountTypeCode: string,
  sequence: number
): string {
  return accountGenerationService.generateIndividualAccountNumber(cif, accountTypeCode, sequence);
}
