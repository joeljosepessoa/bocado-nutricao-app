import { DeviceMetricType } from '@prisma/client';

/** rawPayload nunca sai daqui — mesma regra de ScaleReadingSummaryDto (Fase 10). */
export class DeviceMetricSampleDto {
  id!: string;
  deviceConnectionId!: string;
  metricType!: DeviceMetricType;
  value!: number;
  unit!: string;
  startedAt!: Date;
  endedAt!: Date;
  precision!: number | null;

  static fromEntity(sample: {
    id: string;
    deviceConnectionId: string;
    metricType: DeviceMetricType;
    value: number;
    unit: string;
    startedAt: Date;
    endedAt: Date;
    precision: number | null;
  }): DeviceMetricSampleDto {
    const dto = new DeviceMetricSampleDto();
    dto.id = sample.id;
    dto.deviceConnectionId = sample.deviceConnectionId;
    dto.metricType = sample.metricType;
    dto.value = sample.value;
    dto.unit = sample.unit;
    dto.startedAt = sample.startedAt;
    dto.endedAt = sample.endedAt;
    dto.precision = sample.precision;
    return dto;
  }
}
