import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DietVersionStatus, Food, FoodScope, NutritionUnit, Role } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { NutritionCalculationService } from './nutrition-calculation.service';
import { normalizeFoodName } from './food-name-matching';
import { CreateFoodDto } from './dto/create-food.dto';
import { UpdateFoodDto } from './dto/update-food.dto';
import { CreateSubstitutionDto } from './dto/create-substitution.dto';
import {
  FOOD_LIBRARY_NO_GROUP,
  FOOD_LIBRARY_TACO_SOURCE,
  FoodOrigin,
  FoodOriginFilter,
  nameMatches,
  searchRank,
  searchWords,
} from './food-library';
import { ownNutrientSections, tacoNutrientSections } from './food-nutrients';

const FOOD_INCLUDE = { unitConversions: true } as const;

const NUTRITIONAL_FIELDS = ['baseUnit', 'kcalPer100', 'proteinGPer100', 'carbGPer100', 'fatGPer100', 'fiberGPer100'] as const;

@Injectable()
export class FoodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculation: NutritionCalculationService,
  ) {}

  // Fase 15: conteúdo global só é visível a outros profissionais depois de
  // aprovado — mas o próprio criador continua vendo o que criou enquanto
  // pendente de moderação (senão fica sem acesso ao próprio cadastro).
  private visibilityFilter(professionalId: string) {
    return {
      OR: [
        { scope: FoodScope.global, approvedAt: { not: null } },
        { scope: FoodScope.global, createdByProfessionalId: professionalId },
        { scope: FoodScope.private, ownerProfessionalId: professionalId },
      ],
    };
  }

  async create(professionalId: string, dto: CreateFoodDto) {
    const scope = dto.scope ?? FoodScope.global;

    const food = await this.prisma.food.create({
      data: {
        name: dto.name,
        scope,
        ownerProfessionalId: scope === FoodScope.private ? professionalId : null,
        baseUnit: dto.baseUnit,
        kcalPer100: dto.kcalPer100,
        proteinGPer100: dto.proteinGPer100,
        carbGPer100: dto.carbGPer100,
        fatGPer100: dto.fatGPer100,
        fiberGPer100: dto.fiberGPer100,
        sodiumMgPer100: dto.sodiumMgPer100,
        foodGroup: dto.foodGroup?.trim() || null,
        createdByProfessionalId: professionalId,
        unitConversions: dto.unitConversions
          ? { createMany: { data: dto.unitConversions } }
          : undefined,
      },
      include: FOOD_INCLUDE,
    });
    return food;
  }

  /**
   * Busca do catálogo: pelo nome (contém, sem diferenciar maiúsculas) ou por um
   * apelido aprovado da lista do Bocado — "peito de frango" acha
   * "Frango, peito, sem pele, grelhado".
   */
  async list(professionalId: string, search?: string) {
    const term = search?.trim();
    const aliasFoodIds = term ? await this.foodIdsByAlias(term) : [];
    return this.prisma.food.findMany({
      // AND: o filtro de visibilidade também é um OR — nunca pode ser sobrescrito pela busca.
      where: {
        AND: [
          this.visibilityFilter(professionalId),
          ...(term
            ? [{ OR: [{ name: { contains: term, mode: 'insensitive' as const } }, ...(aliasFoodIds.length ? [{ id: { in: aliasFoodIds } }] : [])] }]
            : []),
        ],
      },
      include: FOOD_INCLUDE,
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  /** Alimentos cujo apelido aprovado (que liga sozinho) contém o termo buscado. */
  private async foodIdsByAlias(term: string): Promise<string[]> {
    const normalized = normalizeFoodName(term);
    if (!normalized) return [];
    const rows = await this.prisma.foodAlias.findMany({
      where: { autoLink: true, foodId: { not: null }, alias: { contains: normalized } },
      select: { foodId: true },
      take: 50,
    });
    return [...new Set(rows.map((r) => r.foodId as string))];
  }

  /** Id e nome de todo alimento visível ao profissional — base do matching do Assistente de Dieta. */
  async listVisibleRefs(professionalId: string): Promise<{ id: string; name: string }[]> {
    return this.prisma.food.findMany({
      where: this.visibilityFilter(professionalId),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Apelidos que ligam sozinhos (lista do Bocado × TACO aprovada pelo
   * nutricionista): "peito de frango" → "Frango, peito, sem pele, grelhado".
   * Só alimentos visíveis ao profissional.
   */
  async listAutoLinkAliases(professionalId: string): Promise<{ alias: string; food: { id: string; name: string } }[]> {
    const rows = await this.prisma.foodAlias.findMany({
      where: { autoLink: true, food: this.visibilityFilter(professionalId) },
      select: { alias: true, food: { select: { id: true, name: true } } },
    });
    return rows.flatMap((r) => (r.food ? [{ alias: r.alias, food: r.food }] : []));
  }

  /**
   * Catálogo que a IA pode usar para MONTAR uma dieta: alimentos visíveis ao
   * profissional, em g ou ml, com os 4 macros numéricos — o que tem marcador
   * da TACO (Tr/NA/*) fica de fora, porque o sistema não conseguiria calcular.
   */
  async listCalculableForAi(professionalId: string) {
    return this.prisma.food.findMany({
      where: {
        AND: [
          this.visibilityFilter(professionalId),
          { baseUnit: { in: [NutritionUnit.g, NutritionUnit.ml] } },
          { kcalPer100: { not: null } },
          { proteinGPer100: { not: null } },
          { carbGPer100: { not: null } },
          { fatGPer100: { not: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        baseUnit: true,
        sourceKey: true,
        sourceNumber: true,
        foodGroup: true,
        kcalPer100: true,
        proteinGPer100: true,
        carbGPer100: true,
        fatGPer100: true,
        fiberGPer100: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  /** Nome dos alimentos visíveis entre os ids pedidos — os que sumiram do catálogo ficam de fora. */
  async visibleRefsByIds(professionalId: string, ids: string[]): Promise<Array<{ id: string; name: string }>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    return this.prisma.food.findMany({ where: { id: { in: unique }, ...this.visibilityFilter(professionalId) }, select: { id: true, name: true } });
  }

  /** Busca um alimento garantindo visibilidade (404 se privado de outro profissional). */
  async findVisible(professionalId: string, foodId: string): Promise<Food & { unitConversions: { unit: string; gramsEquivalent: number }[] }> {
    const food = await this.prisma.food.findFirst({
      where: { id: foodId, ...this.visibilityFilter(professionalId) },
      include: FOOD_INCLUDE,
    });
    if (!food) {
      throw new NotFoundException('Alimento não encontrado.');
    }
    return food as never;
  }

  async update(user: AuthenticatedUser, foodId: string, dto: UpdateFoodDto) {
    const food = await this.findVisible(user.id, foodId);

    // TACO é referência oficial: fica como veio da tabela (só o admin mexe).
    if (food.source === FOOD_LIBRARY_TACO_SOURCE && user.role !== Role.admin) {
      throw new ForbiddenException('Alimento da TACO não pode ser editado. Duplique como seu alimento para ajustar.');
    }
    const isOwner = food.scope === FoodScope.private && food.ownerProfessionalId === user.id;
    const isAuthorizedForGlobal =
      food.scope === FoodScope.global && (food.createdByProfessionalId === user.id || user.role === Role.admin);
    if (!isOwner && !isAuthorizedForGlobal) {
      throw new ForbiddenException('Você não tem permissão para editar este alimento.');
    }

    const touchesNutrition = NUTRITIONAL_FIELDS.some((field) => (dto as Record<string, unknown>)[field] !== undefined);
    if (touchesNutrition) {
      const usedInPublished = await this.prisma.mealFood.findFirst({
        where: {
          foodId,
          meal: { dietVersion: { status: { in: [DietVersionStatus.published, DietVersionStatus.superseded] } } },
        },
      });
      if (usedInPublished) {
        throw new ConflictException(
          'Este alimento já foi usado em uma dieta publicada — os dados nutricionais não podem ser alterados. ' +
            'A dieta já publicada preserva os valores usados no momento; para corrigir o catálogo, cadastre um novo alimento.',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.food.update({
        where: { id: foodId },
        data: {
          name: dto.name,
          baseUnit: dto.baseUnit,
          kcalPer100: dto.kcalPer100,
          proteinGPer100: dto.proteinGPer100,
          carbGPer100: dto.carbGPer100,
          fatGPer100: dto.fatGPer100,
          fiberGPer100: dto.fiberGPer100,
          sodiumMgPer100: dto.sodiumMgPer100,
          foodGroup: dto.foodGroup === undefined ? undefined : dto.foodGroup.trim() || null,
        },
      });

      if (dto.unitConversions) {
        await tx.foodUnitConversion.deleteMany({ where: { foodId } });
        await tx.foodUnitConversion.createMany({
          data: dto.unitConversions.map((c) => ({ foodId, unit: c.unit, gramsEquivalent: c.gramsEquivalent })),
        });
      }

      return tx.food.findUniqueOrThrow({ where: { id: foodId }, include: FOOD_INCLUDE });
    });
  }

  private originOf(professionalId: string, food: { source: string; scope: FoodScope; ownerProfessionalId: string | null; createdByProfessionalId: string }): FoodOrigin {
    if (food.source === FOOD_LIBRARY_TACO_SOURCE) return 'taco';
    const mine =
      (food.scope === FoodScope.private && food.ownerProfessionalId === professionalId) ||
      (food.scope === FoodScope.global && food.createdByProfessionalId === professionalId);
    return mine ? 'mine' : 'shared';
  }

  /**
   * Tela "Alimentos": TACO + alimentos do profissional, com busca (sem acento, palavra por palavra, e pelos
   * apelidos aprovados), filtro por grupo e por origem, contagens e paginação.
   */
  async library(
    professionalId: string,
    query: { search?: string; group?: string; origin?: FoodOriginFilter; page?: number; pageSize?: number },
  ) {
    const rows = await this.prisma.food.findMany({
      where: this.visibilityFilter(professionalId),
      select: {
        id: true,
        name: true,
        scope: true,
        ownerProfessionalId: true,
        createdByProfessionalId: true,
        source: true,
        sourceNumber: true,
        foodGroup: true,
        preparation: true,
        baseUnit: true,
        kcalPer100: true,
        proteinGPer100: true,
        carbGPer100: true,
        fatGPer100: true,
        fiberGPer100: true,
        sodiumMgPer100: true,
        approvedAt: true,
        _count: { select: { unitConversions: true } },
      },
    });
    type Row = (typeof rows)[number] & { origin: FoodOrigin; normalized: string };
    const all: Row[] = rows.map((row) => ({ ...row, origin: this.originOf(professionalId, row), normalized: normalizeFoodName(row.name) }));

    const words = searchWords(query.search);
    const aliasIds = words.length > 0 ? new Set(await this.foodIdsByAlias(query.search!.trim())) : new Set<string>();
    const bySearch = words.length > 0 ? all.filter((row) => nameMatches(row.normalized, words) || aliasIds.has(row.id)) : all;

    const origin = query.origin && query.origin !== 'all' ? query.origin : null;
    const origins = {
      all: bySearch.length,
      taco: bySearch.filter((row) => row.origin === 'taco').length,
      mine: bySearch.filter((row) => row.origin === 'mine').length,
      shared: bySearch.filter((row) => row.origin === 'shared').length,
    };
    const byOrigin = origin ? bySearch.filter((row) => row.origin === origin) : bySearch;

    const groupCounts = new Map<string, number>();
    for (const row of byOrigin) if (row.foodGroup) groupCounts.set(row.foodGroup, (groupCounts.get(row.foodGroup) ?? 0) + 1);
    const groups = [...groupCounts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const withoutGroup = byOrigin.filter((row) => !row.foodGroup).length;

    const filtered = byOrigin
      .filter((row) => !query.group || (query.group === FOOD_LIBRARY_NO_GROUP ? !row.foodGroup : row.foodGroup === query.group))
      .sort((a, b) =>
        words.length > 0
          ? searchRank(a.normalized, words) - searchRank(b.normalized, words) || a.name.trim().localeCompare(b.name.trim(), 'pt-BR')
          : a.name.trim().localeCompare(b.name.trim(), 'pt-BR'),
      );
    const pageSize = Math.min(Math.max(query.pageSize ?? 40, 1), 100);
    const page = Math.max(query.page ?? 1, 1);

    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize).map((row) => ({
        id: row.id,
        name: row.name,
        origin: row.origin,
        tacoNumber: row.origin === 'taco' ? row.sourceNumber : null,
        foodGroup: row.foodGroup,
        preparation: row.preparation,
        baseUnit: row.baseUnit,
        kcalPer100: row.kcalPer100,
        proteinGPer100: row.proteinGPer100,
        carbGPer100: row.carbGPer100,
        fatGPer100: row.fatGPer100,
        fiberGPer100: row.fiberGPer100,
        sodiumMgPer100: row.sodiumMgPer100,
        householdMeasures: row._count.unitConversions,
        /** Global criado pelo profissional e ainda não aprovado pela moderação. */
        pending: row.scope === FoodScope.global && row.approvedAt === null,
        canEdit: row.origin === 'mine',
      })),
      total: filtered.length,
      page,
      pageSize,
      groups,
      withoutGroup,
      origins,
    };
  }

  /** Onde o alimento aparece: dietas e modelos deste profissional (e se pode ser excluído). */
  private async usage(professionalId: string, foodId: string) {
    const mealFoods = await this.prisma.mealFood.findMany({
      where: { foodId, meal: { dietVersion: { diet: { professionalId } } } },
      select: { meal: { select: { dietVersion: { select: { diet: { select: { clientId: true } } } } } } },
    });
    const [templates] = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM templates
      WHERE professional_id = ${professionalId} AND deleted_at IS NULL AND kind = 'diet' AND content::text LIKE ${'%' + foodId + '%'}`;
    return {
      patients: new Set(mealFoods.map((m) => m.meal.dietVersion.diet.clientId)).size,
      dietItems: mealFoods.length,
      templates: Number(templates?.count ?? 0),
    };
  }

  /** Ficha completa do alimento: macros, medidas caseiras, todos os nutrientes da TACO e onde é usado. */
  async details(professionalId: string, foodId: string) {
    const food = await this.findVisible(professionalId, foodId);
    const origin = this.originOf(professionalId, food);
    const usage = await this.usage(professionalId, foodId);
    return {
      id: food.id,
      name: food.name,
      origin,
      tacoNumber: origin === 'taco' ? food.sourceNumber : null,
      sourceEdition: origin === 'taco' ? food.sourceEdition : null,
      foodGroup: food.foodGroup,
      preparation: food.preparation,
      baseUnit: food.baseUnit,
      kcalPer100: food.kcalPer100,
      proteinGPer100: food.proteinGPer100,
      carbGPer100: food.carbGPer100,
      fatGPer100: food.fatGPer100,
      fiberGPer100: food.fiberGPer100,
      sodiumMgPer100: food.sodiumMgPer100,
      pending: food.scope === FoodScope.global && food.approvedAt === null,
      unitConversions: food.unitConversions.map((c) => ({ unit: c.unit, gramsEquivalent: c.gramsEquivalent })),
      sections: origin === 'taco' && food.sourceData ? tacoNutrientSections(food.sourceData) : ownNutrientSections(food),
      usage,
      canEdit: origin === 'mine',
      canDelete: origin === 'mine' && usage.dietItems === 0 && usage.templates === 0,
    };
  }

  /**
   * Exclui alimento cadastrado pelo próprio profissional que ainda não foi usado em lugar nenhum
   * (dieta de qualquer profissional, modelo, substituição ou lista do Bocado). TACO nunca.
   */
  async remove(professionalId: string, foodId: string) {
    const food = await this.findVisible(professionalId, foodId);
    if (this.originOf(professionalId, food) !== 'mine') {
      throw new ForbiddenException('Só dá para excluir alimento cadastrado por você.');
    }
    const [mealFoods, substitutions, aliases, mappings, [templates]] = await Promise.all([
      this.prisma.mealFood.count({ where: { foodId } }),
      this.prisma.foodSubstitution.count({ where: { OR: [{ originalFoodId: foodId }, { substituteFoodId: foodId }] } }),
      this.prisma.foodAlias.count({ where: { foodId } }),
      this.prisma.foodListMapping.count({ where: { foodId } }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM templates WHERE deleted_at IS NULL AND content::text LIKE ${'%' + foodId + '%'}`,
    ]);
    if (mealFoods > 0 || Number(templates?.count ?? 0) > 0) {
      throw new ConflictException('Este alimento já está em dieta ou modelo — não dá para excluir. Você pode continuar usando ou editar o nome.');
    }
    if (substitutions + aliases + mappings > 0) {
      throw new ConflictException('Este alimento está ligado a substituições ou à lista do Bocado — não dá para excluir.');
    }
    await this.prisma.$transaction([
      this.prisma.foodUnitConversion.deleteMany({ where: { foodId } }),
      this.prisma.food.delete({ where: { id: foodId } }),
    ]);
  }

  async createSubstitution(professionalId: string, foodId: string, dto: CreateSubstitutionDto) {
    const originalFood = await this.findVisible(professionalId, foodId);
    const substituteFood = await this.findVisible(professionalId, dto.substituteFoodId);

    const snapshot = await this.calculation.calculate(substituteFood, dto.substituteQuantity, dto.substituteUnit);
    if (!snapshot) {
      throw new BadRequestException(
        `Não há conversão confiável para a unidade "${dto.substituteUnit}" neste alimento substituto.`,
      );
    }

    return this.prisma.foodSubstitution.create({
      data: {
        originalFoodId: originalFood.id,
        substituteFoodId: substituteFood.id,
        substituteQuantity: dto.substituteQuantity,
        substituteUnit: dto.substituteUnit,
        substituteKcal: snapshot.kcal,
        substituteProteinG: snapshot.proteinG,
        substituteCarbG: snapshot.carbG,
        substituteFatG: snapshot.fatG,
        notes: dto.notes,
        createdByProfessionalId: professionalId,
      },
      include: { substituteFood: true },
    });
  }

  async listSubstitutions(professionalId: string, foodId: string) {
    await this.findVisible(professionalId, foodId);
    return this.prisma.foodSubstitution.findMany({
      where: { originalFoodId: foodId },
      include: { substituteFood: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteSubstitution(professionalId: string, foodId: string, substitutionId: string) {
    await this.findVisible(professionalId, foodId);
    const substitution = await this.prisma.foodSubstitution.findFirst({
      where: { id: substitutionId, originalFoodId: foodId },
    });
    if (!substitution) {
      throw new NotFoundException('Substituição não encontrada.');
    }
    if (substitution.createdByProfessionalId !== professionalId) {
      throw new ForbiddenException('Só quem criou a substituição pode removê-la.');
    }
    await this.prisma.foodSubstitution.delete({ where: { id: substitutionId } });
  }
}
