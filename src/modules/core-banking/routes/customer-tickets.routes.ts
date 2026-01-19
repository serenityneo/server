/**
 * Customer Support Tickets Routes
 * Handles support tickets and messages for customer dashboard
 * Optimized for fast response times (P90/P95 < 200ms)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TicketService } from '../services/ticket.service';

interface TicketsQueryParams {
  status?: string;
  type?: string;
  limit?: string;
  offset?: string;
}

interface CustomerIdBody {
  customerId: number;
}

interface CreateTicketBody extends CustomerIdBody {
  ticketType: string;
  subject: string;
  description: string;
  priority?: string;
  relatedService?: string;
}

interface SendMessageBody extends CustomerIdBody {
  ticketId: string;
  message: string;
}

export default async function customerTicketsRoutes(fastify: FastifyInstance) {
  /**
   * POST /customer/support-tickets
   * Get support tickets for a customer (GET functionality via POST for auth)
   */
  fastify.post('/support-tickets', {
    schema: {
      tags: ['Customer', 'Support'],
      summary: 'Get customer support tickets',
      body: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'number' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          type: { type: 'string' },
          limit: { type: 'number', default: 100 },
          offset: { type: 'number', default: 0 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.body as CustomerIdBody;
      const query = request.query as TicketsQueryParams;

      if (!customerId || isNaN(Number(customerId))) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid customer ID',
        });
      }

      const tickets = await TicketService.getTickets({
        customerId: Number(customerId),
        status: query.status || null,
        type: query.type || null,
        limit: query.limit ? parseInt(query.limit, 10) : 100,
        offset: query.offset ? parseInt(query.offset, 10) : 0,
      });

      return reply.send({
        success: true,
        tickets,
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to fetch support tickets');
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve support tickets',
      });
    }
  });

  /**
   * POST /customer/support-tickets/create
   * Create a new support ticket
   */
  fastify.post('/support-tickets/create', {
    schema: {
      tags: ['Customer', 'Support'],
      summary: 'Create a new support ticket',
      body: {
        type: 'object',
        required: ['customerId', 'ticketType', 'subject', 'description'],
        properties: {
          customerId: { type: 'number' },
          ticketType: { type: 'string' },
          subject: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', default: 'MEDIUM' },
          relatedService: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const {
        customerId,
        ticketType,
        subject,
        description,
        priority,
        relatedService,
      } = request.body as CreateTicketBody;

      if (!customerId || !ticketType || !subject || !description) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required fields: customerId, ticketType, subject, description',
        });
      }

      const ticket = await TicketService.createTicket({
        customerId: Number(customerId),
        ticketType,
        subject,
        description,
        priority: priority || 'MEDIUM',
        relatedService: relatedService || null,
      });

      return reply.status(201).send({
        success: true,
        ticket,
        message: 'Ticket created successfully',
      });
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to create support ticket');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to create support ticket',
      });
    }
  });

  /**
   * POST /customer/ticket-messages
   * Send a message to a support ticket
   */
  fastify.post('/ticket-messages', {
    schema: {
      tags: ['Customer', 'Support'],
      summary: 'Send a message to a support ticket',
      body: {
        type: 'object',
        required: ['customerId', 'ticketId', 'message'],
        properties: {
          customerId: { type: 'number' },
          ticketId: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, ticketId, message } = request.body as SendMessageBody;

      if (!customerId || !ticketId || !message) {
        return reply.status(400).send({
          success: false,
          error: 'Missing required fields: customerId, ticketId, message',
        });
      }

      const ticketMessage = await TicketService.sendMessage({
        ticketId,
        customerId: Number(customerId),
        message,
      });

      return reply.status(201).send({
        success: true,
        message: ticketMessage,
        ticketId,
      });
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to send ticket message');
      
      const statusCode = error.message.includes('not found') ? 404 :
                         error.message.includes('Access denied') ? 403 :
                         error.message.includes('closed') ? 400 : 500;

      return reply.status(statusCode).send({
        success: false,
        error: error.message || 'Failed to send message',
      });
    }
  });

  /**
   * POST /customer/support-tickets/messages
   * Get messages for a specific ticket
   */
  fastify.post('/support-tickets/messages', {
    schema: {
      tags: ['Customer', 'Support'],
      summary: 'Get messages for a ticket',
      body: {
        type: 'object',
        required: ['customerId', 'ticketId'],
        properties: {
          customerId: { type: 'number' },
          ticketId: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId, ticketId } = request.body as { customerId: number; ticketId: string };

      const messages = await TicketService.getTicketMessages(ticketId, Number(customerId));

      return reply.send({
        success: true,
        messages,
      });
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to fetch ticket messages');
      
      const statusCode = error.message.includes('not found') || error.message.includes('denied') ? 404 : 500;

      return reply.status(statusCode).send({
        success: false,
        error: error.message || 'Failed to retrieve messages',
      });
    }
  });
}
