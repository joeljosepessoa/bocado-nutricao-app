import { BadRequestException, Injectable } from '@nestjs/common';
import { BioimpedanceOrigin, Prisma, ScaleAuditAction, ScaleReadingStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PhysicalEvaluationsService } from '../physical-evaluations/physical-evaluations.service';
import { ScaleAuditLogService } from './scale-audit-log.service';
import { ConfirmScaleReadingDto } from './dto/confirm-scale-reading.dto';
import { ScaleReadingSummaryDto } from './dto/scale-reading-summary.dto';

export interface RequestMeta {
  ipAddress?: string;
}

const SCALE_READING_SELECT = {
  id: true,
  evaluationId: true,
  status: true,
  driverId: true,
  deviceIdentifier: true,
  protocolVersion: true,
  normalized: true,
  recordedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class ScaleReadingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluations: PhysicalEvaluationsService,
    private readonly auditLog: ScaleAuditLogService,
  ) {}

  /**
   * Único ponto de escrita de uma leitura de balança. Confirmar e descartar
   * passam pelo mesmo endpoint (§12 do desenho): nada chega aqui antes de o
   * profissional decidir no app — não existe estado intermediário persistido
   * no servidor.
   */
  async confirm(
    professionalId: string,
    clientId: string,
    evaluationId: string,
    dto: ConfirmScaleReadingDto,
    meta: RequestMeta = {},
  ): Promise<ScaleReadingSummaryDto> {
    // findOne já valida ownership (professionalId + clientId + evaluationId);
    // audit=false porque esta ação tem sua própria entrada de auditoria abaixo.
    await this.evaluations.findOne(professionalId, clientId, evaluationId, {}, false);

    const existing = await this.prisma.scaleReading.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      select: SCALE_READING_SELECT,
    });
    if (existing) {
      if (existing.evaluationId !== evaluationId) {
        throw new BadRequestException('Esta chave de idempotência já foi usada em outra avaliação.');
      }
      return ScaleReadingSummaryDto.fromEntity(existing);
    }

    const isConfirmed = dto.status === ScaleReadingStatus.confirmed;
    if (isConfirmed && (!dto.normalized || Object.keys(dto.normalized).length === 0)) {
      throw new BadRequestException('normalized é obrigatório para confirmar uma leitura.');
    }

    const recordedAt = new Date(dto.recordedAt);

    let reading;
    try {
      reading = await this.prisma.$transaction(async (tx) => {
        const created = await tx.scaleReading.create({
          data: {
            professionalId,
            clientId,
            evaluationId,
            status: dto.status,
            driverId: dto.driverId,
            deviceIdentifier: dto.deviceIdentifier,
            protocolVersion: dto.protocolVersion,
            idempotencyKey: dto.idempotencyKey,
            rawPayload: dto.rawPayload as Prisma.InputJsonValue,
            normalized: (dto.normalized ?? {}) as Prisma.InputJsonValue,
            recordedAt,
          },
          select: SCALE_READING_SELECT,
        });

        if (isConfirmed) {
          const { segmentalData, impedanceData, ...fields } = dto.normalized!;
          const bioimpedanceData = {
            origin: BioimpedanceOrigin.device_confirmed,
            recordedAt,
            ...fields,
            segmentalData: segmentalData as Prisma.InputJsonValue | undefined,
            impedanceData: impedanceData as Prisma.InputJsonValue | undefined,
          };
          await tx.bioimpedance.upsert({
            where: { evaluationId },
            create: { evaluationId, ...bioimpedanceData },
            update: bioimpedanceData,
          });
        }

        return created;
      });
    } catch (error) {
      // Corrida entre dois envios com a mesma idempotencyKey (retry
      // concorrente) — a constraint @unique do banco pega o que o
      // findUnique acima, por si só, não garante.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raceWinner = await this.prisma.scaleReading.findUniqueOrThrow({
          where: { idempotencyKey: dto.idempotencyKey },
          select: SCALE_READING_SELECT,
        });
        return ScaleReadingSummaryDto.fromEntity(raceWinner);
      }
      throw error;
    }

    if (isConfirmed) {
      // Fora da transação, como já é o padrão de create()/update() —
      // recalcula IMC/%gordura/massa a partir do que acabou de ser gravado.
      await this.evaluations.recalculateMetrics(evaluationId);
    }

    await this.auditLog.record({
      professionalId,
      clientId,
      evaluationId,
      action: isConfirmed ? ScaleAuditAction.reading_confirmed : ScaleAuditAction.reading_discarded,
      ipAddress: meta.ipAddress,
    });

    return ScaleReadingSummaryDto.fromEntity(reading);
  }

  async list(
    professionalId: string,
    clientId: string,
    evaluationId: string,
    meta: RequestMeta = {},
  ): Promise<ScaleReadingSummaryDto[]> {
    await this.evaluations.findOne(professionalId, clientId, evaluationId, {}, false);

    const items = await this.prisma.scaleReading.findMany({
      where: { evaluationId },
      select: SCALE_READING_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      evaluationId,
      action: ScaleAuditAction.reading_listed,
      ipAddress: meta.ipAddress,
    });

    return items.map((item) => ScaleReadingSummaryDto.fromEntity(item));
  }
}
