import { describe, expect, it } from 'vitest';
import type { OrganizedDietProposal } from '../../types/api';
import { draftProblems, draftToPayload, LIVE_WARNINGS, proposalToDraft, removeFood, selectFood, updateFood, withoutNotice } from '../draft';

const proposal: OrganizedDietProposal = {
  warnings: ['Trecho não organizado: "100 g feijão" — revisar.'],
  meals: [
    {
      name: 'CAFÉ DA MANHÃ',
      time: null,
      notes: null,
      warnings: [],
      items: [
        {
          sourceText: '2 fatias de pão integral',
          rawFood: 'Pão integral',
          quantity: 2,
          unitText: 'fatias',
          unit: 'slice',
          notes: null,
          matchStatus: 'matched',
          matchedFood: { id: 'f5', name: 'Pão integral' },
          candidates: [],
          warnings: [],
        },
        {
          sourceText: '150 g de fruta',
          rawFood: 'Fruta',
          quantity: 150,
          unitText: 'g',
          unit: 'g',
          notes: null,
          matchStatus: 'not_found',
          matchedFood: null,
          candidates: [],
          warnings: ['Alimento não identificado no catálogo — revisar.'],
        },
      ],
    },
  ],
};

describe('rascunho do Assistente de Dieta', () => {
  it('preserva exatamente quantidades, unidades e o texto de origem da proposta', () => {
    const draft = proposalToDraft(proposal);
    const [bread, fruit] = draft.meals[0].foods;
    expect([bread.quantity, bread.unit, bread.sourceText]).toEqual([2, 'slice', '2 fatias de pão integral']);
    expect([fruit.quantity, fruit.unit, fruit.food]).toEqual([150, 'g', null]);
    // O aviso do backend que vira aviso "vivo" não é duplicado como observação.
    expect(fruit.notices).toEqual([]);
  });

  it('não deixa criar enquanto houver alimento sem catálogo ou aviso geral sem revisão', () => {
    let draft = proposalToDraft(proposal);
    const problems = draftProblems(draft);
    expect(problems.some((p) => p.includes('aviso(s) geral(is)'))).toBe(true);
    expect(problems.some((p) => p.endsWith(LIVE_WARNINGS.foodNotSelected))).toBe(true);

    const meal = draft.meals[0];
    draft = updateFood(draft, meal.key, meal.foods[1].key, (food) => selectFood(food, { id: 'f9', name: 'Mamão' }));
    draft = { ...draft, notices: withoutNotice(draft.notices, proposal.warnings[0]) };
    expect(draftProblems(draft)).toEqual([]);
  });

  it('o payload leva só o que o profissional revisou — sem publicar e sem substituir rascunho sem confirmação', () => {
    let draft = proposalToDraft(proposal);
    const meal = draft.meals[0];
    draft = removeFood(draft, meal.key, meal.foods[1].key);
    draft = { ...draft, notices: [] };
    expect(draftToPayload(draft)).toEqual({
      meals: [{ name: 'CAFÉ DA MANHÃ', time: null, notes: null, foods: [{ foodId: 'f5', quantity: 2, unit: 'slice', notes: null }] }],
    });
    expect(draftToPayload(draft, true).replaceDraft).toBe(true);
    expect(JSON.stringify(draftToPayload(draft))).not.toMatch(/publish/);
  });
});
