import { ConflictException } from '@nestjs/common';
import { DietDayKind, MealGroupKind, Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Escritas que mantêm a árvore DietDay → Meal → MealGroup → MealChoice →
 * MealFood consistente. Usadas tanto pelos caminhos antigos (criar refeição,
 * incluir alimento, copiar versão) quanto pelos novos.
 */

/** Primeiro dia da versão (cria o dia único se ainda não houver). */
export async function ensureDefaultDay(tx: Tx, dietVersionId: string): Promise<string> {
  const day = await tx.dietDay.findFirst({ where: { dietVersionId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  if (day) return day.id;
  const created = await tx.dietDay.create({ data: { dietVersionId, label: null, kind: DietDayKind.other, order: 0 } });
  return created.id;
}

/** Refeição nova já com o grupo fixo e a escolha única (onde os alimentos "normais" entram). */
export async function createMealWithFixedGroup(
  tx: Tx,
  data: { dietVersionId: string; dietDayId: string; name: string; order: number; time?: string | null; notes?: string | null },
) {
  const meal = await tx.meal.create({
    data: { dietVersionId: data.dietVersionId, dietDayId: data.dietDayId, name: data.name, order: data.order, time: data.time ?? null, notes: data.notes ?? null },
  });
  const group = await tx.mealGroup.create({ data: { mealId: meal.id, kind: MealGroupKind.fixed, order: 0 } });
  const choice = await tx.mealChoice.create({ data: { mealGroupId: group.id, order: 0 } });
  return { meal, choiceId: choice.id };
}

/**
 * Escolha do grupo fixo da refeição — destino do endpoint antigo "incluir
 * alimento na refeição". Refeição de opções completas não tem grupo fixo:
 * o alimento precisa ir para uma opção específica.
 */
export async function fixedChoiceForMeal(tx: Tx, mealId: string): Promise<string> {
  const groups = await tx.mealGroup.findMany({ where: { mealId }, orderBy: { order: 'asc' }, include: { choices: { orderBy: { order: 'asc' } } } });
  if (groups.some((g) => g.kind === MealGroupKind.meal_options)) {
    throw new ConflictException('Esta refeição tem opções completas — inclua o alimento em uma das opções.');
  }
  const fixed = groups.find((g) => g.kind === MealGroupKind.fixed);
  if (fixed?.choices[0]) return fixed.choices[0].id;
  const group = fixed ?? (await tx.mealGroup.create({ data: { mealId, kind: MealGroupKind.fixed, order: (groups.at(-1)?.order ?? -1) + 1 } }));
  const choice = await tx.mealChoice.create({ data: { mealGroupId: group.id, order: 0 } });
  return choice.id;
}

/** Remove a refeição de um RASCUNHO com tudo o que está dentro dela. */
export async function deleteMealCascade(tx: Tx, mealId: string): Promise<void> {
  const groups = await tx.mealGroup.findMany({ where: { mealId }, select: { id: true } });
  await tx.mealFood.deleteMany({ where: { mealId } });
  await tx.mealChoice.deleteMany({ where: { mealGroupId: { in: groups.map((g) => g.id) } } });
  await tx.mealGroup.deleteMany({ where: { mealId } });
  await tx.meal.delete({ where: { id: mealId } });
}

/** Esvazia o conteúdo de um RASCUNHO (refeições e dias); suplementos e orientações ficam. */
export async function clearDraftMeals(tx: Tx, dietVersionId: string): Promise<void> {
  const meals = await tx.meal.findMany({ where: { dietVersionId }, select: { id: true } });
  for (const meal of meals) await deleteMealCascade(tx, meal.id);
  await tx.dietDay.deleteMany({ where: { dietVersionId } });
}

/**
 * Cópia PROFUNDA de uma versão para outra (nova versão em rascunho): dias,
 * refeições, grupos, escolhas, itens (com o snapshot nutricional como
 * estava) e suplementos. Dado ainda não convertido (refeição sem dia, item
 * sem escolha) é colocado no dia único / grupo fixo, como é lido.
 */
export async function cloneVersionContent(tx: Tx, fromVersionId: string, toVersionId: string): Promise<void> {
  const [days, meals, supplements] = await Promise.all([
    tx.dietDay.findMany({ where: { dietVersionId: fromVersionId }, orderBy: { order: 'asc' } }),
    tx.meal.findMany({
      where: { dietVersionId: fromVersionId },
      orderBy: { order: 'asc' },
      include: { foods: { orderBy: { order: 'asc' } }, groups: { orderBy: { order: 'asc' }, include: { choices: { orderBy: { order: 'asc' } } } } },
    }),
    tx.dietSupplement.findMany({ where: { dietVersionId: fromVersionId }, orderBy: { order: 'asc' } }),
  ]);

  const dayMap = new Map<string, string>();
  for (const day of days) {
    const created = await tx.dietDay.create({
      data: { dietVersionId: toVersionId, label: day.label, kind: day.kind, usageNotes: day.usageNotes, order: day.order },
    });
    dayMap.set(day.id, created.id);
  }
  let defaultDayId: string | null = days.length > 0 ? dayMap.get(days[0].id)! : null;

  for (const meal of meals) {
    let dietDayId = meal.dietDayId ? dayMap.get(meal.dietDayId) : undefined;
    if (!dietDayId) {
      defaultDayId ??= (await tx.dietDay.create({ data: { dietVersionId: toVersionId, kind: DietDayKind.other, order: 0 } })).id;
      dietDayId = defaultDayId;
    }
    const newMeal = await tx.meal.create({
      data: { dietVersionId: toVersionId, dietDayId, name: meal.name, order: meal.order, time: meal.time, notes: meal.notes },
    });

    const choiceMap = new Map<string, string>();
    let fixedChoiceId: string | null = null;
    for (const group of meal.groups) {
      const newGroup = await tx.mealGroup.create({ data: { mealId: newMeal.id, kind: group.kind, label: group.label, order: group.order } });
      for (const choice of group.choices) {
        const newChoice = await tx.mealChoice.create({ data: { mealGroupId: newGroup.id, label: choice.label, order: choice.order } });
        choiceMap.set(choice.id, newChoice.id);
        if (group.kind === MealGroupKind.fixed && !fixedChoiceId) fixedChoiceId = newChoice.id;
      }
    }

    for (const food of meal.foods) {
      let mealChoiceId = food.mealChoiceId ? choiceMap.get(food.mealChoiceId) : undefined;
      if (!mealChoiceId) {
        if (!fixedChoiceId) {
          const group = await tx.mealGroup.create({ data: { mealId: newMeal.id, kind: MealGroupKind.fixed, order: -1 } });
          fixedChoiceId = (await tx.mealChoice.create({ data: { mealGroupId: group.id, order: 0 } })).id;
        }
        mealChoiceId = fixedChoiceId;
      }
      await tx.mealFood.create({
        data: {
          mealId: newMeal.id,
          mealChoiceId,
          foodId: food.foodId,
          customFoodName: food.customFoodName,
          order: food.order,
          quantity: food.quantity,
          quantityMax: food.quantityMax,
          isFreeQuantity: food.isFreeQuantity,
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

  for (const s of supplements) {
    await tx.dietSupplement.create({
      data: {
        dietVersionId: toVersionId,
        name: s.name,
        quantity: s.quantity,
        quantityMax: s.quantityMax,
        unitText: s.unitText,
        timing: s.timing,
        notes: s.notes,
        order: s.order,
      },
    });
  }
}
