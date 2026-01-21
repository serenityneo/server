import { db } from '../../../services/db';
import { jobApplications } from '../../../db/schema';
import { desc } from 'drizzle-orm';

export interface CreateApplicationDTO {
    fullName: string;
    email: string;
    phone: string;
    portfolio?: string;
    coverLetter: string;
    jobTitle: string;
    cvUrl: string;
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: any;
}

export class JobApplicationsService {

    /**
     * Create a new job application record
     */
    async createApplication(data: CreateApplicationDTO) {
        return await db.insert(jobApplications).values({
            fullName: data.fullName,
            email: data.email,
            phone: data.phone,
            portfolio: data.portfolio,
            coverLetter: data.coverLetter,
            jobTitle: data.jobTitle,
            cvUrl: data.cvUrl,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            deviceInfo: data.deviceInfo,
            status: 'PENDING'
        }).returning();
    }

    /**
     * Get all applications (Admin)
     */
    async getApplications() {
        return await db.select().from(jobApplications).orderBy(desc(jobApplications.createdAt));
    }
}

export const jobApplicationsService = new JobApplicationsService();
