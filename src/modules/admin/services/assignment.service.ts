import { db } from '../../../db';
import { agencies, agents, customers } from '../../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * Service for automatic agency and agent assignment
 * Used when creating members manually without explicit assignment
 */
export class AssignmentService {
  /**
   * Assign agency automatically based on location or load balancing
   * 
   * Priority rules:
   * 1. If communeId provided: Find agency in same commune
   * 2. If no communeId (non-Kinshasa): Find agency with least customers
   * 3. Fallback: Default agency "Kinshasa Centre"
   * 
   * @param params - Assignment parameters
   * @returns agency_id
   */
  async assignAgency(params: {
    communeId?: number;
    quartierId?: number;
  }): Promise<number> {
    try {
      // Rule 1: If commune provided, find agency in same commune
      if (params.communeId) {
        const communeAgency = await db
          .select({
            id: agencies.id,
            name: agencies.name,
            customerCount: sql<number>`(
              SELECT COUNT(*) 
              FROM ${customers} 
              WHERE ${customers.agencyId} = ${agencies.id}
            )`.as('customer_count')
          })
          .from(agencies)
          .where(
            and(
              eq(agencies.communeId, params.communeId),
              eq(agencies.active, true)
            )
          )
          .orderBy(sql`customer_count ASC`)
          .limit(1);

        if (communeAgency.length > 0) {
          console.log(`[AssignmentService] Agency assigned by commune: ${communeAgency[0].name} (ID: ${communeAgency[0].id})`);
          return communeAgency[0].id;
        }
      }

      // Rule 2: Find agency with least customers
      const leastLoadedAgency = await db
        .select({
          id: agencies.id,
          name: agencies.name,
          customerCount: sql<number>`(
            SELECT COUNT(*) 
            FROM ${customers} 
            WHERE ${customers.agencyId} = ${agencies.id}
          )`.as('customer_count')
        })
        .from(agencies)
        .where(eq(agencies.active, true))
        .orderBy(sql`customer_count ASC`)
        .limit(1);

      if (leastLoadedAgency.length > 0) {
        console.log(`[AssignmentService] Agency assigned by load: ${leastLoadedAgency[0].name} (ID: ${leastLoadedAgency[0].id})`);
        return leastLoadedAgency[0].id;
      }

      // Rule 3: Fallback - Find default agency "Kinshasa Centre" or first active agency
      const defaultAgency = await db
        .select({ id: agencies.id, name: agencies.name })
        .from(agencies)
        .where(eq(agencies.active, true))
        .limit(1);

      if (defaultAgency.length > 0) {
        console.log(`[AssignmentService] Fallback agency assigned: ${defaultAgency[0].name} (ID: ${defaultAgency[0].id})`);
        return defaultAgency[0].id;
      }

      throw new Error('No active agency found for assignment');
    } catch (error) {
      console.error('[AssignmentService] Error assigning agency:', error);
      throw error;
    }
  }

  /**
   * Assign agent automatically within assigned agency
   * 
   * Priority rules:
   * 1. Find virtual agent in the agency
   * 2. If no virtual agent: Find physical agent with least customers
   * 3. Fallback: First active agent in agency
   * 
   * @param agencyId - Agency ID to find agent in
   * @returns agent_id
   */
  async assignAgent(agencyId: number): Promise<number> {
    try {
      // Rule 1: Find agent with least customers in the agency
      // Note: agents table doesn't have isVirtual column, so we use type field or skip virtual check
      const agentWithLeastLoad = await db
        .select({
          id: agents.id,
          code: agents.code,
          customerCount: sql<number>`(
            SELECT COUNT(*) 
            FROM ${customers} 
            WHERE ${customers.agentId} = ${agents.id}
          )`.as('customer_count')
        })
        .from(agents)
        .where(
          and(
            eq(agents.agencyId, agencyId),
            eq(agents.isActive, true)
          )
        )
        .orderBy(sql`customer_count ASC`)
        .limit(1);

      if (agentWithLeastLoad.length > 0) {
        console.log(`[AssignmentService] Agent assigned: ${agentWithLeastLoad[0].code} (ID: ${agentWithLeastLoad[0].id})`);
        return agentWithLeastLoad[0].id;
      }

      // Rule 2: Fallback - First active agent (should not happen if agency is properly configured)
      const fallbackAgent = await db
        .select({ id: agents.id, code: agents.code })
        .from(agents)
        .where(
          and(
            eq(agents.agencyId, agencyId),
            eq(agents.isActive, true)
          )
        )
        .limit(1);

      if (fallbackAgent.length > 0) {
        console.log(`[AssignmentService] Fallback agent assigned: ${fallbackAgent[0].code} (ID: ${fallbackAgent[0].id})`);
        return fallbackAgent[0].id;
      }

      throw new Error(`No active agent found in agency ${agencyId}`);
    } catch (error) {
      console.error('[AssignmentService] Error assigning agent:', error);
      throw error;
    }
  }

  /**
   * Assign both agency and agent automatically
   * Convenience method that calls both assignment methods
   * 
   * @param params - Assignment parameters
   * @returns { agencyId, agentId }
   */
  async assignBoth(params: {
    communeId?: number;
    quartierId?: number;
  }): Promise<{ agencyId: number; agentId: number }> {
    const agencyId = await this.assignAgency(params);
    const agentId = await this.assignAgent(agencyId);
    
    return { agencyId, agentId };
  }
}
