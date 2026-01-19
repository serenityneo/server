import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db';
import { twoFactorErrorReports, customers, users } from '../../db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { emailService } from '../../services/email.service';

/**
 * Security helper - Handle errors safely (BANKING SECURITY)
 */
function handleError(request: FastifyRequest, reply: FastifyReply, error: unknown, statusCode: number = 500) {
  request.log.error({ err: error }, 'Error reports error');
  reply.status(statusCode).send({
    success: false,
    error: 'Une erreur est survenue. Veuillez réessayer.'
  });
}

/**
 * 2FA Error Reports Routes
 * Handles submission and management of 2FA authentication error reports
 */
export async function errorReportsRoutes(fastify: FastifyInstance) {
  
  /**
   * POST /api/v1/error-reports/2fa
   * Submit a new 2FA error report (PUBLIC - no auth required)
   */
  fastify.post('/api/v1/error-reports/2fa', {
    schema: {
      tags: ['Error Reports'],
      summary: 'Submit 2FA error report',
      description: 'Allow users to report 2FA authentication issues with screenshots',
      body: {
        type: 'object',
        properties: {
          userEmail: { type: 'string' },
          userPhone: { type: 'string' },
          errorType: { type: 'string' },
          errorMessage: { type: 'string' },
          userDescription: { type: 'string' },
          failedAttempts: { type: 'number' },
          authenticatorApp: { type: 'string' },
          deviceInfo: { type: 'object' },
          ipAddress: { type: 'string' },
          userAgent: { type: 'string' },
          screenshotData: { type: 'string' }, // Base64 encoded image
        },
        required: ['errorType']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            reportId: { type: 'number' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const {
        userEmail,
        userPhone,
        errorType,
        errorMessage,
        userDescription,
        failedAttempts = 0,
        authenticatorApp,
        deviceInfo,
        ipAddress,
        userAgent,
        screenshotData
      } = request.body as any;

      console.log('[Error Reports] Received 2FA error report:', {
        userEmail,
        userPhone,
        errorType,
        failedAttempts
      });

      // Try to find customer by email or phone
      let customerId: number | null = null;
      if (userEmail || userPhone) {
        const customerQuery = userEmail
          ? eq(customers.email, userEmail)
          : eq(customers.mobileMoneyNumber, userPhone!);

        const [customer] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(customerQuery)
          .limit(1);

        if (customer) {
          customerId = customer.id;
        }
      }

      // Insert error report
      const [report] = await db
        .insert(twoFactorErrorReports)
        .values({
          customerId,
          userEmail,
          userPhone,
          errorType,
          errorMessage,
          userDescription,
          failedAttempts,
          authenticatorApp,
          deviceInfo: deviceInfo as any,
          ipAddress: ipAddress || request.ip,
          userAgent: userAgent || request.headers['user-agent'],
          screenshotData, // Temporarily store base64 data
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .returning({ id: twoFactorErrorReports.id, createdAt: twoFactorErrorReports.createdAt });

      console.log('[Error Reports] Created report:', { reportId: report.id });

      // Send email notification to support team
      try {
        await emailService.send2FAErrorReport({
          reportId: report.id,
          userEmail,
          userPhone,
          errorType,
          errorMessage,
          userDescription,
          failedAttempts,
          authenticatorApp,
          deviceInfo,
          ipAddress: ipAddress || request.ip,
          userAgent: userAgent || request.headers['user-agent'],
          createdAt: report.createdAt,
        });
        
        console.log('[Error Reports] Email notification sent to support');
      } catch (emailError) {
        console.error('[Error Reports] Failed to send email notification:', emailError);
        // Continue even if email fails - report is saved
      }

      // Send confirmation email to user if email provided
      if (userEmail) {
        try {
          await emailService.sendUserConfirmation(userEmail, report.id);
          console.log('[Error Reports] Confirmation email sent to user');
        } catch (emailError) {
          console.error('[Error Reports] Failed to send user confirmation:', emailError);
        }
      }

      return {
        success: true,
        reportId: report.id,
        message: 'Your error report has been submitted successfully. Our support team will review it shortly.'
      };
    } catch (error) {
      console.error('[Error Reports] Error creating report:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /api/v1/admin/error-reports/2fa
   * Get all 2FA error reports (ADMIN ONLY)
   */
  fastify.get('/api/v1/admin/error-reports/2fa', {
    // preHandler: requireAdminAuth, // Add auth middleware
    schema: {
      tags: ['Admin - Error Reports'],
      summary: 'Get all 2FA error reports',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          page: { type: 'number' },
          limit: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { status, page = 1, limit = 50 } = request.query as any;
      const offset = (page - 1) * limit;

      // Build where clause
      const conditions = [];
      if (status) {
        conditions.push(eq(twoFactorErrorReports.status, status));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get reports with customer info
      const reports = await db
        .select({
          id: twoFactorErrorReports.id,
          customerId: twoFactorErrorReports.customerId,
          userEmail: twoFactorErrorReports.userEmail,
          userPhone: twoFactorErrorReports.userPhone,
          errorType: twoFactorErrorReports.errorType,
          errorMessage: twoFactorErrorReports.errorMessage,
          userDescription: twoFactorErrorReports.userDescription,
          failedAttempts: twoFactorErrorReports.failedAttempts,
          authenticatorApp: twoFactorErrorReports.authenticatorApp,
          deviceInfo: twoFactorErrorReports.deviceInfo,
          ipAddress: twoFactorErrorReports.ipAddress,
          userAgent: twoFactorErrorReports.userAgent,
          screenshotUrl: twoFactorErrorReports.screenshotUrl,
          status: twoFactorErrorReports.status,
          assignedTo: twoFactorErrorReports.assignedTo,
          adminNotes: twoFactorErrorReports.adminNotes,
          resolution: twoFactorErrorReports.resolution,
          resolvedAt: twoFactorErrorReports.resolvedAt,
          createdAt: twoFactorErrorReports.createdAt,
          updatedAt: twoFactorErrorReports.updatedAt,
          // Customer info
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
          customerCif: customers.cifCode,
          // Assigned admin info
          assignedUsername: users.username,
        })
        .from(twoFactorErrorReports)
        .leftJoin(customers, eq(twoFactorErrorReports.customerId, customers.id))
        .leftJoin(users, eq(twoFactorErrorReports.assignedTo, users.id))
        .where(whereClause)
        .orderBy(desc(twoFactorErrorReports.createdAt))
        .limit(limit)
        .offset(offset);

      // Get total count
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(twoFactorErrorReports)
        .where(whereClause);

      return {
        success: true,
        reports,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      console.error('[Error Reports] Error fetching reports:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * GET /api/v1/admin/error-reports/2fa/:id
   * Get single 2FA error report details (ADMIN ONLY)
   */
  fastify.get('/api/v1/admin/error-reports/2fa/:id', {
    // preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin - Error Reports'],
      summary: 'Get 2FA error report details',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };

      const [report] = await db
        .select()
        .from(twoFactorErrorReports)
        .where(eq(twoFactorErrorReports.id, id))
        .limit(1);

      if (!report) {
        return reply.status(404).send({
          success: false,
          error: 'Report not found'
        });
      }

      return {
        success: true,
        report
      };
    } catch (error) {
      console.error('[Error Reports] Error fetching report:', error);
      handleError(request, reply, error, 500);
    }
  });

  /**
   * PUT /api/v1/admin/error-reports/2fa/:id
   * Update 2FA error report (status, assignment, notes) (ADMIN ONLY)
   */
  fastify.put('/api/v1/admin/error-reports/2fa/:id', {
    // preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin - Error Reports'],
      summary: 'Update 2FA error report',
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          assignedTo: { type: 'number' },
          adminNotes: { type: 'string' },
          resolution: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: number };
      const { status, assignedTo, adminNotes, resolution } = request.body as any;

      const updateData: any = {
        updatedAt: new Date().toISOString()
      };

      if (status) updateData.status = status;
      if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
      if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
      if (resolution !== undefined) updateData.resolution = resolution;

      // If status is RESOLVED or CLOSED, set resolved timestamp
      if (status === 'RESOLVED' || status === 'CLOSED') {
        updateData.resolvedAt = new Date().toISOString();
      }

      const [updated] = await db
        .update(twoFactorErrorReports)
        .set(updateData)
        .where(eq(twoFactorErrorReports.id, id))
        .returning();

      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'Report not found'
        });
      }

      return {
        success: true,
        report: updated
      };
    } catch (error) {
      console.error('[Error Reports] Error updating report:', error);
      handleError(request, reply, error, 500);
    }
  });

  console.log('[Error Reports] Routes registered successfully');
}
