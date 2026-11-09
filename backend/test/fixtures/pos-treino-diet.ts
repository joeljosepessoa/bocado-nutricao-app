import type { AiDietItem, AiGroup, AiMeal, AiOrganizedDiet, AiSupplement } from '../../src/ai/use-cases/organize-diet/organized-diet.schema';
import { it_ } from './user-example-diet';

/**
 * Sexta dieta real (colada em 09/11/2026): refeição "Pós-treino" sem opções, "ESCOLHA 1 OPÇÃO" com
 * opções numeradas, "1 fruta (100–150 g)", "respectiva proteína (150 g)", "legumes/salada" e
 * suplementos/medicamentos com "1.000 UI" e "½ comprimido".
 */
export const POS_TREINO_DIET = `Pós-treino
30 g de whey protein
5 g de creatina
Café da Manhã
ESCOLHA 1 OPÇÃO
1. 2 fatias de pão integral + 2 ovos inteiros + 2 claras + 180 g de fruta
2. 80 g de tapioca + 50 g de frango desfiado + 1 ovo inteiro + 2 claras + 150 g de fruta
Almoço
ESCOLHA 1 OPÇÃO
1. 280 g de arroz + 100 g de feijão + 150 g de proteína + salada à vontade
2. 230 g de arroz + 100 g de feijão + 150 g de sobrecoxa sem pele + salada à vontade
Lanche da Tarde
ESCOLHA 1 OPÇÃO
1. 70 g de aveia + 30 g de whey + 150 g de banana + 300 ml de leite desnatado
2. 3 fatias de pão integral + 50 g de frango desfiado
3. 3 fatias de pão integral + 2 ovos inteiros + 2 claras + 1 fruta (100–150 g)
Jantar
ESCOLHA 1 OPÇÃO
1. 280 g de arroz + respectiva proteína (150 g) + legumes/salada
2. 180 g de arroz + 100 g de feijão + respectiva proteína (150 g) + legumes/salada
3. 330 g de macarrão + respectiva proteína (150 g) + molho de tomate caseiro
4. 3 pães franceses + 150 g de frango desfiado + salada à vontade
SUPLEMENTAÇÃO E MEDICAMENTOS
07:00 — Em jejum: Nattokinase + Ioimbina 5 mg. Após tomar a Ioimbina, permanecer em jejum por no mínimo 2 horas.
Almoço: Ômega-3 + Vitamina D3 (1.000 UI), junto da refeição.
Horário fixo diário: Tadalafila 5 mg, conforme prescrição.
Com uma refeição: AAS — ½ comprimido, conforme prescrição.`;

const g = (quantity: number, food: string, unit = 'g') => it_(`${quantity} ${unit} de ${food}`, food, quantity, unit);
const n = (quantity: number, food: string, unit: string | null = null) => it_(`${quantity} ${unit ? `${unit} de ` : ''}${food}`, food, quantity, unit);
const free = (food: string) => it_(`${food} à vontade`, food, null, null, { freeQuantity: true });
const protein150 = () => it_('respectiva proteína (150 g)', 'respectiva proteína', 150, 'g');
const veg = () => it_('legumes/salada', 'legumes/salada', null, null);
const options = (choices: AiDietItem[][]): AiGroup => ({
  kind: 'meal_options',
  label: null,
  choices: choices.map((items, i) => ({ label: `Opção ${i + 1}`, items })),
});
const meal = (name: string, groups: AiGroup[]): AiMeal => ({ name, time: null, notes: null, groups });
const sup = (sourceText: string, name: string, quantity: number | null, unit: string | null, timing: string | null, notes: string | null = null): AiSupplement => ({
  sourceText,
  name,
  quantity,
  quantityMax: null,
  unit,
  timing,
  notes,
});

/** Organização FIEL, como a IA a devolve. */
export function faithfulPosTreinoDiet(): AiOrganizedDiet {
  return {
    days: [
      {
        label: null,
        kind: 'other',
        usageNotes: null,
        meals: [
          meal('Pós-treino', [{ kind: 'fixed', label: null, choices: [{ label: null, items: [g(30, 'whey protein'), g(5, 'creatina')] }] }]),
          meal('Café da Manhã', [
            options([
              [n(2, 'pão integral', 'fatias'), n(2, 'ovos inteiros'), n(2, 'claras'), g(180, 'fruta')],
              [g(80, 'tapioca'), g(50, 'frango desfiado'), n(1, 'ovo inteiro'), n(2, 'claras'), g(150, 'fruta')],
            ]),
          ]),
          meal('Almoço', [
            options([
              [g(280, 'arroz'), g(100, 'feijão'), g(150, 'proteína'), free('salada')],
              [g(230, 'arroz'), g(100, 'feijão'), g(150, 'sobrecoxa sem pele'), free('salada')],
            ]),
          ]),
          meal('Lanche da Tarde', [
            options([
              [g(70, 'aveia'), g(30, 'whey'), g(150, 'banana'), g(300, 'leite desnatado', 'ml')],
              [n(3, 'pão integral', 'fatias'), g(50, 'frango desfiado')],
              [n(3, 'pão integral', 'fatias'), n(2, 'ovos inteiros'), n(2, 'claras'), it_('1 fruta (100–150 g)', 'fruta', 100, 'g', { quantityMax: 150, notes: '1 fruta' })],
            ]),
          ]),
          meal('Jantar', [
            options([
              [g(280, 'arroz'), protein150(), veg()],
              [g(180, 'arroz'), g(100, 'feijão'), protein150(), veg()],
              [g(330, 'macarrão'), protein150(), it_('molho de tomate caseiro', 'molho de tomate caseiro', null, null)],
              [n(3, 'pães franceses'), g(150, 'frango desfiado'), free('salada')],
            ]),
          ]),
        ],
      },
    ],
    supplements: [
      sup('Nattokinase', 'Nattokinase', null, null, '07:00 — Em jejum'),
      sup('Ioimbina 5 mg', 'Ioimbina', 5, 'mg', '07:00 — Em jejum', 'Após tomar a Ioimbina, permanecer em jejum por no mínimo 2 horas.'),
      sup('Ômega-3', 'Ômega-3', null, null, 'Almoço', 'junto da refeição'),
      sup('Vitamina D3 (1.000 UI)', 'Vitamina D3', 1000, 'UI', 'Almoço', 'junto da refeição'),
      sup('Tadalafila 5 mg', 'Tadalafila', 5, 'mg', 'Horário fixo diário', 'conforme prescrição'),
      sup('AAS — ½ comprimido', 'AAS', 0.5, 'comprimido', 'Com uma refeição', 'conforme prescrição'),
    ],
    guidelines: [],
    warnings: [],
  };
}
