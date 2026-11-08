import type { AiDietItem, AiGroup, AiMeal, AiOrganizedDiet } from '../../src/ai/use-cases/organize-diet/organized-diet.schema';
import { it_ } from './user-example-diet';

/**
 * Quinta dieta real (colada no painel em 08/11/2026): opções com "Fruta (150 g) + 20 g de whey protein",
 * "1 copo de Danone Pense Zero", "1 torrada (ou 1 fatia de pão)", blocos "Proteína/Carboidrato — escolha
 * 1 opção:" no almoço e no jantar com pesos diferentes, "Fixos:" numa linha só e suplementos com
 * "dose conforme embalagem".
 */
export const PENSE_ZERO_DIET = `Café da Manhã — escolha 1 opção:

Fruta (150 g) + 20 g de whey protein
1 fatia de pão + 1 fatia de queijo + 1 fatia de peito de peru
1 copo de Danone Pense Zero + 20 g de whey protein

Almoço

Proteína — escolha 1 opção:

Frango grelhado — 95 g
Carne magra grelhada (patinho ou alcatra) — 95 g
Lombo de porco grelhado — 105 g
Peixe grelhado — 120 g

Carboidrato — escolha 1 opção:

Arroz cozido — 100 g
Batata-doce cozida — 135 g
Batata inglesa cozida — 145 g
Aipim (mandioca) cozido — 105 g

Fixos: salada à vontade + legumes à vontade + azeite (5 g)

Lanche da Tarde — escolha 1 opção:

Fruta (150 g) + 20 g de amêndoas + 20 g de whey protein
1 copo de Danone Pense Zero + 20 g de amêndoas + 20 g de whey protein
1 torrada (ou 1 fatia de pão) + 1 fatia de queijo + 1 fatia de peito de peru

Jantar

Proteína — escolha 1 opção:

Frango grelhado — 85 g
Carne magra grelhada (patinho ou alcatra) — 85 g
Lombo de porco grelhado — 95 g
Peixe grelhado — 105 g

Carboidrato — escolha 1 opção:

Arroz cozido — 70 g
Batata-doce cozida — 95 g

Fixos: salada à vontade + legumes à vontade + azeite (5 g)

Suplementação

Manhã (após o café da manhã): Multivitamínico (Belt 23 Bariatric Plus) + NAC — dose conforme embalagem.
Almoço: Ômega-3 — dose conforme embalagem, junto da refeição.`;

const dash = (food: string, quantity: number) => it_(`${food} — ${quantity} g`, food, quantity, 'g');
const whey = () => it_('20 g de whey protein', 'whey protein', 20, 'g');
const almonds = () => it_('20 g de amêndoas', 'amêndoas', 20, 'g');
const fruit = () => it_('Fruta (150 g)', 'Fruta', 150, 'g');
const pense = () => it_('1 copo de Danone Pense Zero', 'Danone Pense Zero', 1, 'copo');
const slice = (food: string) => it_(`1 fatia de ${food}`, food, 1, 'fatia');
const options = (choices: AiDietItem[][]): AiGroup => ({
  kind: 'meal_options',
  label: null,
  choices: choices.map((items, i) => ({ label: `Opção ${i + 1}`, items })),
});
const alternatives = (label: string, choices: AiDietItem[][]): AiGroup => ({
  kind: 'alternatives',
  label,
  choices: choices.map((items, i) => ({ label: `Opção ${i + 1}`, items })),
});
const fixed = (): AiGroup => ({
  kind: 'fixed',
  label: 'Fixos',
  choices: [
    {
      label: null,
      items: [
        it_('salada à vontade', 'salada', null, null, { freeQuantity: true }),
        it_('legumes à vontade', 'legumes', null, null, { freeQuantity: true }),
        it_('azeite (5 g)', 'azeite', 5, 'g'),
      ],
    },
  ],
});
const meal = (name: string, groups: AiGroup[]): AiMeal => ({ name, time: null, notes: null, groups });

/** Organização FIEL, como a IA a devolve. */
export function faithfulPenseZeroDiet(): AiOrganizedDiet {
  return {
    days: [
      {
        label: null,
        kind: 'other',
        usageNotes: null,
        meals: [
          meal('Café da Manhã', [
            options([
              [fruit(), whey()],
              [it_('1 fatia de pão', 'pão', 1, 'fatia'), slice('queijo'), slice('peito de peru')],
              [pense(), whey()],
            ]),
          ]),
          meal('Almoço', [
            alternatives('Proteína', [
              [dash('Frango grelhado', 95)],
              [it_('Carne magra grelhada (patinho ou alcatra) — 95 g', 'Carne magra grelhada', 95, 'g', { notes: 'patinho ou alcatra' })],
              [dash('Lombo de porco grelhado', 105)],
              [dash('Peixe grelhado', 120)],
            ]),
            alternatives('Carboidrato', [
              [dash('Arroz cozido', 100)],
              [dash('Batata-doce cozida', 135)],
              [dash('Batata inglesa cozida', 145)],
              [it_('Aipim (mandioca) cozido — 105 g', 'Aipim (mandioca) cozido', 105, 'g')],
            ]),
            fixed(),
          ]),
          meal('Lanche da Tarde', [
            options([
              [fruit(), almonds(), whey()],
              [pense(), almonds(), whey()],
              [it_('1 torrada (ou 1 fatia de pão)', 'torrada', 1, null, { notes: 'ou 1 fatia de pão' }), slice('queijo'), slice('peito de peru')],
            ]),
          ]),
          meal('Jantar', [
            alternatives('Proteína', [
              [dash('Frango grelhado', 85)],
              [it_('Carne magra grelhada (patinho ou alcatra) — 85 g', 'Carne magra grelhada', 85, 'g', { notes: 'patinho ou alcatra' })],
              [dash('Lombo de porco grelhado', 95)],
              [dash('Peixe grelhado', 105)],
            ]),
            alternatives('Carboidrato', [
              [dash('Arroz cozido', 70)],
              [dash('Batata-doce cozida', 95)],
            ]),
            fixed(),
          ]),
        ],
      },
    ],
    supplements: [
      {
        sourceText: 'Multivitamínico (Belt 23 Bariatric Plus)',
        name: 'Multivitamínico (Belt 23 Bariatric Plus)',
        quantity: null,
        quantityMax: null,
        unit: null,
        timing: 'Manhã (após o café da manhã)',
        notes: 'dose conforme embalagem',
      },
      { sourceText: 'NAC — dose conforme embalagem', name: 'NAC', quantity: null, quantityMax: null, unit: null, timing: 'Manhã (após o café da manhã)', notes: 'dose conforme embalagem' },
      {
        sourceText: 'Ômega-3 — dose conforme embalagem, junto da refeição',
        name: 'Ômega-3',
        quantity: null,
        quantityMax: null,
        unit: null,
        timing: 'Almoço',
        notes: 'dose conforme embalagem, junto da refeição',
      },
    ],
    guidelines: [],
    warnings: [],
  };
}
