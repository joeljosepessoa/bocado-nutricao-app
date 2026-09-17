import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClientStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { RefreshTokenService } from '../auth/refresh-token.service';
import { ClientsService } from '../clients/clients.service';
import { DietsService } from '../diets/diets.service';
import { WorkoutsService } from '../workouts/workouts.service';
import { PhysicalEvaluationsService } from '../physical-evaluations/physical-evaluations.service';
import { ReportsService } from '../reports/reports.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { DevicesService } from '../devices/devices.service';
import { NotificationPreferencesService } from '../notifications/notification-preferences.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

const EXPORT_PAGE_SIZE = 10_000;

/**
 * Só o que o cliente já tem acesso via API própria hoje (dieta/treino
 * publicado atual, avaliações liberadas, relatórios liberados, mensagens,
 * consultas, dispositivos, preferências) — reaproveitando os services
 * client-safe já existentes, nunca uma query nova sem o allowlist que cada
 * um já aplica. Não inclui histórico técnico interno do profissional
 * (versões não publicadas, dado nunca exposto ao cliente) — isso nunca foi
 * "dado do cliente" no sentido de posse/visualização própria.
 */
export interface ClientDataExport {
  requestId: string;
  exportedAt: string;
  profile: unknown;
  evaluations: unknown[];
  diet: unknown;
  workout: unknown;
  reports: unknown[];
  messages: unknown[];
  appointments: unknown[];
  devices: unknown;
  notificationPreferences: unknown[];
}

@Injectable()
export class LgpdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly clientsService: ClientsService,
    private readonly dietsService: DietsService,
    private readonly workoutsService: WorkoutsService,
    private readonly evaluationsService: PhysicalEvaluationsService,
    private readonly reportsService: ReportsService,
    private readonly appointmentsService: AppointmentsService,
    private readonly devicesService: DevicesService,
    private readonly notificationPreferencesService: NotificationPreferencesService,
  ) {}

  async exportClientData(clientId: string): Promise<ClientDataExport> {
    const [profile, evaluations, diet, workout, reports, appointments, devices, notificationPreferences] =
      await Promise.all([
        this.clientsService.me(clientId),
        this.evaluationsService.listReleasedForClient(clientId, 1, EXPORT_PAGE_SIZE),
        this.dietsService.findCurrentPublishedForClient(clientId),
        this.workoutsService.findCurrentPublishedForClient(clientId),
        this.reportsService.listReleasedForClient(clientId, 1, EXPORT_PAGE_SIZE),
        this.appointmentsService.listForClient(clientId),
        this.devicesService.listOwnConnections(clientId),
        this.notificationPreferencesService.list({ id: clientId, role: 'client' } as AuthenticatedUser),
      ]);

    // Mensagens: consulta direta (não listForClient) de propósito — aquele
    // método marca mensagem do profissional como lida como efeito
    // colateral (correto para quem está de fato lendo a conversa); uma
    // exportação de dados nunca deve mutar nada.
    const messages = await this.prisma.message.findMany({
      where: { thread: { clientId } },
      orderBy: { createdAt: 'asc' },
    });

    const request = await this.prisma.dataExportRequest.create({ data: { clientId } });

    return {
      requestId: request.id,
      exportedAt: request.requestedAt.toISOString(),
      profile,
      evaluations: evaluations.items,
      diet,
      workout,
      reports: reports.items,
      messages,
      appointments,
      devices,
      notificationPreferences,
    };
  }

  /**
   * Soft-delete + anonimização — nunca apaga a linha de Client (preserva a
   * integridade referencial das tabelas do profissional: avaliações,
   * dietas, treinos, relatórios etc. continuam existindo). Email/nome/senha
   * viram placeholder irreversível; sessões ativas são revogadas na hora
   * (mesmo mecanismo já usado em reset de senha e suspensão).
   */
  async deleteAccount(clientId: string, currentPassword: string): Promise<void> {
    const existingRequest = await this.prisma.accountDeletionRequest.findUnique({ where: { clientId } });
    if (existingRequest) {
      throw new ConflictException('Esta conta já foi excluída.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: clientId } });
    const passwordMatches = await this.passwordService.compare(currentPassword, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Senha atual incorreta.');
    }

    const unusableHash = await this.passwordService.hash(this.passwordService.generateTemporaryPassword());
    const anonymizedEmail = `deleted-${clientId}@bocadodenutricao.invalid`;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: clientId },
        data: {
          email: anonymizedEmail,
          fullName: 'Cliente removido',
          passwordHash: unusableHash,
          anonymizedAt: new Date(),
        },
      }),
      this.prisma.client.update({
        where: { id: clientId },
        data: {
          phone: null,
          gender: null,
          notes: null,
          birthDate: null,
          status: ClientStatus.archived,
          archivedAt: new Date(),
        },
      }),
      this.prisma.accountDeletionRequest.create({ data: { clientId } }),
    ]);

    await this.refreshTokenService.revokeAllForUser(clientId);
  }
}
