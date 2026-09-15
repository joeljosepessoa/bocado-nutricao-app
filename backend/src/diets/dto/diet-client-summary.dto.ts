/**
 * Subconjunto seguro de uma dieta para eventual exposição ao próprio
 * cliente — sem rota nesta fase (Fase 7). Existe agora só para provar,
 * com teste dedicado, que o backend já sabe montar uma visão sem dado
 * interno: nunca notas do profissional, metas internas, nem versão que
 * não seja a publicada.
 */
export class DietClientMealFoodDto {
  foodName!: string;
  quantity!: number;
  unit!: string;
  kcal!: number | null;
  proteinG!: number | null;
  carbG!: number | null;
  fatG!: number | null;
}

export class DietClientMealDto {
  name!: string;
  order!: number;
  time!: string | null;
  foods!: DietClientMealFoodDto[];
}

export class DietClientSummaryDto {
  dietId!: string;
  versionId!: string;
  meals!: DietClientMealDto[];

  static fromPublishedVersion(version: {
    id: string;
    dietId: string;
    status: string;
    meals: Array<{
      name: string;
      order: number;
      time: string | null;
      foods: Array<{
        quantity: number;
        unit: string;
        kcal: number | null;
        proteinG: number | null;
        carbG: number | null;
        fatG: number | null;
        food: { name: string };
      }>;
    }>;
  }): DietClientSummaryDto | null {
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
      mealDto.foods = meal.foods.map((f) => {
        const foodDto = new DietClientMealFoodDto();
        foodDto.foodName = f.food.name;
        foodDto.quantity = f.quantity;
        foodDto.unit = f.unit;
        foodDto.kcal = f.kcal;
        foodDto.proteinG = f.proteinG;
        foodDto.carbG = f.carbG;
        foodDto.fatG = f.fatG;
        return foodDto;
      });
      return mealDto;
    });
    return dto;
  }
}
