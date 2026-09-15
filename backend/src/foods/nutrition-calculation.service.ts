import { Injectable } from '@nestjs/common';
import { Food, NutritionUnit } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface NutritionSnapshot {
  gramsEquivalent: number;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number | null;
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

@Injectable()
export class NutritionCalculationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve quantidade+unidade para a base do alimento (g ou ml).
   * Devolve null se a unidade não é a base do alimento e não existe
   * conversão cadastrada — nunca inventa um fator.
   */
  async resolveBaseEquivalent(food: Food, quantity: number, unit: NutritionUnit): Promise<number | null> {
    if (unit === food.baseUnit) {
      return quantity;
    }
    const conversion = await this.prisma.foodUnitConversion.findUnique({
      where: { foodId_unit: { foodId: food.id, unit } },
    });
    if (!conversion) {
      return null;
    }
    return quantity * conversion.gramsEquivalent;
  }

  /**
   * Calcula os macros para uma quantidade específica de um alimento.
   * Devolve null se a unidade não puder ser resolvida (Seção 7 do desenho:
   * nunca incluir automaticamente um item sem conversão confiável).
   */
  async calculate(food: Food, quantity: number, unit: NutritionUnit): Promise<NutritionSnapshot | null> {
    const baseEquivalent = await this.resolveBaseEquivalent(food, quantity, unit);
    if (baseEquivalent == null) {
      return null;
    }
    const factor = baseEquivalent / 100;
    return {
      gramsEquivalent: round(baseEquivalent, 2),
      kcal: round(food.kcalPer100 * factor),
      proteinG: round(food.proteinGPer100 * factor),
      carbG: round(food.carbGPer100 * factor),
      fatG: round(food.fatGPer100 * factor),
      fiberG: food.fiberGPer100 != null ? round(food.fiberGPer100 * factor) : null,
    };
  }
}
