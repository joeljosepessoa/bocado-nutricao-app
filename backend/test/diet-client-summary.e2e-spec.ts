import { DietClientSummaryDto, SubstitutionOption } from '../src/diets/dto/diet-client-summary.dto';

// Teste unitário puro (sem app Nest, sem banco) — prova que o mapper só
// serializa dado da versão publicada e nunca campo interno do profissional
// (DietVersion.notes, metas), mas expõe o que É destinado ao cliente
// (Meal.notes, substituições).
describe('DietClientSummaryDto', () => {
  const fullVersion = {
    id: 'v-1',
    dietId: 'diet-1',
    status: 'published',
    notes: 'Ajustar conforme evolução — nota interna do profissional',
    targetCalories: 1800,
    meals: [
      {
        name: 'Almoço',
        order: 0,
        time: '12:00',
        notes: 'Mastigar devagar',
        foods: [
          {
            foodId: 'food-arroz',
            quantity: 150,
            unit: 'g',
            kcal: 195,
            proteinG: 4.1,
            carbG: 42.3,
            fatG: 0.5,
            food: { name: 'Arroz branco cozido' },
          },
        ],
      },
    ],
  };

  const substitutions = new Map<string, SubstitutionOption[]>([
    [
      'food-arroz',
      [
        {
          substituteFoodId: 'food-batata',
          substituteFoodName: 'Batata doce cozida',
          substituteQuantity: 130,
          substituteUnit: 'g',
          substituteKcal: 104,
          substituteProteinG: 2.1,
          substituteCarbG: 23.9,
          substituteFatG: 0.1,
        },
      ],
    ],
  ]);

  it('expõe refeições, alimentos, observação da refeição e substituições — nunca notas/metas da versão', () => {
    const dto = DietClientSummaryDto.fromPublishedVersion(fullVersion as never, substitutions)!;

    expect(dto.dietId).toBe('diet-1');
    expect(dto.meals[0].name).toBe('Almoço');
    expect(dto.meals[0].notes).toBe('Mastigar devagar');
    expect(dto.meals[0].foods[0].foodName).toBe('Arroz branco cozido');
    expect(dto.meals[0].foods[0].substitutions).toEqual([
      expect.objectContaining({ substituteFoodName: 'Batata doce cozida', substituteKcal: 104 }),
    ]);

    const keys = Object.keys(dto);
    expect(keys).not.toContain('notes');
    expect(keys).not.toContain('targetCalories');
  });

  it('alimento sem substituição cadastrada devolve lista vazia, não erro', () => {
    const dto = DietClientSummaryDto.fromPublishedVersion(fullVersion as never)!;
    expect(dto.meals[0].foods[0].substitutions).toEqual([]);
  });

  it('devolve null para versão não publicada (draft ou superseded)', () => {
    expect(DietClientSummaryDto.fromPublishedVersion({ ...fullVersion, status: 'draft' } as never)).toBeNull();
    expect(DietClientSummaryDto.fromPublishedVersion({ ...fullVersion, status: 'superseded' } as never)).toBeNull();
  });
});
