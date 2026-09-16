import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientStatus, DietStatus, Role, WorkoutStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { RefreshTokenService } from '../auth/refresh-token.service';
import { CreateClientDto } from './dto/create-client.dto';
import { DashboardSummaryDto, RecentActivityItem } from './dto/dashboard-summary.dto';

const RECENT_ACTIVITY_LIMIT = 10;
const RECENT_DAYS = 30;

@Injectable()
export class ProfessionalsService {
  private readonly logger = new Logger(ProfessionalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async me(professionalId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
    if (!professional) {
      throw new NotFoundException('Profissional não encontrado.');
    }
    return professional;
  }

  async createClient(professionalId: string, dto: CreateClientDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      this.logger.warn(`Tentativa de cadastro de cliente com e-mail já existente: ${dto.email}`);
      throw new BadRequestException('Não foi possível concluir o cadastro com os dados informados.');
    }

    const temporaryPassword = this.passwordService.generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);

    const client = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: Role.client,
          mustChangePassword: true,
        },
      });
      return tx.client.create({
        data: {
          id: user.id,
          professionalId,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          phone: dto.phone,
          gender: dto.gender,
        },
        include: { user: { select: { id: true, email: true, fullName: true } } },
      });
    });

    return { client, temporaryPassword };
  }

  async resetClientPassword(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, professionalId } });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    const temporaryPassword = this.passwordService.generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);

    await this.prisma.user.update({
      where: { id: clientId },
      data: { passwordHash, mustChangePassword: true },
    });
    await this.refreshTokenService.revokeAllForUser(clientId);

    return { temporaryPassword };
  }

  /**
   * Só números derivados diretamente do banco (Fase 9) — nenhuma métrica
   * inventada. "pendingRelease" reaproveita releasedToClientAt (Fase 7),
   * não é um status novo.
   */
  async getDashboard(professionalId: string): Promise<DashboardSummaryDto> {
    const recentSince = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);

    const [
      totalClients,
      activeClients,
      archivedClients,
      recentEvaluations,
      pendingReleaseEvaluations,
      activeDiets,
      activeWorkouts,
      lastEvaluations,
      lastDietVersions,
      lastWorkoutVersions,
    ] = await Promise.all([
      this.prisma.client.count({ where: { professionalId } }),
      this.prisma.client.count({ where: { professionalId, status: ClientStatus.active } }),
      this.prisma.client.count({ where: { professionalId, status: ClientStatus.archived } }),
      this.prisma.physicalEvaluation.count({ where: { professionalId, createdAt: { gte: recentSince } } }),
      this.prisma.physicalEvaluation.count({ where: { professionalId, releasedToClientAt: null } }),
      this.prisma.diet.count({ where: { professionalId, status: DietStatus.active } }),
      this.prisma.workout.count({ where: { professionalId, status: WorkoutStatus.active } }),
      this.prisma.physicalEvaluation.findMany({
        where: { professionalId },
        select: { createdAt: true, client: { select: { id: true, user: { select: { fullName: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_ACTIVITY_LIMIT,
      }),
      this.prisma.dietVersion.findMany({
        where: { publishedAt: { not: null }, diet: { professionalId } },
        select: {
          publishedAt: true,
          diet: { select: { client: { select: { id: true, user: { select: { fullName: true } } } } } },
        },
        orderBy: { publishedAt: 'desc' },
        take: RECENT_ACTIVITY_LIMIT,
      }),
      this.prisma.workoutVersion.findMany({
        where: { publishedAt: { not: null }, workout: { professionalId } },
        select: {
          publishedAt: true,
          workout: { select: { client: { select: { id: true, user: { select: { fullName: true } } } } } },
        },
        orderBy: { publishedAt: 'desc' },
        take: RECENT_ACTIVITY_LIMIT,
      }),
    ]);

    const recentActivity: RecentActivityItem[] = [
      ...lastEvaluations.map((e) => ({
        type: 'evaluation_created' as const,
        clientId: e.client.id,
        clientName: e.client.user.fullName,
        occurredAt: e.createdAt,
      })),
      ...lastDietVersions.map((v) => ({
        type: 'diet_published' as const,
        clientId: v.diet.client.id,
        clientName: v.diet.client.user.fullName,
        occurredAt: v.publishedAt as Date,
      })),
      ...lastWorkoutVersions.map((v) => ({
        type: 'workout_published' as const,
        clientId: v.workout.client.id,
        clientName: v.workout.client.user.fullName,
        occurredAt: v.publishedAt as Date,
      })),
    ]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, RECENT_ACTIVITY_LIMIT);

    const dto = new DashboardSummaryDto();
    dto.clients = { total: totalClients, active: activeClients, archived: archivedClients };
    dto.evaluations = { last30Days: recentEvaluations, pendingRelease: pendingReleaseEvaluations };
    dto.diets = { active: activeDiets };
    dto.workouts = { active: activeWorkouts };
    dto.recentActivity = recentActivity;
    return dto;
  }
}
