import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateWeightLogDto } from './dto/create-weight-log.dto';
import { CreateWaterLogDto } from './dto/create-water-log.dto';
import { formatCalendarDate, parseCalendarDate, resolveWaterGoal } from './water-goal';

export const ALLOWED_PROGRESS_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PROGRESS_PHOTO_BYTES = 10 * 1024 * 1024;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WEIGHT_ITEMS = 1000;
const MAX_HISTORY_DAYS = 366;
/** Pequena folga para relógio do aparelho adiantado. */
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

export interface WeightEntry {
  /** null para pesos vindos de avaliação (não podem ser apagados pelo app). */
  id: string | null;
  weightKg: number;
  recordedAt: Date;
  source: 'self' | 'evaluation';
}

/**
 * Registros do próprio paciente (peso, água e fotos de progresso). Toda
 * consulta filtra pelo `clientId` do token — o paciente só enxerga e altera
 * o que é dele; ids de outro paciente respondem 404, sem revelar existência.
 */
@Injectable()
export class ClientTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------- peso

  /**
   * Pesos reais do paciente: os que ele registrou no app e os das avaliações
   * já liberadas pelo nutricionista. Ordem cronológica; `days` limita ao
   * período recente (ex.: 30 para o gráfico do Dashboard).
   */
  async listWeights(clientId: string, days?: number) {
    const since = days ? new Date(Date.now() - days * DAY_MS) : undefined;
    const [client, logs, evaluations] = await Promise.all([
      this.prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { targetWeightKg: true } }),
      this.prisma.clientWeightLog.findMany({
        where: { clientId, ...(since ? { recordedAt: { gte: since } } : {}) },
        orderBy: { recordedAt: 'desc' },
        take: MAX_WEIGHT_ITEMS,
        select: { id: true, weightKg: true, recordedAt: true },
      }),
      this.prisma.physicalEvaluation.findMany({
        where: {
          clientId,
          releasedToClientAt: { not: null },
          weightKg: { not: null },
          ...(since ? { evaluatedAt: { gte: since } } : {}),
        },
        orderBy: { evaluatedAt: 'desc' },
        take: MAX_WEIGHT_ITEMS,
        select: { weightKg: true, evaluatedAt: true },
      }),
    ]);

    const items: WeightEntry[] = [
      ...logs.map((log) => ({ id: log.id, weightKg: log.weightKg, recordedAt: log.recordedAt, source: 'self' as const })),
      ...evaluations.map((evaluation) => ({
        id: null,
        weightKg: evaluation.weightKg as number,
        recordedAt: evaluation.evaluatedAt,
        source: 'evaluation' as const,
      })),
    ].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

    return { targetWeightKg: client.targetWeightKg, items };
  }

  async addWeight(clientId: string, dto: CreateWeightLogDto) {
    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    if (recordedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('A data da pesagem não pode estar no futuro.');
    }
    const log = await this.prisma.clientWeightLog.create({
      data: { clientId, weightKg: Math.round(dto.weightKg * 100) / 100, recordedAt },
      select: { id: true, weightKg: true, recordedAt: true },
    });
    return { ...log, source: 'self' as const };
  }

  async deleteWeight(clientId: string, id: string): Promise<void> {
    const { count } = await this.prisma.clientWeightLog.deleteMany({ where: { id, clientId } });
    if (count === 0) throw new NotFoundException('Registro de peso não encontrado.');
  }

  /** Último peso real (registro do app ou avaliação liberada), ou null. */
  async currentWeightKg(clientId: string): Promise<number | null> {
    const [log, evaluation] = await Promise.all([
      this.prisma.clientWeightLog.findFirst({
        where: { clientId },
        orderBy: { recordedAt: 'desc' },
        select: { weightKg: true, recordedAt: true },
      }),
      this.prisma.physicalEvaluation.findFirst({
        where: { clientId, releasedToClientAt: { not: null }, weightKg: { not: null } },
        orderBy: { evaluatedAt: 'desc' },
        select: { weightKg: true, evaluatedAt: true },
      }),
    ]);
    if (log && (!evaluation || log.recordedAt >= evaluation.evaluatedAt)) return log.weightKg;
    return evaluation?.weightKg ?? null;
  }

  // ---------------------------------------------------------------- água

  private async waterGoal(clientId: string) {
    const [client, weightKg] = await Promise.all([
      this.prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { waterGoalMl: true } }),
      this.currentWeightKg(clientId),
    ]);
    return resolveWaterGoal(client.waterGoalMl, weightKg);
  }

  private resolveDay(value: string | undefined): Date {
    if (value === undefined || value === '') return parseCalendarDate(formatCalendarDate(new Date())) as Date;
    const day = parseCalendarDate(value);
    if (!day) throw new BadRequestException('date deve ser uma data válida no formato AAAA-MM-DD.');
    const diffDays = (day.getTime() - Date.now()) / DAY_MS;
    if (diffDays > 1 || diffDays < -MAX_HISTORY_DAYS) {
      throw new BadRequestException('date fora do período permitido.');
    }
    return day;
  }

  async getWaterDay(clientId: string, date?: string) {
    const day = this.resolveDay(date);
    const [goal, entries] = await Promise.all([
      this.waterGoal(clientId),
      this.prisma.clientWaterLog.findMany({
        where: { clientId, loggedOn: day },
        orderBy: { loggedAt: 'asc' },
        select: { id: true, amountMl: true, loggedAt: true },
      }),
    ]);
    const totalMl = entries.reduce((sum, entry) => sum + entry.amountMl, 0);
    return { date: formatCalendarDate(day), totalMl, goalMl: goal.goalMl, goalSource: goal.source, entries };
  }

  async addWater(clientId: string, dto: CreateWaterLogDto) {
    const day = this.resolveDay(dto.date);
    await this.prisma.clientWaterLog.create({ data: { clientId, amountMl: dto.amountMl, loggedOn: day } });
    return this.getWaterDay(clientId, formatCalendarDate(day));
  }

  async deleteWaterEntry(clientId: string, id: string) {
    const entry = await this.prisma.clientWaterLog.findFirst({ where: { id, clientId }, select: { loggedOn: true } });
    if (!entry) throw new NotFoundException('Registro de água não encontrado.');
    await this.prisma.clientWaterLog.delete({ where: { id } });
    return this.getWaterDay(clientId, formatCalendarDate(entry.loggedOn));
  }

  /** "Zerar o dia": apaga só os registros de água daquele dia, do próprio paciente. */
  async resetWaterDay(clientId: string, date?: string) {
    const day = this.resolveDay(date);
    await this.prisma.clientWaterLog.deleteMany({ where: { clientId, loggedOn: day } });
    return this.getWaterDay(clientId, formatCalendarDate(day));
  }

  /** Total por dia (só dias com registro), do mais recente para o mais antigo. */
  async waterHistory(clientId: string, days = 30) {
    const span = Math.min(Math.max(Math.trunc(days) || 30, 1), MAX_HISTORY_DAYS);
    const since = parseCalendarDate(formatCalendarDate(new Date(Date.now() - (span - 1) * DAY_MS))) as Date;
    const [goal, groups] = await Promise.all([
      this.waterGoal(clientId),
      this.prisma.clientWaterLog.groupBy({
        by: ['loggedOn'],
        where: { clientId, loggedOn: { gte: since } },
        _sum: { amountMl: true },
        orderBy: { loggedOn: 'desc' },
      }),
    ]);
    return {
      goalMl: goal.goalMl,
      goalSource: goal.source,
      days: groups.map((group) => ({ date: formatCalendarDate(group.loggedOn), totalMl: group._sum.amountMl ?? 0 })),
    };
  }

  // ------------------------------------------------------ fotos de progresso

  listPhotos(clientId: string) {
    return this.prisma.clientProgressPhoto.findMany({
      where: { clientId },
      orderBy: { takenAt: 'desc' },
      select: { id: true, contentType: true, takenAt: true, createdAt: true },
    });
  }

  async uploadPhoto(clientId: string, file: { buffer: Buffer; mimetype: string; size: number }, takenAt?: string) {
    if (!ALLOWED_PROGRESS_PHOTO_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Formato de imagem não suportado. Use JPEG, PNG ou WEBP.');
    }
    if (file.size > MAX_PROGRESS_PHOTO_BYTES) {
      throw new BadRequestException('Arquivo maior que o limite de 10MB.');
    }
    let when = new Date();
    if (takenAt !== undefined && takenAt !== '') {
      when = new Date(takenAt);
      if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
        throw new BadRequestException('takenAt inválido.');
      }
    }

    const { storageKey, sizeBytes } = await this.storage.save(file.buffer, file.mimetype);
    return this.prisma.clientProgressPhoto.create({
      data: { clientId, storageKey, contentType: file.mimetype, sizeBytes, takenAt: when },
      select: { id: true, contentType: true, takenAt: true, createdAt: true },
    });
  }

  async getPhotoUrl(clientId: string, id: string) {
    const photo = await this.prisma.clientProgressPhoto.findFirst({
      where: { id, clientId },
      select: { storageKey: true, contentType: true },
    });
    if (!photo) throw new NotFoundException('Foto não encontrada.');
    return this.storage.getSignedUrl(photo.storageKey, photo.contentType, 'photo-download');
  }

  async deletePhoto(clientId: string, id: string): Promise<void> {
    const photo = await this.prisma.clientProgressPhoto.findFirst({ where: { id, clientId }, select: { storageKey: true } });
    if (!photo) throw new NotFoundException('Foto não encontrada.');
    await this.prisma.clientProgressPhoto.delete({ where: { id } });
    await this.storage.delete(photo.storageKey);
  }

  // --------------------------------------------------------------- LGPD

  /** Tudo o que o paciente registrou no app (para a exportação de dados). */
  async exportOwnRecords(clientId: string) {
    const [weights, water, progressPhotos] = await Promise.all([
      this.prisma.clientWeightLog.findMany({
        where: { clientId },
        orderBy: { recordedAt: 'asc' },
        select: { weightKg: true, recordedAt: true, createdAt: true },
      }),
      this.prisma.clientWaterLog.findMany({
        where: { clientId },
        orderBy: { loggedAt: 'asc' },
        select: { amountMl: true, loggedOn: true, loggedAt: true },
      }),
      this.listPhotos(clientId),
    ]);
    return { weights, water, progressPhotos };
  }

  /**
   * Exclusão de conta: apaga os registros pessoais feitos pelo próprio
   * paciente (peso, água e fotos, inclusive os arquivos). Dados do
   * nutricionista (avaliações, dietas, treinos) seguem a anonimização da
   * LGPD e não passam por aqui.
   */
  async deleteOwnRecords(clientId: string): Promise<void> {
    const photos = await this.prisma.clientProgressPhoto.findMany({ where: { clientId }, select: { storageKey: true } });
    await this.prisma.$transaction([
      this.prisma.clientWeightLog.deleteMany({ where: { clientId } }),
      this.prisma.clientWaterLog.deleteMany({ where: { clientId } }),
      this.prisma.clientProgressPhoto.deleteMany({ where: { clientId } }),
    ]);
    for (const photo of photos) {
      // Arquivo órfão no storage não expõe nada (chave aleatória, sem linha
      // apontando para ele); a exclusão da conta não pode falhar por isso.
      await this.storage.delete(photo.storageKey).catch(() => undefined);
    }
  }
}
