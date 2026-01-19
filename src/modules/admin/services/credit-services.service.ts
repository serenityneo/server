import { db } from '../../../db';
import { creditTypes, customers } from '../../../db/schema';
import { customerServices } from '../../../db/migration-schema';
import { eq, sql, and } from 'drizzle-orm';

/**
 * Credit Services Management
 * Handles activation and management of credit services for customers
 */
export class CreditServicesService {
  /**
   * Get all available credit services from credit_types table
   */
  async getAvailableServices() {
    const services = await db
      .select({
        id: creditTypes.id,
        code: creditTypes.code,
        label: creditTypes.label,
        description: creditTypes.description,
        status: creditTypes.status,
        allowedCurrencies: creditTypes.allowedCurrencies,
        repaymentFrequency: creditTypes.repaymentFrequency
      })
      .from(creditTypes)
      .where(eq(creditTypes.status, 'ACTIVE'))
      .orderBy(creditTypes.code);
    
    return services;
  }

  /**
   * Get services activated for a specific customer
   */
  async getCustomerServices(customerId: number) {
    // Validate customer exists
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    
    if (!customer) {
      throw new Error('Customer not found');
    }
    
    // Get customer's active services
    const services = await db
      .select({
        id: customerServices.id,
        serviceCode: customerServices.serviceCode,
        isActive: customerServices.isActive,
        activatedAt: customerServices.activatedAt,
        activatedByUserId: customerServices.activatedByUserId,
        deactivatedAt: customerServices.deactivatedAt
      })
      .from(customerServices)
      .where(eq(customerServices.customerId, customerId))
      .orderBy(customerServices.activatedAt);
    
    // Get service details from credit_types
    const serviceCodes = services.map(s => s.serviceCode);
    let serviceDetails: any[] = [];
    
    if (serviceCodes.length > 0) {
      serviceDetails = await db
        .select({
          code: creditTypes.code,
          label: creditTypes.label,
          description: creditTypes.description
        })
        .from(creditTypes)
        .where(sql`${creditTypes.code} = ANY(${serviceCodes})`);
    }
    
    // Merge service activation data with service details
    const enrichedServices = services.map(svc => {
      const detail = serviceDetails.find(d => d.code === svc.serviceCode);
      return {
        ...svc,
        label: detail?.label || svc.serviceCode,
        description: detail?.description || ''
      };
    });
    
    return enrichedServices;
  }

  /**
   * Activate credit services for a customer
   * @param customerId - Customer ID
   * @param serviceCodes - Array of service codes to activate (e.g., ['BOMBE', 'TELEMA'])
   * @param activatedByUserId - User ID performing the activation
   */
  async activateServices(
    customerId: number,
    serviceCodes: string[],
    activatedByUserId: number
  ) {
    // Validate customer exists
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    
    if (!customer) {
      throw new Error('Customer not found');
    }
    
    // Validate all services exist in credit_types
    const validServices = await db
      .select({ code: creditTypes.code })
      .from(creditTypes)
      .where(sql`${creditTypes.code} = ANY(${serviceCodes})`);
    
    const validCodes = validServices.map(s => s.code);
    const invalidCodes = serviceCodes.filter(code => !validCodes.includes(code));
    
    if (invalidCodes.length > 0) {
      throw new Error(`Invalid service codes: ${invalidCodes.join(', ')}`);
    }
    
    // Insert services (or update if already exist)
    const activatedServices = [];
    
    for (const serviceCode of serviceCodes) {
      // Check if service already activated
      const [existing] = await db
        .select()
        .from(customerServices)
        .where(
          and(
            eq(customerServices.customerId, customerId),
            eq(customerServices.serviceCode, serviceCode)
          )
        )
        .limit(1);
      
      if (existing) {
        // If exists and inactive, reactivate it
        if (!existing.isActive) {
          await db
            .update(customerServices)
            .set({
              isActive: true,
              activatedByUserId,
              activatedAt: sql`CURRENT_TIMESTAMP`,
              updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .where(eq(customerServices.id, existing.id));
          
          activatedServices.push({ code: serviceCode, action: 'reactivated' });
        } else {
          activatedServices.push({ code: serviceCode, action: 'already_active' });
        }
      } else {
        // Insert new service
        await db.insert(customerServices).values({
          customerId,
          serviceCode,
          isActive: true,
          activatedByUserId,
          activatedAt: sql`CURRENT_TIMESTAMP`,
          createdAt: sql`CURRENT_TIMESTAMP`,
          updatedAt: sql`CURRENT_TIMESTAMP`
        });
        
        activatedServices.push({ code: serviceCode, action: 'activated' });
      }
    }
    
    console.log('[CreditServices] Services activated for customer:', customerId, activatedServices);
    
    return activatedServices;
  }

  /**
   * Deactivate a service for a customer
   */
  async deactivateService(
    customerId: number,
    serviceCode: string,
    deactivatedByUserId: number,
    reason?: string
  ) {
    const [service] = await db
      .select()
      .from(customerServices)
      .where(
        and(
          eq(customerServices.customerId, customerId),
          eq(customerServices.serviceCode, serviceCode),
          eq(customerServices.isActive, true)
        )
      )
      .limit(1);
    
    if (!service) {
      throw new Error('Active service not found for this customer');
    }
    
    await db
      .update(customerServices)
      .set({
        isActive: false,
        deactivatedByUserId,
        deactivatedAt: sql`CURRENT_TIMESTAMP`,
        deactivationReason: reason || null,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(customerServices.id, service.id));
    
    console.log('[CreditServices] Service deactivated:', { customerId, serviceCode, reason });
    
    return { success: true, message: 'Service deactivated successfully' };
  }
}

export const creditServicesService = new CreditServicesService();
