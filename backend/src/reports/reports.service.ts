import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { NotificationEventType, Prisma, ReportAudience, ReportAuditAction, ReportStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PhysicalEvaluationsService } from '../physical-evaluations/physical-evaluations.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { PdfService } from './pdf.service';
import { PdfQueueService } from './pdf-queue.service';
import { ReportAuditLogService } from './report-audit-log.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ClientReportSummaryDto, ReportSummaryDto } from './dto/report-summary.dto';
import { renderClientReportHtml, renderProfessionalReportHtml } from './templates/evaluation-report.template';
import { CURRENT_TEMPLATE_VERSION } from './templates/report-types';
import type {
  ClientEvaluationReportData,
  EvaluationReportCore,
  ProfessionalEvaluationReportData,
  ReportComparison,
  ReportPhoto,
  ReportPreviousSnapshot,
  ReportSeriesPoint,
} from './templates/report-types';

export interface RequestMeta {
  ipAddress?: string;
}

// Mesma matemática de delta usada em PhysicalEvaluationsService.compare() —
// reimplementada aqui (não importada) para não acoplar este serviço a um
// método privado daquele.
function numericDelta(a: number | null | undefined, b: number | null | undefined): number | null {
  return a == null || b == null ? null : Math.round((b - a) * 100) / 100;
}

/** massaKg como % do peso naquele mesmo ponto — derivado de dois valores reais já registrados, nunca uma referência externa inventada. */
function percentOfWeight(massKg: number | null | undefined, weightKg: number | null | undefined): number | null {
  return massKg == null || weightKg == null || weightKg === 0 ? null : Math.round((massKg / weightKg) * 1000) / 10;
}

const REPORT_LIST_SELECT = {
  id: true,
  evaluationId: true,
  audience: true,
  status: true,
  templateVersion: true,
  sizeBytes: true,
  generatedAt: true,
  releasedToClientAt: true,
  failureReason: true,
  createdAt: true,
} as const;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly evaluations: PhysicalEvaluationsService,
    private readonly pdf: PdfService,
    private readonly pdfQueue: PdfQueueService,
    private readonly auditLog: ReportAuditLogService,
    private readonly notifications: NotificationDispatchService,
  ) {}

  private async assertOwnedClient(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, professionalId } });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado.');
    }
    return client;
  }

  private async assertOwnedReport(professionalId: string, clientId: string, reportId: string) {
    await this.assertOwnedClient(professionalId, clientId);
    const report = await this.prisma.report.findFirst({ where: { id: reportId, clientId } });
    if (!report) {
      throw new NotFoundException('Relatório não encontrado.');
    }
    return report;
  }

  async list(
    professionalId: string,
    clientId: string,
    filters: { evaluationId?: string; audience?: ReportAudience } = {},
    page = 1,
    pageSize = 20,
  ) {
    await this.assertOwnedClient(professionalId, clientId);
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 20;
    const where = { clientId, evaluationId: filters.evaluationId, audience: filters.audience };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        select: REPORT_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.report.count({ where }),
    ]);

    return { items: items.map((r) => ReportSummaryDto.fromEntity(r)), total, page: safePage, pageSize: safePageSize };
  }

  async findOne(professionalId: string, clientId: string, reportId: string): Promise<ReportSummaryDto> {
    const report = await this.assertOwnedReport(professionalId, clientId, reportId);
    return ReportSummaryDto.fromEntity(report);
  }

  async create(
    professionalId: string,
    clientId: string,
    evaluationId: string,
    dto: CreateReportDto,
    meta: RequestMeta = {},
  ): Promise<ReportSummaryDto> {
    // findOne já valida ownership (professionalId + clientId) e traz o
    // detalhe técnico completo — usado tal como está para o relatório
    // profissional; para o relatório cliente, usamos só o resumo já
    // restrito (getReleasedSummaryForClient), nunca este objeto técnico.
    const fullEvaluation = await this.evaluations.findOne(professionalId, clientId, evaluationId, {}, false);

    if (dto.audience === ReportAudience.client && !fullEvaluation.releasedToClientAt) {
      throw new BadRequestException(
        'Libere esta avaliação ao cliente antes de gerar o relatório do cliente.',
      );
    }

    const [client, professional] = await Promise.all([
      this.prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { user: { select: { fullName: true } } } }),
      this.prisma.professional.findUniqueOrThrow({
        where: { id: professionalId },
        select: { user: { select: { fullName: true } } },
      }),
    ]);

    const report = await this.prisma.report.create({
      data: {
        evaluationId,
        clientId,
        professionalId,
        audience: dto.audience,
        status: ReportStatus.queued,
        templateVersion: CURRENT_TEMPLATE_VERSION,
      },
    });
    await this.auditLog.record({
      professionalId,
      clientId,
      reportId: report.id,
      action: ReportAuditAction.created,
      ipAddress: meta.ipAddress,
    });

    try {
      await this.prisma.report.update({ where: { id: report.id }, data: { status: ReportStatus.generating } });

      const generatedAt = new Date().toISOString();
      const clientName = client.user.fullName;
      const professionalName = professional.user.fullName;

      let html: string;
      let snapshot: Record<string, unknown>;

      // Campos seguros mesmo fora do allowlist restrito do cliente: idade,
      // altura e sexo biológico já são atributos que o próprio cliente
      // conhece, e a relação cintura/quadril é derivada só de duas
      // circunferências que já estão no allowlist — por isso vêm direto de
      // fullEvaluation nas duas audiências, como ageAtEvaluation/heightCm
      // já faziam antes desta mudança.
      const sharedIdentity = {
        ageAtEvaluation: fullEvaluation.ageAtEvaluation,
        heightCm: fullEvaluation.heightCm,
        biologicalSexForCalculation: fullEvaluation.biologicalSexForCalculation,
        waistHipRatio: fullEvaluation.calculatedMetrics?.waistHipRatio ?? null,
      };

      if (dto.audience === ReportAudience.client) {
        const summary = await this.evaluations.getReleasedSummaryForClient(clientId, evaluationId);
        if (!summary) {
          // Só pode acontecer se a liberação foi retirada entre a checagem
          // acima e agora — janela muito estreita, mas tratada explicitamente.
          throw new BadRequestException('Avaliação não está mais liberada ao cliente.');
        }
        const comparison = await this.computePreviousComparison(clientId, fullEvaluation.evaluatedAt, dto.audience, {
          weightKg: summary.weightKg,
          bodyFatPercent: summary.bodyFatPercent,
          leanMassKg: summary.leanMassKg,
          fatMassKg: summary.fatMassKg,
          muscleMassKg: summary.composition?.muscleMassKg ?? null,
          skeletalMuscleMassKg: summary.composition?.skeletalMuscleMassKg ?? null,
        });
        const core: EvaluationReportCore = {
          clientName,
          professionalName,
          evaluatedAt: summary.evaluatedAt.toISOString(),
          ...sharedIdentity,
          weightKg: summary.weightKg,
          bmi: summary.bmi,
          bmiClassification: summary.bmiClassification,
          bodyFatPercent: summary.bodyFatPercent,
          fatMassKg: summary.fatMassKg,
          leanMassKg: summary.leanMassKg,
          measurements: summary.measurements,
          composition: summary.composition,
          comparison,
        };
        const data: ClientEvaluationReportData = { ...core, generatedAt };
        html = renderClientReportHtml(data);
        snapshot = { ...data };
      } else {
        const [photos, series] = await Promise.all([
          this.loadPhotosForProfessionalReport(evaluationId),
          this.evaluations.getEvolutionSeries(professionalId, clientId),
        ]);
        const currentIndex = series.findIndex((point) => point.id === evaluationId);
        const previousPoint = currentIndex > 0 ? series[currentIndex - 1] : null;
        // "Geral": desde a primeira avaliação já registrada — só existe
        // como comparação distinta quando há pelo menos 2 avaliações antes
        // da atual (senão "primeira" === "anterior" e o dado já está em
        // `comparison`).
        const firstPoint = currentIndex > 1 ? series[0] : null;

        const evolutionPointToComparison = (point: (typeof series)[number]): ReportComparison => ({
          previousEvaluatedAt: point.evaluatedAt.toISOString(),
          weightKg: numericDelta(point.weightKg, fullEvaluation.weightKg),
          bodyFatPercent: numericDelta(point.bodyFatPercent, fullEvaluation.calculatedMetrics?.bodyFatPercent),
          leanMassKg: numericDelta(point.leanMassKg, fullEvaluation.calculatedMetrics?.leanMassKg),
          fatMassKg: numericDelta(point.fatMassKg, fullEvaluation.calculatedMetrics?.fatMassKg),
          muscleMassKg: numericDelta(point.bioimpedance?.muscleMassKg, fullEvaluation.bioimpedance?.muscleMassKg),
          skeletalMuscleMassKg: numericDelta(point.bioimpedance?.skeletalMuscleMassKg, fullEvaluation.bioimpedance?.skeletalMuscleMassKg),
          musclePercent: numericDelta(
            percentOfWeight(point.bioimpedance?.muscleMassKg, point.weightKg),
            percentOfWeight(fullEvaluation.bioimpedance?.muscleMassKg, fullEvaluation.weightKg),
          ),
          skeletalMusclePercent: numericDelta(
            percentOfWeight(point.bioimpedance?.skeletalMuscleMassKg, point.weightKg),
            percentOfWeight(fullEvaluation.bioimpedance?.skeletalMuscleMassKg, fullEvaluation.weightKg),
          ),
        });
        const evolutionPointToSnapshot = (point: (typeof series)[number]): ReportPreviousSnapshot => ({
          evaluatedAt: point.evaluatedAt.toISOString(),
          measurements: point.measurements,
          skinfolds: null, // EvolutionPointDto só traz a soma (skinfoldSumMm), não os valores por local
          bloodPressureSystolic: point.bloodPressureSystolic,
          bloodPressureDiastolic: point.bloodPressureDiastolic,
        });

        const comparison = previousPoint ? evolutionPointToComparison(previousPoint) : null;
        const previous = previousPoint ? evolutionPointToSnapshot(previousPoint) : null;
        const overallComparison = firstPoint ? evolutionPointToComparison(firstPoint) : null;
        const first = firstPoint ? evolutionPointToSnapshot(firstPoint) : null;

        const reportSeries: ReportSeriesPoint[] = series.map((point) => ({
          evaluatedAt: point.evaluatedAt.toISOString(),
          ageAtEvaluation: point.ageAtEvaluation,
          weightKg: point.weightKg,
          bodyFatPercent: point.bodyFatPercent,
          fatMassKg: point.fatMassKg,
          leanMassKg: point.leanMassKg,
          muscleMassKg: point.bioimpedance?.muscleMassKg ?? null,
          skeletalMuscleMassKg: point.bioimpedance?.skeletalMuscleMassKg ?? null,
          bodyWaterPercent: point.bioimpedance?.bodyWaterPercent ?? null,
          bodyAgeYears: point.bioimpedance?.bodyAgeYears ?? null,
          boneMassKg: point.bioimpedance?.boneMassKg ?? null,
        }));

        const skinfoldSiteCount = fullEvaluation.protocol?.requiredSkinfoldSites?.length ?? 0;
        const protocolLabel = fullEvaluation.protocol
          ? skinfoldSiteCount > 0
            ? `Dobras Cutâneas - ${skinfoldSiteCount} dobras`
            : `${fullEvaluation.protocol.name} (v${fullEvaluation.protocol.version})`
          : null;

        const core: EvaluationReportCore = {
          clientName,
          professionalName,
          evaluatedAt: fullEvaluation.evaluatedAt.toISOString(),
          ...sharedIdentity,
          weightKg: fullEvaluation.weightKg,
          bmi: fullEvaluation.calculatedMetrics?.bmi ?? null,
          bmiClassification: fullEvaluation.calculatedMetrics?.bmiClassification ?? null,
          bodyFatPercent: fullEvaluation.calculatedMetrics?.bodyFatPercent ?? null,
          fatMassKg: fullEvaluation.calculatedMetrics?.fatMassKg ?? null,
          leanMassKg: fullEvaluation.calculatedMetrics?.leanMassKg ?? null,
          measurements: fullEvaluation.measurements,
          composition: fullEvaluation.bioimpedance,
          comparison,
        };
        const data: ProfessionalEvaluationReportData = {
          ...core,
          generatedAt,
          bodyFatPercentSource: fullEvaluation.calculatedMetrics?.bodyFatPercentSource ?? null,
          skinfolds: fullEvaluation.skinfolds,
          protocolLabel,
          bioimpedanceOrigin: fullEvaluation.bioimpedance?.origin ?? null,
          bloodPressureSystolic: fullEvaluation.bloodPressureSystolic,
          bloodPressureDiastolic: fullEvaluation.bloodPressureDiastolic,
          heartRate: fullEvaluation.heartRate,
          glucose: fullEvaluation.glucose,
          notes: fullEvaluation.notes,
          photos,
          series: reportSeries,
          previous,
          first,
          overallComparison,
        };
        html = renderProfessionalReportHtml(data);
        snapshot = { ...data, photos: data.photos.map((p) => ({ angle: p.angle })) }; // nunca guarda a imagem no snapshot
      }

      const footerDateLabel = `Gerado em ${new Date(generatedAt).toLocaleDateString('pt-BR')}`;
      const pdfBuffer = await this.pdfQueue.run(() => this.pdf.renderHtmlToPdf(html, footerDateLabel));
      const { storageKey, sizeBytes } = await this.storage.save(pdfBuffer, 'application/pdf');

      const updated = await this.prisma.report.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.ready,
          storageKey,
          sizeBytes,
          generatedAt: new Date(),
          dataSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      await this.auditLog.record({
        professionalId,
        clientId,
        reportId: report.id,
        action: ReportAuditAction.generated,
        ipAddress: meta.ipAddress,
      });
      return ReportSummaryDto.fromEntity(updated);
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        this.logger.error('Falha ao gerar relatório', error instanceof Error ? error.stack : error);
      }
      // A causa real (ex.: Chromium não lançou, ENOENT do script de
      // renderização) fica visível para o profissional via GET do relatório
      // — só a resposta HTTP desta chamada permanece genérica, por baixo
      // risco de expor detalhe de infraestrutura numa exceção de API.
      const rawReason = error instanceof Error ? error.message : String(error);
      const failureReason = rawReason.length > 500 ? `${rawReason.slice(0, 500)}…` : rawReason;
      await this.prisma.report.update({
        where: { id: report.id },
        data: { status: ReportStatus.failed, failureReason },
      });
      await this.auditLog.record({
        professionalId,
        clientId,
        reportId: report.id,
        action: ReportAuditAction.generation_failed,
        ipAddress: meta.ipAddress,
      });
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Não foi possível gerar o relatório.');
    }
  }

  async getDownloadUrl(professionalId: string, clientId: string, reportId: string, meta: RequestMeta = {}) {
    const report = await this.assertOwnedReport(professionalId, clientId, reportId);
    if (report.status !== ReportStatus.ready || !report.storageKey) {
      throw new BadRequestException('Relatório ainda não está pronto.');
    }
    await this.auditLog.record({
      professionalId,
      clientId,
      reportId,
      action: ReportAuditAction.downloaded,
      ipAddress: meta.ipAddress,
    });
    return this.storage.getSignedUrl(report.storageKey, 'application/pdf', 'report-download');
  }

  async setRelease(
    professionalId: string,
    clientId: string,
    reportId: string,
    released: boolean,
    meta: RequestMeta = {},
  ): Promise<ReportSummaryDto> {
    const report = await this.assertOwnedReport(professionalId, clientId, reportId);
    if (report.audience !== ReportAudience.client) {
      throw new BadRequestException('Só relatórios destinados ao cliente podem ser liberados.');
    }
    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: { releasedToClientAt: released ? new Date() : null },
    });
    await this.auditLog.record({
      professionalId,
      clientId,
      reportId,
      action: released ? ReportAuditAction.released : ReportAuditAction.revoked,
      ipAddress: meta.ipAddress,
    });

    // "Relatório pronto" dispara na liberação, não na geração — antes disso
    // o relatório existe mas o cliente não consegue de fato ver nada (ver
    // auditoria da Fase 16), então notificar antes seria um push morto.
    if (released) {
      await this.notifications.dispatch({
        eventType: NotificationEventType.report_ready,
        recipient: { clientId },
        title: 'Relatório disponível',
        body: 'Seu relatório já está disponível para download.',
      });
    }

    return ReportSummaryDto.fromEntity(updated);
  }

  async remove(professionalId: string, clientId: string, reportId: string, meta: RequestMeta = {}): Promise<void> {
    const report = await this.assertOwnedReport(professionalId, clientId, reportId);
    if (report.storageKey) {
      await this.storage.delete(report.storageKey);
    }
    await this.prisma.report.delete({ where: { id: reportId } });
    await this.auditLog.record({
      professionalId,
      clientId,
      reportId: undefined,
      action: ReportAuditAction.deleted,
      ipAddress: meta.ipAddress,
    });
  }

  // --- Fase 9: acesso client-facing -----------------------------------

  async listReleasedForClient(clientId: string, page = 1, pageSize = 20) {
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 20;
    const where = {
      clientId,
      audience: ReportAudience.client,
      releasedToClientAt: { not: null } as const,
      status: ReportStatus.ready,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        select: {
          id: true,
          generatedAt: true,
          sizeBytes: true,
          evaluation: { select: { evaluatedAt: true } },
        },
        orderBy: { generatedAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.report.count({ where }),
    ]);

    return {
      items: items.map((r) =>
        ClientReportSummaryDto.fromEntity({
          id: r.id,
          generatedAt: r.generatedAt as Date,
          sizeBytes: r.sizeBytes as number,
          evaluation: r.evaluation,
        }),
      ),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async getDownloadUrlForClient(clientId: string, reportId: string) {
    const report = await this.prisma.report.findFirst({
      where: {
        id: reportId,
        clientId,
        audience: ReportAudience.client,
        releasedToClientAt: { not: null },
        status: ReportStatus.ready,
      },
    });
    if (!report || !report.storageKey) {
      throw new NotFoundException('Relatório não encontrado.');
    }
    return this.storage.getSignedUrl(report.storageKey, 'application/pdf', 'report-download');
  }

  // --- privado -----------------------------------------------------------

  private async computePreviousComparison(
    clientId: string,
    beforeEvaluatedAt: Date,
    audience: ReportAudience,
    current: {
      weightKg: number | null;
      bodyFatPercent: number | null;
      leanMassKg: number | null;
      fatMassKg: number | null;
      muscleMassKg: number | null;
      skeletalMuscleMassKg: number | null;
    },
  ): Promise<ReportComparison | null> {
    const previous = await this.prisma.physicalEvaluation.findFirst({
      where: {
        clientId,
        evaluatedAt: { lt: beforeEvaluatedAt },
        ...(audience === ReportAudience.client ? { releasedToClientAt: { not: null } } : {}),
      },
      orderBy: { evaluatedAt: 'desc' },
      select: {
        evaluatedAt: true,
        weightKg: true,
        calculatedMetrics: { select: { bodyFatPercent: true, leanMassKg: true, fatMassKg: true } },
        bioimpedance: { select: { muscleMassKg: true, skeletalMuscleMassKg: true } },
      },
    });
    if (!previous) {
      return null;
    }

    return {
      previousEvaluatedAt: previous.evaluatedAt.toISOString(),
      weightKg: numericDelta(previous.weightKg, current.weightKg),
      bodyFatPercent: numericDelta(previous.calculatedMetrics?.bodyFatPercent, current.bodyFatPercent),
      leanMassKg: numericDelta(previous.calculatedMetrics?.leanMassKg, current.leanMassKg),
      fatMassKg: numericDelta(previous.calculatedMetrics?.fatMassKg, current.fatMassKg),
      muscleMassKg: numericDelta(previous.bioimpedance?.muscleMassKg, current.muscleMassKg),
      skeletalMuscleMassKg: numericDelta(previous.bioimpedance?.skeletalMuscleMassKg, current.skeletalMuscleMassKg),
      musclePercent: numericDelta(
        percentOfWeight(previous.bioimpedance?.muscleMassKg, previous.weightKg),
        percentOfWeight(current.muscleMassKg, current.weightKg),
      ),
      skeletalMusclePercent: numericDelta(
        percentOfWeight(previous.bioimpedance?.skeletalMuscleMassKg, previous.weightKg),
        percentOfWeight(current.skeletalMuscleMassKg, current.weightKg),
      ),
    };
  }

  private async loadPhotosForProfessionalReport(evaluationId: string): Promise<ReportPhoto[]> {
    const photos = await this.prisma.bodyPhoto.findMany({
      where: { evaluationId },
      select: { angle: true, storageKey: true, contentType: true },
      orderBy: { createdAt: 'asc' },
    });
    const loaded: ReportPhoto[] = [];
    for (const photo of photos) {
      try {
        const buffer = await this.storage.read(photo.storageKey);
        loaded.push({ angle: photo.angle, dataUri: `data:${photo.contentType};base64,${buffer.toString('base64')}` });
      } catch {
        // arquivo ausente/corrompido: relatório continua sem essa foto,
        // em vez de falhar a geração inteira
      }
    }
    return loaded;
  }
}
