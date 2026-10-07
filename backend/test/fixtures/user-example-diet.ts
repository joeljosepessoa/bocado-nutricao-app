import type { AiDietItem, AiGroup, AiMeal, AiOrganizedDiet } from '../../src/ai/use-cases/organize-diet/organized-diet.schema';

/**
 * Dieta real enviada pelo profissional (dia de treino/descanso, opções
 * completas, blocos "escolher 1", alternativas com 2 alimentos, à vontade,
 * suplementação e orientações). Foi ela que gerou o falso positivo "trecho
 * usado mais vezes do que aparece" na v1 — é o caso de regressão da v2.
 */
export const USER_EXAMPLE_DIET = `DIA DE TREINO
Usar nos 5 dias de musculação na semana. Escolher 1 opção em cada refeição ou bloco.
1. CAFÉ DA MANHÃ — ESCOLHER 1 OPÇÃO

* Opção 1: 10 g de aveia + 110 g de fruta + 2 ovos + 3 claras.
* Opção 2: 20 g de aveia + 120 g de fruta + 30 g de whey protein.
* Opção 3: 2 fatias de pão integral + 2 ovos + 2 claras.

2. ALMOÇO

* Carboidrato (escolher 1): 65 g de arroz / 160 g de batata inglesa / 65 g de aipim / 110 g de batata-doce / 120 g de polenta.
* Proteína (escolher 1): 120 g de peito de frango / 145 g de carne vermelha magra / 135 g de filé mignon suíno / 150 g de sobrecoxa sem pele.
* 50 g de feijão + 100 g de legumes + salada de folhas à vontade + 4 g de azeite.

3. LANCHE DA TARDE (PRÉ OU PÓS-TREINO) — ESCOLHER 1 OPÇÃO

* Opção 1: 10 g de aveia + 110 g de fruta + 2 ovos + 3 claras.
* Opção 2: 20 g de aveia + 120 g de fruta + 30 g de whey protein.
* Opção 3: 2 fatias de pão integral + 2 ovos + 2 claras.

4. JANTAR

* Carboidrato (escolher 1): 65 g de arroz / 160 g de batata inglesa / 65 g de aipim / 110 g de batata-doce / 120 g de polenta.
* Proteína (escolher 1): 120 g de peito de frango / 145 g de carne vermelha magra / 135 g de filé mignon suíno / 150 g de sobrecoxa sem pele.
* 50 g de feijão + 100 g de legumes + salada de folhas à vontade + 4 g de azeite.

5. CEIA

* 100 g de Danone natural + 10 g de aveia + 5 g de amêndoas + 15 g de whey protein.

DIA DE DESCANSO
Usar nos 2 dias sem treino na semana. Escolher 1 opção em cada refeição ou bloco.
1. CAFÉ DA MANHÃ — ESCOLHER 1 OPÇÃO

* Opção 1: 2 ovos + 3 claras + 90 g de abacate.
* Opção 2: 2 ovos + 2 claras + 35 g de muçarela.
* Opção 3: 1 ovo + 4 claras + 150 g de Danone natural + 10 g de castanhas.

2. ALMOÇO

* Proteína (escolher 1): 135 g de peito de frango + 10 g de azeite / 160 g de carne vermelha magra + 8 g de azeite / 145 g de filé mignon suíno + 8 g de azeite / 165 g de sobrecoxa sem pele + 2 g de azeite.
* 150 g de legumes + salada de folhas à vontade.

3. LANCHE DA TARDE — ESCOLHER 1 OPÇÃO

* Opção 1: 2 ovos + 3 claras + 90 g de abacate.
* Opção 2: 2 ovos + 2 claras + 35 g de muçarela.
* Opção 3: 1 ovo + 4 claras + 150 g de Danone natural + 10 g de castanhas.

4. JANTAR

* Proteína (escolher 1): 135 g de peito de frango + 10 g de azeite / 160 g de carne vermelha magra + 8 g de azeite / 145 g de filé mignon suíno + 8 g de azeite / 165 g de sobrecoxa sem pele + 2 g de azeite.
* 150 g de legumes + salada de folhas à vontade.

5. CEIA

* 150 g de Danone natural + 15 g de whey protein + 10 g de castanhas.

SUPLEMENTAÇÃO

* Creatina: 3 a 5 g por dia, antes do café da manhã (também nos dias sem treino).
* Ômega-3: 1 cápsula no almoço e 1 cápsula no jantar, junto com a refeição.
* Whey protein: nas porções indicadas em cada refeição.

ORIENTAÇÕES

* Água: no mínimo 2,5 litros por dia.
* Escolha: 1 opção em cada bloco (proteína, carboidrato, café/lanche), sem misturar itens de opções diferentes.
* Dias de treino: qualquer dia em que fizer musculação (5 dias na semana). Dias de descanso: os outros 2 dias.
* Lanche da tarde: nos dias de treino, pode ser feito antes ou depois do treino, conforme o seu horário.
* Pesos: alimentos pesados cozidos (arroz, batata, aipim, polenta, carnes, feijão e legumes).
* Fruta: escolha 1 tipo por refeição (banana, maçã, mamão, laranja, morango ou kiwi).
* Salada: de folhas à vontade, temperada com limão, vinagre e sal. Azeite somente o indicado.
* Evite ultraprocessados, frituras e açúcar. Durma de 7 a 9 horas por noite.`;

/** "10 g de aveia" → item com o trecho mínimo, como a IA deve devolver. */
export function it_(sourceText: string, food: string, quantity: number | null, unit: string | null, extra: Partial<AiDietItem> = {}): AiDietItem {
  return { sourceText, food, quantity, quantityMax: null, unit, freeQuantity: false, notes: null, ...extra };
}

const fixed = (items: AiDietItem[]): AiGroup => ({ kind: 'fixed', label: null, choices: [{ label: null, items }] });
const options = (choices: AiDietItem[][]): AiGroup => ({
  kind: 'meal_options',
  label: null,
  choices: choices.map((items, i) => ({ label: `Opção ${i + 1}`, items })),
});
const alternatives = (label: string, choices: AiDietItem[][]): AiGroup => ({ kind: 'alternatives', label, choices: choices.map((items) => ({ label: null, items })) });
const meal = (name: string, groups: AiGroup[]): AiMeal => ({ name, time: null, notes: null, groups });

const salad = () => it_('salada de folhas à vontade', 'salada de folhas', null, null, { freeQuantity: true });

function trainingOptions(): AiDietItem[][] {
  return [
    [it_('10 g de aveia', 'aveia', 10, 'g'), it_('110 g de fruta', 'fruta', 110, 'g'), it_('2 ovos', 'ovo', 2, null), it_('3 claras', 'clara', 3, null)],
    [it_('20 g de aveia', 'aveia', 20, 'g'), it_('120 g de fruta', 'fruta', 120, 'g'), it_('30 g de whey protein', 'whey protein', 30, 'g')],
    [it_('2 fatias de pão integral', 'pão integral', 2, 'fatias'), it_('2 ovos', 'ovo', 2, null), it_('2 claras', 'clara', 2, null)],
  ];
}

function restOptions(): AiDietItem[][] {
  return [
    [it_('2 ovos', 'ovo', 2, null), it_('3 claras', 'clara', 3, null), it_('90 g de abacate', 'abacate', 90, 'g')],
    [it_('2 ovos', 'ovo', 2, null), it_('2 claras', 'clara', 2, null), it_('35 g de muçarela', 'muçarela', 35, 'g')],
    [it_('1 ovo', 'ovo', 1, null), it_('4 claras', 'clara', 4, null), it_('150 g de Danone natural', 'Danone natural', 150, 'g'), it_('10 g de castanhas', 'castanha', 10, 'g')],
  ];
}

function trainingLunch(name: string): AiMeal {
  return meal(name, [
    alternatives('Carboidrato', [
      [it_('65 g de arroz', 'arroz', 65, 'g')],
      [it_('160 g de batata inglesa', 'batata inglesa', 160, 'g')],
      [it_('65 g de aipim', 'aipim', 65, 'g')],
      [it_('110 g de batata-doce', 'batata-doce', 110, 'g')],
      [it_('120 g de polenta', 'polenta', 120, 'g')],
    ]),
    alternatives('Proteína', [
      [it_('120 g de peito de frango', 'peito de frango', 120, 'g')],
      [it_('145 g de carne vermelha magra', 'carne vermelha magra', 145, 'g')],
      [it_('135 g de filé mignon suíno', 'filé mignon suíno', 135, 'g')],
      [it_('150 g de sobrecoxa sem pele', 'sobrecoxa', 150, 'g', { notes: 'sem pele' })],
    ]),
    fixed([it_('50 g de feijão', 'feijão', 50, 'g'), it_('100 g de legumes', 'legumes', 100, 'g'), salad(), it_('4 g de azeite', 'azeite', 4, 'g')]),
  ]);
}

function restLunch(name: string): AiMeal {
  return meal(name, [
    alternatives('Proteína', [
      [it_('135 g de peito de frango', 'peito de frango', 135, 'g'), it_('10 g de azeite', 'azeite', 10, 'g')],
      [it_('160 g de carne vermelha magra', 'carne vermelha magra', 160, 'g'), it_('8 g de azeite', 'azeite', 8, 'g')],
      [it_('145 g de filé mignon suíno', 'filé mignon suíno', 145, 'g'), it_('8 g de azeite', 'azeite', 8, 'g')],
      [it_('165 g de sobrecoxa sem pele', 'sobrecoxa', 165, 'g', { notes: 'sem pele' }), it_('2 g de azeite', 'azeite', 2, 'g')],
    ]),
    fixed([it_('150 g de legumes', 'legumes', 150, 'g'), salad()]),
  ]);
}

/** Organização FIEL da dieta acima — o que a IA deve devolver (trecho mínimo por item). */
export function faithfulUserDiet(): AiOrganizedDiet {
  return {
    days: [
      {
        label: 'DIA DE TREINO',
        kind: 'training',
        usageNotes: 'Usar nos 5 dias de musculação na semana. Escolher 1 opção em cada refeição ou bloco.',
        meals: [
          meal('CAFÉ DA MANHÃ', [options(trainingOptions())]),
          trainingLunch('ALMOÇO'),
          meal('LANCHE DA TARDE (PRÉ OU PÓS-TREINO)', [options(trainingOptions())]),
          trainingLunch('JANTAR'),
          meal('CEIA', [
            fixed([
              it_('100 g de Danone natural', 'Danone natural', 100, 'g'),
              it_('10 g de aveia', 'aveia', 10, 'g'),
              it_('5 g de amêndoas', 'amêndoa', 5, 'g'),
              it_('15 g de whey protein', 'whey protein', 15, 'g'),
            ]),
          ]),
        ],
      },
      {
        label: 'DIA DE DESCANSO',
        kind: 'rest',
        usageNotes: 'Usar nos 2 dias sem treino na semana. Escolher 1 opção em cada refeição ou bloco.',
        meals: [
          meal('CAFÉ DA MANHÃ', [options(restOptions())]),
          restLunch('ALMOÇO'),
          meal('LANCHE DA TARDE', [options(restOptions())]),
          restLunch('JANTAR'),
          meal('CEIA', [
            fixed([
              it_('150 g de Danone natural', 'Danone natural', 150, 'g'),
              it_('15 g de whey protein', 'whey protein', 15, 'g'),
              it_('10 g de castanhas', 'castanha', 10, 'g'),
            ]),
          ]),
        ],
      },
    ],
    supplements: [
      {
        sourceText: 'Creatina: 3 a 5 g por dia, antes do café da manhã',
        name: 'Creatina',
        quantity: 3,
        quantityMax: 5,
        unit: 'g',
        timing: 'antes do café da manhã',
        notes: 'também nos dias sem treino',
      },
      {
        sourceText: 'Ômega-3: 1 cápsula no almoço e 1 cápsula no jantar, junto com a refeição',
        name: 'Ômega-3',
        quantity: 1,
        quantityMax: null,
        unit: 'cápsula',
        timing: 'no almoço e 1 cápsula no jantar',
        notes: 'junto com a refeição',
      },
      { sourceText: 'Whey protein: nas porções indicadas em cada refeição', name: 'Whey protein', quantity: null, quantityMax: null, unit: null, timing: null, notes: 'nas porções indicadas em cada refeição' },
    ],
    guidelines: [
      'Água: no mínimo 2,5 litros por dia.',
      'Escolha: 1 opção em cada bloco (proteína, carboidrato, café/lanche), sem misturar itens de opções diferentes.',
      'Dias de treino: qualquer dia em que fizer musculação (5 dias na semana). Dias de descanso: os outros 2 dias.',
      'Lanche da tarde: nos dias de treino, pode ser feito antes ou depois do treino, conforme o seu horário.',
      'Pesos: alimentos pesados cozidos (arroz, batata, aipim, polenta, carnes, feijão e legumes).',
      'Fruta: escolha 1 tipo por refeição (banana, maçã, mamão, laranja, morango ou kiwi).',
      'Salada: de folhas à vontade, temperada com limão, vinagre e sal. Azeite somente o indicado.',
      'Evite ultraprocessados, frituras e açúcar. Durma de 7 a 9 horas por noite.',
    ],
    warnings: [],
  };
}

/** A MESMA dieta, mas com a linha inteira em cada item (como a v1 recebia) — deve ser aceita (sem falso positivo). */
export function wholeLineUserDiet(): AiOrganizedDiet {
  const lines = USER_EXAMPLE_DIET.split('\n').map((l) => l.replace(/^\*\s*/, '').trim());
  const diet = faithfulUserDiet();
  for (const day of diet.days) {
    for (const m of day.meals) {
      for (const group of m.groups) {
        for (const choice of group.choices) {
          for (const item of choice.items) {
            const line = lines.find((l) => l.includes(item.sourceText));
            if (line) item.sourceText = line.replace(/\.$/, '');
          }
        }
      }
    }
  }
  return diet;
}
