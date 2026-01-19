/**
 * KYC CONDITIONAL LOGIC SERVICE
 * Logique conditionnelle KYC basée sur business_type
 * - INDIVIDUAL: KYC1 + KYC2 standard
 * - BUSINESS (entrepreneur, trader, farmer): KYC1 + KYC2 + Business KYC
 */

import { db } from '../../db';
import { eq } from 'drizzle-orm';
import { customers } from '../../db/schema';

export interface KYCRequirements {
  kyc1Required: boolean;
  kyc2Required: boolean;
  businessKYCRequired: boolean;
  requiredDocuments: string[];
  nextStep: 'KYC1' | 'KYC2' | 'BUSINESS_KYC' | 'COMPLETE';
  eligibleForGold: boolean;
}

export class KYCConditionalService {
  /**
   * Get KYC requirements based on customer profile
   */
  static async getKYCRequirements(customerId: number): Promise<KYCRequirements> {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    const businessType = (customer as any).business_type || 'INDIVIDUAL';
    const isBusinessProfile = businessType !== 'INDIVIDUAL';

    // Check completion status
    const kyc1Completed = customer.kycStatus === 'KYC1_COMPLETED' || 
                          customer.kycStatus === 'KYC2_PENDING' ||
                          customer.kycStatus === 'KYC2_UNDER_REVIEW' ||
                          customer.kycStatus === 'KYC2_VERIFIED';

    const kyc2Completed = customer.kycStatus === 'KYC2_VERIFIED';
    const businessKYCCompleted = (customer as any).business_kyc_completed || false;

    // Determine next step
    let nextStep: 'KYC1' | 'KYC2' | 'BUSINESS_KYC' | 'COMPLETE' = 'KYC1';
    if (!kyc1Completed) {
      nextStep = 'KYC1';
    } else if (!kyc2Completed) {
      nextStep = 'KYC2';
    } else if (isBusinessProfile && !businessKYCCompleted) {
      nextStep = 'BUSINESS_KYC';
    } else {
      nextStep = 'COMPLETE';
    }

    // Required documents based on business type
    const requiredDocuments: string[] = ['ID_CARD', 'PROOF_OF_ADDRESS'];
    
    if (isBusinessProfile) {
      switch (businessType) {
        case 'MICRO_ENTREPRENEUR':
        case 'SMALL_BUSINESS':
          requiredDocuments.push('BUSINESS_REGISTRATION', 'TAX_ID');
          break;
        case 'TRADER':
          requiredDocuments.push('TRADE_LICENSE', 'TAX_ID');
          break;
        case 'FARMER':
          requiredDocuments.push('LAND_OWNERSHIP', 'AGRICULTURAL_CERTIFICATE');
          break;
        case 'SERVICE_PROVIDER':
        case 'ARTISAN':
          requiredDocuments.push('PROFESSIONAL_LICENSE');
          break;
        default:
          requiredDocuments.push('BUSINESS_DOCUMENTS');
      }
    }

    // Eligible for GOLD only if all KYCs complete
    const eligibleForGold = kyc2Completed && (!isBusinessProfile || businessKYCCompleted);

    return {
      kyc1Required: true, // Always required
      kyc2Required: true, // Always required for GOLD
      businessKYCRequired: isBusinessProfile,
      requiredDocuments,
      nextStep,
      eligibleForGold,
    };
  }

  /**
   * Validate if customer can proceed to specific KYC step
   */
  static async canProceedToStep(
    customerId: number,
    targetStep: 'KYC1' | 'KYC2' | 'BUSINESS_KYC'
  ): Promise<{ canProceed: boolean; reason?: string }> {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
    });

    if (!customer) {
      return { canProceed: false, reason: 'Customer not found' };
    }

    const kyc1Completed = customer.kycStatus === 'KYC1_COMPLETED' || 
                          customer.kycStatus === 'KYC2_PENDING' ||
                          customer.kycStatus === 'KYC2_UNDER_REVIEW' ||
                          customer.kycStatus === 'KYC2_VERIFIED';

    const kyc2Completed = customer.kycStatus === 'KYC2_VERIFIED';

    switch (targetStep) {
      case 'KYC1':
        return { canProceed: true };

      case 'KYC2':
        if (!kyc1Completed) {
          return {
            canProceed: false,
            reason: 'Vous devez compléter KYC1 avant KYC2',
          };
        }
        return { canProceed: true };

      case 'BUSINESS_KYC':
        if (!kyc2Completed) {
          return {
            canProceed: false,
            reason: 'Vous devez compléter KYC2 avant Business KYC',
          };
        }

        const businessType = (customer as any).business_type || 'INDIVIDUAL';
        if (businessType === 'INDIVIDUAL') {
          return {
            canProceed: false,
            reason: 'Business KYC requis uniquement pour profils commerciaux',
          };
        }

        return { canProceed: true };

      default:
        return { canProceed: false, reason: 'Invalid step' };
    }
  }

  /**
   * Mark business KYC as completed
   */
  static async completeBusinessKYC(
    customerId: number,
    documents: Record<string, string>
  ): Promise<void> {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Verify KYC2 completed
    if (customer.kycStatus !== 'KYC2_VERIFIED') {
      throw new Error('KYC2 must be completed before Business KYC');
    }

    // Update customer
    await db
      .update(customers)
      .set({
        // @ts-ignore - business_kyc fields from migration
        business_kyc_completed: true,
        business_kyc_documents: documents,
        // Upgrade to GOLD after business KYC
        category: 'GOLD',
        goldEligibleDate: new Date().toISOString(),
      })
      .where(eq(customers.id, customerId));

    console.log(`[KYC] Business KYC completed for customer ${customerId} - Upgraded to GOLD`);
  }

  /**
   * Get business document upload requirements
   */
  static getBusinessDocumentRequirements(businessType: string): {
    documentType: string;
    description: string;
    required: boolean;
  }[] {
    const baseRequirements = [
      {
        documentType: 'BUSINESS_PROOF',
        description: 'Preuve d\'activité commerciale (facture, contrat, etc.)',
        required: true,
      },
    ];

    switch (businessType) {
      case 'MICRO_ENTREPRENEUR':
      case 'SMALL_BUSINESS':
        return [
          ...baseRequirements,
          {
            documentType: 'BUSINESS_REGISTRATION',
            description: 'Registre de commerce (RCCM)',
            required: true,
          },
          {
            documentType: 'TAX_ID',
            description: 'Numéro d\'identification fiscale (NIF)',
            required: true,
          },
        ];

      case 'TRADER':
        return [
          ...baseRequirements,
          {
            documentType: 'TRADE_LICENSE',
            description: 'Patente commerciale',
            required: true,
          },
          {
            documentType: 'TAX_ID',
            description: 'Numéro d\'identification fiscale',
            required: true,
          },
        ];

      case 'FARMER':
        return [
          ...baseRequirements,
          {
            documentType: 'LAND_OWNERSHIP',
            description: 'Titre de propriété ou bail agricole',
            required: true,
          },
          {
            documentType: 'AGRICULTURAL_CERTIFICATE',
            description: 'Certificat d\'exploitation agricole (optionnel)',
            required: false,
          },
        ];

      case 'SERVICE_PROVIDER':
      case 'ARTISAN':
        return [
          ...baseRequirements,
          {
            documentType: 'PROFESSIONAL_LICENSE',
            description: 'Licence professionnelle ou certificat de compétence',
            required: true,
          },
        ];

      default:
        return baseRequirements;
    }
  }
}
