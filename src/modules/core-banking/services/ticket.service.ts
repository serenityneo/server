/**
 * Support Ticket Service
 * Handles customer support tickets and messages
 * Uses Drizzle ORM for optimal performance
 */

import { db } from '../../../db';
import { supportTickets, ticketMessages } from '../../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface Ticket {
  id: string;
  customerId: number;
  publicId: string;
  ticketType: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  relatedService: string | null;
  assignedTo: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderType: string;
  senderId: number | null;
  message: string;
  isInternalNote: boolean;
  createdAt: string;
}

export interface GetTicketsParams {
  customerId: number;
  status?: string | null;
  type?: string | null;
  limit?: number;
  offset?: number;
}

export interface CreateTicketParams {
  customerId: number;
  ticketType: string;
  subject: string;
  description: string;
  priority?: string;
  relatedService?: string | null;
}

export interface CreateMessageParams {
  ticketId: string;
  customerId: number;
  message: string;
}

export class TicketService {
  /**
   * Get tickets for a customer with optional filtering
   */
  static async getTickets(params: GetTicketsParams): Promise<any[]> {
    const {
      customerId,
      status = null,
      type = null,
      limit = 100,
      offset = 0,
    } = params;

    // Build WHERE conditions
    const conditions = [eq(supportTickets.customerId, customerId)];

    if (status) {
      conditions.push(eq(supportTickets.status, status));
    }

    if (type) {
      conditions.push(eq(supportTickets.ticketType, type));
    }

    // Get tickets
    const tickets = await db
      .select()
      .from(supportTickets)
      .where(and(...conditions))
      .orderBy(desc(supportTickets.createdAt))
      .limit(limit)
      .offset(offset);

    // Get messages for each ticket (optimized batch query)
    const ticketIds = tickets.map(t => t.id);
    
    if (ticketIds.length === 0) {
      return [];
    }

    const messages = await db
      .select()
      .from(ticketMessages)
      .where(sql`${ticketMessages.ticketId} IN (${sql.join(ticketIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(ticketMessages.createdAt);

    // Group messages by ticket
    const messagesByTicket = new Map<string, any[]>();
    for (const msg of messages) {
      const ticketMsgs = messagesByTicket.get(msg.ticketId) || [];
      ticketMsgs.push(msg);
      messagesByTicket.set(msg.ticketId, ticketMsgs);
    }

    // Attach messages to tickets
    return tickets.map(ticket => ({
      ...ticket,
      ticket_messages: messagesByTicket.get(ticket.id) || [],
    }));
  }

  /**
   * Create a new support ticket
   */
  static async createTicket(params: CreateTicketParams): Promise<any> {
    const {
      customerId,
      ticketType,
      subject,
      description,
      priority = 'MEDIUM',
      relatedService = null,
    } = params;

    // Generate unique public ID
    let publicId: string;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      publicId = `TKT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      const existing = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.publicId, publicId))
        .limit(1);

      if (existing.length === 0) {
        isUnique = true;
      } else {
        attempts++;
      }
    }

    if (!isUnique) {
      throw new Error('Unable to generate unique ticket ID');
    }

    // Create ticket in transaction
    return await db.transaction(async (tx) => {
      const ticketId = uuidv4();

      const [ticket] = await tx
        .insert(supportTickets)
        .values({
          id: ticketId,
          customerId,
          publicId: publicId!,
          ticketType,
          subject,
          description,
          priority,
          status: 'OPEN',
          relatedService,
        })
        .returning();

      // Create initial message from customer
      await tx.insert(ticketMessages).values({
        id: uuidv4(),
        ticketId: ticketId,
        senderType: 'CUSTOMER',
        senderId: customerId,
        message: description,
      });

      return ticket;
    });
  }

  /**
   * Send a message to a ticket
   */
  static async sendMessage(params: CreateMessageParams): Promise<any> {
    const { ticketId, customerId, message } = params;

    // Verify ticket exists and belongs to customer
    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    if (ticket.customerId !== customerId) {
      throw new Error('Access denied to this ticket');
    }

    if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
      throw new Error('This ticket is closed. Cannot send message.');
    }

    // Create message and update ticket in transaction
    return await db.transaction(async (tx) => {
      const [ticketMessage] = await tx
        .insert(ticketMessages)
        .values({
          id: uuidv4(),
          ticketId,
          senderType: 'CUSTOMER',
          senderId: customerId,
          message,
        })
        .returning();

      // Update ticket timestamp
      await tx
        .update(supportTickets)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(supportTickets.id, ticketId));

      return ticketMessage;
    });
  }

  /**
   * Get messages for a specific ticket
   */
  static async getTicketMessages(ticketId: string, customerId: number): Promise<any[]> {
    // Verify ownership
    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    if (!ticket || ticket.customerId !== customerId) {
      throw new Error('Ticket not found or access denied');
    }

    return await db
      .select()
      .from(ticketMessages)
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(ticketMessages.createdAt);
  }

  /**
   * Update ticket status
   */
  static async updateTicketStatus(ticketId: string, status: string, customerId?: number): Promise<any> {
    const conditions = [eq(supportTickets.id, ticketId)];
    
    if (customerId) {
      conditions.push(eq(supportTickets.customerId, customerId));
    }

    const updateData: any = {
      status,
      updatedAt: new Date().toISOString(),
    };

    if (status === 'RESOLVED') {
      updateData.resolvedAt = new Date().toISOString();
    } else if (status === 'CLOSED') {
      updateData.closedAt = new Date().toISOString();
    }

    const [ticket] = await db
      .update(supportTickets)
      .set(updateData)
      .where(and(...conditions))
      .returning();

    if (!ticket) {
      throw new Error('Ticket not found or access denied');
    }

    return ticket;
  }
}
