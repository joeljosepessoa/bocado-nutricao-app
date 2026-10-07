import { DietDayKind, MealGroupKind, Prisma } from '@prisma/client';
import type { ProposalChoiceFoodDto, ProposalDayDto, ProposalSupplementDto } from './dto/create-diet-from-proposal.dto';

type Tx = Prisma.TransactionClient;

interface Snapshot {
  gramsEquivalent: number | null;
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

const blank = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

/**
 * Regras da estrutura de uma proposta revisada (mesmas do editor e da
 * publicação): opções completas são o único grupo da refeição, itens fixos
 * formam uma lista só, toda escolha tem alimento, item tem nome escrito
 * e/ou catálogo, "à vontade" não tem quantidade e a faixa é válida.
 */
export function proposalStructureProblems(days: ProposalDayDto[], supplements: ProposalSupplementDto[]): string[] {
  const problems: string[] = [];
  days.forEach((day, d) => {
    day.meals.forEach((meal, m) => {
      const where = `${day.label ? `${day.label} · ` : days.length > 1 ? `Dia ${d + 1} · ` : ''}${meal.name || `Refeição ${m + 1}`}`;
      if (meal.groups.length === 0) problems.push(`${where}: refeição sem alimentos.`);
      if (meal.groups.some((g) => g.kind === MealGroupKind.meal_options) && meal.groups.length > 1) {
        problems.push(`${where}: refeição com opções completas não pode ter outros grupos.`);
      }
      if (meal.groups.filter((g) => g.kind === MealGroupKind.fixed).length > 1) problems.push(`${where}: só pode haver um grupo de itens fixos.`);
      for (const group of meal.groups) {
        if (group.kind === MealGroupKind.fixed && group.choices.length !== 1) problems.push(`${where}: itens fixos devem formar uma única lista.`);
        if (group.kind !== MealGroupKind.fixed && group.choices.length === 0) problems.push(`${where}: grupo "escolher 1" sem nenhuma opção.`);
        group.choices.forEach((choice, c) => {
          if (choice.foods.length === 0) problems.push(`${where}: ${choice.label || `escolha ${c + 1}`} sem alimentos.`);
          for (const food of choice.foods) {
            const name = food.customFoodName?.trim() || 'alimento';
            if (!food.foodId && !food.customFoodName?.trim()) problems.push(`${where}: item sem nome e sem alimento do catálogo.`);
            if (food.isFreeQuantity && (food.quantity != null || food.quantityMax != null)) problems.push(`${where}: ${name} "à vontade" não tem quantidade.`);
            if (food.quantityMax != null && (food.quantity == null || food.quantityMax < food.quantity)) {
              problems.push(`${where}: ${name} com quantidade máxima menor que a mínima.`);
            }
          }
        });
      }
    });
  });
  supplements.forEach((s) => {
    if (s.quantityMax != null && (s.quantity == null || s.quantityMax < s.quantity)) problems.push(`Suplemento ${s.name}: quantidade máxima menor que a mínima.`);
  });
  return [...new Set(problems)];
}

/** Grava a árvore da proposta no RASCUNHO (já vazio): dias, refeições, grupos, escolhas e itens. */
export async function writeProposalContent(
  tx: Tx,
  dietVersionId: string,
  days: ProposalDayDto[],
  snapshotOf: (item: ProposalChoiceFoodDto) => Snapshot | null,
): Promise<void> {
  for (const [d, day] of days.entries()) {
    const createdDay = await tx.dietDay.create({
      data: { dietVersionId, label: blank(day.label), kind: day.kind ?? DietDayKind.other, usageNotes: blank(day.usageNotes), order: d },
    });
    for (const [m, meal] of day.meals.entries()) {
      const createdMeal = await tx.meal.create({
        data: { dietVersionId, dietDayId: createdDay.id, name: meal.name.trim(), order: m, time: meal.time ?? null, notes: blank(meal.notes) },
      });
      for (const [g, group] of meal.groups.entries()) {
        const createdGroup = await tx.mealGroup.create({ data: { mealId: createdMeal.id, kind: group.kind, label: blank(group.label), order: g } });
        for (const [c, choice] of group.choices.entries()) {
          const createdChoice = await tx.mealChoice.create({ data: { mealGroupId: createdGroup.id, label: blank(choice.label), order: c } });
          await tx.mealFood.createMany({
            data: choice.foods.map((item, f) => {
              const snapshot = snapshotOf(item);
              const free = item.isFreeQuantity ?? false;
              return {
                mealId: createdMeal.id,
                mealChoiceId: createdChoice.id,
                foodId: item.foodId ?? null,
                customFoodName: blank(item.customFoodName),
                order: f,
                quantity: free ? null : (item.quantity ?? null),
                quantityMax: free ? null : (item.quantityMax ?? null),
                isFreeQuantity: free,
                unit: free ? null : (item.unit ?? null),
                gramsEquivalent: snapshot?.gramsEquivalent ?? null,
                kcal: snapshot?.kcal ?? null,
                proteinG: snapshot?.proteinG ?? null,
                carbG: snapshot?.carbG ?? null,
                fatG: snapshot?.fatG ?? null,
                fiberG: snapshot?.fiberG ?? null,
                notes: blank(item.notes),
              };
            }),
          });
        }
      }
    }
  }
}
