import { Injectable } from '@nestjs/common';
import { Food, NutritionUnit } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Macro null = o alimento não tem número para ele (catálogo oficial com
 * marcador da TACO: Tr, NA, *, não analisado). Nunca vira 0.
 */
export interface NutritionSnapshot {
  gramsEquivalent: number;
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const scaled = (per100: number | null, factor: number) => (per100 != null ? round(per100 * factor) : null);

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
      kcal: scaled(food.kcalPer100, factor),
      proteinG: scaled(food.proteinGPer100, factor),
      carbG: scaled(food.carbGPer100, factor),
      fatG: scaled(food.fatGPer100, factor),
      fiberG: scaled(food.fiberGPer100, factor),
    };
  }
}
