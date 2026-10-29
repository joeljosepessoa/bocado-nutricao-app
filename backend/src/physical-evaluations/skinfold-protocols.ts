import { EvaluationBiologicalSex } from '@prisma/client';

/**
 * Protocolos de dobras cutâneas para % de gordura. Só equações publicadas e de uso corrente — nada
 * estimado com dado parcial: faltou uma dobra exigida, o sexo (quando a equação depende dele) ou a idade
 * (idem, ou fora da faixa da tabela), o resultado é null.
 *
 * Os protocolos também existem como linhas da tabela `protocols` (a avaliação guarda qual foi usado);
 * aqui fica a parte de cálculo, por código.
 */
export type SkinfoldSite = 'chest' | 'axillaryMid' | 'triceps' | 'subscapular' | 'abdominal' | 'suprailiac' | 'thigh' | 'biceps' | 'calf';

export interface SkinfoldValues {
  chestMm?: number | null;
  axillaryMidMm?: number | null;
  tricepsMm?: number | null;
  subscapularMm?: number | null;
  abdominalMm?: number | null;
  suprailiacMm?: number | null;
  thighMm?: number | null;
  bicepsMm?: number | null;
  calfMm?: number | null;
}

const FIELD: Record<SkinfoldSite, keyof SkinfoldValues> = {
  chest: 'chestMm',
  axillaryMid: 'axillaryMidMm',
  triceps: 'tricepsMm',
  subscapular: 'subscapularMm',
  abdominal: 'abdominalMm',
  suprailiac: 'suprailiacMm',
  thigh: 'thighMm',
  biceps: 'bicepsMm',
  calf: 'calfMm',
};

type Sex = EvaluationBiologicalSex;
const MALE = EvaluationBiologicalSex.male;

/** Siri (1961): densidade corporal → % de gordura. */
export const siri = (density: number) => 495 / density - 450;

export interface SkinfoldProtocolDef {
  code: string;
  name: string;
  description: string;
  /** Dobras exigidas por sexo (iguais nos dois quando a equação não muda os locais). */
  sites: Record<Sex, SkinfoldSite[]>;
  sexSpecific: boolean;
  /** % de gordura a partir da soma das dobras exigidas (mm), sexo e idade; null fora do que a equação cobre. */
  percent: (sum: number, sex: Sex, age: number | null) => number | null;
  /** Rodapé do relatório: de onde vem a conta. */
  reference: string;
}

const JP7_SITES: SkinfoldSite[] = ['chest', 'axillaryMid', 'triceps', 'subscapular', 'abdominal', 'suprailiac', 'thigh'];

/** Durnin & Womersley (1974): D = c − m · log10(soma das 4 dobras), coeficientes por sexo e faixa de idade. */
const DURNIN_TABLE: Record<Sex, Array<{ from: number; to: number; c: number; m: number }>> = {
  male: [
    { from: 17, to: 19, c: 1.162, m: 0.063 },
    { from: 20, to: 29, c: 1.1631, m: 0.0632 },
    { from: 30, to: 39, c: 1.1422, m: 0.0544 },
    { from: 40, to: 49, c: 1.162, m: 0.07 },
    { from: 50, to: 200, c: 1.1715, m: 0.0779 },
  ],
  female: [
    { from: 16, to: 19, c: 1.1549, m: 0.0678 },
    { from: 20, to: 29, c: 1.1599, m: 0.0717 },
    { from: 30, to: 39, c: 1.1423, m: 0.0632 },
    { from: 40, to: 49, c: 1.1333, m: 0.0612 },
    { from: 50, to: 200, c: 1.1339, m: 0.0645 },
  ],
};

export const SKINFOLD_PROTOCOLS: SkinfoldProtocolDef[] = [
  {
    code: 'jackson_pollock_7',
    name: 'Jackson & Pollock — 7 dobras',
    description:
      'Densidade corporal por Jackson & Pollock (1978, homens; Jackson, Pollock & Ward, 1980, mulheres), ' +
      'convertida para percentual de gordura pela equação de Siri (1961). Protocolo padrão do Bocado de Nutrição.',
    sites: { male: JP7_SITES, female: JP7_SITES },
    sexSpecific: true,
    percent: (s, sex, age) =>
      age == null
        ? null
        : siri(
            sex === MALE
              ? 1.112 - 0.00043499 * s + 0.00000055 * s ** 2 - 0.00028826 * age
              : 1.097 - 0.00046971 * s + 0.00000056 * s ** 2 - 0.00012828 * age,
          ),
    reference: 'Jackson & Pollock (7 dobras) com a equação de Siri',
  },
  {
    code: 'jackson_pollock_3',
    name: 'Jackson & Pollock — 3 dobras',
    description:
      'Homens: peitoral, abdominal e coxa (Jackson & Pollock, 1978). Mulheres: tríceps, supra-ilíaca e coxa ' +
      '(Jackson, Pollock & Ward, 1980). Densidade convertida para % de gordura por Siri (1961).',
    sites: { male: ['chest', 'abdominal', 'thigh'], female: ['triceps', 'suprailiac', 'thigh'] },
    sexSpecific: true,
    percent: (s, sex, age) =>
      age == null
        ? null
        : siri(
            sex === MALE
              ? 1.10938 - 0.0008267 * s + 0.0000016 * s ** 2 - 0.0002574 * age
              : 1.0994921 - 0.0009929 * s + 0.0000023 * s ** 2 - 0.0001392 * age,
          ),
    reference: 'Jackson & Pollock (3 dobras) com a equação de Siri',
  },
  {
    code: 'guedes_3',
    name: 'Guedes — 3 dobras',
    description:
      'Equação brasileira de Guedes (1985). Homens: tríceps, supra-ilíaca e abdominal; mulheres: coxa, ' +
      'supra-ilíaca e subescapular. Densidade convertida para % de gordura por Siri (1961).',
    sites: { male: ['triceps', 'suprailiac', 'abdominal'], female: ['thigh', 'suprailiac', 'subscapular'] },
    sexSpecific: true,
    percent: (s, sex) => (s <= 0 ? null : siri(sex === MALE ? 1.17136 - 0.06706 * Math.log10(s) : 1.1665 - 0.07063 * Math.log10(s))),
    reference: 'Guedes (3 dobras) com a equação de Siri',
  },
  {
    code: 'durnin_womersley_4',
    name: 'Durnin & Womersley — 4 dobras',
    description:
      'Bíceps, tríceps, subescapular e supra-ilíaca (Durnin & Womersley, 1974), coeficientes por sexo e faixa ' +
      'de idade (homens a partir de 17 anos, mulheres a partir de 16). Densidade convertida por Siri (1961).',
    sites: { male: ['biceps', 'triceps', 'subscapular', 'suprailiac'], female: ['biceps', 'triceps', 'subscapular', 'suprailiac'] },
    sexSpecific: true,
    percent: (s, sex, age) => {
      if (age == null || s <= 0) return null;
      const row = DURNIN_TABLE[sex].find((r) => age >= r.from && age <= r.to);
      return row ? siri(row.c - row.m * Math.log10(s)) : null;
    },
    reference: 'Durnin & Womersley (4 dobras) com a equação de Siri',
  },
  {
    code: 'faulkner_4',
    name: 'Faulkner — 4 dobras',
    description: 'Tríceps, subescapular, supra-ilíaca e abdominal: % de gordura = 0,153 × soma + 5,783 (Faulkner, 1968). Não depende de sexo nem idade.',
    sites: { male: ['triceps', 'subscapular', 'suprailiac', 'abdominal'], female: ['triceps', 'subscapular', 'suprailiac', 'abdominal'] },
    sexSpecific: false,
    percent: (s) => 0.153 * s + 5.783,
    reference: 'Faulkner (4 dobras)',
  },
];

export const findSkinfoldProtocol = (code: string | null | undefined) => SKINFOLD_PROTOCOLS.find((p) => p.code === code) ?? null;

/** Dobras que entram na conta para este sexo (sem sexo, só quando o protocolo não depende dele). */
export function protocolSites(code: string | null | undefined, sex: Sex | null | undefined): SkinfoldSite[] | null {
  const protocol = findSkinfoldProtocol(code);
  if (!protocol) return null;
  if (sex) return protocol.sites[sex];
  return protocol.sexSpecific ? null : protocol.sites.male;
}

/** Soma das dobras exigidas (mm), ou null se faltar alguma. */
export function sumSites(sites: SkinfoldSite[], skinfolds: SkinfoldValues | null | undefined): number | null {
  if (!skinfolds || sites.length === 0) return null;
  let sum = 0;
  for (const site of sites) {
    const value = skinfolds[FIELD[site]];
    if (value == null) return null;
    sum += value;
  }
  return Math.round(sum * 100) / 100;
}

/** % de gordura (1 casa) pelo protocolo, ou null quando falta dado ou a equação não cobre o caso. */
export function skinfoldBodyFatPercent(
  code: string | null | undefined,
  skinfolds: SkinfoldValues | null | undefined,
  sex: Sex | null | undefined,
  age: number | null | undefined,
): number | null {
  const protocol = findSkinfoldProtocol(code);
  const sites = protocolSites(code, sex);
  if (!protocol || !sites) return null;
  const sum = sumSites(sites, skinfolds);
  if (sum == null) return null;
  // Sem sexo só chega aqui protocolo que não depende dele (Faulkner).
  const percent = protocol.percent(sum, sex ?? MALE, age ?? null);
  return percent == null || !Number.isFinite(percent) ? null : Math.round(percent * 10) / 10;
}
