import type { AiDietItem, AiGroup, AiMeal, AiOrganizedDiet } from '../../src/ai/use-cases/organize-diet/organized-diet.schema';
import { it_ } from './user-example-diet';

/**
 * Quarta dieta real (colada no painel em 06/11/2026): "fruta (100 g) a escolher" com a
 * quantidade entre parênteses e um complemento depois; "Danone/iogurte grego light (100 g)"
 * com a barra separando só duas marcas de um MESMO alimento (não opções da refeição);
 * blocos "Proteína/Carboidrato — escolha 1 opção:" com o peso antes ("150 g de …") ou
 * depois do travessão ("Arroz branco cozido — 100 g"); "Fixos (todos os dias):"; e o
 * jantar escrito como "igual ao almoço".
 */
export const ESCOLHER_FRUTA_DIET = `Café da Manhã — escolha 1 opção:

Iogurte natural desnatado (170 g) + 1 dose de whey protein (30 g) + fruta (100 g) a escolher
Danone/iogurte grego light (100 g) + 1 dose de whey protein (30 g) + aveia (20 g)
Iogurte natural integral (170 g) + 1 dose de whey protein (30 g) + fruta (100 g) a escolher

Almoço
Proteína — escolha 1 opção:

150 g de peito de frango grelhado
150 g de carne bovina magra grelhada (patinho ou alcatra)
150 g de filé de peixe grelhado (tilápia ou merluza)
2 ovos inteiros + 2 claras, mexidos ou cozidos

Carboidrato — escolha 1 opção:

Arroz branco cozido — 100 g
Macarrão cozido — 100 g
Aipim (mandioca) cozido — 100 g
Batata inglesa cozida — 150 g

Fixos (todos os dias):

Feijão cozido — 80 g
Salada de folhas verdes à vontade
Legumes cozidos ou refogados à vontade + 1 colher de chá de azeite

Lanche da Tarde — escolha 1 opção:

1 dose de whey protein (30 g) + fruta (100 g) a escolher
Pão integral (50 g) + peito de peru (40 g)
Iogurte natural desnatado (150 g) + aveia (20 g)

Jantar — igual ao almoço (mesma proteína e carboidrato à escolha, e mesmos fixos)

Orientações:

Arroz, massa, aipim, batata e feijão: pesos já cozidos
Whey protein: preparado com água
Carnes, frango e peixe: grelhados, assados ou cozidos — evite empanados e frituras
Saladas e legumes: à vontade, tempere com limão, vinagre e ervas (evite molhos industrializados)
Azeite: com moderação (≈1 colher de chá por refeição principal)
Hidratação: 2,5 a 3 L de água como referência inicial, ajustando conforme sede, calor e atividade física`;

const paren = (food: string, quantity: number, unit = 'g') => it_(`${food} (${quantity} ${unit})`, food, quantity, unit);
const dash = (food: string, quantity: number) => it_(`${food} — ${quantity} g`, food, quantity, 'g');
const whey = () => it_('1 dose de whey protein (30 g)', 'whey protein', 30, 'g', { notes: '1 dose' });
const fruit = () => it_('fruta (100 g) a escolher', 'fruta', 100, 'g', { notes: 'a escolher' });
const numbered = (kind: 'meal_options' | 'alternatives', label: string | null, choices: AiDietItem[][]): AiGroup => ({
  kind,
  label,
  choices: choices.map((items, i) => ({ label: `Opção ${i + 1}`, items })),
});
const fixed = (label: string | null, items: AiDietItem[]): AiGroup => ({ kind: 'fixed', label, choices: [{ label: null, items }] });
const meal = (name: string, groups: AiGroup[]): AiMeal => ({ name, time: null, notes: null, groups });

const lunchGroups = (): AiGroup[] => [
  numbered('alternatives', 'Proteína', [
    [it_('150 g de peito de frango grelhado', 'peito de frango grelhado', 150, 'g')],
    [it_('150 g de carne bovina magra grelhada (patinho ou alcatra)', 'carne bovina magra grelhada', 150, 'g', { notes: 'patinho ou alcatra' })],
    [it_('150 g de filé de peixe grelhado (tilápia ou merluza)', 'filé de peixe grelhado', 150, 'g', { notes: 'tilápia ou merluza' })],
    [it_('2 ovos inteiros', 'ovos inteiros', 2, null), it_('2 claras, mexidos ou cozidos', 'claras', 2, null, { notes: 'mexidos ou cozidos' })],
  ]),
  numbered('alternatives', 'Carboidrato', [
    [dash('Arroz branco cozido', 100)],
    [dash('Macarrão cozido', 100)],
    [it_('Aipim (mandioca) cozido — 100 g', 'Aipim (mandioca) cozido', 100, 'g')],
    [dash('Batata inglesa cozida', 150)],
  ]),
  fixed('Fixos (todos os dias)', [
    dash('Feijão cozido', 80),
    it_('Salada de folhas verdes à vontade', 'Salada de folhas verdes', null, null, { freeQuantity: true }),
    it_('Legumes cozidos ou refogados à vontade', 'Legumes cozidos ou refogados', null, null, { freeQuantity: true }),
    it_('1 colher de chá de azeite', 'azeite', 1, 'colher de chá'),
  ]),
];

/** Organização FIEL, como a IA a devolve; `copyLunchToDinner` = a IA repete o almoço no jantar. */
export function faithfulEscolherFrutaDiet(copyLunchToDinner = false): AiOrganizedDiet {
  return {
    days: [
      {
        label: null,
        kind: 'other',
        usageNotes: null,
        meals: [
          meal('Café da Manhã', [
            numbered('meal_options', null, [
              [paren('Iogurte natural desnatado', 170), whey(), fruit()],
              [paren('Danone/iogurte grego light', 100), whey(), paren('aveia', 20)],
              [paren('Iogurte natural integral', 170), whey(), fruit()],
            ]),
          ]),
          meal('Almoço', lunchGroups()),
          meal('Lanche da Tarde', [
            numbered('meal_options', null, [
              [whey(), fruit()],
              [paren('Pão integral', 50), paren('peito de peru', 40)],
              [paren('Iogurte natural desnatado', 150), paren('aveia', 20)],
            ]),
          ]),
          ...(copyLunchToDinner ? [meal('Jantar', lunchGroups())] : []),
        ],
      },
    ],
    supplements: [],
    guidelines: [
      'Arroz, massa, aipim, batata e feijão: pesos já cozidos',
      'Whey protein: preparado com água',
      'Carnes, frango e peixe: grelhados, assados ou cozidos — evite empanados e frituras',
      'Saladas e legumes: à vontade, tempere com limão, vinagre e ervas (evite molhos industrializados)',
      'Azeite: com moderação (≈1 colher de chá por refeição principal)',
      'Hidratação: 2,5 a 3 L de água como referência inicial, ajustando conforme sede, calor e atividade física',
    ],
    warnings: [],
  };
}
