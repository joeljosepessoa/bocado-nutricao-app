import { ReportAudience, ReportStatus } from '@prisma/client';

/**
 * Visão profissional de um relatório — nunca inclui dataSnapshot (payload
 * técnico interno usado só para regenerar/depurar, não uma resposta de API)
 * nem storageKey (o caminho no disco não é informação de negócio).
 */
export class ReportSummaryDto {
  id!: string;
  evaluationId!: string;
  audience!: ReportAudience;
  status!: ReportStatus;
  templateVersion!: number;
  sizeBytes!: number | null;
  generatedAt!: Date | null;
  releasedToClientAt!: Date | null;
  failureReason!: string | null;
  createdAt!: Date;

  static fromEntity(report: {
    id: string;
    evaluationId: string;
    audience: ReportAudience;
    status: ReportStatus;
    templateVersion: number;
    sizeBytes: number | null;
    generatedAt: Date | null;
    releasedToClientAt: Date | null;
    failureReason: string | null;
    createdAt: Date;
  }): ReportSummaryDto {
    const dto = new ReportSummaryDto();
    dto.id = report.id;
    dto.evaluationId = report.evaluationId;
    dto.audience = report.audience;
    dto.status = report.status;
    dto.templateVersion = report.templateVersion;
    dto.sizeBytes = report.sizeBytes;
    dto.generatedAt = report.generatedAt;
    dto.releasedToClientAt = report.releasedToClientAt;
    dto.failureReason = report.failureReason;
    dto.createdAt = report.createdAt;
    return dto;
  }
}

/**
 * Visão do cliente — só relatórios audience=client já liberados chegam
 * até aqui (filtrado na query do serviço, não neste mapper). Nem
 * professionalId/clientId (o cliente já sabe que são os dele) nem status
 * intermediário (só aparece o que está pronto).
 */
export class ClientReportSummaryDto {
  id!: string;
  evaluationEvaluatedAt!: Date;
  generatedAt!: Date;
  sizeBytes!: number;

  static fromEntity(report: {
    id: string;
    generatedAt: Date;
    sizeBytes: number;
    evaluation: { evaluatedAt: Date };
  }): ClientReportSummaryDto {
    const dto = new ClientReportSummaryDto();
    dto.id = report.id;
    dto.evaluationEvaluatedAt = report.evaluation.evaluatedAt;
    dto.generatedAt = report.generatedAt;
    dto.sizeBytes = report.sizeBytes;
    return dto;
  }
}
