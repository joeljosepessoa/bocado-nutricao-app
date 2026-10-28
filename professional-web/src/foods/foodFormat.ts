import { UNIT_LABELS } from '../dietAssistant/draft';
import type { FoodDetails, FoodInput, FoodOrigin, NutrientRow, NutrientStatus, NutritionUnit } from '../types/api';

export const ORIGIN_LABELS: Record<FoodOrigin, string> = {
  taco: 'TACO',
  mine: 'Meu alimento',
  shared: 'Outro profissional',
};

/** Marcadores da TACO — nunca viram 0. */
export const STATUS_MARKS: Record<Exclude<NutrientStatus, 'valor'>, { mark: string; meaning: string }> = {
  traco: { mark: 'Tr', meaning: 'traço (quantidade muito pequena)' },
  nao_aplicavel: { mark: 'NA', meaning: 'não se aplica a este alimento' },
  em_reavaliacao: { mark: '*', meaning: 'em reavaliação pela TACO' },
  nao_analisado: { mark: '—', meaning: 'não analisado' },
  invalido: { mark: '?', meaning: 'valor ilegível na tabela' },
};

/** 27.456 → "27,5"; inteiro para kcal/mg grandes. */
export function fmt(value: number, decimals = 1): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

const decimalsFor = (unit: string, value: number) => (unit === 'kcal' || unit === 'kJ' || Math.abs(value) >= 100 ? 0 : Math.abs(value) < 1 ? 2 : 1);

/** Valor de um nutriente numa porção (factor = gramas / 100), ou o marcador da TACO. */
export function nutrientText(row: NutrientRow, factor = 1): string {
  if (row.status !== 'valor' || row.value == null) return STATUS_MARKS[row.status === 'valor' ? 'nao_analisado' : row.status].mark;
  const v = row.unit === '%' ? row.value : row.value * factor; // umidade em % não muda com a porção
  return `${fmt(v, decimalsFor(row.unit, v))} ${row.unit}`;
}

/** Só os marcadores que aparecem na ficha, para a legenda. */
export function marksUsed(sections: FoodDetails['sections']): Array<{ mark: string; meaning: string }> {
  const used = new Set(sections.flatMap((s) => s.rows.map((r) => r.status)).filter((s) => s !== 'valor'));
  return (Object.keys(STATUS_MARKS) as Array<keyof typeof STATUS_MARKS>).filter((k) => used.has(k)).map((k) => STATUS_MARKS[k]);
}

export const macroText = (value: number | null, unit: 'kcal' | 'g') => (value == null ? '—' : unit === 'kcal' ? `${fmt(value, 0)}` : fmt(value, 1));

/** Medidas para a calculadora: a base (g/ml) e as medidas caseiras cadastradas. */
export function measureOptions(food: Pick<FoodDetails, 'baseUnit' | 'unitConversions'>): Array<{ unit: NutritionUnit; grams: number; label: string }> {
  return [
    { unit: food.baseUnit, grams: 1, label: food.baseUnit },
    ...food.unitConversions.map((c) => ({ unit: c.unit, grams: c.gramsEquivalent, label: UNIT_LABELS[c.unit] ?? c.unit })),
  ];
}

/** "1 colher(es) de sopa = 12 g" */
export function measureText(conversion: { unit: NutritionUnit; gramsEquivalent: number }, baseUnit: string): string {
  return `1 ${UNIT_LABELS[conversion.unit] ?? conversion.unit} = ${fmt(conversion.gramsEquivalent, 1)} ${baseUnit}`;
}

/** "12,5" / "12.5" / "" → número (ou null). */
export function parseDecimal(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** kcal que os macros dão (4/4/9) — só para avisar de erro de digitação, nunca substitui o informado. */
export function kcalFromMacros(protein: number, carb: number, fat: number): number {
  return protein * 4 + carb * 4 + fat * 9;
}

export interface FoodFormValues {
  name: string;
  baseUnit: 'g' | 'ml';
  foodGroup: string;
  kcal: string;
  protein: string;
  carb: string;
  fat: string;
  fiber: string;
  sodium: string;
  measures: Array<{ unit: NutritionUnit | ''; grams: string }>;
}

export const EMPTY_FOOD_FORM: FoodFormValues = { name: '', baseUnit: 'g', foodGroup: '', kcal: '', protein: '', carb: '', fat: '', fiber: '', sodium: '', measures: [] };

const toText = (v: number | null | undefined) => (v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ','));

/** Ficha → formulário (editar o seu, ou duplicar um da TACO como seu). */
export function formFromDetails(food: FoodDetails, duplicate: boolean): FoodFormValues {
  return {
    name: duplicate ? `${food.name} (meu)` : food.name,
    baseUnit: food.baseUnit,
    foodGroup: food.foodGroup ?? '',
    kcal: toText(food.kcalPer100),
    protein: toText(food.proteinGPer100),
    carb: toText(food.carbGPer100),
    fat: toText(food.fatGPer100),
    fiber: toText(food.fiberGPer100),
    sodium: toText(food.sodiumMgPer100),
    measures: food.unitConversions.map((c) => ({ unit: c.unit, grams: toText(c.gramsEquivalent) })),
  };
}

/** Erros em português, ou o que vai para a API. */
export function foodFormResult(values: FoodFormValues): { errors: string[]; input: FoodInput | null } {
  const errors: string[] = [];
  if (!values.name.trim()) errors.push('Informe o nome do alimento.');
  const required = { kcal: 'Calorias', protein: 'Proteína', carb: 'Carboidrato', fat: 'Gordura' } as const;
  const nums: Record<string, number | null> = {};
  for (const [key, label] of Object.entries(required)) {
    const n = parseDecimal(values[key as keyof typeof required]);
    if (n == null) errors.push(`${label}: informe um número (pode ser 0).`);
    else if (n < 0) errors.push(`${label} não pode ser negativo.`);
    nums[key] = n;
  }
  const optional = (text: string, label: string) => {
    if (!text.trim()) return undefined;
    const n = parseDecimal(text);
    if (n == null || n < 0) {
      errors.push(`${label}: número inválido.`);
      return undefined;
    }
    return n;
  };
  const fiber = optional(values.fiber, 'Fibra');
  const sodium = optional(values.sodium, 'Sódio');
  const seen = new Set<string>();
  const measures: FoodInput['unitConversions'] = [];
  for (const m of values.measures) {
    if (!m.unit && !m.grams.trim()) continue;
    const grams = parseDecimal(m.grams);
    if (!m.unit || grams == null || grams <= 0) {
      errors.push('Medida caseira: escolha a medida e quantos gramas/ml ela tem.');
      continue;
    }
    if (seen.has(m.unit)) {
      errors.push(`Medida "${UNIT_LABELS[m.unit]}" repetida.`);
      continue;
    }
    seen.add(m.unit);
    measures.push({ unit: m.unit, gramsEquivalent: grams });
  }
  if (errors.length > 0) return { errors, input: null };
  return {
    errors,
    input: {
      name: values.name.trim(),
      baseUnit: values.baseUnit,
      kcalPer100: nums.kcal!,
      proteinGPer100: nums.protein!,
      carbGPer100: nums.carb!,
      fatGPer100: nums.fat!,
      ...(fiber !== undefined ? { fiberGPer100: fiber } : {}),
      ...(sodium !== undefined ? { sodiumMgPer100: sodium } : {}),
      foodGroup: values.foodGroup,
      unitConversions: measures,
    },
  };
}
