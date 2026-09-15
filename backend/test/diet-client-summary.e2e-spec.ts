import { DietClientSummaryDto } from '../src/diets/dto/diet-client-summary.dto';

// Teste unitário puro (sem app Nest, sem banco) — prova que o mapper só
// serializa dado da versão publicada e nunca campo interno do profissional.
describe('DietClientSummaryDto', () => {
  const fullVersion = {
    id: 'v-1',
    dietId: 'diet-1',
    status: 'published',
    notes: 'Nota clínica confidencial',
    targetCalories: 1800,
    meals: [
      {
        name: 'Almoço',
        order: 0,
        time: '12:00',
        notes: 'Observação interna do profissional',
        foods: [
          {
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

  it('expõe refeições e alimentos, mas nunca notas ou metas internas', () => {
    const dto = DietClientSummaryDto.fromPublishedVersion(fullVersion as never)!;

    expect(dto.dietId).toBe('diet-1');
    expect(dto.meals[0].name).toBe('Almoço');
    expect(dto.meals[0].foods[0]).toEqual({
      foodName: 'Arroz branco cozido',
      quantity: 150,
      unit: 'g',
      kcal: 195,
      proteinG: 4.1,
      carbG: 42.3,
      fatG: 0.5,
    });

    const keys = Object.keys(dto);
    expect(keys).not.toContain('notes');
    expect(keys).not.toContain('targetCalories');
    expect((dto.meals[0] as unknown as Record<string, unknown>).notes).toBeUndefined();
  });

  it('devolve null para versão não publicada (draft ou superseded)', () => {
    expect(DietClientSummaryDto.fromPublishedVersion({ ...fullVersion, status: 'draft' } as never)).toBeNull();
    expect(DietClientSummaryDto.fromPublishedVersion({ ...fullVersion, status: 'superseded' } as never)).toBeNull();
  });
});
