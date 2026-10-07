import { describe, expect, it } from 'vitest';
import type { OrganizedDietProposal, ProposalDietItem } from '../../types/api';
import {
  draftProblems,
  draftToPayload,
  foodHints,
  LIVE_WARNINGS,
  linkCatalog,
  proposalToDraft,
  removeChoice,
  removeFood,
  unlinkCatalog,
  updateFood,
  withoutNotice,
  type DietDraft,
} from '../draft';

const item = (sourceText: string, rawFood: string, quantity: number | null, unit: ProposalDietItem['unit'], extra: Partial<ProposalDietItem> = {}): ProposalDietItem => ({
  sourceText,
  rawFood,
  quantity,
  quantityMax: null,
  freeQuantity: false,
  unitText: unit,
  unit,
  notes: null,
  matchStatus: 'matched',
  matchedFood: { id: `f-${rawFood}`, name: rawFood },
  candidates: [],
  warnings: [],
  ...extra,
});

const notFound = { matchStatus: 'not_found' as const, matchedFood: null, warnings: ['Alimento não identificado no catálogo — revisar.'] };
const ambiguous = (candidate: string) => ({
  matchStatus: 'ambiguous' as const,
  matchedFood: null,
  candidates: [{ id: `f-${candidate}`, name: candidate }],
  warnings: ['Alimento com mais de uma correspondência possível — escolha no catálogo.'],
});

const proposal: OrganizedDietProposal = {
  warnings: ['Trecho não organizado: "100 g feijão" — revisar.'],
  guidelines: ['Água: no mínimo 2,5 litros por dia.', 'Durma de 7 a 9 horas por noite.'],
  supplements: [{ sourceText: 'Creatina: 3 a 5 g', name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g', timing: null, notes: null, warnings: [] }],
  days: [
    {
      label: 'DIA DE TREINO',
      kind: 'training',
      usageNotes: null,
      warnings: [],
      meals: [
        {
          name: 'CAFÉ DA MANHÃ',
          time: null,
          notes: null,
          warnings: [],
          groups: [
            {
              kind: 'meal_options',
              label: null,
              choices: [
                { label: 'Opção 1', items: [item('10 g de aveia', 'aveia', 10, 'g', ambiguous('Aveia, flocos, crua')), item('2 ovos', 'ovos', 2, 'unit', notFound)] },
                { label: 'Opção 2', items: [item('20 g de aveia', 'aveia', 20, 'g', ambiguous('Aveia, flocos, crua'))] },
              ],
            },
          ],
        },
        {
          name: 'ALMOÇO',
          time: null,
          notes: null,
          warnings: [],
          groups: [
            {
              kind: 'alternatives',
              label: 'Carboidrato',
              choices: [
                { label: null, items: [item('65 g de arroz', 'Arroz', 65, 'g')] },
                { label: null, items: [item('65 g de aipim', 'aipim', 65, 'g', notFound)] },
              ],
            },
            {
              kind: 'fixed',
              label: null,
              choices: [{ label: null, items: [item('salada de folhas à vontade', 'salada de folhas', null, null, { ...notFound, freeQuantity: true }), item('3 a 5 g de azeite', 'Azeite', 3, 'g', { quantityMax: 5 })] }],
            },
          ],
        },
      ],
    },
  ],
};

const meal = (draft: DietDraft, m: number) => draft.days[0].meals[m];
const allFoods = (draft: DietDraft) => draft.days.flatMap((d) => d.meals.flatMap((x) => x.groups.flatMap((g) => g.choices.flatMap((c) => c.foods))));

describe('rascunho do Assistente de Dieta — nome igual ao texto, catálogo só para calcular', () => {
  it('cada item fica com o nome COMO ESCRITO; só liga ao catálogo quando o nome bate exatamente', () => {
    const draft = proposalToDraft(proposal);
    expect(allFoods(draft).map((f) => [f.name, f.food?.name ?? null])).toEqual([
      ['aveia', null],
      ['ovos', null],
      ['aveia', null],
      ['Arroz', 'Arroz'],
      ['aipim', null],
      ['salada de folhas', null],
      ['Azeite', 'Azeite'],
    ]);
    const [salad, oil] = meal(draft, 1).groups[1].choices[0].foods;
    expect([salad.freeQuantity, salad.quantity, salad.unit]).toEqual([true, null, null]);
    expect([oil.quantity, oil.quantityMax]).toEqual([3, 5]);
    // O aviso "não identificado" do backend não aparece: o item simplesmente fica sem cálculo.
    expect(allFoods(draft).flatMap((f) => f.notices)).toEqual([]);
    expect(draft.guidelines).toBe('Água: no mínimo 2,5 litros por dia.\nDurma de 7 a 9 horas por noite.');
    expect(draft.supplements[0]).toMatchObject({ name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g' });
  });

  it('alimento fora do catálogo NÃO impede criar; só o aviso geral precisa de revisão', () => {
    let draft = proposalToDraft(proposal);
    expect(draftProblems(draft)).toEqual(['Revise 1 aviso(s) geral(is) da organização (ex.: trecho não organizado) antes de criar.']);
    draft = { ...draft, notices: withoutNotice(draft.notices, proposal.warnings[0]) };
    expect(draftProblems(draft)).toEqual([]);
  });

  it('ligar ao catálogo vale para todos os itens com o mesmo nome escrito; desligar volta a "sem cálculo"', () => {
    let draft = proposalToDraft(proposal);
    const aveia = meal(draft, 0).groups[0].choices[0].foods[0];
    draft = linkCatalog(draft, aveia.key, { id: 'f-aveia', name: 'Aveia, flocos, crua' });
    const aveias = allFoods(draft).filter((f) => f.name === 'aveia');
    expect(aveias.map((f) => f.food?.id)).toEqual(['f-aveia', 'f-aveia']);
    // O nome exibido continua o do texto; outros alimentos não mudam.
    expect(aveias.map((f) => f.name)).toEqual(['aveia', 'aveia']);
    expect(allFoods(draft).find((f) => f.name === 'ovos')?.food).toBeNull();

    draft = updateFood(draft, aveia.key, unlinkCatalog);
    expect(allFoods(draft).filter((f) => f.name === 'aveia').map((f) => f.food?.id ?? null)).toEqual([null, 'f-aveia']);
  });

  it('item ligado ao catálogo sem quantidade/unidade só ganha observação (não bloqueia)', () => {
    let draft = proposalToDraft(proposal);
    const arroz = meal(draft, 1).groups[0].choices[0].foods[0];
    draft = updateFood(draft, arroz.key, (f) => ({ ...f, unit: null }));
    const updated = allFoods(draft).find((f) => f.key === arroz.key)!;
    expect(foodHints(updated)).toHaveLength(1);
    draft = { ...draft, notices: [] };
    expect(draftProblems(draft)).toEqual([]);
  });

  it('regras que bloqueiam: nome vazio sem catálogo, faixa invertida e bloco sem opção', () => {
    let draft = proposalToDraft(proposal);
    const [carbo, fixos] = meal(draft, 1).groups;
    draft = updateFood(draft, fixos.choices[0].foods[1].key, (f) => ({ ...f, quantityMax: 2 }));
    draft = updateFood(draft, fixos.choices[0].foods[0].key, (f) => ({ ...f, name: '  ' }));
    draft = removeChoice(removeChoice(draft, carbo.choices[0].key), carbo.choices[1].key);
    const problems = draftProblems(draft);
    expect(problems).toContain('DIA DE TREINO · Refeição 2 (ALMOÇO) — Carboidrato: Bloco "escolha 1" sem nenhuma opção.');
    expect(problems.some((p) => p.endsWith(LIVE_WARNINGS.rangeInvalid))).toBe(true);
    expect(problems.some((p) => p.endsWith(LIVE_WARNINGS.nameBlank))).toBe(true);
  });

  it('o payload leva o nome escrito (sempre) e o catálogo (quando ligado), suplementos e orientações — sem publicar', () => {
    let draft = proposalToDraft(proposal);
    draft = { ...draft, days: [{ ...draft.days[0], meals: [draft.days[0].meals[1]] }], notices: [] };
    const carbo = meal(draft, 0).groups[0];
    draft = removeFood(draft, carbo.choices[1].foods[0].key);
    draft = removeChoice(draft, carbo.choices[1].key);
    expect(draftToPayload(draft)).toEqual({
      days: [
        {
          label: 'DIA DE TREINO',
          kind: 'training',
          usageNotes: null,
          meals: [
            {
              name: 'ALMOÇO',
              time: null,
              notes: null,
              groups: [
                { kind: 'alternatives', label: 'Carboidrato', choices: [{ label: null, foods: [{ customFoodName: 'Arroz', foodId: 'f-Arroz', quantity: 65, unit: 'g', notes: null }] }] },
                {
                  kind: 'fixed',
                  label: null,
                  choices: [
                    {
                      label: null,
                      foods: [
                        { customFoodName: 'salada de folhas', isFreeQuantity: true, notes: null },
                        { customFoodName: 'Azeite', foodId: 'f-Azeite', quantity: 3, quantityMax: 5, unit: 'g', notes: null },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      supplements: [{ name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g', timing: null, notes: null }],
      patientGuidelines: 'Água: no mínimo 2,5 litros por dia.\nDurma de 7 a 9 horas por noite.',
    });
    expect(draftToPayload(draft, true).replaceDraft).toBe(true);
    expect(JSON.stringify(draftToPayload(draft))).not.toMatch(/publish/);
  });
});
