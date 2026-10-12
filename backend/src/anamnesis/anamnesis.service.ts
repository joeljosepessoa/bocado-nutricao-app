import { Injectable, NotFoundException } from '@nestjs/common';
import { AnamnesisAuditAction, Prisma, type Anamnesis } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import type { AnamnesisItemDto, SaveAnamnesisDto } from './dto/save-anamnesis.dto';

export interface RequestMeta {
  ipAddress?: string;
}

export interface AnamnesisItem {
  name: string;
  dosage: string | null;
  frequency: string | null;
}

const TEXT_FIELDS = [
  'maritalStatus',
  'cpf',
  'rg',
  'occupation',
  'address',
  'goalDescription',
  'otherConditions',
  'surgeries',
  'allergies',
  'smoking',
  'alcohol',
  'waterIntake',
  'sleepHours',
  'sleepQuality',
  'stressLevel',
  'bowelFrequency',
  'trainingFrequency',
  'trainingDuration',
  'trainingModality',
  'cardio',
  'dailySteps',
  'mealsPerDay',
  'mealTimes',
  'foodPreferences',
  'intolerances',
  'restrictions',
  'aversions',
  'notes',
] as const;
const CODE_LIST_FIELDS = ['goals', 'conditions', 'familyHistory'] as const;
const ITEM_LIST_FIELDS = ['medications', 'supplements', 'hormones'] as const;

type TextField = (typeof TEXT_FIELDS)[number];
type CodeListField = (typeof CODE_LIST_FIELDS)[number];
type ItemListField = (typeof ITEM_LIST_FIELDS)[number];

/** A ficha como o painel a recebe — sempre completa, mesmo antes de existir no banco. */
export type AnamnesisContent = Record<TextField, string | null> & Record<CodeListField, string[]> & Record<ItemListField, AnamnesisItem[]>;

export interface AnamnesisView {
  /** Dados do cadastro mostrados na etapa "Dados pessoais". Nome e e-mail só para leitura. */
  client: { id: string; fullName: string; email: string; birthDate: string | null; gender: string | null; phone: string | null };
  anamnesis: AnamnesisContent & { completedAt: string | null; updatedAt: string | null };
}

const toItems = (items: AnamnesisItemDto[]): AnamnesisItem[] => items.map((item) => ({ name: item.name, dosage: item.dosage ?? null, frequency: item.frequency ?? null }));

function storedItems(value: Prisma.JsonValue | undefined): AnamnesisItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.name !== 'string') return [];
    return [{ name: entry.name, dosage: typeof entry.dosage === 'string' ? entry.dosage : null, frequency: typeof entry.frequency === 'string' ? entry.frequency : null }];
  });
}

function content(row: Anamnesis | null): AnamnesisContent {
  const text = Object.fromEntries(TEXT_FIELDS.map((field) => [field, row?.[field] ?? null])) as Record<TextField, string | null>;
  const codes = Object.fromEntries(CODE_LIST_FIELDS.map((field) => [field, row?.[field] ?? []])) as Record<CodeListField, string[]>;
  const items = Object.fromEntries(ITEM_LIST_FIELDS.map((field) => [field, storedItems(row?.[field])])) as Record<ItemListField, AnamnesisItem[]>;
  return { ...text, ...codes, ...items };
}

/**
 * Anamnese do paciente — ficha em 12 etapas preenchida pelo profissional. Só o
 * profissional dono do paciente lê e grava; cada acesso fica registrado (quem,
 * de quem, quando — nunca o conteúdo). O paciente recebe a própria ficha na
 * exportação de dados (LGPD) e ela é apagada quando ele exclui a conta.
 */
@Injectable()
export class AnamnesisService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownedClient(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, professionalId },
      select: { id: true, birthDate: true, gender: true, phone: true, user: { select: { fullName: true, email: true } } },
    });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado.');
    }
    return client;
  }

  private audit(professionalId: string, clientId: string, action: AnamnesisAuditAction, meta: RequestMeta) {
    return this.prisma.anamnesisAuditLog.create({ data: { professionalId, clientId, action, ipAddress: meta.ipAddress } });
  }

  private async view(professionalId: string, clientId: string): Promise<AnamnesisView> {
    const client = await this.ownedClient(professionalId, clientId);
    const row = await this.prisma.anamnesis.findUnique({ where: { clientId } });
    return {
      client: {
        id: client.id,
        fullName: client.user.fullName,
        email: client.user.email,
        birthDate: client.birthDate ? client.birthDate.toISOString().slice(0, 10) : null,
        gender: client.gender,
        phone: client.phone,
      },
      anamnesis: { ...content(row), completedAt: row?.completedAt?.toISOString() ?? null, updatedAt: row?.updatedAt.toISOString() ?? null },
    };
  }

  async get(professionalId: string, clientId: string, meta: RequestMeta = {}): Promise<AnamnesisView> {
    const result = await this.view(professionalId, clientId);
    await this.audit(professionalId, clientId, AnamnesisAuditAction.read, meta);
    return result;
  }

  /** Situação da ficha de cada paciente do profissional (para a lista da tela Anamnese). */
  async listStatus(professionalId: string): Promise<Array<{ clientId: string; completedAt: string | null; updatedAt: string }>> {
    const rows = await this.prisma.anamnesis.findMany({
      where: { client: { professionalId } },
      select: { clientId: true, completedAt: true, updatedAt: true },
    });
    return rows.map((row) => ({ clientId: row.clientId, completedAt: row.completedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString() }));
  }

  /** Grava o que veio (campo ausente não é tocado). Nascimento, sexo e WhatsApp vão para o cadastro do paciente. */
  async save(professionalId: string, clientId: string, dto: SaveAnamnesisDto, meta: RequestMeta = {}): Promise<AnamnesisView> {
    await this.ownedClient(professionalId, clientId);

    const data: Prisma.AnamnesisUncheckedUpdateInput = {};
    for (const field of TEXT_FIELDS) if (dto[field] !== undefined) data[field] = dto[field] ?? null;
    for (const field of CODE_LIST_FIELDS) if (dto[field] !== undefined) data[field] = dto[field];
    for (const field of ITEM_LIST_FIELDS) {
      const items = dto[field];
      if (items !== undefined) data[field] = toItems(items) as unknown as Prisma.InputJsonValue;
    }

    const clientData: Prisma.ClientUpdateInput = {};
    if (dto.birthDate !== undefined) clientData.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    if (dto.gender !== undefined) clientData.gender = dto.gender ?? null;
    if (dto.phone !== undefined) clientData.phone = dto.phone ?? null;

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.anamnesis.findUnique({ where: { clientId }, select: { completedAt: true } });
      // Concluir de novo mantém a data da primeira conclusão; `completed: false` reabre.
      if (dto.completed === true) data.completedAt = existing?.completedAt ?? new Date();
      if (dto.completed === false) data.completedAt = null;
      await tx.anamnesis.upsert({
        where: { clientId },
        create: { ...(data as Prisma.AnamnesisUncheckedCreateInput), clientId, professionalId },
        update: data,
      });
      if (Object.keys(clientData).length > 0) await tx.client.update({ where: { id: clientId }, data: clientData });
    });

    await this.audit(professionalId, clientId, dto.completed === true ? AnamnesisAuditAction.completed : AnamnesisAuditAction.saved, meta);
    return this.view(professionalId, clientId);
  }

  /** LGPD — a ficha do próprio paciente, para a exportação de dados (null se nunca foi preenchida). */
  async exportForClient(clientId: string): Promise<(AnamnesisContent & { completedAt: string | null; updatedAt: string }) | null> {
    const row = await this.prisma.anamnesis.findUnique({ where: { clientId } });
    return row ? { ...content(row), completedAt: row.completedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString() } : null;
  }

  /** LGPD — exclusão de conta: a ficha (CPF, RG, histórico de saúde) é apagada; o registro de acessos permanece. */
  async deleteForClient(clientId: string): Promise<void> {
    await this.prisma.anamnesis.deleteMany({ where: { clientId } });
  }
}
