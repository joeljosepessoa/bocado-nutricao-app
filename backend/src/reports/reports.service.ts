import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { NotificationEventType, Prisma, ReportAudience, ReportAuditAction, ReportStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PhysicalEvaluationsService } from '../physical-evaluations/physical-evaluations.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { PdfService } from './pdf.service';
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
} from './templates/report-types';

export interface RequestMeta {
  ipAddress?: string;
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
        });
        const core: EvaluationReportCore = {
          clientName,
          professionalName,
          evaluatedAt: summary.evaluatedAt.toISOString(),
          ageAtEvaluation: fullEvaluation.ageAtEvaluation,
          heightCm: fullEvaluation.heightCm,
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
        const photos = await this.loadPhotosForProfessionalReport(evaluationId);
        const comparison = await this.computePreviousComparison(clientId, fullEvaluation.evaluatedAt, dto.audience, {
          weightKg: fullEvaluation.weightKg,
          bodyFatPercent: fullEvaluation.calculatedMetrics?.bodyFatPercent ?? null,
          leanMassKg: fullEvaluation.calculatedMetrics?.leanMassKg ?? null,
          fatMassKg: fullEvaluation.calculatedMetrics?.fatMassKg ?? null,
        });
        const core: EvaluationReportCore = {
          clientName,
          professionalName,
          evaluatedAt: fullEvaluation.evaluatedAt.toISOString(),
          ageAtEvaluation: fullEvaluation.ageAtEvaluation,
          heightCm: fullEvaluation.heightCm,
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
          protocolLabel: fullEvaluation.protocol
            ? `${fullEvaluation.protocol.name} (v${fullEvaluation.protocol.version})`
            : null,
          bioimpedanceOrigin: fullEvaluation.bioimpedance?.origin ?? null,
          bloodPressureSystolic: fullEvaluation.bloodPressureSystolic,
          bloodPressureDiastolic: fullEvaluation.bloodPressureDiastolic,
          heartRate: fullEvaluation.heartRate,
          glucose: fullEvaluation.glucose,
          notes: fullEvaluation.notes,
          photos,
        };
        html = renderProfessionalReportHtml(data);
        snapshot = { ...data, photos: data.photos.map((p) => ({ angle: p.angle })) }; // nunca guarda a imagem no snapshot
      }

      const pdfBuffer = await this.pdf.renderHtmlToPdf(html);
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
      await this.prisma.report.update({
        where: { id: report.id },
        data: { status: ReportStatus.failed, failureReason: 'Falha ao gerar o PDF.' },
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
    current: { weightKg: number | null; bodyFatPercent: number | null; leanMassKg: number | null; fatMassKg: number | null },
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
      },
    });
    if (!previous) {
      return null;
    }

    // Mesma matemática de delta já usada em PhysicalEvaluationsService.compare()
    // — reimplementada aqui (3 linhas) em vez de importar, para não acoplar
    // este serviço a métodos privados daquele.
    const delta = (a: number | null | undefined, b: number | null | undefined) =>
      a == null || b == null ? null : Math.round((b - a) * 100) / 100;

    return {
      previousEvaluatedAt: previous.evaluatedAt.toISOString(),
      weightKg: delta(previous.weightKg, current.weightKg),
      bodyFatPercent: delta(previous.calculatedMetrics?.bodyFatPercent, current.bodyFatPercent),
      leanMassKg: delta(previous.calculatedMetrics?.leanMassKg, current.leanMassKg),
      fatMassKg: delta(previous.calculatedMetrics?.fatMassKg, current.fatMassKg),
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
