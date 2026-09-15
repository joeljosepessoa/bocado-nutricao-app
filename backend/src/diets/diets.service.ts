import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DietAuditAction, DietVersionStatus, NutritionUnit } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { FoodsService } from '../foods/foods.service';
import { NutritionCalculationService } from '../foods/nutrition-calculation.service';
import { DietAuditLogService } from './diet-audit-log.service';
import { CreateDietDto } from './dto/create-diet.dto';
import { UpdateDietDto } from './dto/update-diet.dto';
import { UpdateDietVersionDto } from './dto/update-diet-version.dto';
import { CreateMealDto } from './dto/create-meal.dto';
import { UpdateMealDto } from './dto/update-meal.dto';
import { CreateMealFoodDto } from './dto/create-meal-food.dto';
import { UpdateMealFoodDto } from './dto/update-meal-food.dto';

export interface RequestMeta {
  ipAddress?: string;
}

const VERSION_DETAIL_INCLUDE = {
  meals: {
    include: {
      foods: {
        include: { food: { select: { id: true, name: true, baseUnit: true } } },
      },
    },
  },
} as const;

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

interface NutritionLike {
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

@Injectable()
export class DietsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculation: NutritionCalculationService,
    private readonly foodsService: FoodsService,
    private readonly auditLog: DietAuditLogService,
  ) {}

  private async assertOwnedClient(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, professionalId } });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado.');
    }
    return client;
  }

  private async assertOwnedDiet(professionalId: string, clientId: string, dietId: string) {
    await this.assertOwnedClient(professionalId, clientId);
    const diet = await this.prisma.diet.findFirst({ where: { id: dietId, clientId } });
    if (!diet) {
      throw new NotFoundException('Dieta não encontrada.');
    }
    return diet;
  }

  private async getVersionOrThrow(dietId: string, versionId: string) {
    const version = await this.prisma.dietVersion.findFirst({ where: { id: versionId, dietId } });
    if (!version) {
      throw new NotFoundException('Versão não encontrada.');
    }
    return version;
  }

  private sumNutrition(items: NutritionLike[]) {
    const initial = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 };
    const totals = items.reduce<typeof initial>(
      (acc, item) => ({
        kcal: acc.kcal + (item.kcal ?? 0),
        proteinG: acc.proteinG + (item.proteinG ?? 0),
        carbG: acc.carbG + (item.carbG ?? 0),
        fatG: acc.fatG + (item.fatG ?? 0),
        fiberG: acc.fiberG + (item.fiberG ?? 0),
      }),
      initial,
    );
    return {
      kcal: round(totals.kcal),
      proteinG: round(totals.proteinG),
      carbG: round(totals.carbG),
      fatG: round(totals.fatG),
      fiberG: round(totals.fiberG),
    };
  }

  private percentageDistribution(totals: { kcal: number; proteinG: number; carbG: number; fatG: number }) {
    if (totals.kcal <= 0) {
      return { proteinPercent: null, carbPercent: null, fatPercent: null };
    }
    return {
      proteinPercent: round(((totals.proteinG * 4) / totals.kcal) * 100),
      carbPercent: round(((totals.carbG * 4) / totals.kcal) * 100),
      fatPercent: round(((totals.fatG * 9) / totals.kcal) * 100),
    };
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private buildVersionDetail(version: any) {
    const meals = [...version.meals]
      .sort((a: any, b: any) => a.order - b.order)
      .map((meal: any) => {
        const foods = [...meal.foods].sort((a: any, b: any) => a.order - b.order);
        return { ...meal, foods, totals: this.sumNutrition(foods) };
      });
    const dayTotals = this.sumNutrition(meals.flatMap((m: any) => m.foods));
    return { ...version, meals, dayTotals, percentageDistribution: this.percentageDistribution(dayTotals) };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  async create(professionalId: string, clientId: string, dto: CreateDietDto, meta: RequestMeta = {}) {
    await this.assertOwnedClient(professionalId, clientId);

    const diet = await this.prisma.$transaction(async (tx) => {
      const created = await tx.diet.create({ data: { clientId, professionalId } });
      await tx.dietVersion.create({
        data: {
          dietId: created.id,
          versionNumber: 1,
          createdByProfessionalId: professionalId,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          notes: dto.notes,
          objective: dto.objective,
          targetCalories: dto.targetCalories,
          targetProteinG: dto.targetProteinG,
          targetCarbG: dto.targetCarbG,
          targetFatG: dto.targetFatG,
        },
      });
      return created;
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      dietId: diet.id,
      action: DietAuditAction.created,
      ipAddress: meta.ipAddress,
    });

    return this.findOne(professionalId, clientId, diet.id, meta, false);
  }

  async list(professionalId: string, clientId: string, page = 1, pageSize = 20, meta: RequestMeta = {}) {
    await this.assertOwnedClient(professionalId, clientId);
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 20;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.diet.findMany({
        where: { clientId },
        select: { id: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.diet.count({ where: { clientId } }),
    ]);

    return { items, total, page: safePage, pageSize: safePageSize };
  }

  async findOne(professionalId: string, clientId: string, dietId: string, meta: RequestMeta = {}, audit = true) {
    const diet = await this.assertOwnedDiet(professionalId, clientId, dietId);

    const versions = await this.prisma.dietVersion.findMany({
      where: { dietId },
      select: { id: true, versionNumber: true, status: true, publishedAt: true, supersededAt: true, createdAt: true },
      orderBy: { versionNumber: 'desc' },
    });

    const published = versions.find((v) => v.status === DietVersionStatus.published);
    const relevantVersionId = published?.id ?? versions.find((v) => v.status === DietVersionStatus.draft)?.id;

    const currentVersion = relevantVersionId
      ? await this.findVersion(professionalId, clientId, dietId, relevantVersionId, meta, false)
      : null;

    if (audit) {
      await this.auditLog.record({
        professionalId,
        clientId,
        dietId,
        action: DietAuditAction.read,
        ipAddress: meta.ipAddress,
      });
    }

    return { ...diet, versions, currentVersion };
  }

  async update(professionalId: string, clientId: string, dietId: string, dto: UpdateDietDto, meta: RequestMeta = {}) {
    await this.assertOwnedDiet(professionalId, clientId, dietId);
    await this.prisma.diet.update({ where: { id: dietId }, data: { status: dto.status } });

    await this.auditLog.record({
      professionalId,
      clientId,
      dietId,
      action: dto.status === 'archived' ? DietAuditAction.archived : DietAuditAction.updated,
      ipAddress: meta.ipAddress,
    });

    return this.findOne(professionalId, clientId, dietId, meta, false);
  }

  async listVersions(professionalId: string, clientId: string, dietId: string, meta: RequestMeta = {}) {
    await this.assertOwnedDiet(professionalId, clientId, dietId);
    await this.auditLog.record({
      professionalId,
      clientId,
      dietId,
      action: DietAuditAction.listed,
      ipAddress: meta.ipAddress,
    });
    return this.prisma.dietVersion.findMany({
      where: { dietId },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async findVersion(
    professionalId: string,
    clientId: string,
    dietId: string,
    versionId: string,
    meta: RequestMeta = {},
    audit = true,
  ) {
    await this.assertOwnedDiet(professionalId, clientId, dietId);
    const version = await this.prisma.dietVersion.findFirst({
      where: { id: versionId, dietId },
      include: VERSION_DETAIL_INCLUDE,
    });
    if (!version) {
      throw new NotFoundException('Versão não encontrada.');
    }

    if (audit) {
      await this.auditLog.record({
        professionalId,
        clientId,
        dietId,
        dietVersionId: versionId,
        action: DietAuditAction.read,
        ipAddress: meta.ipAddress,
      });
    }

    return this.buildVersionDetail(version);
  }

  async createVersion(professionalId: string, clientId: string, dietId: string, meta: RequestMeta = {}) {
    await this.assertOwnedDiet(professionalId, clientId, dietId);

    const existingDraft = await this.prisma.dietVersion.findFirst({
      where: { dietId, status: DietVersionStatus.draft },
    });
    if (existingDraft) {
      throw new ConflictException(
        `Já existe um rascunho em aberto (versão ${existingDraft.versionNumber}). Edite-o ou publique-o antes de criar outro.`,
      );
    }

    const [publishedVersion, lastVersion] = await Promise.all([
      this.prisma.dietVersion.findFirst({
        where: { dietId, status: DietVersionStatus.published },
        include: VERSION_DETAIL_INCLUDE,
      }),
      this.prisma.dietVersion.findFirst({ where: { dietId }, orderBy: { versionNumber: 'desc' } }),
    ]);

    const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1;

    const newVersion = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dietVersion.create({
        data: {
          dietId,
          versionNumber: nextVersionNumber,
          createdByProfessionalId: professionalId,
          startDate: publishedVersion?.startDate,
          endDate: publishedVersion?.endDate,
          notes: publishedVersion?.notes,
          objective: publishedVersion?.objective,
          targetCalories: publishedVersion?.targetCalories,
          targetProteinG: publishedVersion?.targetProteinG,
          targetCarbG: publishedVersion?.targetCarbG,
          targetFatG: publishedVersion?.targetFatG,
        },
      });

      if (publishedVersion) {
        for (const meal of publishedVersion.meals as any[]) {
          const clonedMeal = await tx.meal.create({
            data: {
              dietVersionId: created.id,
              name: meal.name,
              order: meal.order,
              time: meal.time,
              notes: meal.notes,
            },
          });
          for (const food of meal.foods as any[]) {
            await tx.mealFood.create({
              data: {
                mealId: clonedMeal.id,
                foodId: food.foodId,
                order: food.order,
                quantity: food.quantity,
                unit: food.unit,
                gramsEquivalent: food.gramsEquivalent,
                kcal: food.kcal,
                proteinG: food.proteinG,
                carbG: food.carbG,
                fatG: food.fatG,
                fiberG: food.fiberG,
                notes: food.notes,
              },
            });
          }
        }
      }

      return created;
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      dietId,
      dietVersionId: newVersion.id,
      action: DietAuditAction.version_created,
      ipAddress: meta.ipAddress,
    });

    return this.findVersion(professionalId, clientId, dietId, newVersion.id, meta, false);
  }

  async updateVersion(
    professionalId: string,
    clientId: string,
    dietId: string,
    versionId: string,
    dto: UpdateDietVersionDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedDiet(professionalId, clientId, dietId);
    const version = await this.getVersionOrThrow(dietId, versionId);
    if (version.status !== DietVersionStatus.draft) {
      throw new ConflictException('Só é possível editar uma versão em rascunho. Crie uma nova versão.');
    }

    await this.prisma.dietVersion.update({
      where: { id: versionId },
      data: {
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        notes: dto.notes,
        objective: dto.objective,
        targetCalories: dto.targetCalories,
        targetProteinG: dto.targetProteinG,
        targetCarbG: dto.targetCarbG,
        targetFatG: dto.targetFatG,
      },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      dietId,
      dietVersionId: versionId,
      action: DietAuditAction.version_updated,
      ipAddress: meta.ipAddress,
    });

    return this.findVersion(professionalId, clientId, dietId, versionId, meta, false);
  }

  async publishVersion(
    professionalId: string,
    clientId: string,
    dietId: string,
    versionId: string,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedDiet(professionalId, clientId, dietId);
    const version = await this.getVersionOrThrow(dietId, versionId);
    if (version.status !== DietVersionStatus.draft) {
      throw new ConflictException('Só é possível publicar uma versão em rascunho.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.dietVersion.updateMany({
        where: { dietId, status: DietVersionStatus.published },
        data: { status: DietVersionStatus.superseded, supersededAt: new Date() },
      });
      await tx.dietVersion.update({
        where: { id: versionId },
        data: { status: DietVersionStatus.published, publishedAt: new Date() },
      });
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      dietId,
      dietVersionId: versionId,
      action: DietAuditAction.published,
      ipAddress: meta.ipAddress,
    });

    return this.findVersion(professionalId, clientId, dietId, versionId, meta, false);
  }

  private async assertDraftVersion(dietId: string, versionId: string) {
    const version = await this.getVersionOrThrow(dietId, versionId);
    if (version.status !== DietVersionStatus.draft) {
      throw new ConflictException('Só é possível alterar refeições em uma versão em rascunho.');
    }
    return version;
  }

  async createMeal(
    professionalId: string,
    clientId: string,
    dietId: string,
    versionId: string,
    dto: CreateMealDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedDiet(professionalId, clientId, dietId);
    await this.assertDraftVersion(dietId, versionId);

    let order = dto.order;
    if (order == null) {
      const last = await this.prisma.meal.findFirst({ where: { dietVersionId: versionId }, orderBy: { order: 'desc' } });
      order = (last?.order ?? -1) + 1;
    }

    const meal = await this.prisma.meal.create({
      data: { dietVersionId: versionId, name: dto.name, order, time: dto.time, notes: dto.notes },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      dietId,
      dietVersionId: versionId,
      action: DietAuditAction.meal_added,
      ipAddress: meta.ipAddress,
    });

    return meal;
  }

  async updateMeal(
    professionalId: string,
    clientId: string,
    dietId: string,
    versionId: string,
    mealId: string,
    dto: UpdateMealDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedDiet(professionalId, clientId, dietId);
    await this.assertDraftVersion(dietId, versionId);
    await this.getMealOrThrow(versionId, mealId);

    const meal = await this.prisma.meal.update({
      where: { id: mealId },
      data: { name: dto.name, order: dto.order, time: dto.time, notes: dto.notes },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      dietId,
      dietVersionId: versionId,
      action: DietAuditAction.meal_updated,
      ipAddress: meta.ipAddress,
    });

    return meal;
  }

  async deleteMeal(
    professionalId: string,
    clientId: string,
    dietId: string,
    versionId: string,
    mealId: string,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedDiet(professionalId, clientId, dietId);
    await this.assertDraftVersion(dietId, versionId);
    await this.getMealOrThrow(versionId, mealId);

    await this.prisma.mealFood.deleteMany({ where: { mealId } });
    await this.prisma.meal.delete({ where: { id: mealId } });

    await this.auditLog.record({
      professionalId,
      clientId,
      dietId,
      dietVersionId: versionId,
      action: DietAuditAction.meal_removed,
      ipAddress: meta.ipAddress,
    });
  }

  private async getMealOrThrow(versionId: string, mealId: string) {
    const meal = await this.prisma.meal.findFirst({ where: { id: mealId, dietVersionId: versionId } });
    if (!meal) {
      throw new NotFoundException('Refeição não encontrada.');
    }
    return meal;
  }

  async createMealFood(
    professionalId: string,
    clientId: string,
    dietId: string,
    versionId: string,
    mealId: string,
    dto: CreateMealFoodDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedDiet(professionalId, clientId, dietId);
    await this.assertDraftVersion(dietId, versionId);
    await this.getMealOrThrow(versionId, mealId);

    const food = await this.foodsService.findVisible(professionalId, dto.foodId);
    const snapshot = await this.calculation.calculate(food, dto.quantity, dto.unit);

    const last = await this.prisma.mealFood.findFirst({ where: { mealId }, orderBy: { order: 'desc' } });
    const order = (last?.order ?? -1) + 1;

    const mealFood = await this.prisma.mealFood.create({
      data: {
        mealId,
        foodId: food.id,
        order,
        quantity: dto.quantity,
        unit: dto.unit,
        gramsEquivalent: snapshot?.gramsEquivalent,
        kcal: snapshot?.kcal,
        proteinG: snapshot?.proteinG,
        carbG: snapshot?.carbG,
        fatG: snapshot?.fatG,
        fiberG: snapshot?.fiberG,
        notes: dto.notes,
      },
      include: { food: { select: { id: true, name: true } } },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      dietId,
      dietVersionId: versionId,
      action: DietAuditAction.food_added,
      ipAddress: meta.ipAddress,
    });

    return { ...mealFood, hasReliableConversion: snapshot != null };
  }

  async updateMealFood(
    professionalId: string,
    clientId: string,
    dietId: string,
    versionId: string,
    mealId: string,
    mealFoodId: string,
    dto: UpdateMealFoodDto,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedDiet(professionalId, clientId, dietId);
    await this.assertDraftVersion(dietId, versionId);
    const existing = await this.prisma.mealFood.findFirst({ where: { id: mealFoodId, mealId } });
    if (!existing) {
      throw new NotFoundException('Item não encontrado.');
    }

    const quantity = dto.quantity ?? existing.quantity;
    const unit = dto.unit ?? existing.unit;
    const food = await this.foodsService.findVisible(professionalId, existing.foodId);
    const snapshot = await this.calculation.calculate(food, quantity, unit);

    const mealFood = await this.prisma.mealFood.update({
      where: { id: mealFoodId },
      data: {
        quantity,
        unit,
        notes: dto.notes ?? existing.notes,
        gramsEquivalent: snapshot?.gramsEquivalent ?? null,
        kcal: snapshot?.kcal ?? null,
        proteinG: snapshot?.proteinG ?? null,
        carbG: snapshot?.carbG ?? null,
        fatG: snapshot?.fatG ?? null,
        fiberG: snapshot?.fiberG ?? null,
      },
      include: { food: { select: { id: true, name: true } } },
    });

    await this.auditLog.record({
      professionalId,
      clientId,
      dietId,
      dietVersionId: versionId,
      action: DietAuditAction.food_updated,
      ipAddress: meta.ipAddress,
    });

    return { ...mealFood, hasReliableConversion: snapshot != null };
  }

  async deleteMealFood(
    professionalId: string,
    clientId: string,
    dietId: string,
    versionId: string,
    mealId: string,
    mealFoodId: string,
    meta: RequestMeta = {},
  ) {
    await this.assertOwnedDiet(professionalId, clientId, dietId);
    await this.assertDraftVersion(dietId, versionId);
    const existing = await this.prisma.mealFood.findFirst({ where: { id: mealFoodId, mealId } });
    if (!existing) {
      throw new NotFoundException('Item não encontrado.');
    }

    await this.prisma.mealFood.delete({ where: { id: mealFoodId } });

    await this.auditLog.record({
      professionalId,
      clientId,
      dietId,
      dietVersionId: versionId,
      action: DietAuditAction.food_removed,
      ipAddress: meta.ipAddress,
    });
  }
}
