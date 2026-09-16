import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DeviceAuditAction, DeviceMetricType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { DeviceAuditLogService } from './device-audit-log.service';
import { CreateDeviceConnectionDto } from './dto/create-device-connection.dto';
import { UpdateDeviceConnectionDto } from './dto/update-device-connection.dto';
import { IngestMetricSamplesDto, MetricSampleInputDto } from './dto/ingest-metric-samples.dto';
import { DeviceConnectionSummaryDto } from './dto/device-connection-summary.dto';
import { DeviceMetricSampleDto } from './dto/device-metric-sample.dto';

export interface RequestMeta {
  ipAddress?: string;
}

export interface RejectedSample {
  index: number;
  reason: string;
}

export interface IngestResult {
  inserted: number;
  duplicates: number;
  rejected: RejectedSample[];
}

/**
 * Faixa plausível por tipo de métrica — mesma ideia do validate() de um
 * ScaleDriver (Fase 10), aqui centralizada porque não há um "driver" por
 * amostra (a validação acontece na ingestão, depois do Normalizer do app).
 * Tipo sem faixa aqui (ex.: workout_activity) só é checado quanto a
 * finitude/sinal do valor, não a uma faixa específica — nenhuma inventada.
 */
const METRIC_RANGES: Partial<Record<DeviceMetricType, { min: number; max: number }>> = {
  heart_rate: { min: 20, max: 250 },
  resting_heart_rate: { min: 20, max: 150 },
  steps: { min: 0, max: 100_000 },
  distance: { min: 0, max: 200_000 },
  active_calories: { min: 0, max: 10_000 },
  exercise_duration: { min: 0, max: 86_400 },
  oxygen_saturation: { min: 0, max: 100 },
  body_temperature: { min: 25, max: 45 },
  respiratory_rate: { min: 4, max: 80 },
  sleep_session: { min: 0, max: 86_400 },
};

function computeDedupHash(deviceConnectionId: string, sample: MetricSampleInputDto): string {
  const material = `${deviceConnectionId}:${sample.metricType}:${sample.externalId ?? `${sample.startedAt}:${sample.endedAt}:${sample.value}`}`;
  return createHash('sha256').update(material).digest('hex');
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: DeviceAuditLogService,
  ) {}

  private async assertOwnedClient(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, professionalId } });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado.');
    }
    return client;
  }

  private async assertOwnedConnection(clientId: string, connectionId: string) {
    const connection = await this.prisma.deviceConnection.findFirst({
      where: { id: connectionId, clientId },
    });
    if (!connection) {
      throw new NotFoundException('Conexão de dispositivo não encontrada.');
    }
    return connection;
  }

  // ---------------------------------------------------------------------
  // Cliente
  // ---------------------------------------------------------------------

  async recordConsent(clientId: string): Promise<{ deviceDataConsentAt: Date }> {
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { deviceDataConsentAt: true },
    });
    const deviceDataConsentAt = client.deviceDataConsentAt ?? new Date();
    if (!client.deviceDataConsentAt) {
      await this.prisma.client.update({ where: { id: clientId }, data: { deviceDataConsentAt } });
    }
    return { deviceDataConsentAt };
  }

  async listOwnConnections(
    clientId: string,
  ): Promise<{ consentedAt: Date | null; items: DeviceConnectionSummaryDto[] }> {
    const [client, items] = await Promise.all([
      this.prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { deviceDataConsentAt: true } }),
      this.prisma.deviceConnection.findMany({ where: { clientId }, orderBy: { connectedAt: 'desc' } }),
    ]);
    return {
      consentedAt: client.deviceDataConsentAt,
      items: items.map((item) => DeviceConnectionSummaryDto.fromEntity(item)),
    };
  }

  /** O cliente vendo suas próprias amostras — sem allowlist, é o próprio dado dele. */
  async listOwnMetrics(
    clientId: string,
    connectionId: string,
    metricType: DeviceMetricType | undefined,
    page = 1,
    pageSize = 50,
  ): Promise<{ items: DeviceMetricSampleDto[]; total: number; page: number; pageSize: number }> {
    await this.assertOwnedConnection(clientId, connectionId);
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 50;
    const where: Prisma.DeviceMetricSampleWhereInput = { clientId, deviceConnectionId: connectionId, metricType };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.deviceMetricSample.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.deviceMetricSample.count({ where }),
    ]);

    return {
      items: items.map((item) => DeviceMetricSampleDto.fromEntity(item)),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async createConnection(
    clientId: string,
    dto: CreateDeviceConnectionDto,
    meta: RequestMeta = {},
  ): Promise<DeviceConnectionSummaryDto> {
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { deviceDataConsentAt: true },
    });
    if (!client.deviceDataConsentAt) {
      throw new BadRequestException(
        'É necessário aceitar o consentimento de dados de dispositivo antes de conectar uma fonte.',
      );
    }

    const connection = await this.prisma.deviceConnection.create({
      data: {
        clientId,
        sourceType: dto.sourceType,
        driverId: dto.driverId,
        deviceIdentifier: dto.deviceIdentifier,
        externalAccountId: dto.externalAccountId,
      },
    });
    await this.auditLog.record({
      clientId,
      deviceConnectionId: connection.id,
      action: DeviceAuditAction.connection_created,
      ipAddress: meta.ipAddress,
    });
    return DeviceConnectionSummaryDto.fromEntity(connection);
  }

  async updateConnection(
    clientId: string,
    connectionId: string,
    dto: UpdateDeviceConnectionDto,
    meta: RequestMeta = {},
  ): Promise<DeviceConnectionSummaryDto> {
    const connection = await this.assertOwnedConnection(clientId, connectionId);

    const data: Prisma.DeviceConnectionUpdateInput = {};
    const actions: DeviceAuditAction[] = [];

    if (dto.sharedWithProfessional !== undefined && dto.sharedWithProfessional !== connection.sharedWithProfessional) {
      data.sharedWithProfessional = dto.sharedWithProfessional;
      actions.push(dto.sharedWithProfessional ? DeviceAuditAction.share_enabled : DeviceAuditAction.share_disabled);
    }

    if (dto.status === 'revoked' && connection.status !== 'revoked') {
      data.status = 'revoked';
      data.revokedAt = new Date();
      data.sharedWithProfessional = false;
      actions.push(DeviceAuditAction.connection_revoked);
    }

    const updated =
      Object.keys(data).length > 0
        ? await this.prisma.deviceConnection.update({ where: { id: connectionId }, data })
        : connection;

    for (const action of actions) {
      await this.auditLog.record({ clientId, deviceConnectionId: connectionId, action, ipAddress: meta.ipAddress });
    }

    return DeviceConnectionSummaryDto.fromEntity(updated);
  }

  async ingestMetrics(
    clientId: string,
    connectionId: string,
    dto: IngestMetricSamplesDto,
    meta: RequestMeta = {},
  ): Promise<IngestResult> {
    const connection = await this.assertOwnedConnection(clientId, connectionId);
    if (connection.status !== 'active') {
      throw new BadRequestException('Esta conexão não está ativa — reconecte a fonte para sincronizar.');
    }

    const rejected: RejectedSample[] = [];
    const candidates: Array<{ sample: MetricSampleInputDto; dedupHash: string }> = [];

    dto.samples.forEach((sample, index) => {
      if (new Date(sample.endedAt).getTime() < new Date(sample.startedAt).getTime()) {
        rejected.push({ index, reason: 'endedAt é anterior a startedAt.' });
        return;
      }
      const range = METRIC_RANGES[sample.metricType];
      if (range && (sample.value < range.min || sample.value > range.max)) {
        rejected.push({ index, reason: `Valor fora da faixa plausível para ${sample.metricType}.` });
        return;
      }
      candidates.push({ sample, dedupHash: computeDedupHash(connectionId, sample) });
    });

    let inserted = 0;
    if (candidates.length > 0) {
      const existing = await this.prisma.deviceMetricSample.findMany({
        where: { dedupHash: { in: candidates.map((c) => c.dedupHash) } },
        select: { dedupHash: true },
      });
      const existingHashes = new Set(existing.map((e) => e.dedupHash));
      const toInsert = candidates.filter((c) => !existingHashes.has(c.dedupHash));

      if (toInsert.length > 0) {
        const result = await this.prisma.deviceMetricSample.createMany({
          data: toInsert.map(({ sample, dedupHash }) => ({
            clientId,
            deviceConnectionId: connectionId,
            metricType: sample.metricType,
            value: sample.value,
            unit: sample.unit,
            startedAt: new Date(sample.startedAt),
            endedAt: new Date(sample.endedAt),
            precision: sample.precision,
            externalId: sample.externalId,
            dedupHash,
            rawPayload: sample.rawPayload as Prisma.InputJsonValue | undefined,
          })),
          skipDuplicates: true,
        });
        inserted = result.count;
        await this.prisma.deviceConnection.update({
          where: { id: connectionId },
          data: { lastSyncedAt: new Date() },
        });
      }
    }

    await this.auditLog.record({
      clientId,
      deviceConnectionId: connectionId,
      action: DeviceAuditAction.metrics_ingested,
      ipAddress: meta.ipAddress,
    });

    return { inserted, duplicates: candidates.length - inserted, rejected };
  }

  // ---------------------------------------------------------------------
  // Profissional
  // ---------------------------------------------------------------------

  async listConnectionsForProfessional(
    professionalId: string,
    clientId: string,
  ): Promise<DeviceConnectionSummaryDto[]> {
    await this.assertOwnedClient(professionalId, clientId);
    const items = await this.prisma.deviceConnection.findMany({
      where: { clientId },
      orderBy: { connectedAt: 'desc' },
    });
    return items.map((item) => DeviceConnectionSummaryDto.fromEntity(item));
  }

  async listMetricsForProfessional(
    professionalId: string,
    clientId: string,
    metricType: DeviceMetricType | undefined,
    page = 1,
    pageSize = 50,
    meta: RequestMeta = {},
  ): Promise<{ items: DeviceMetricSampleDto[]; total: number; page: number; pageSize: number }> {
    await this.assertOwnedClient(professionalId, clientId);
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 50;

    // Só amostras de conexões que o próprio cliente marcou como
    // compartilhadas — nunca por padrão (decisão da Fase 11).
    const where: Prisma.DeviceMetricSampleWhereInput = {
      clientId,
      metricType,
      deviceConnection: { sharedWithProfessional: true },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.deviceMetricSample.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.deviceMetricSample.count({ where }),
    ]);

    await this.auditLog.record({
      clientId,
      professionalId,
      action: DeviceAuditAction.metrics_viewed_by_professional,
      ipAddress: meta.ipAddress,
    });

    return {
      items: items.map((item) => DeviceMetricSampleDto.fromEntity(item)),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }
}
