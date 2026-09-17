import { Injectable, NotFoundException } from '@nestjs/common';
import { Message, MessageAuditAction, MessageSenderRole, MessageThread, NotificationEventType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { MessageAuditLogService } from './message-audit-log.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';

export interface RequestMeta {
  ipAddress?: string;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: MessageAuditLogService,
    private readonly notifications: NotificationDispatchService,
  ) {}

  private async assertOwnedClient(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, professionalId } });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado.');
    }
    return client;
  }

  /**
   * Uma thread por par profissional↔cliente — o @@unique no schema é a
   * garantia real; findUnique/create aqui só evita duas chamadas para quem
   * já tem thread na maioria das vezes.
   */
  private async getOrCreateThread(clientId: string, professionalId: string, meta: RequestMeta): Promise<MessageThread> {
    const existing = await this.prisma.messageThread.findUnique({
      where: { clientId_professionalId: { clientId, professionalId } },
    });
    if (existing) {
      return existing;
    }
    const created = await this.prisma.messageThread.create({ data: { clientId, professionalId } });
    await this.auditLog.record({
      professionalId,
      clientId,
      threadId: created.id,
      action: MessageAuditAction.thread_created,
      ipAddress: meta.ipAddress,
    });
    return created;
  }

  /**
   * Lista a thread e marca como lida toda mensagem que veio do OUTRO lado e
   * ainda não tinha readAt — nunca marca a própria mensagem como lida.
   */
  private async listAndMarkRead(
    thread: MessageThread,
    incomingSenderRole: MessageSenderRole,
    professionalId: string,
    clientId: string,
    meta: RequestMeta,
  ): Promise<Message[]> {
    const messages = await this.prisma.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
    });

    const unreadIncomingIds = messages.filter((m) => m.senderRole === incomingSenderRole && !m.readAt).map((m) => m.id);
    if (unreadIncomingIds.length === 0) {
      return messages;
    }

    await this.prisma.message.updateMany({
      where: { id: { in: unreadIncomingIds } },
      data: { readAt: new Date() },
    });
    await this.auditLog.record({
      professionalId,
      clientId,
      threadId: thread.id,
      action: MessageAuditAction.thread_read,
      ipAddress: meta.ipAddress,
    });

    return this.prisma.message.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: 'asc' } });
  }

  private async createMessage(
    thread: MessageThread,
    senderRole: MessageSenderRole,
    body: string,
    professionalId: string,
    clientId: string,
    meta: RequestMeta,
  ): Promise<Message> {
    const message = await this.prisma.message.create({ data: { threadId: thread.id, senderRole, body } });
    await this.auditLog.record({
      professionalId,
      clientId,
      threadId: thread.id,
      messageId: message.id,
      action: MessageAuditAction.message_sent,
      ipAddress: meta.ipAddress,
    });

    // Notifica sempre quem NÃO enviou — nunca dá pra saber por push quem
    // mandou nem o texto: NotificationLog nunca guarda conteúdo (Fase 16).
    await this.notifications.dispatch({
      eventType: NotificationEventType.message_received,
      recipient: senderRole === MessageSenderRole.professional ? { clientId } : { professionalId },
      title: 'Nova mensagem',
      body:
        senderRole === MessageSenderRole.professional
          ? 'Seu profissional enviou uma nova mensagem.'
          : 'Seu cliente enviou uma nova mensagem.',
    });

    return message;
  }

  // --- Visão do profissional (professionalId vem do RBAC, clientId da rota, sempre validado por assertOwnedClient) ---

  async listForProfessional(professionalId: string, clientId: string, meta: RequestMeta = {}): Promise<Message[]> {
    await this.assertOwnedClient(professionalId, clientId);
    const thread = await this.getOrCreateThread(clientId, professionalId, meta);
    return this.listAndMarkRead(thread, MessageSenderRole.client, professionalId, clientId, meta);
  }

  async sendFromProfessional(professionalId: string, clientId: string, body: string, meta: RequestMeta = {}): Promise<Message> {
    await this.assertOwnedClient(professionalId, clientId);
    const thread = await this.getOrCreateThread(clientId, professionalId, meta);
    return this.createMessage(thread, MessageSenderRole.professional, body, professionalId, clientId, meta);
  }

  // --- Visão do cliente (professionalId nunca vem de parâmetro — sempre resolvido do próprio Client) ---

  async listForClient(clientId: string, meta: RequestMeta = {}): Promise<Message[]> {
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const thread = await this.getOrCreateThread(clientId, client.professionalId, meta);
    return this.listAndMarkRead(thread, MessageSenderRole.professional, client.professionalId, clientId, meta);
  }

  async sendFromClient(clientId: string, body: string, meta: RequestMeta = {}): Promise<Message> {
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const thread = await this.getOrCreateThread(clientId, client.professionalId, meta);
    return this.createMessage(thread, MessageSenderRole.client, body, client.professionalId, clientId, meta);
  }
}
