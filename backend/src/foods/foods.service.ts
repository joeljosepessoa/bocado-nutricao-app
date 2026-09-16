import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DietVersionStatus, Food, FoodScope, Role } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { NutritionCalculationService } from './nutrition-calculation.service';
import { CreateFoodDto } from './dto/create-food.dto';
import { UpdateFoodDto } from './dto/update-food.dto';
import { CreateSubstitutionDto } from './dto/create-substitution.dto';

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
        createdByProfessionalId: professionalId,
        unitConversions: dto.unitConversions
          ? { createMany: { data: dto.unitConversions } }
          : undefined,
      },
      include: FOOD_INCLUDE,
    });
    return food;
  }

  async list(professionalId: string, search?: string) {
    return this.prisma.food.findMany({
      where: {
        ...this.visibilityFilter(professionalId),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: FOOD_INCLUDE,
      orderBy: { name: 'asc' },
      take: 100,
    });
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
