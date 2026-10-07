import { randomUUID } from 'crypto';
import { FoodScope, NutritionUnit, Prisma, PrismaClient } from '@prisma/client';
import { LEGACY_TACO_SOURCE, StoredCatalogFood, TacoCatalogStore } from './taco-catalog-import';
import { TacoCatalogRecord } from './taco-catalog';

/** O que o banco guarda de cada alimento oficial (espelha `foods`). */
export interface CatalogFoodRow {
  id: string;
  name: string;
  scope: 'global' | 'private';
  source: string;
  createdByProfessionalId: string;
  approvedAt: Date | null;
  sourceKey: string | null;
  sourceEdition: string | null;
  sourceNumber: number | null;
  sourceHash: string | null;
  foodGroup: string | null;
  preparation: string | null;
  kcalPer100: number | null;
  proteinGPer100: number | null;
  carbGPer100: number | null;
  fatGPer100: number | null;
  fiberGPer100: number | null;
  sodiumMgPer100: number | null;
  sourceData: unknown;
}

/** Colunas que a importação grava a partir de um registro da TACO. */
export function columnsFromRecord(record: TacoCatalogRecord) {
  return {
    name: record.name,
    source: record.source,
    sourceKey: record.sourceKey,
    sourceEdition: record.sourceEdition,
    sourceNumber: record.sourceNumber,
    sourceHash: record.contentHash,
    foodGroup: record.foodGroup,
    preparation: record.preparation,
    kcalPer100: record.values.kcal,
    proteinGPer100: record.values.proteina,
    carbGPer100: record.values.carboidrato,
    fatGPer100: record.values.lipideos,
    fiberGPer100: record.values.fibra,
    sodiumMgPer100: record.values.sodio,
    sourceData: {
      porcaoReferencia: record.referencePortion,
      origem: record.origin,
      macros: record.macros,
      nutrientes: record.nutrients,
      acidosGraxos: record.fattyAcids,
      aminoacidos: record.aminoAcids,
    },
  };
}

/** Store em memória com a mesma regra de unicidade do banco (testes). */
export class InMemoryTacoCatalogStore implements TacoCatalogStore {
  readonly rows: CatalogFoodRow[] = [];
  readonly writes = { insert: 0, update: 0 };

  constructor(private readonly systemProfessionalId: string) {}

  async findExisting(sourceKeys: string[]): Promise<StoredCatalogFood[]> {
    const keys = new Set(sourceKeys);
    return this.rows
      .filter((r) => (r.sourceKey && keys.has(r.sourceKey)) || (!r.sourceKey && r.source === LEGACY_TACO_SOURCE && r.createdByProfessionalId === this.systemProfessionalId))
      .map((r) => ({
        id: r.id,
        name: r.name,
        source: r.source,
        sourceKey: r.sourceKey,
        contentHash: r.sourceHash,
        approvedAt: r.approvedAt,
        createdBySystem: r.createdByProfessionalId === this.systemProfessionalId,
      }));
  }

  async insert(record: TacoCatalogRecord, approvedAt: Date): Promise<void> {
    if (this.rows.some((r) => r.sourceKey === record.sourceKey)) throw new Error(`unique: source_key ${record.sourceKey}`);
    this.writes.insert += 1;
    this.rows.push({ id: randomUUID(), scope: 'global', createdByProfessionalId: this.systemProfessionalId, approvedAt, ...columnsFromRecord(record) });
  }

  async update(id: string, record: TacoCatalogRecord, approvedAt: Date | null): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error(`alimento ${id} não existe`);
    if (this.rows.some((r) => r.id !== id && r.sourceKey === record.sourceKey)) throw new Error(`unique: source_key ${record.sourceKey}`);
    this.writes.update += 1;
    Object.assign(row, columnsFromRecord(record), { approvedAt: row.approvedAt ?? approvedAt });
  }
}

/** Store real: tabela `foods` via Prisma (global, conta técnica do catálogo). */
export class PrismaTacoCatalogStore implements TacoCatalogStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly systemProfessionalId: string,
  ) {}

  async findExisting(sourceKeys: string[]): Promise<StoredCatalogFood[]> {
    const rows = await this.prisma.food.findMany({
      where: {
        OR: [
          { sourceKey: { in: sourceKeys } },
          { sourceKey: null, source: LEGACY_TACO_SOURCE, createdByProfessionalId: this.systemProfessionalId },
        ],
      },
      select: { id: true, name: true, source: true, sourceKey: true, sourceHash: true, approvedAt: true, createdByProfessionalId: true },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      source: r.source,
      sourceKey: r.sourceKey,
      contentHash: r.sourceHash,
      approvedAt: r.approvedAt,
      createdBySystem: r.createdByProfessionalId === this.systemProfessionalId,
    }));
  }

  private data(record: TacoCatalogRecord) {
    const { sourceData, ...columns } = columnsFromRecord(record);
    return { ...columns, sourceData: sourceData as unknown as Prisma.InputJsonValue };
  }

  /**
   * O Prisma grava Float/Json com 16 algarismos significativos (128.25848566666664
   * vira 128.2584856666666). Para guardar o número EXATO da planilha, os macros e
   * o source_data são regravados por SQL a partir do texto do número.
   */
  private async writeExact(tx: Prisma.TransactionClient, id: string, record: TacoCatalogRecord) {
    const c = columnsFromRecord(record);
    const text = (v: number | null) => (v === null ? null : String(v));
    await tx.$executeRawUnsafe(
      `UPDATE foods SET kcal_per_100 = $2::float8, protein_g_per_100 = $3::float8, carb_g_per_100 = $4::float8,
                        fat_g_per_100 = $5::float8, fiber_g_per_100 = $6::float8, sodium_mg_per_100 = $7::float8,
                        source_data = $8::jsonb
        WHERE id = $1`,
      id,
      text(c.kcalPer100),
      text(c.proteinGPer100),
      text(c.carbGPer100),
      text(c.fatGPer100),
      text(c.fiberGPer100),
      text(c.sodiumMgPer100),
      JSON.stringify(c.sourceData),
    );
  }

  async insert(record: TacoCatalogRecord, approvedAt: Date): Promise<void> {
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.food.create({
        data: {
          id,
          ...this.data(record),
          scope: FoodScope.global,
          baseUnit: NutritionUnit.g,
          createdByProfessionalId: this.systemProfessionalId,
          approvedAt,
        },
      });
      await this.writeExact(tx, id, record);
    });
  }

  async update(id: string, record: TacoCatalogRecord, approvedAt: Date | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.food.update({ where: { id }, data: { ...this.data(record), ...(approvedAt ? { approvedAt } : {}) } });
      await this.writeExact(tx, id, record);
    });
  }
}
