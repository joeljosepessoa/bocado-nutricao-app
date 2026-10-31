import type { AiDietItem, AiGroup, AiMeal, AiOrganizedDiet } from '../../src/ai/use-cases/organize-diet/organized-diet.schema';
import { it_ } from './user-example-diet';

/**
 * Terceira dieta real: "escolha 1 opção:" no cabeçalho e as opções UMA POR LINHA,
 * numeradas ("1. …") ou não (a numeração some ao copiar de algumas telas), sem a
 * palavra "Opção N" escrita. Blocos "Proteína/Carboidrato/Leguminosa" com um
 * alimento por linha, quantidade depois do travessão ("Peixe — 100 g") ou entre
 * parênteses ("fruta (100 g)"), detalhe entre parênteses ANTES da quantidade
 * ("Carne magra (patinho ou coxão mole) — 75 g") e outro alimento entre parênteses
 * DEPOIS dela ("Macarrão cozido — 120 g (com molho de tomate caseiro 60 g)").
 */
export const CHOOSE_ONE_LINES_DIET = `CAFÉ DA MANHÃ — escolha 1 opção:

1. 2 ovos mexidos + fruta (100 g) + chia (8 g) + psyllium (5 g)
2. 1 ovo (omelete) + 3 claras + fruta (100 g) + chia (10 g) + psyllium (5 g)
3. 2 ovos cozidos + fruta (80 g) + chia (8 g) + psyllium (5 g)

ALMOÇO
Proteína — escolha 1 opção:

1. Peito de frango — 90 g
2. Peixe — 100 g
3. Carne magra (patinho ou coxão mole) — 75 g

Carboidrato — escolha 1 opção:

1. Arroz cozido — 130 g
2. Batata-doce cozida — 220 g
3. Aipim (mandioca) cozido — 130 g
4. Batata inglesa cozida — 190 g

Leguminosa — escolha 1 opção:

1. Feijão — 60 g
2. Lentilha cozida — 60 g

Fixos: salada à vontade + legumes à vontade + azeite (9 g)
LANCHE DA TARDE — escolha 1 opção:

1. Whey protein (30 g) + fruta (100 g) + semente de abóbora (8 g) + creatina (3–5 g)
2. Whey protein (30 g) + abacate (30 g) + leite vegetal (60 ml) + semente de abóbora (8 g) + creatina (3–5 g)
3. Whey protein (30 g) + abacate (35 g) + semente de abóbora (8 g) + fruta (30 g) + creatina (3–5 g)
4. Aveia (30 g) + leite (200 ml) + whey protein (30 g)

LANCHE ANTES DO JANTAR — itens fixos (consumir todos):

* Iogurte natural Danone (150 g)
* Farinha de maracujá (10 g)
* 2 ovos

JANTAR
Proteína — escolha 1 opção:

1. Peito de frango — 80 g
2. Peixe — 100 g
3. Carne magra moída — 65 g

Carboidrato — escolha 1 opção:

1. Arroz cozido — 100 g
2. Batata-doce cozida — 170 g
3. Macarrão cozido — 120 g (com molho de tomate caseiro 60 g)
4. Aipim (mandioca) cozido — 100 g
5. Batata inglesa cozida — 150 g

Fixos: salada à vontade + legumes à vontade + azeite (8 g)
CEIA — escolha 1 opção:

1. Fruta (100 g) + Danone natural (150 g) + whey protein (20 g)
2. Aveia (30 g) + leite (200 ml) + whey protein (20 g)

Suplementação:

* Whey protein — 1 scoop, no lanche da tarde
* Creatina — 3–5 g, junto com o whey (nos dias sem treino, continua no mesmo horário)
* Ômega-3 — 2–3 g`;

/** O mesmo texto como chegou no painel: sem a numeração "1." e sem os marcadores "*". */
export const CHOOSE_ONE_LINES_DIET_UNNUMBERED = CHOOSE_ONE_LINES_DIET.replace(/^(?:\d+\. |\* )/gm, '');

const paren = (food: string, quantity: number, unit = 'g', extra: Partial<AiDietItem> = {}) => it_(`${food} (${quantity} ${unit})`, food, quantity, unit, extra);
const dash = (food: string, quantity: number) => it_(`${food} — ${quantity} g`, food, quantity, 'g');
const creatine = () => it_('creatina (3–5 g)', 'creatina', 3, 'g', { quantityMax: 5 });
const free = (food: string) => it_(`${food} à vontade`, food, null, null, { freeQuantity: true });
/** A IA numera as opções ("Opção 1", "Opção 2"…) mesmo quando o texto só lista uma por linha. */
const numbered = (kind: 'meal_options' | 'alternatives', label: string | null, choices: AiDietItem[][]): AiGroup => ({
  kind,
  label,
  choices: choices.map((items, i) => ({ label: `Opção ${i + 1}`, items })),
});
const fixed = (label: string | null, items: AiDietItem[]): AiGroup => ({ kind: 'fixed', label, choices: [{ label: null, items }] });
const meal = (name: string, groups: AiGroup[]): AiMeal => ({ name, time: null, notes: null, groups });

/** Organização FIEL do texto acima, como a IA a devolve. */
export function faithfulChooseOneLinesDiet(): AiOrganizedDiet {
  return {
    days: [
      {
        label: null,
        kind: 'other',
        usageNotes: null,
        meals: [
          meal('CAFÉ DA MANHÃ', [
            numbered('meal_options', null, [
              [it_('2 ovos mexidos', 'ovos mexidos', 2, null), paren('fruta', 100), paren('chia', 8), paren('psyllium', 5)],
              [it_('1 ovo (omelete)', 'ovo', 1, null, { notes: 'omelete' }), it_('3 claras', 'claras', 3, null), paren('fruta', 100), paren('chia', 10), paren('psyllium', 5)],
              [it_('2 ovos cozidos', 'ovos cozidos', 2, null), paren('fruta', 80), paren('chia', 8), paren('psyllium', 5)],
            ]),
          ]),
          meal('ALMOÇO', [
            numbered('alternatives', 'Proteína', [
              [dash('Peito de frango', 90)],
              [dash('Peixe', 100)],
              [it_('Carne magra (patinho ou coxão mole) — 75 g', 'Carne magra', 75, 'g', { notes: 'patinho ou coxão mole' })],
            ]),
            numbered('alternatives', 'Carboidrato', [
              [dash('Arroz cozido', 130)],
              [dash('Batata-doce cozida', 220)],
              [it_('Aipim (mandioca) cozido — 130 g', 'Aipim (mandioca) cozido', 130, 'g')],
              [dash('Batata inglesa cozida', 190)],
            ]),
            numbered('alternatives', 'Leguminosa', [[dash('Feijão', 60)], [dash('Lentilha cozida', 60)]]),
            fixed('Fixos', [free('salada'), free('legumes'), paren('azeite', 9)]),
          ]),
          meal('LANCHE DA TARDE', [
            numbered('meal_options', null, [
              [paren('Whey protein', 30), paren('fruta', 100), paren('semente de abóbora', 8), creatine()],
              [paren('Whey protein', 30), paren('abacate', 30), paren('leite vegetal', 60, 'ml'), paren('semente de abóbora', 8), creatine()],
              [paren('Whey protein', 30), paren('abacate', 35), paren('semente de abóbora', 8), paren('fruta', 30), creatine()],
              [paren('Aveia', 30), paren('leite', 200, 'ml'), paren('whey protein', 30)],
            ]),
          ]),
          meal('LANCHE ANTES DO JANTAR', [fixed(null, [paren('Iogurte natural Danone', 150), paren('Farinha de maracujá', 10), it_('2 ovos', 'ovos', 2, null)])]),
          meal('JANTAR', [
            numbered('alternatives', 'Proteína', [[dash('Peito de frango', 80)], [dash('Peixe', 100)], [dash('Carne magra moída', 65)]]),
            numbered('alternatives', 'Carboidrato', [
              [dash('Arroz cozido', 100)],
              [dash('Batata-doce cozida', 170)],
              [dash('Macarrão cozido', 120), it_('molho de tomate caseiro 60 g', 'molho de tomate caseiro', 60, 'g')],
              [it_('Aipim (mandioca) cozido — 100 g', 'Aipim (mandioca) cozido', 100, 'g')],
              [dash('Batata inglesa cozida', 150)],
            ]),
            fixed('Fixos', [free('salada'), free('legumes'), paren('azeite', 8)]),
          ]),
          meal('CEIA', [
            numbered('meal_options', null, [
              [paren('Fruta', 100), paren('Danone natural', 150), paren('whey protein', 20)],
              [paren('Aveia', 30), paren('leite', 200, 'ml'), paren('whey protein', 20)],
            ]),
          ]),
        ],
      },
    ],
    supplements: [
      { sourceText: 'Whey protein — 1 scoop, no lanche da tarde', name: 'Whey protein', quantity: 1, quantityMax: null, unit: 'scoop', timing: 'no lanche da tarde', notes: null },
      {
        sourceText: 'Creatina — 3–5 g, junto com o whey',
        name: 'Creatina',
        quantity: 3,
        quantityMax: 5,
        unit: 'g',
        timing: 'junto com o whey',
        notes: 'nos dias sem treino, continua no mesmo horário',
      },
      { sourceText: 'Ômega-3 — 2–3 g', name: 'Ômega-3', quantity: 2, quantityMax: 3, unit: 'g', timing: null, notes: null },
    ],
    guidelines: [],
    warnings: [],
  };
}
