/**
 * KYC2 ROUTES
 * Routes for KYC Level 2 submission and management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { customers } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export function registerKyc2Routes(app: FastifyInstance) {
  /**
   * POST /customer/kyc2/submit
   * Submit KYC2 data for validation
   */
  app.post('/customer/kyc2/submit', {
    schema: {
      tags: ['KYC'],
      summary: 'Submit KYC2 data for validation',
      body: {
        type: 'object',
        properties: {
          professionalInfo: {
            type: 'object',
            properties: {
              profession: { type: 'string' },
              employer: { type: 'string' },
              employerAddress: { type: 'string' },
              employmentDuration: { type: 'number' },
              monthlyIncome: { type: 'number' },
              incomeSource: { type: 'string' }
            },
            required: ['profession', 'monthlyIncome', 'incomeSource']
          },
          businessInfo: {
            type: 'object',
            nullable: true,
            properties: {
              hasOwnBusiness: { type: 'boolean' },
              businessName: { type: 'string' },
              businessType: { type: 'string' },
              businessAddress: { type: 'string' },
              businessDuration: { type: 'number' },
              businessMonthlyRevenue: { type: 'number' }
            }
          },
          documents: {
            type: 'object',
            properties: {
              incomeProofUrl: { type: 'string' },
              businessProofUrl: { type: 'string' },
              additionalDocUrl: { type: 'string' }
            }
          },
          termsAccepted: { type: 'boolean' },
          dataAccuracyConfirmed: { type: 'boolean' },
          submittedAt: { type: 'string' }
        },
        required: ['professionalInfo', 'termsAccepted', 'dataAccuracyConfirmed']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get customer ID from session
      const session = (request as any).session;
      if (!session?.customerId) {
        return reply.status(401).send({
          success: false,
          error: 'Non authentifié'
        });
      }

      const customerId = session.customerId;
      const body = request.body as any;

      // Verify customer exists and KYC1 is validated
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer) {
        return reply.status(404).send({
          success: false,
          error: 'Client non trouvé'
        });
      }

      // Check KYC1 is validated
      const validKyc1Statuses = ['KYC1_COMPLETED', 'KYC1_VERIFIED'];
      if (!validKyc1Statuses.includes(customer.kycStatus || '')) {
        return reply.status(400).send({
          success: false,
          error: 'Le KYC1 doit être validé avant de soumettre le KYC2'
        });
      }

      // Check not already KYC2 verified
      const kyc2DoneStatuses = ['KYC2_VERIFIED', 'KYC3_PENDING', 'KYC3_UNDER_REVIEW', 'KYC3_VERIFIED'];
      if (kyc2DoneStatuses.includes(customer.kycStatus || '')) {
        return reply.status(400).send({
          success: false,
          error: 'Le KYC2 a déjà été validé'
        });
      }

      const { professionalInfo, businessInfo, documents, termsAccepted, submittedAt } = body;

      // Build business documents JSON
      const businessDocuments = businessInfo?.hasOwnBusiness ? {
        businessName: businessInfo.businessName,
        businessType: businessInfo.businessType,
        businessAddress: businessInfo.businessAddress,
        businessDuration: businessInfo.businessDuration,
        businessMonthlyRevenue: businessInfo.businessMonthlyRevenue,
        businessProofUrl: documents?.businessProofUrl
      } : null;

      // Get client IP
      const ipAddress = request.headers['x-forwarded-for'] || 
                       request.headers['x-real-ip'] || 
                       request.ip || 'unknown';

      // Update customer with KYC2 data
      await db
        .update(customers)
        .set({
          profession: professionalInfo.profession,
          employer: professionalInfo.employer,
          monthlyIncome: professionalInfo.monthlyIncome?.toString(),
          incomeProofUrl: documents?.incomeProofUrl,
          businessDocuments: businessDocuments,
          kycStatus: 'KYC2_PENDING',
          kyc2SubmissionDate: new Date().toISOString(),
          termsAccepted: termsAccepted,
          termsAcceptedAt: termsAccepted ? new Date().toISOString() : null,
          termsAcceptedIp: termsAccepted ? (Array.isArray(ipAddress) ? ipAddress[0] : ipAddress) : null,
          updatedAt: new Date().toISOString(),
          // Add to audit trail
          kycAuditTrail: [
            ...(customer.kycAuditTrail as any[] || []),
            {
              action: 'KYC2_SUBMITTED',
              timestamp: new Date().toISOString(),
              ip: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
              data: {
                profession: professionalInfo.profession,
                hasBusinessInfo: !!businessInfo?.hasOwnBusiness,
                documentsCount: Object.values(documents || {}).filter(Boolean).length
              }
            }
          ]
        })
        .where(eq(customers.id, customerId));

      // TODO: Send notification to admin about new KYC2 submission
      // TODO: Send confirmation notification to customer

      return reply.send({
        success: true,
        message: 'KYC2 soumis avec succès pour validation',
        data: {
          status: 'KYC2_PENDING',
          submissionDate: submittedAt || new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error('[KYC2] Submit error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Erreur lors de la soumission du KYC2'
      });
    }
  });

  /**
   * GET /customer/kyc2/status
   * Get current KYC2 status for customer
   */
  app.get('/customer/kyc2/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const session = (request as any).session;
      if (!session?.customerId) {
        return reply.status(401).send({
          success: false,
          error: 'Non authentifié'
        });
      }

      const [customer] = await db
        .select({
          kycStatus: customers.kycStatus,
          kyc2SubmissionDate: customers.kyc2SubmissionDate,
          kyc2ValidationDate: customers.kyc2ValidationDate,
          profession: customers.profession,
          employer: customers.employer,
          monthlyIncome: customers.monthlyIncome,
          businessDocuments: customers.businessDocuments,
          category: customers.category,
          isManualCreation: customers.isManualCreation
        })
        .from(customers)
        .where(eq(customers.id, session.customerId))
        .limit(1);

      if (!customer) {
        return reply.status(404).send({
          success: false,
          error: 'Client non trouvé'
        });
      }

      // Determine KYC2 status
      let kyc2Status = 'NOT_STARTED';
      if (customer.kycStatus?.includes('KYC2') || customer.kycStatus?.includes('KYC3')) {
        if (customer.kycStatus === 'KYC2_PENDING') kyc2Status = 'PENDING';
        else if (customer.kycStatus === 'KYC2_UNDER_REVIEW') kyc2Status = 'UNDER_REVIEW';
        else if (customer.kycStatus === 'KYC2_VERIFIED') kyc2Status = 'VERIFIED';
        else if (customer.kycStatus === 'KYC2_REJECTED') kyc2Status = 'REJECTED';
        else if (customer.kycStatus?.includes('KYC3')) kyc2Status = 'VERIFIED'; // KYC3 means KYC2 is done
      }

      // Check eligibility for KYC2
      const kyc1ValidStatuses = ['KYC1_COMPLETED', 'KYC1_VERIFIED'];
      const isKyc1Valid = kyc1ValidStatuses.includes(customer.kycStatus || '');

      return reply.send({
        success: true,
        data: {
          kyc2Status,
          isEligible: isKyc1Valid && kyc2Status === 'NOT_STARTED',
          submissionDate: customer.kyc2SubmissionDate,
          validationDate: customer.kyc2ValidationDate,
          hasExistingData: !!(customer.profession && customer.monthlyIncome),
          needsReview: customer.isManualCreation && !!(customer.profession && customer.monthlyIncome) && kyc2Status === 'NOT_STARTED',
          existingData: {
            profession: customer.profession,
            employer: customer.employer,
            monthlyIncome: customer.monthlyIncome,
            businessInfo: customer.businessDocuments
          }
        }
      });

    } catch (error: any) {
      console.error('[KYC2] Status error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération du statut KYC2'
      });
    }
  });
}
