import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { FoodListStore, mappingKey, PlannedAlias, PlannedMapping, StoredAlias, StoredMapping } from './food-list-import';

/** Store em memória para os testes do importador. */
export class InMemoryFoodListStore implements FoodListStore {
  mappings: StoredMapping[] = [];
  aliases: StoredAlias[] = [];
  applyCalls = 0;

  constructor(private readonly foods: ReadonlyMap<string, string>) {}

  async foodIdsByKey(keys: string[]): Promise<Map<string, string>> {
    return new Map(keys.filter((k) => this.foods.has(k)).map((k) => [k, this.foods.get(k) as string]));
  }

  async listMappings(): Promise<StoredMapping[]> {
    return this.mappings.map((m) => ({ ...m }));
  }

  async listAliases(): Promise<StoredAlias[]> {
    return this.aliases.map((a) => ({ ...a }));
  }

  async apply(changes: { createMappings: PlannedMapping[]; updateMappings: StoredMapping[]; upsertAliases: PlannedAlias[] }): Promise<void> {
    this.applyCalls++;
    for (const m of changes.createMappings) this.mappings.push({ ...m, id: randomUUID() });
    for (const m of changes.updateMappings) this.mappings = this.mappings.map((x) => (x.id === m.id ? { ...m } : x));
    const idByKey = new Map(this.mappings.map((m) => [mappingKey(m), m.id]));
    for (const a of changes.upsertAliases) {
      const row: StoredAlias = { alias: a.alias, mappingId: idByKey.get(a.mappingKey) ?? null, foodId: a.foodId, autoLink: a.autoLink };
      const i = this.aliases.findIndex((x) => x.alias === a.alias);
      if (i >= 0) this.aliases[i] = row;
      else this.aliases.push(row);
    }
  }
}

/** Banco real: tudo numa transação; nada é apagado. */
export class PrismaFoodListStore implements FoodListStore {
  constructor(private readonly prisma: PrismaClient) {}

  async foodIdsByKey(keys: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.food.findMany({ where: { sourceKey: { in: keys } }, select: { id: true, sourceKey: true } });
    return new Map(rows.map((r) => [r.sourceKey as string, r.id]));
  }

  async listMappings(): Promise<StoredMapping[]> {
    const rows = await this.prisma.foodListMapping.findMany();
    return rows.map((r) => ({
      id: r.id,
      listGroup: r.listGroup,
      listItemName: r.listItemName,
      status: r.status,
      foodId: r.foodId,
      candidateKeys: r.candidateKeys,
      notes: r.notes ?? '',
      decidedAt: r.decidedAt ?? new Date(0),
    }));
  }

  async listAliases(): Promise<StoredAlias[]> {
    return this.prisma.foodAlias.findMany({ select: { alias: true, mappingId: true, foodId: true, autoLink: true } });
  }

  async apply(changes: { createMappings: PlannedMapping[]; updateMappings: StoredMapping[]; upsertAliases: PlannedAlias[] }): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        for (const m of changes.createMappings) {
          await tx.foodListMapping.create({
            data: {
              listGroup: m.listGroup,
              listItemName: m.listItemName,
              status: m.status,
              foodId: m.foodId,
              candidateKeys: m.candidateKeys,
              notes: m.notes,
              decidedAt: m.decidedAt,
            },
          });
        }
        for (const m of changes.updateMappings) {
          await tx.foodListMapping.update({
            where: { id: m.id },
            data: { status: m.status, foodId: m.foodId, candidateKeys: m.candidateKeys, notes: m.notes, decidedAt: m.decidedAt },
          });
        }
        const all = await tx.foodListMapping.findMany({ select: { id: true, listGroup: true, listItemName: true } });
        const idByKey = new Map(all.map((m) => [mappingKey(m), m.id]));
        for (const a of changes.upsertAliases) {
          const data = { mappingId: idByKey.get(a.mappingKey) ?? null, foodId: a.foodId, autoLink: a.autoLink };
          await tx.foodAlias.upsert({ where: { alias: a.alias }, create: { alias: a.alias, ...data }, update: data });
        }
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  }
}
