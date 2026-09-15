/**
 * Subconjunto seguro de uma dieta para exposição ao próprio cliente
 * (Fase 7). Nunca notas da versão, metas internas (target*), nem versão
 * que não seja a publicada. `Meal.notes` é orientação do profissional
 * PARA o cliente (ex. "mastigar devagar") — diferente de
 * `DietVersion.notes`, que continua interno e nunca aparece aqui.
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

export class DietClientMealFoodDto {
  foodName!: string;
  quantity!: number;
  unit!: string;
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

export class DietClientSummaryDto {
  dietId!: string;
  versionId!: string;
  meals!: DietClientMealDto[];

  static fromPublishedVersion(
    version: {
      id: string;
      dietId: string;
      status: string;
      meals: Array<{
        name: string;
        order: number;
        time: string | null;
        notes: string | null;
        foods: Array<{
          foodId: string;
          quantity: number;
          unit: string;
          kcal: number | null;
          proteinG: number | null;
          carbG: number | null;
          fatG: number | null;
          food: { name: string };
        }>;
      }>;
    },
    substitutionsByFoodId: Map<string, SubstitutionOption[]> = new Map(),
  ): DietClientSummaryDto | null {
    if (version.status !== 'published') {
      return null;
    }
    const dto = new DietClientSummaryDto();
    dto.dietId = version.dietId;
    dto.versionId = version.id;
    dto.meals = version.meals.map((meal) => {
      const mealDto = new DietClientMealDto();
      mealDto.name = meal.name;
      mealDto.order = meal.order;
      mealDto.time = meal.time;
      mealDto.notes = meal.notes;
      mealDto.foods = meal.foods.map((f) => {
        const foodDto = new DietClientMealFoodDto();
        foodDto.foodName = f.food.name;
        foodDto.quantity = f.quantity;
        foodDto.unit = f.unit;
        foodDto.kcal = f.kcal;
        foodDto.proteinG = f.proteinG;
        foodDto.carbG = f.carbG;
        foodDto.fatG = f.fatG;
        foodDto.substitutions = substitutionsByFoodId.get(f.foodId) ?? [];
        return foodDto;
      });
      return mealDto;
    });
    return dto;
  }
}
