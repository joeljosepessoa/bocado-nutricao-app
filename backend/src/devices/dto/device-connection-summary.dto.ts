import { DeviceConnectionStatus, DeviceSourceType } from '@prisma/client';

/** Metadados da conexão — nunca inclui amostra/valor de métrica. */
export class DeviceConnectionSummaryDto {
  id!: string;
  sourceType!: DeviceSourceType;
  driverId!: string | null;
  deviceIdentifier!: string | null;
  status!: DeviceConnectionStatus;
  sharedWithProfessional!: boolean;
  lastSyncedAt!: Date | null;
  connectedAt!: Date;
  revokedAt!: Date | null;

  static fromEntity(connection: {
    id: string;
    sourceType: DeviceSourceType;
    driverId: string | null;
    deviceIdentifier: string | null;
    status: DeviceConnectionStatus;
    sharedWithProfessional: boolean;
    lastSyncedAt: Date | null;
    connectedAt: Date;
    revokedAt: Date | null;
  }): DeviceConnectionSummaryDto {
    const dto = new DeviceConnectionSummaryDto();
    dto.id = connection.id;
    dto.sourceType = connection.sourceType;
    dto.driverId = connection.driverId;
    dto.deviceIdentifier = connection.deviceIdentifier;
    dto.status = connection.status;
    dto.sharedWithProfessional = connection.sharedWithProfessional;
    dto.lastSyncedAt = connection.lastSyncedAt;
    dto.connectedAt = connection.connectedAt;
    dto.revokedAt = connection.revokedAt;
    return dto;
  }
}
