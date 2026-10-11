import type { AiDietItem, AiGroup, AiMeal, AiOrganizedDiet } from '../../src/ai/use-cases/organize-diet/organized-diet.schema';
import { it_ } from './user-example-diet';

/**
 * Segunda dieta real de profissional: opções completas em quatro refeições,
 * uma refeição sem opções, faixa ("3 a 5 g"), medida caseira com o peso entre
 * parênteses e um detalhe com "ou" dentro do alimento ("carne magra (patinho
 * ou coxão mole)"). Era recusada inteira porque esse "ou" era lido como
 * separador de alternativas da linha — é o caso de regressão do parêntese.
 */
export const OPTIONS_EXAMPLE_DIET = `1. CAFÉ DA MANHÃ — ESCOLHER 1 OPÇÃO
Opção 1: 2 ovos mexidos + 100 g de fruta + 8 g de chia + 5 g de psyllium.
Opção 2: Omelete de 1 ovo + 3 claras + 100 g de fruta + 10 g de chia + 5 g de psyllium.
Opção 3: 2 ovos cozidos + 80 g de fruta + 8 g de chia + 5 g de psyllium.
2. ALMOÇO — ESCOLHER 1 OPÇÃO
Opção 1: 110 g de peito de frango + 110 g de arroz cozido + 60 g de feijão + salada à vontade + 9 g de azeite.
Opção 2: 120 g de peixe + 200 g de batata-doce cozida + 100 g de legumes + salada à vontade + 10 g de azeite.
Opção 3: 95 g de carne magra (patinho ou coxão mole) + 90 g de arroz cozido + 60 g de lentilha cozida + salada à vontade + 8 g de azeite.
3. LANCHE DA TARDE — ESCOLHER 1 OPÇÃO
Opção 1: 1 scoop de whey protein (30 g) amassado com 35 g de abacate + 8 g de semente de abóbora por cima + 3 a 5 g de creatina.
Opção 2: 1 scoop de whey protein (30 g) amassado com 30 g de abacate e 60 ml de leite vegetal + 8 g de semente de abóbora + 3 a 5 g de creatina.
Opção 3: 1 scoop de whey protein (30 g) amassado com 35 g de abacate + 8 g de semente de abóbora + 30 g de fruta + 3 a 5 g de creatina.
4. LANCHE ANTES DO JANTAR
150 g de iogurte natural Danone + 10 g de farinha de maracujá + 2 ovos.
5. JANTAR — ESCOLHER 1 OPÇÃO
Opção 1: 100 g de peito de frango + 80 g de arroz cozido + 150 g de legumes + salada à vontade + 8 g de azeite.
Opção 2: 120 g de peixe + 150 g de batata-doce cozida + salada à vontade + 10 g de azeite.
Opção 3: 85 g de carne magra moída + 90 g de macarrão cozido + 60 g de molho de tomate caseiro + 100 g de legumes + 6 g de azeite.`;

const g = (quantity: number, food: string, extra: Partial<AiDietItem> = {}) => it_(`${quantity} g de ${food}`, food, quantity, 'g', extra);
const salad = () => it_('salada à vontade', 'salada', null, null, { freeQuantity: true });
const whey = () => it_('1 scoop de whey protein (30 g)', 'whey protein', 1, 'scoop', { notes: 'amassado' });
const creatine = () => it_('3 a 5 g de creatina', 'creatina', 3, 'g', { quantityMax: 5 });
const fixed = (items: AiDietItem[]): AiGroup => ({ kind: 'fixed', label: null, choices: [{ label: null, items }] });
const options = (choices: AiDietItem[][]): AiGroup => ({ kind: 'meal_options', label: null, choices: choices.map((items, i) => ({ label: `Opção ${i + 1}`, items })) });
const meal = (name: string, group: AiGroup): AiMeal => ({ name, time: null, notes: null, groups: [group] });

/** O item da carne magra: UM alimento, com o corte ("patinho ou coxão mole") como observação. */
export const leanMeat = (): AiDietItem => it_('95 g de carne magra (patinho ou coxão mole)', 'carne magra', 95, 'g', { notes: 'patinho ou coxão mole' });

/** Organização FIEL da dieta acima — o que a IA deve devolver. */
export function faithfulOptionsDiet(): AiOrganizedDiet {
  return {
    days: [
      {
        label: null,
        kind: 'other',
        usageNotes: null,
        meals: [
          meal(
            'CAFÉ DA MANHÃ',
            options([
              [it_('2 ovos mexidos', 'ovos mexidos', 2, null), g(100, 'fruta'), g(8, 'chia'), g(5, 'psyllium')],
              [it_('Omelete de 1 ovo', 'ovo', 1, null), it_('3 claras', 'claras', 3, null), g(100, 'fruta'), g(10, 'chia'), g(5, 'psyllium')],
              [it_('2 ovos cozidos', 'ovos cozidos', 2, null), g(80, 'fruta'), g(8, 'chia'), g(5, 'psyllium')],
            ]),
          ),
          meal(
            'ALMOÇO',
            options([
              [g(110, 'peito de frango'), g(110, 'arroz cozido'), g(60, 'feijão'), salad(), g(9, 'azeite')],
              [g(120, 'peixe'), g(200, 'batata-doce cozida'), g(100, 'legumes'), salad(), g(10, 'azeite')],
              [leanMeat(), g(90, 'arroz cozido'), g(60, 'lentilha cozida'), salad(), g(8, 'azeite')],
            ]),
          ),
          meal(
            'LANCHE DA TARDE',
            options([
              [whey(), g(35, 'abacate'), g(8, 'semente de abóbora', { notes: 'por cima' }), creatine()],
              [whey(), g(30, 'abacate'), it_('60 ml de leite vegetal', 'leite vegetal', 60, 'ml'), g(8, 'semente de abóbora'), creatine()],
              [whey(), g(35, 'abacate'), g(8, 'semente de abóbora'), g(30, 'fruta'), creatine()],
            ]),
          ),
          meal('LANCHE ANTES DO JANTAR', fixed([g(150, 'iogurte natural Danone'), g(10, 'farinha de maracujá'), it_('2 ovos', 'ovos', 2, null)])),
          meal(
            'JANTAR',
            options([
              [g(100, 'peito de frango'), g(80, 'arroz cozido'), g(150, 'legumes'), salad(), g(8, 'azeite')],
              [g(120, 'peixe'), g(150, 'batata-doce cozida'), salad(), g(10, 'azeite')],
              [g(85, 'carne magra moída'), g(90, 'macarrão cozido'), g(60, 'molho de tomate caseiro'), g(100, 'legumes'), g(6, 'azeite')],
            ]),
          ),
        ],
      },
    ],
    supplements: [],
    guidelines: [],
    warnings: [],
  };
}
