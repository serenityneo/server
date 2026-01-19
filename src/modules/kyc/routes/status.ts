import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../db';
import { customers } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export async function registerKycStatusRoutes(fastify: FastifyInstance) {

    // Helper to map DB status to Frontend status
    const mapStatus = (status: string | null) => {
        if (!status) return 'not_started';
        return status.toLowerCase();
    };

    // GET /customers/:customerId/kyc-status
    fastify.get('/customers/:customerId/kyc-status', async (request: FastifyRequest, reply: FastifyReply) => {
        const { customerId } = request.params as { customerId: string };
        const id = parseInt(customerId);

        if (isNaN(id)) {
            return reply.status(400).send({ error: 'Invalid customer ID' });
        }

        const [customer] = await db.select().from(customers).where(eq(customers.id, id));

        if (!customer) {
            return reply.status(404).send({ error: 'Customer not found' });
        }

        return {
            kyc_status: mapStatus(customer.kycStatus)
        };
    });

    // GET /customers/:customerId/documents
    fastify.get('/customers/:customerId/documents', async (request: FastifyRequest, reply: FastifyReply) => {
        const { customerId } = request.params as { customerId: string };
        const id = parseInt(customerId);

        if (isNaN(id)) {
            return reply.status(400).send({ error: 'Invalid customer ID' });
        }

        const [customer] = await db.select().from(customers).where(eq(customers.id, id));

        if (!customer) {
            return reply.status(404).send({ error: 'Customer not found' });
        }

        const docs = [];
        if (customer.facePhotoUrl) {
            docs.push({ document_type: 'face_photo', url: customer.facePhotoUrl, status: 'approved' });
        }
        if (customer.signaturePhotoUrl) {
            docs.push({ document_type: 'signature_photo', url: customer.signaturePhotoUrl, status: 'approved' });
        }
        if (customer.idCardFrontUrl) {
            docs.push({ document_type: 'id_document_photo', url: customer.idCardFrontUrl, status: 'approved' });
        } else if (customer.passportUrl) {
            docs.push({ document_type: 'id_document_photo', url: customer.passportUrl, status: 'approved' });
        }

        return {
            documents: docs
        };
    });

    // GET /customers/:customerId/kyc2/submissions
    fastify.get('/customers/:customerId/kyc2/submissions', async (request: FastifyRequest, reply: FastifyReply) => {
        const { customerId } = request.params as { customerId: string };
        const id = parseInt(customerId);

        if (isNaN(id)) {
            return reply.status(400).send({ error: 'Invalid customer ID' });
        }

        // For now, return a synthesized history based on current status
        // Since we don't have a submissions table yet
        const submissions = [];
        const [customer] = await db.select().from(customers).where(eq(customers.id, id));

        if (customer && customer.kyc2SubmissionDate) {
            submissions.push({
                id: `sub_${id}_${new Date(customer.kyc2SubmissionDate).getTime()}`,
                submissionDate: customer.kyc2SubmissionDate,
                status: customer.kycStatus === 'KYC2_PENDING' || customer.kycStatus === 'KYC2_UNDER_REVIEW' ? 'under_review' :
                    customer.kycStatus === 'KYC2_VERIFIED' ? 'approved' : 'rejected',
                reviewDate: customer.kyc2ValidationDate,
                rejectionReason: null
            });
        }

        return {
            submissions: submissions
        };
    });
}
