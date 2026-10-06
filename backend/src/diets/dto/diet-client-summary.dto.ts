import { DietDayKind, MealGroupKind } from '@prisma/client';
import { buildDietTree, DayRow, flattenForLegacy, FoodRow, foodDisplayName, MealRow, NutritionRange, roundRange } from '../diet-structure';

/**
 * Subconjunto seguro de uma dieta para exposição ao próprio cliente
 * (Fase 7). Nunca notas da versão, metas internas (target*), nem versão
 * que não seja a publicada. `Meal.notes` é orientação do profissional
 * PARA o cliente (ex. "mastigar devagar") — diferente de
 * `DietVersion.notes`, que continua interno e nunca aparece aqui.
 * `patientGuidelines` é o texto de ORIENTAÇÕES escrito para o paciente.
 */
export interface SubstitutionOption {
  substituteFoodId: string;
  substituteFoodName: string;
  substituteQuantity: number;
  substituteUnit: string;
  substituteKcal: number | null;
  substituteProteinG: number | null;
  substituteCarbG: number | null;
  substituteFatG: number | null;
}

/** Formato ANTIGO (APKs já instalados): refeições achatadas com alimentos. */
export class DietClientMealFoodDto {
  foodName!: string;
  quantity!: number | null;
  unit!: string | null;
  kcal!: number | null;
  proteinG!: number | null;
  carbG!: number | null;
  fatG!: number | null;
  substitutions!: SubstitutionOption[];
}

export class DietClientMealDto {
  name!: string;
  order!: number;
  time!: string | null;
  notes!: string | null;
  foods!: DietClientMealFoodDto[];
}

/** Formato NOVO: dias → refeições → grupos (fixo / opções / alternativas) → escolhas → alimentos. */
export interface DietClientFoodItem {
  foodName: string;
  /** Item fora do catálogo — sem cálculo nutricional. */
  isCustom: boolean;
  quantity: number | null;
  quantityMax: number | null;
  isFreeQuantity: boolean;
  unit: string | null;
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  substitutions: SubstitutionOption[];
}

export interface DietClientChoice {
  label: string | null;
  order: number;
  nutrition: NutritionRange;
  foods: DietClientFoodItem[];
}

export interface DietClientGroup {
  kind: MealGroupKind;
  label: string | null;
  order: number;
  nutrition: NutritionRange;
  choices: DietClientChoice[];
}

export interface DietClientMealNode {
  name: string;
  order: number;
  time: string | null;
  notes: string | null;
  nutrition: NutritionRange;
  groups: DietClientGroup[];
}

export interface DietClientDay {
  label: string | null;
  kind: DietDayKind;
  usageNotes: string | null;
  order: number;
  nutrition: NutritionRange;
  meals: DietClientMealNode[];
}

export interface DietClientSupplement {
  name: string;
  quantity: number | null;
  quantityMax: number | null;
  unitText: string | null;
  timing: string | null;
  notes: string | null;
  order: number;
}

export class DietClientSummaryDto {
  dietId!: string;
  versionId!: string;
  /** Formato antigo, mantido para compatibilidade (opções viram refeições próprias). */
  meals!: DietClientMealDto[];
  days!: DietClientDay[];
  supplements!: DietClientSupplement[];
  patientGuidelines!: string | null;

  static fromPublishedVersion(
    version: {
      id: string;
      dietId: string;
      status: string;
      patientGuidelines?: string | null;
      supplements?: DietClientSupplement[];
      days?: DayRow[];
      meals: unknown[];
    },
    substitutionsByFoodId: Map<string, SubstitutionOption[]> = new Map(),
  ): DietClientSummaryDto | null {
    if (version.status !== 'published') {
      return null;
    }
    const tree = buildDietTree(version.days ?? [], normalizeMeals(version.meals));
    const substitutions = (food: FoodRow) => (food.foodId ? (substitutionsByFoodId.get(food.foodId) ?? []) : []);

    const dto = new DietClientSummaryDto();
    dto.dietId = version.dietId;
    dto.versionId = version.id;
    dto.meals = flattenForLegacy(tree).map((meal) => {
      const mealDto = new DietClientMealDto();
      mealDto.name = meal.name;
      mealDto.order = meal.order;
      mealDto.time = meal.time;
      mealDto.notes = meal.notes;
      mealDto.foods = meal.foods.map((f) => {
        const foodDto = new DietClientMealFoodDto();
        foodDto.foodName = f.displayName;
        foodDto.quantity = f.quantity;
        foodDto.unit = f.unit;
        foodDto.kcal = f.kcal;
        foodDto.proteinG = f.proteinG;
        foodDto.carbG = f.carbG;
        foodDto.fatG = f.fatG;
        foodDto.substitutions = substitutions(f);
        return foodDto;
      });
      return mealDto;
    });
    dto.days = tree.map((day) => ({
      label: day.label,
      kind: day.kind,
      usageNotes: day.usageNotes,
      order: day.order,
      nutrition: roundRange(day.nutrition),
      meals: day.meals.map((meal) => ({
        name: meal.name,
        order: meal.order,
        time: meal.time,
        notes: meal.notes,
        nutrition: roundRange(meal.nutrition),
        groups: meal.groups.map((group) => ({
          kind: group.kind,
          label: group.label,
          order: group.order,
          nutrition: roundRange(group.nutrition),
          choices: group.choices.map((choice) => ({
            label: choice.label,
            order: choice.order,
            nutrition: roundRange(choice.nutrition),
            foods: choice.foods.map((f) => ({
              foodName: f.food?.name ?? f.customFoodName ?? foodDisplayName(f),
              isCustom: f.foodId === null,
              quantity: f.quantity,
              quantityMax: f.quantityMax,
              isFreeQuantity: f.isFreeQuantity,
              unit: f.unit,
              kcal: f.kcal,
              proteinG: f.proteinG,
              carbG: f.carbG,
              fatG: f.fatG,
              substitutions: substitutions(f),
            })),
          })),
        })),
      })),
    }));
    dto.supplements = [...(version.supplements ?? [])]
      .sort((a, b) => a.order - b.order)
      .map(({ name, quantity, quantityMax, unitText, timing, notes, order }) => ({ name, quantity, quantityMax, unitText, timing, notes, order }));
    dto.patientGuidelines = version.patientGuidelines ?? null;
    return dto;
  }
}

/** Aceita linhas no formato antigo (sem grupos/escolhas/campos novos) — mesmo resultado de antes. */
function normalizeMeals(meals: unknown[]): MealRow[] {
  return (meals as Array<Partial<MealRow> & { foods?: Array<Partial<FoodRow>> }>).map((meal, i) => ({
    id: meal.id ?? `meal-${i}`,
    dietDayId: meal.dietDayId ?? null,
    name: meal.name ?? '',
    order: meal.order ?? i,
    time: meal.time ?? null,
    notes: meal.notes ?? null,
    groups: meal.groups ?? [],
    foods: (meal.foods ?? []).map((food, j) => ({
      id: food.id ?? `food-${i}-${j}`,
      mealId: food.mealId ?? meal.id ?? '',
      mealChoiceId: food.mealChoiceId ?? null,
      foodId: food.foodId ?? null,
      customFoodName: food.customFoodName ?? null,
      order: food.order ?? j,
      quantity: food.quantity ?? null,
      quantityMax: food.quantityMax ?? null,
      isFreeQuantity: food.isFreeQuantity ?? false,
      unit: food.unit ?? null,
      gramsEquivalent: food.gramsEquivalent ?? null,
      kcal: food.kcal ?? null,
      proteinG: food.proteinG ?? null,
      carbG: food.carbG ?? null,
      fatG: food.fatG ?? null,
      fiberG: food.fiberG ?? null,
      notes: food.notes ?? null,
      food: food.food ? { id: food.food.id ?? food.foodId ?? '', name: food.food.name } : null,
    })),
  }));
}
