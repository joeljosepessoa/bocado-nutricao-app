import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BioimpedanceOrigin, BodyFatSource, EvaluationAuditAction, NotificationEventType, PhotoAngle } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CalculationService } from './calculation.service';
import { AuditLogService } from './audit-log.service';
import { StorageService } from '../storage/storage.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { UpdateEvaluationDto } from './dto/update-evaluation.dto';
import { UpdateEvaluationReleaseDto } from './dto/update-evaluation-release.dto';
import { PhysicalEvaluationClientSummaryDto } from './dto/physical-evaluation-client-summary.dto';
import { computeSkinfoldSumMm, EvolutionPointDto } from './dto/evolution-point.dto';

const EVALUATION_DETAIL_INCLUDE = {
  measurements: true,
  skinfolds: true,
  bioimpedance: true,
  calculatedMetrics: true,
  protocol: true,
  photos: { select: { id: true, angle: true, contentType: true, capturedAt: true, createdAt: true } },
} as const;

const EVALUATION_LIST_SELECT = {
  id: true,
  evaluatedAt: true,
  weightKg: true,
  createdAt: true,
  calculatedMetrics: { select: { bmi: true, bodyFatPercent: true, bodyFatPercentSource: true } },
} as const;

const MEASUREMENTS_SELECT = {
  chestCm: true,
  waistCm: true,
  abdomenCm: true,
  hipCm: true,
  armRightCm: true,
  armLeftCm: true,
  forearmRightCm: true,
  forearmLeftCm: true,
  thighRightCm: true,
  thighLeftCm: true,
  calfRightCm: true,
  calfLeftCm: true,
  wristCm: true,
  femurBicondylarCm: true,
} as const;

const BIOIMPEDANCE_RESULT_SELECT = {
  origin: true,
  muscleMassKg: true,
  skeletalMuscleMassKg: true,
  bodyWaterPercent: true,
  visceralFatLevel: true,
  boneMassKg: true,
  basalMetabolicRateKcal: true,
  bodyAgeYears: true,
} as const;

/**
 * Fase 8, Decisão 2: o que o cliente pode ver de uma avaliação liberada —
 * composição corporal (resultados) + circunferências. Nunca dobras,
 * protocolo, pressão, glicemia, notas, nem os campos brutos de
 * bioimpedância (`origin`, `recordedAt`, `impedanceData`, `segmentalData`).
 */
const CLIENT_EVOLUTION_SELECT = {
  id: true,
  evaluatedAt: true,
  weightKg: true,
  calculatedMetrics: {
    select: { bmi: true, bmiClassification: true, bodyFatPercent: true, fatMassKg: true, leanMassKg: true },
  },
  measurements: { select: MEASUREMENTS_SELECT },
  bioimpedance: {
    select: {
      muscleMassKg: true,
      skeletalMuscleMassKg: true,
      bodyWaterPercent: true,
      visceralFatLevel: true,
      boneMassKg: true,
      basalMetabolicRateKcal: true,
      bodyAgeYears: true,
    },
  },
} as const;

const EVOLUTION_SERIES_SELECT = {
  id: true,
  evaluatedAt: true,
  releasedToClientAt: true,
  weightKg: true,
  calculatedMetrics: {
    select: {
      bmi: true,
      bmiClassification: true,
      bodyFatPercent: true,
      bodyFatPercentSource: true,
      fatMassKg: true,
      leanMassKg: true,
    },
  },
  measurements: { select: MEASUREMENTS_SELECT },
  skinfolds: true,
  protocol: { select: { code: true, version: true, requiredSkinfoldSites: true } },
  bioimpedance: { select: BIOIMPEDANCE_RESULT_SELECT },
} as const;

// Teto de segurança para a série não-paginada do profissional — bem acima
// do volume real esperado por cliente (Fase 8, Seção 15 do desenho:
// dezenas de avaliações, não milhares); protege a consulta sem precisar
// de paginação para um gráfico, que precisa da série inteira de uma vez.
const MAX_EVOLUTION_SERIES_POINTS = 500;

const ALLOWED_PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

function calculateAge(birthDate: Date, atDate: Date): number {
  let age = atDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = atDate.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && atDate.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export interface RequestMeta {
  ipAddress?: string;
}

@Injectable()
export class PhysicalEvaluationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculation: CalculationService,
    private readonly auditLog: AuditLogService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationDispatchService,
  ) {}

  private async assertOwnedClient(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, professionalId } });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado.');
    }
    return client;
  }

  private async assertOwnedEvaluation(professionalId: string, clientId: string, evaluationId: string) {
    await this.assertOwnedClient(professionalId, clientId);
    const evaluation = await this.prisma.physicalEvaluation.findFirst({
      where: { id: evaluationId, clientId },
    });
    if (!evaluation) {
      throw new NotFoundException('Avaliação não encontrada.');
    }
    return evaluation;
  }

  async create(professionalId: string, clientId: string, dto: CreateEvaluationDto, meta: RequestMeta = {}) {
    const client = await this.assertOwnedClient(professionalId, clientId);

    const evaluatedAt = dto.evaluatedAt ? new Date(dto.evaluatedAt) : new Date();

    let ageAtEvaluation = dto.ageAtEvaluation;
    if (ageAtEvaluation == null && client.birthDate) {
      ageAtEvaluation = calculateAge(client.birthDate, evaluatedAt);
    }

    let protocolId: string | undefined;
    if (dto.protocolCode) {
      const protocol = await this.prisma.protocol.findUnique({ where: { code: dto.protocolCode } });
      if (!protocol) {
        throw new BadRequestException(`Protocolo "${dto.protocolCode}" não encontrado.`);
      }
      protocolId = protocol.id;
    }

    const evaluation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.physicalEvaluation.create({
        data: {
          clientId,
          professionalId,
          evaluatedAt,
          ageAtEvaluation,
          biologicalSexForCalculation: dto.biologicalSexForCalculation,
          heightCm: dto.heightCm,
          weightKg: dto.weightKg,
          protocolId,
          bloodPressureSystolic: dto.bloodPressureSystolic,
          bloodPressureDiastolic: dto.bloodPressureDiastolic,
          heartRate: dto.heartRate,
          glucose: dto.glucose,
          notes: dto.notes,
        },
      });

      if (dto.measurements) {
        await tx.measurements.create({ data: { evaluationId: created.id, ...dto.measurements } });
      }
      if (dto.skinfolds) {
        await tx.skinfolds.create({ data: { evaluationId: created.id, ...dto.skinfolds } });
      }
      if (dto.bioimpedance) {
        await tx.bioimpedance.create({
          data: { evaluationId: created.id, origin: BioimpedanceOrigin.manual, ...dto.bioimpedance },
        });
      }

      return created;
    });

    await this.recalculateMetrics(evaluation.id);
    await this.auditLog.record({
      professionalId,
      clientId,
      evaluationId: evaluation.id,
      action: EvaluationAuditAction.created,
      ipAddress: meta.ipAddress,
    });

    return this.findOne(professionalId, clientId, evaluation.id, meta, false);
  }

  async list(professionalId: string, clientId: string, page = 1, pageSize = 20, meta: RequestMeta = {}) {
    await this.assertOwnedClient(professionalId, clientId);
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 20;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.physicalEvaluation.findMany({
        where: { clientId },
        select: EVALUATION_LIST_SELECT,
        orderBy: { evaluatedAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.physicalEvaluation.count({ where: { clientId } }),
    ]);

    await this.auditLog.record({
      professionalId,
      clientId,
      action: EvaluationAuditAction.listed,
      ipAddress: meta.ipAddress,
    });

    return { items, total, page: safePage, pageSize: safePageSize };
  }

  async findOne(
    professionalId: string,
    clientId: string,
    evaluationId: string,
    meta: RequestMeta = {},
    audit = true,
  ) {
    await this.assertOwnedClient(professionalId, clientId);
    const evaluation = await this.prisma.physicalEvaluation.findFirst({
      where: { id: evaluationId, clientId },
      include: EVALUATION_DETAIL_INCLUDE,
    });
    if (!evaluation) {
      throw new NotFoundException('Avaliação não encontrada.');
    }

    if (audit) {
      await this.auditLog.record({
        professionalId,
        clientId,
        evaluationId,
        action: EvaluationAuditAction.read,
        ipAddress: meta.ipAddress,
      });
    }

    return evaluation;
  }

  async update(
    professionalId: string,
    clientId: string,
    evaluationId: string,
    dto: UpdateEvaluationDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedEvaluation(professionalId, clientId, evaluationId);

    let protocolId: string | null | undefined;
    if (dto.protocolCode !== undefined) {
      const protocol = await this.prisma.protocol.findUnique({ where: { code: dto.protocolCode } });
      if (!protocol) {
        throw new BadRequestException(`Protocolo "${dto.protocolCode}" não encontrado.`);
      }
      protocolId = protocol.id;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.physicalEvaluation.update({
        where: { id: evaluationId },
        data: {
          evaluatedAt: dto.evaluatedAt ? new Date(dto.evaluatedAt) : undefined,
          ageAtEvaluation: dto.ageAtEvaluation,
          biologicalSexForCalculation: dto.biologicalSexForCalculation,
          heightCm: dto.heightCm,
          weightKg: dto.weightKg,
          protocolId,
          bloodPressureSystolic: dto.bloodPressureSystolic,
          bloodPressureDiastolic: dto.bloodPressureDiastolic,
          heartRate: dto.heartRate,
          glucose: dto.glucose,
          notes: dto.notes,
        },
      });

      if (dto.measurements) {
        await tx.measurements.upsert({
          where: { evaluationId },
          create: { evaluationId, ...dto.measurements },
          update: { ...dto.measurements },
        });
      }
      if (dto.skinfolds) {
        await tx.skinfolds.upsert({
          where: { evaluationId },
          create: { evaluationId, ...dto.skinfolds },
          update: { ...dto.skinfolds },
        });
      }
      if (dto.bioimpedance) {
        await tx.bioimpedance.upsert({
          where: { evaluationId },
          create: { evaluationId, origin: BioimpedanceOrigin.manual, ...dto.bioimpedance },
          update: { origin: BioimpedanceOrigin.manual, ...dto.bioimpedance },
        });
      }
    });

    await this.recalculateMetrics(evaluationId);
    await this.auditLog.record({
      professionalId,
      clientId,
      evaluationId,
      action: EvaluationAuditAction.updated,
      ipAddress: meta.ipAddress,
    });

    return this.findOne(professionalId, clientId, evaluationId, meta, false);
  }

  async compare(professionalId: string, clientId: string, fromId: string, toId: string, meta: RequestMeta = {}) {
    const [from, to] = await Promise.all([
      this.findOne(professionalId, clientId, fromId, meta, false),
      this.findOne(professionalId, clientId, toId, meta, false),
    ]);

    const numericDelta = (a: number | null | undefined, b: number | null | undefined) =>
      a == null || b == null ? null : Math.round((b - a) * 100) / 100;

    // % de variação sobre o valor de origem; base 0 não tem variação
    // percentual definida (não é ausência de dado, é divisão por zero).
    const percentDelta = (a: number | null | undefined, b: number | null | undefined) =>
      a == null || b == null || a === 0 ? null : Math.round(((b - a) / a) * 1000) / 10;

    const fromSkinfoldSumMm = computeSkinfoldSumMm(from.protocol?.requiredSkinfoldSites, from.skinfolds);
    const toSkinfoldSumMm = computeSkinfoldSumMm(to.protocol?.requiredSkinfoldSites, to.skinfolds);

    // Fase 8: campos originais da Fase 4 preservados nome-a-nome (formato
    // já coberto por teste e2e existente); tudo abaixo do comentário é
    // aditivo.
    const deltaFields = {
      weightKg: numericDelta(from.weightKg, to.weightKg),
      bmi: numericDelta(from.calculatedMetrics?.bmi, to.calculatedMetrics?.bmi),
      bodyFatPercent: numericDelta(from.calculatedMetrics?.bodyFatPercent, to.calculatedMetrics?.bodyFatPercent),
      fatMassKg: numericDelta(from.calculatedMetrics?.fatMassKg, to.calculatedMetrics?.fatMassKg),
      leanMassKg: numericDelta(from.calculatedMetrics?.leanMassKg, to.calculatedMetrics?.leanMassKg),
      waistCm: numericDelta(from.measurements?.waistCm, to.measurements?.waistCm),
      hipCm: numericDelta(from.measurements?.hipCm, to.measurements?.hipCm),

      // --- Fase 8 ---
      chestCm: numericDelta(from.measurements?.chestCm, to.measurements?.chestCm),
      abdomenCm: numericDelta(from.measurements?.abdomenCm, to.measurements?.abdomenCm),
      armRightCm: numericDelta(from.measurements?.armRightCm, to.measurements?.armRightCm),
      armLeftCm: numericDelta(from.measurements?.armLeftCm, to.measurements?.armLeftCm),
      forearmRightCm: numericDelta(from.measurements?.forearmRightCm, to.measurements?.forearmRightCm),
      forearmLeftCm: numericDelta(from.measurements?.forearmLeftCm, to.measurements?.forearmLeftCm),
      thighRightCm: numericDelta(from.measurements?.thighRightCm, to.measurements?.thighRightCm),
      thighLeftCm: numericDelta(from.measurements?.thighLeftCm, to.measurements?.thighLeftCm),
      calfRightCm: numericDelta(from.measurements?.calfRightCm, to.measurements?.calfRightCm),
      calfLeftCm: numericDelta(from.measurements?.calfLeftCm, to.measurements?.calfLeftCm),
      wristCm: numericDelta(from.measurements?.wristCm, to.measurements?.wristCm),
      femurBicondylarCm: numericDelta(from.measurements?.femurBicondylarCm, to.measurements?.femurBicondylarCm),
      skinfoldSumMm: numericDelta(fromSkinfoldSumMm, toSkinfoldSumMm),
      muscleMassKg: numericDelta(from.bioimpedance?.muscleMassKg, to.bioimpedance?.muscleMassKg),
      bodyWaterPercent: numericDelta(from.bioimpedance?.bodyWaterPercent, to.bioimpedance?.bodyWaterPercent),
      visceralFatLevel: numericDelta(from.bioimpedance?.visceralFatLevel, to.bioimpedance?.visceralFatLevel),
      boneMassKg: numericDelta(from.bioimpedance?.boneMassKg, to.bioimpedance?.boneMassKg),
      basalMetabolicRateKcal: numericDelta(
        from.bioimpedance?.basalMetabolicRateKcal,
        to.bioimpedance?.basalMetabolicRateKcal,
      ),
    };

    const deltasPercent = {
      weightKg: percentDelta(from.weightKg, to.weightKg),
      bmi: percentDelta(from.calculatedMetrics?.bmi, to.calculatedMetrics?.bmi),
      bodyFatPercent: percentDelta(from.calculatedMetrics?.bodyFatPercent, to.calculatedMetrics?.bodyFatPercent),
      fatMassKg: percentDelta(from.calculatedMetrics?.fatMassKg, to.calculatedMetrics?.fatMassKg),
      leanMassKg: percentDelta(from.calculatedMetrics?.leanMassKg, to.calculatedMetrics?.leanMassKg),
      waistCm: percentDelta(from.measurements?.waistCm, to.measurements?.waistCm),
      hipCm: percentDelta(from.measurements?.hipCm, to.measurements?.hipCm),
      chestCm: percentDelta(from.measurements?.chestCm, to.measurements?.chestCm),
      abdomenCm: percentDelta(from.measurements?.abdomenCm, to.measurements?.abdomenCm),
      armRightCm: percentDelta(from.measurements?.armRightCm, to.measurements?.armRightCm),
      armLeftCm: percentDelta(from.measurements?.armLeftCm, to.measurements?.armLeftCm),
      forearmRightCm: percentDelta(from.measurements?.forearmRightCm, to.measurements?.forearmRightCm),
      forearmLeftCm: percentDelta(from.measurements?.forearmLeftCm, to.measurements?.forearmLeftCm),
      thighRightCm: percentDelta(from.measurements?.thighRightCm, to.measurements?.thighRightCm),
      thighLeftCm: percentDelta(from.measurements?.thighLeftCm, to.measurements?.thighLeftCm),
      calfRightCm: percentDelta(from.measurements?.calfRightCm, to.measurements?.calfRightCm),
      calfLeftCm: percentDelta(from.measurements?.calfLeftCm, to.measurements?.calfLeftCm),
      wristCm: percentDelta(from.measurements?.wristCm, to.measurements?.wristCm),
      femurBicondylarCm: percentDelta(from.measurements?.femurBicondylarCm, to.measurements?.femurBicondylarCm),
      skinfoldSumMm: percentDelta(fromSkinfoldSumMm, toSkinfoldSumMm),
      muscleMassKg: percentDelta(from.bioimpedance?.muscleMassKg, to.bioimpedance?.muscleMassKg),
      bodyWaterPercent: percentDelta(from.bioimpedance?.bodyWaterPercent, to.bioimpedance?.bodyWaterPercent),
      visceralFatLevel: percentDelta(from.bioimpedance?.visceralFatLevel, to.bioimpedance?.visceralFatLevel),
      boneMassKg: percentDelta(from.bioimpedance?.boneMassKg, to.bioimpedance?.boneMassKg),
      basalMetabolicRateKcal: percentDelta(
        from.bioimpedance?.basalMetabolicRateKcal,
        to.bioimpedance?.basalMetabolicRateKcal,
      ),
    };

    const fromSource = from.calculatedMetrics?.bodyFatPercentSource ?? null;
    const toSource = to.calculatedMetrics?.bodyFatPercentSource ?? null;
    const bodyFatSourceChanged = fromSource != null && toSource != null && fromSource !== toSource;

    await this.auditLog.record({
      professionalId,
      clientId,
      evaluationId: fromId,
      action: EvaluationAuditAction.compared,
      ipAddress: meta.ipAddress,
    });
    await this.auditLog.record({
      professionalId,
      clientId,
      evaluationId: toId,
      action: EvaluationAuditAction.compared,
      ipAddress: meta.ipAddress,
    });

    return { from, to, deltas: deltaFields, deltasPercent, bodyFatSourceChanged };
  }

  async uploadPhoto(
    professionalId: string,
    clientId: string,
    evaluationId: string,
    angle: PhotoAngle,
    file: { buffer: Buffer; mimetype: string; size: number },
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedEvaluation(professionalId, clientId, evaluationId);

    if (!ALLOWED_PHOTO_CONTENT_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Formato de imagem não suportado. Use JPEG, PNG ou WEBP.');
    }
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      throw new BadRequestException('Arquivo maior que o limite de 10MB.');
    }

    const { storageKey, sizeBytes } = await this.storage.save(file.buffer, file.mimetype);

    const photo = await this.prisma.bodyPhoto.create({
      data: {
        evaluationId,
        angle,
        storageKey,
        contentType: file.mimetype,
        sizeBytes,
        uploadedByProfessionalId: professionalId,
      },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      evaluationId,
      action: EvaluationAuditAction.photo_uploaded,
      ipAddress: meta.ipAddress,
    });

    return { id: photo.id, angle: photo.angle };
  }

  async getPhotoSignedUrl(
    professionalId: string,
    clientId: string,
    evaluationId: string,
    photoId: string,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedEvaluation(professionalId, clientId, evaluationId);
    const photo = await this.prisma.bodyPhoto.findFirst({ where: { id: photoId, evaluationId } });
    if (!photo) {
      throw new NotFoundException('Foto não encontrada.');
    }

    const signed = this.storage.getSignedUrl(photo.storageKey, photo.contentType);

    await this.auditLog.record({
      professionalId,
      clientId,
      evaluationId,
      action: EvaluationAuditAction.photo_read,
      ipAddress: meta.ipAddress,
    });

    return signed;
  }

  async deletePhoto(
    professionalId: string,
    clientId: string,
    evaluationId: string,
    photoId: string,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedEvaluation(professionalId, clientId, evaluationId);
    const photo = await this.prisma.bodyPhoto.findFirst({ where: { id: photoId, evaluationId } });
    if (!photo) {
      throw new NotFoundException('Foto não encontrada.');
    }

    await this.storage.delete(photo.storageKey);
    await this.prisma.bodyPhoto.delete({ where: { id: photoId } });

    await this.auditLog.record({
      professionalId,
      clientId,
      evaluationId,
      action: EvaluationAuditAction.photo_deleted,
      ipAddress: meta.ipAddress,
    });
  }

  async setRelease(
    professionalId: string,
    clientId: string,
    evaluationId: string,
    dto: UpdateEvaluationReleaseDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedEvaluation(professionalId, clientId, evaluationId);

    const evaluation = await this.prisma.physicalEvaluation.update({
      where: { id: evaluationId },
      data: { releasedToClientAt: dto.released ? new Date() : null },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      evaluationId,
      action: EvaluationAuditAction.released,
      ipAddress: meta.ipAddress,
    });

    if (dto.released) {
      await this.notifications.dispatch({
        eventType: NotificationEventType.evaluation_released,
        recipient: { clientId },
        title: 'Avaliação física liberada',
        body: 'Sua avaliação física mais recente já está disponível.',
      });
    }

    return { id: evaluation.id, releasedToClientAt: evaluation.releasedToClientAt };
  }

  // --- Fase 7: acesso client-facing ---------------------------------------

  async listReleasedForClient(clientId: string, page = 1, pageSize = 20) {
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 20;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.physicalEvaluation.findMany({
        where: { clientId, releasedToClientAt: { not: null } },
        select: CLIENT_EVOLUTION_SELECT,
        orderBy: { evaluatedAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.physicalEvaluation.count({ where: { clientId, releasedToClientAt: { not: null } } }),
    ]);

    return {
      items: items.map((e) => PhysicalEvaluationClientSummaryDto.fromEvaluation(e)),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  /**
   * Mesmo allowlist/mapper de listReleasedForClient, para uma avaliação só
   * — usado pelo gerador de relatório "cliente" (Fase 9), que precisa
   * exatamente do que o app do cliente já mostra, nunca de uma cópia
   * paralela da lista de campos permitidos. Devolve null se a avaliação
   * não existe, não é desse cliente, ou não está liberada.
   */
  async getReleasedSummaryForClient(
    clientId: string,
    evaluationId: string,
  ): Promise<PhysicalEvaluationClientSummaryDto | null> {
    const evaluation = await this.prisma.physicalEvaluation.findFirst({
      where: { id: evaluationId, clientId, releasedToClientAt: { not: null } },
      select: CLIENT_EVOLUTION_SELECT,
    });
    return evaluation ? PhysicalEvaluationClientSummaryDto.fromEvaluation(evaluation) : null;
  }

  /**
   * Série cronológica leve para os gráficos de evolução do profissional —
   * uma consulta só, sem N+1, sem incluir fotos/notas/protocolo por
   * extenso que os gráficos não usam. Ordenada ascendente (mais antiga
   * primeiro) porque é assim que um gráfico de linha do tempo é desenhado.
   */
  async getEvolutionSeries(professionalId: string, clientId: string): Promise<EvolutionPointDto[]> {
    await this.assertOwnedClient(professionalId, clientId);

    const evaluations = await this.prisma.physicalEvaluation.findMany({
      where: { clientId },
      select: EVOLUTION_SERIES_SELECT,
      orderBy: { evaluatedAt: 'asc' },
      take: MAX_EVOLUTION_SERIES_POINTS,
    });

    return evaluations.map((evaluation) => EvolutionPointDto.fromEvaluation(evaluation));
  }

  /** Público: reaproveitado pela Fase 10 (ScaleReadingsService) após gravar Bioimpedance fora do fluxo manual create/update. */
  async recalculateMetrics(evaluationId: string): Promise<void> {
    const evaluation = await this.prisma.physicalEvaluation.findUniqueOrThrow({
      where: { id: evaluationId },
      include: { measurements: true, skinfolds: true, bioimpedance: true, protocol: true },
    });

    const bmiResult = this.calculation.computeBmi(evaluation.weightKg, evaluation.heightCm);
    const waistHipRatio = this.calculation.computeWaistHipRatio(
      evaluation.measurements?.waistCm,
      evaluation.measurements?.hipCm,
    );

    let bodyFatPercent: number | null = null;
    let bodyFatPercentSource: BodyFatSource | null = null;
    let protocolVersionUsed: string | null = null;

    if (evaluation.skinfolds && evaluation.protocol?.code === 'jackson_pollock_7') {
      const percent = this.calculation.computeJacksonPollock7Percent(
        evaluation.skinfolds,
        evaluation.biologicalSexForCalculation,
        evaluation.ageAtEvaluation,
      );
      if (percent != null) {
        bodyFatPercent = percent;
        bodyFatPercentSource = BodyFatSource.skinfolds;
        protocolVersionUsed = `${evaluation.protocol.code}@v${evaluation.protocol.version}`;
      }
    }

    if (bodyFatPercent == null && evaluation.bioimpedance?.bodyFatPercent != null) {
      bodyFatPercent = evaluation.bioimpedance.bodyFatPercent;
      bodyFatPercentSource = BodyFatSource.bioimpedance;
    }

    let fatMassKg: number | null = null;
    let leanMassKg: number | null = null;
    if (bodyFatPercent != null && evaluation.weightKg != null) {
      fatMassKg = Math.round(evaluation.weightKg * (bodyFatPercent / 100) * 100) / 100;
      leanMassKg = Math.round((evaluation.weightKg - fatMassKg) * 100) / 100;
    }

    await this.prisma.calculatedMetrics.upsert({
      where: { evaluationId },
      create: {
        evaluationId,
        bmi: bmiResult?.bmi,
        bmiClassification: bmiResult?.classification,
        waistHipRatio,
        bodyFatPercent,
        bodyFatPercentSource,
        fatMassKg,
        leanMassKg,
        protocolVersionUsed,
      },
      update: {
        bmi: bmiResult?.bmi ?? null,
        bmiClassification: bmiResult?.classification ?? null,
        waistHipRatio,
        bodyFatPercent,
        bodyFatPercentSource,
        fatMassKg,
        leanMassKg,
        protocolVersionUsed,
        calculatedAt: new Date(),
      },
    });
  }
}
