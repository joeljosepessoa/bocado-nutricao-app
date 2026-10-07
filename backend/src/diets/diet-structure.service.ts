import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DietAuditAction, MealGroupKind, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { FoodsService } from '../foods/foods.service';
import { NutritionCalculationService } from '../foods/nutrition-calculation.service';
import { DietAuditLogService } from './diet-audit-log.service';
import { DietsService, RequestMeta } from './diets.service';
import {
  CreateChoiceFoodDto,
  CreateDietDayDto,
  CreateDietSupplementDto,
  CreateMealChoiceDto,
  CreateMealGroupDto,
  UpdateDietDayDto,
  UpdateDietSupplementDto,
  UpdateMealChoiceDto,
  UpdateMealGroupDto,
} from './dto/diet-structure.dto';

export interface DraftRef {
  professionalId: string;
  clientId: string;
  dietId: string;
  versionId: string;
}

const blank = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

/**
 * Edição da estrutura nova do RASCUNHO: dias, grupos (fixo / opções completas
 * / alternativas), escolhas, itens das escolhas e suplementos. Versão
 * publicada nunca é alterada (mesma trava das demais edições).
 */
@Injectable()
export class DietStructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diets: DietsService,
    private readonly foodsService: FoodsService,
    private readonly calculation: NutritionCalculationService,
    private readonly auditLog: DietAuditLogService,
  ) {}

  private async audit(ref: DraftRef, action: DietAuditAction, meta: RequestMeta) {
    await this.auditLog.record({
      professionalId: ref.professionalId,
      clientId: ref.clientId,
      dietId: ref.dietId,
      dietVersionId: ref.versionId,
      action,
      ipAddress: meta.ipAddress,
    });
  }

  private async getDay(versionId: string, dayId: string) {
    const day = await this.prisma.dietDay.findFirst({ where: { id: dayId, dietVersionId: versionId } });
    if (!day) throw new NotFoundException('Dia da dieta não encontrado.');
    return day;
  }

  private async getMeal(versionId: string, mealId: string) {
    const meal = await this.prisma.meal.findFirst({ where: { id: mealId, dietVersionId: versionId } });
    if (!meal) throw new NotFoundException('Refeição não encontrada.');
    return meal;
  }

  private async getGroup(versionId: string, mealId: string, groupId: string) {
    await this.getMeal(versionId, mealId);
    const group = await this.prisma.mealGroup.findFirst({ where: { id: groupId, mealId }, include: { choices: true } });
    if (!group) throw new NotFoundException('Grupo da refeição não encontrado.');
    return group;
  }

  private async getChoice(versionId: string, mealId: string, groupId: string, choiceId: string) {
    const group = await this.getGroup(versionId, mealId, groupId);
    const choice = group.choices.find((c) => c.id === choiceId);
    if (!choice) throw new NotFoundException('Escolha não encontrada.');
    return { group, choice };
  }

  // --- Dias ---------------------------------------------------------------------

  async createDay(ref: DraftRef, dto: CreateDietDayDto, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    const last = await this.prisma.dietDay.findFirst({ where: { dietVersionId: ref.versionId }, orderBy: { order: 'desc' } });
    const day = await this.prisma.dietDay.create({
      data: {
        dietVersionId: ref.versionId,
        label: blank(dto.label),
        kind: dto.kind,
        usageNotes: blank(dto.usageNotes),
        order: dto.order ?? (last?.order ?? -1) + 1,
      },
    });
    await this.audit(ref, DietAuditAction.version_updated, meta);
    return day;
  }

  async updateDay(ref: DraftRef, dayId: string, dto: UpdateDietDayDto, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    await this.getDay(ref.versionId, dayId);
    const day = await this.prisma.dietDay.update({
      where: { id: dayId },
      data: {
        ...(dto.label !== undefined ? { label: blank(dto.label) } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.usageNotes !== undefined ? { usageNotes: blank(dto.usageNotes) } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
    await this.audit(ref, DietAuditAction.version_updated, meta);
    return day;
  }

  async deleteDay(ref: DraftRef, dayId: string, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    await this.getDay(ref.versionId, dayId);
    if (await this.prisma.meal.count({ where: { dietDayId: dayId } })) {
      throw new ConflictException('Remova (ou mova) as refeições deste dia antes de excluí-lo.');
    }
    await this.prisma.dietDay.delete({ where: { id: dayId } });
    await this.audit(ref, DietAuditAction.version_updated, meta);
  }

  // --- Grupos -------------------------------------------------------------------

  async createGroup(ref: DraftRef, mealId: string, dto: CreateMealGroupDto, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    await this.getMeal(ref.versionId, mealId);

    const group = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.mealGroup.findMany({ where: { mealId }, include: { choices: { include: { _count: { select: { foods: true } } } } } });
      if (existing.some((g) => g.kind === MealGroupKind.meal_options)) {
        throw new ConflictException('Esta refeição tem opções completas — ela não aceita outros grupos.');
      }
      if (dto.kind === MealGroupKind.fixed && existing.some((g) => g.kind === MealGroupKind.fixed)) {
        throw new ConflictException('Esta refeição já tem um grupo fixo.');
      }
      if (dto.kind === MealGroupKind.meal_options) {
        // Opções completas são o único grupo da refeição. Grupo fixo vazio (criado junto da refeição) é descartado.
        const withFoods = existing.filter((g) => g.kind !== MealGroupKind.fixed || g.choices.some((c) => c._count.foods > 0));
        if (withFoods.length > 0) {
          throw new ConflictException('Para usar opções completas, a refeição não pode ter outros grupos com alimentos.');
        }
        await tx.mealChoice.deleteMany({ where: { mealGroupId: { in: existing.map((g) => g.id) } } });
        await tx.mealGroup.deleteMany({ where: { id: { in: existing.map((g) => g.id) } } });
      }
      const order = dto.order ?? (existing.length && dto.kind !== MealGroupKind.meal_options ? Math.max(...existing.map((g) => g.order)) + 1 : 0);
      const created = await tx.mealGroup.create({ data: { mealId, kind: dto.kind, label: blank(dto.label), order } });
      if (dto.kind === MealGroupKind.fixed) {
        await tx.mealChoice.create({ data: { mealGroupId: created.id, order: 0 } });
      }
      return created;
    });
    await this.audit(ref, DietAuditAction.meal_updated, meta);
    return group;
  }

  async updateGroup(ref: DraftRef, mealId: string, groupId: string, dto: UpdateMealGroupDto, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    const group = await this.getGroup(ref.versionId, mealId, groupId);
    if (dto.kind !== undefined && dto.kind !== group.kind) {
      const others = await this.prisma.mealGroup.count({ where: { mealId, id: { not: groupId } } });
      if (dto.kind === MealGroupKind.meal_options && others > 0) {
        throw new ConflictException('Opções completas precisam ser o único grupo da refeição.');
      }
      if (dto.kind === MealGroupKind.fixed && group.choices.length > 1) {
        throw new ConflictException('Um grupo fixo tem uma única escolha — remova as escolhas extras antes.');
      }
    }
    const updated = await this.prisma.mealGroup.update({
      where: { id: groupId },
      data: {
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.label !== undefined ? { label: blank(dto.label) } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
    await this.audit(ref, DietAuditAction.meal_updated, meta);
    return updated;
  }

  async deleteGroup(ref: DraftRef, mealId: string, groupId: string, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    const group = await this.getGroup(ref.versionId, mealId, groupId);
    const choiceIds = group.choices.map((c) => c.id);
    await this.prisma.$transaction([
      this.prisma.mealFood.deleteMany({ where: { mealChoiceId: { in: choiceIds } } }),
      this.prisma.mealChoice.deleteMany({ where: { id: { in: choiceIds } } }),
      this.prisma.mealGroup.delete({ where: { id: groupId } }),
    ]);
    await this.audit(ref, DietAuditAction.meal_updated, meta);
  }

  // --- Escolhas -----------------------------------------------------------------

  async createChoice(ref: DraftRef, mealId: string, groupId: string, dto: CreateMealChoiceDto, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    const group = await this.getGroup(ref.versionId, mealId, groupId);
    if (group.kind === MealGroupKind.fixed && group.choices.length > 0) {
      throw new ConflictException('Um grupo fixo tem uma única escolha — use opções ou alternativas para "escolher 1".');
    }
    const choice = await this.prisma.mealChoice.create({
      data: {
        mealGroupId: groupId,
        label: blank(dto.label),
        order: dto.order ?? (group.choices.length ? Math.max(...group.choices.map((c) => c.order)) + 1 : 0),
      },
    });
    await this.audit(ref, DietAuditAction.meal_updated, meta);
    return choice;
  }

  async updateChoice(ref: DraftRef, mealId: string, groupId: string, choiceId: string, dto: UpdateMealChoiceDto, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    await this.getChoice(ref.versionId, mealId, groupId, choiceId);
    const choice = await this.prisma.mealChoice.update({
      where: { id: choiceId },
      data: {
        ...(dto.label !== undefined ? { label: blank(dto.label) } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
    await this.audit(ref, DietAuditAction.meal_updated, meta);
    return choice;
  }

  async deleteChoice(ref: DraftRef, mealId: string, groupId: string, choiceId: string, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    const { group } = await this.getChoice(ref.versionId, mealId, groupId, choiceId);
    if (group.kind === MealGroupKind.fixed) {
      throw new ConflictException('A escolha do grupo fixo não pode ser removida — remova o grupo ou os alimentos.');
    }
    await this.prisma.$transaction([
      this.prisma.mealFood.deleteMany({ where: { mealChoiceId: choiceId } }),
      this.prisma.mealChoice.delete({ where: { id: choiceId } }),
    ]);
    await this.audit(ref, DietAuditAction.meal_updated, meta);
  }

  /**
   * Item da escolha: nome escrito (customFoodName, o que o paciente vê) e/ou
   * alimento do catálogo (foodId, só para o cálculo — mesma regra da inclusão
   * manual). Sem catálogo = sem cálculo. "À vontade" e faixa de quantidade
   * ficam fora do cálculo/viram faixa — nunca valor inventado.
   */
  async addChoiceFood(ref: DraftRef, mealId: string, groupId: string, choiceId: string, dto: CreateChoiceFoodDto, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    await this.getChoice(ref.versionId, mealId, groupId, choiceId);

    const customFoodName = blank(dto.customFoodName);
    if (!dto.foodId && !customFoodName) {
      throw new BadRequestException('Informe o nome do alimento (customFoodName) e/ou um alimento do catálogo (foodId).');
    }
    const isFreeQuantity = dto.isFreeQuantity ?? false;
    if (isFreeQuantity && (dto.quantity !== undefined || dto.quantityMax !== undefined)) {
      throw new BadRequestException('Item "à vontade" não tem quantidade.');
    }
    if (dto.quantityMax !== undefined && (dto.quantity === undefined || dto.quantityMax < dto.quantity)) {
      throw new BadRequestException('A quantidade máxima precisa de uma quantidade mínima menor ou igual.');
    }

    let snapshot: Awaited<ReturnType<NutritionCalculationService['calculate']>> = null;
    if (dto.foodId) {
      const food = await this.foodsService.findVisible(ref.professionalId, dto.foodId);
      if (!isFreeQuantity && dto.quantity !== undefined && dto.unit) {
        snapshot = await this.calculation.calculate(food, dto.quantity, dto.unit);
      }
    }

    const last = await this.prisma.mealFood.findFirst({ where: { mealChoiceId: choiceId }, orderBy: { order: 'desc' } });
    const data: Prisma.MealFoodUncheckedCreateInput = {
      mealId,
      mealChoiceId: choiceId,
      foodId: dto.foodId ?? null,
      customFoodName,
      order: (last?.order ?? -1) + 1,
      quantity: dto.quantity ?? null,
      quantityMax: dto.quantityMax ?? null,
      isFreeQuantity,
      unit: dto.unit ?? null,
      gramsEquivalent: snapshot?.gramsEquivalent,
      kcal: snapshot?.kcal,
      proteinG: snapshot?.proteinG,
      carbG: snapshot?.carbG,
      fatG: snapshot?.fatG,
      fiberG: snapshot?.fiberG,
      notes: blank(dto.notes),
    };
    const mealFood = await this.prisma.mealFood.create({ data, include: { food: { select: { id: true, name: true } } } });
    await this.audit(ref, DietAuditAction.food_added, meta);
    return { ...mealFood, hasReliableConversion: snapshot != null };
  }

  // --- Suplementos ----------------------------------------------------------------

  private checkSupplementRange(quantity: number | null | undefined, quantityMax: number | null | undefined) {
    if (quantityMax != null && (quantity == null || quantityMax < quantity)) {
      throw new BadRequestException('A quantidade máxima precisa de uma quantidade mínima menor ou igual.');
    }
  }

  async createSupplement(ref: DraftRef, dto: CreateDietSupplementDto, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    this.checkSupplementRange(dto.quantity, dto.quantityMax);
    const last = await this.prisma.dietSupplement.findFirst({ where: { dietVersionId: ref.versionId }, orderBy: { order: 'desc' } });
    const supplement = await this.prisma.dietSupplement.create({
      data: {
        dietVersionId: ref.versionId,
        name: dto.name.trim(),
        quantity: dto.quantity ?? null,
        quantityMax: dto.quantityMax ?? null,
        unitText: blank(dto.unitText),
        timing: blank(dto.timing),
        notes: blank(dto.notes),
        order: dto.order ?? (last?.order ?? -1) + 1,
      },
    });
    await this.audit(ref, DietAuditAction.version_updated, meta);
    return supplement;
  }

  private async getSupplement(versionId: string, supplementId: string) {
    const supplement = await this.prisma.dietSupplement.findFirst({ where: { id: supplementId, dietVersionId: versionId } });
    if (!supplement) throw new NotFoundException('Suplemento não encontrado.');
    return supplement;
  }

  async updateSupplement(ref: DraftRef, supplementId: string, dto: UpdateDietSupplementDto, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    const existing = await this.getSupplement(ref.versionId, supplementId);
    this.checkSupplementRange(dto.quantity ?? existing.quantity, dto.quantityMax ?? existing.quantityMax);
    const supplement = await this.prisma.dietSupplement.update({
      where: { id: supplementId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.quantityMax !== undefined ? { quantityMax: dto.quantityMax } : {}),
        ...(dto.unitText !== undefined ? { unitText: blank(dto.unitText) } : {}),
        ...(dto.timing !== undefined ? { timing: blank(dto.timing) } : {}),
        ...(dto.notes !== undefined ? { notes: blank(dto.notes) } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
    await this.audit(ref, DietAuditAction.version_updated, meta);
    return supplement;
  }

  async deleteSupplement(ref: DraftRef, supplementId: string, meta: RequestMeta = {}) {
    await this.diets.assertEditableDraft(ref.professionalId, ref.clientId, ref.dietId, ref.versionId);
    await this.getSupplement(ref.versionId, supplementId);
    await this.prisma.dietSupplement.delete({ where: { id: supplementId } });
    await this.audit(ref, DietAuditAction.version_updated, meta);
  }
}
