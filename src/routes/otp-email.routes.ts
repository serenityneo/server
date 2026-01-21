import { FastifyInstance, FastifyRequest } from 'fastify';
import { resendEmailService } from '../services/resend-email.service';

interface SendOtpEmailBody {
    email: string;
    code: string;
    purpose: string;
}

export async function otpEmailRoutes(app: FastifyInstance) {
    app.post('/otp/send-email', {
        schema: {
            body: {
                type: 'object',
                required: ['email', 'code', 'purpose'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    code: { type: 'string' },
                    purpose: { type: 'string' }
                }
            }
        }
    }, async (request: FastifyRequest, reply) => {
        const { email, code, purpose } = request.body as SendOtpEmailBody;

        // Security: Validate code format (numeric, length) to prevent injection
        if (!/^\d{4,8}$/.test(code)) {
            return reply.status(400).send({ success: false, error: 'Invalid OTP format' });
        }

        const success = await resendEmailService.sendOTP(email, code, purpose);

        if (success) {
            return reply.send({ success: true, message: 'OTP sent successfully' });
        } else {
            return reply.status(500).send({ success: false, error: 'Failed to send OTP email' });
        }
    });

    // Login Alert Route (Secure - Internal/Trusted calls only)
    app.post('/security/alert-login', {
        schema: {
            body: {
                type: 'object',
                required: ['email', 'details'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    clientName: { type: 'string' },
                    details: {
                        type: 'object',
                        required: ['ip', 'device', 'time'],
                        properties: {
                            ip: { type: 'string' },
                            device: { type: 'string' },
                            time: { type: 'string' }
                        }
                    }
                }
            }
        }
    }, async (request: FastifyRequest, reply) => {
        const { email, clientName, details } = request.body as { email: string, clientName?: string, details: { ip: string, device: string, time: string } };

        // Non-blocking send
        resendEmailService.sendLoginAlert(email, clientName || 'Client', {
            ...details,
            browser: 'Unknown',
            os: 'Unknown',
            provider: 'Unknown',
            location: 'Unknown'
        }).catch(err => {
            request.log.error({ err }, 'Failed to send login alert');
        });

        return reply.send({ success: true, message: 'Alert queued' });
    });
}
