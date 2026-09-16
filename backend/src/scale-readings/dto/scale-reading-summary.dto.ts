import { ScaleReadingStatus } from '@prisma/client';

/**
 * rawPayload nunca sai daqui — é bytes de transporte, só útil para depurar
 * um driver, não uma resposta de API (ver §12 do desenho da Fase 10).
 */
export class ScaleReadingSummaryDto {
  id!: string;
  evaluationId!: string;
  status!: ScaleReadingStatus;
  driverId!: string;
  deviceIdentifier!: string;
  protocolVersion!: string;
  normalized!: unknown;
  recordedAt!: Date;
  createdAt!: Date;

  static fromEntity(reading: {
    id: string;
    evaluationId: string;
    status: ScaleReadingStatus;
    driverId: string;
    deviceIdentifier: string;
    protocolVersion: string;
    normalized: unknown;
    recordedAt: Date;
    createdAt: Date;
  }): ScaleReadingSummaryDto {
    const dto = new ScaleReadingSummaryDto();
    dto.id = reading.id;
    dto.evaluationId = reading.evaluationId;
    dto.status = reading.status;
    dto.driverId = reading.driverId;
    dto.deviceIdentifier = reading.deviceIdentifier;
    dto.protocolVersion = reading.protocolVersion;
    dto.normalized = reading.normalized;
    dto.recordedAt = reading.recordedAt;
    dto.createdAt = reading.createdAt;
    return dto;
  }
}
