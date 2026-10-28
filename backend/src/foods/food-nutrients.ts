/**
 * Ficha completa de um alimento na tela "Alimentos": as colunas da TACO (guardadas em Food.sourceData)
 * organizadas em seções com rótulo e unidade. Marcador da TACO (Tr, NA, *, vazio) continua marcador —
 * nunca vira 0.
 */
export type NutrientStatus = 'valor' | 'traco' | 'nao_aplicavel' | 'em_reavaliacao' | 'nao_analisado' | 'invalido';

export interface NutrientRow {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  status: NutrientStatus;
}

export interface NutrientSection {
  title: string;
  rows: NutrientRow[];
}

type Spec = [key: string, label: string, unit: string];

const COMPOSITION: Spec[] = [
  ['energia_kcal', 'Energia', 'kcal'],
  ['energia_kj', 'Energia', 'kJ'],
  ['proteina', 'Proteína', 'g'],
  ['carboidrato', 'Carboidrato', 'g'],
  ['lipideos', 'Lipídeos (gorduras)', 'g'],
  ['fibra_alimentar', 'Fibra alimentar', 'g'],
  ['colesterol', 'Colesterol', 'mg'],
  ['umidade', 'Umidade', '%'],
  ['cinzas', 'Cinzas', 'g'],
];

const MINERALS: Spec[] = [
  ['calcio', 'Cálcio', 'mg'],
  ['ferro', 'Ferro', 'mg'],
  ['magnesio', 'Magnésio', 'mg'],
  ['fosforo', 'Fósforo', 'mg'],
  ['potassio', 'Potássio', 'mg'],
  ['sodio', 'Sódio', 'mg'],
  ['zinco', 'Zinco', 'mg'],
  ['cobre', 'Cobre', 'mg'],
  ['manganes', 'Manganês', 'mg'],
];

const VITAMINS: Spec[] = [
  ['vitamina_c', 'Vitamina C', 'mg'],
  ['retinol', 'Retinol', 'mcg'],
  ['re', 'Vitamina A (RE)', 'mcg'],
  ['rae', 'Vitamina A (RAE)', 'mcg'],
  ['tiamina', 'Tiamina (B1)', 'mg'],
  ['riboflavina', 'Riboflavina (B2)', 'mg'],
  ['niacina', 'Niacina (B3)', 'mg'],
  ['piridoxina', 'Piridoxina (B6)', 'mg'],
];

const FATTY_ACIDS: Spec[] = [
  ['saturados', 'Saturados', 'g'],
  ['monoinsaturados', 'Monoinsaturados', 'g'],
  ['poliinsaturados', 'Poli-insaturados', 'g'],
  ['18_2_n_6', 'Ômega-6 (18:2 n-6)', 'g'],
  ['18_3_n_3', 'Ômega-3 (18:3 n-3)', 'g'],
  ['18_1t', 'Trans (18:1t)', 'g'],
  ['18_2t', 'Trans (18:2t)', 'g'],
];

const AMINO_ACIDS: Spec[] = [
  ['triptofano', 'Triptofano', 'g'],
  ['treonina', 'Treonina', 'g'],
  ['isoleucina', 'Isoleucina', 'g'],
  ['leucina', 'Leucina', 'g'],
  ['lisina', 'Lisina', 'g'],
  ['metionina', 'Metionina', 'g'],
  ['cistina', 'Cistina', 'g'],
  ['fenilalanina', 'Fenilalanina', 'g'],
  ['tirosina', 'Tirosina', 'g'],
  ['valina', 'Valina', 'g'],
  ['arginina', 'Arginina', 'g'],
  ['histidina', 'Histidina', 'g'],
  ['alanina', 'Alanina', 'g'],
  ['acido_aspartico', 'Ácido aspártico', 'g'],
  ['acido_glutamico', 'Ácido glutâmico', 'g'],
  ['glicina', 'Glicina', 'g'],
  ['prolina', 'Prolina', 'g'],
  ['serina', 'Serina', 'g'],
];

type Cell = { valor?: unknown; situacao?: unknown } | undefined;
type Table = Record<string, Cell> | null | undefined;

function rowsOf(table: Table, specs: Spec[]): NutrientRow[] {
  if (!table) return [];
  return specs.flatMap(([key, label, unit]) => {
    const cell = table[key];
    if (!cell) return [];
    const value = typeof cell.valor === 'number' ? cell.valor : null;
    const status = (typeof cell.situacao === 'string' ? cell.situacao : value != null ? 'valor' : 'nao_analisado') as NutrientStatus;
    return [{ key, label, unit, value, status }];
  });
}

/** Seções da TACO; tabela inteira sem nenhum número (ex.: aminoácidos não analisados) fica de fora. */
export function tacoNutrientSections(sourceData: unknown): NutrientSection[] {
  const data = (sourceData ?? {}) as { nutrientes?: Table; acidosGraxos?: Table; aminoacidos?: Table };
  const sections: NutrientSection[] = [
    { title: 'Composição', rows: rowsOf(data.nutrientes, COMPOSITION) },
    { title: 'Minerais', rows: rowsOf(data.nutrientes, MINERALS) },
    { title: 'Vitaminas', rows: rowsOf(data.nutrientes, VITAMINS) },
    { title: 'Ácidos graxos', rows: rowsOf(data.acidosGraxos, FATTY_ACIDS) },
    { title: 'Aminoácidos', rows: rowsOf(data.aminoacidos, AMINO_ACIDS) },
  ];
  return sections.filter((s) => s.rows.some((r) => r.status !== 'nao_analisado'));
}

/** Alimento cadastrado pelo profissional: só o que ele informou. */
export function ownNutrientSections(food: {
  kcalPer100: number | null;
  proteinGPer100: number | null;
  carbGPer100: number | null;
  fatGPer100: number | null;
  fiberGPer100: number | null;
  sodiumMgPer100: number | null;
}): NutrientSection[] {
  const row = (key: string, label: string, unit: string, value: number | null): NutrientRow => ({
    key,
    label,
    unit,
    value,
    status: value != null ? 'valor' : 'nao_analisado',
  });
  return [
    {
      title: 'Composição',
      rows: [
        row('energia_kcal', 'Energia', 'kcal', food.kcalPer100),
        row('proteina', 'Proteína', 'g', food.proteinGPer100),
        row('carboidrato', 'Carboidrato', 'g', food.carbGPer100),
        row('lipideos', 'Lipídeos (gorduras)', 'g', food.fatGPer100),
        row('fibra_alimentar', 'Fibra alimentar', 'g', food.fiberGPer100),
        row('sodio', 'Sódio', 'mg', food.sodiumMgPer100),
      ],
    },
  ];
}
