import type { ScaleProfile, SegmentImpedances } from './icomonProtocol';

/**
 * Composição corporal a partir da bioimpedância da balança.
 *
 * As contas foram AJUSTADAS aos números do app da balança (relatórios da Relaxmedic,
 * que imprimem as impedâncias por parte do corpo, e uma pesagem gravada do app):
 * 7 pessoas, homens e mulheres, de 36 a 59 anos e de 66 a 103 kg. Não é o código do
 * fabricante — é uma regressão própria sobre o que o app mostra.
 *
 * - Resistência do corpo inteiro = braço + tronco + perna (média dos dois lados).
 * - Massa livre de gordura: −1,52 + 0,962 × altura²/R(100 kHz) + 0,052 × peso − 8,49
 *   (homem). Nas 6 pesagens com impedância conhecida, errou no máximo 0,7 kg mesmo
 *   calculando cada pessoa sem ela entrar no ajuste. A Sun 2003 (equação publicada
 *   usada antes) errava até 4,8 kg.
 * - Músculo esquelético: 57,2% da massa magra no homem e 55,7% na mulher.
 * - Água corporal: 73,2% da massa magra. Metabolismo basal: Katch-McArdle
 *   (370 + 21,6 × massa magra). Massa óssea: 6,7% da massa magra; massa muscular =
 *   massa magra − osso; proteína = massa magra − água − osso. Peso ideal: IMC 22.
 *   (Mesmas relações em todas as pesagens comparadas.)
 * - Gordura visceral (nível): −2,28 + 0,502 × massa gorda − 0,57 (homem) — acertou o
 *   nível das 9 pessoas comparadas (2 a 16).
 * - Gordura subcutânea: 71,5% do percentual de gordura (igual em todas).
 * - Idade corporal: −7,6 + 0,904 × idade + 0,37 × % de gordura + 3,9 (homem) — até
 *   1,4 ano de diferença nas 8 pessoas com idade conhecida.
 * - Músculo por parte do corpo: o app não mede cada lado — divide a massa muscular em
 *   frações fixas (esquerdo = direito): tronco 46,7%; cada perna 17,8% (homem) ou
 *   17,3% (mulher); cada braço 6,2% (homem) ou 5,7% (mulher).
 * - Gordura por parte do corpo: o relatório do fabricante diz que é "valor inferido" —
 *   tronco 55% da massa gorda; cada braço −0,40 + 0,0796 × massa gorda; cada perna
 *   0,44 + 0,1346 × massa gorda (7 pessoas, até 0,2 kg de diferença nos braços e pernas).
 *   O relatório do cliente (backend, bioimpedance-analysis.ts) usa as mesmas contas.
 */

export const FAT_FREE_MASS_REFERENCE = 'Regressão própria ajustada ao app da balança (7 pessoas, 100 kHz)';
export const SKELETAL_MUSCLE_REFERENCE = '57,2% (homem) / 55,7% (mulher) da massa magra';

type Sex = 'male' | 'female';

export interface MuscleBySegment {
  /** Cada braço. */
  armKg: number;
  /** Cada perna. */
  legKg: number;
  trunkKg: number;
}

const MUSCLE_SHARES: Record<Sex | 'unknown', { arm: number; leg: number; trunk: number }> = {
  male: { arm: 0.062, leg: 0.178, trunk: 0.467 },
  female: { arm: 0.057, leg: 0.173, trunk: 0.467 },
  unknown: { arm: 0.06, leg: 0.176, trunk: 0.467 },
};

const TRUNK_SHARE_OF_FAT = 0.55;

const SUBCUTANEOUS_SHARE_OF_BODY_FAT = 0.715;

/** Divisão da massa muscular por parte do corpo, nas mesmas frações do app da balança. */
export function muscleBySegment(muscleMassKg: number, sex: Sex | null = null): MuscleBySegment | null {
  if (!(muscleMassKg > 0)) return null;
  const share = MUSCLE_SHARES[sex ?? 'unknown'];
  return {
    armKg: round1(share.arm * muscleMassKg),
    legKg: round1(share.leg * muscleMassKg),
    trunkKg: round1(share.trunk * muscleMassKg),
  };
}

/** Divisão da massa gorda por parte do corpo, nas mesmas frações do app da balança. */
export function fatBySegment(fatMassKg: number): MuscleBySegment | null {
  if (!(fatMassKg > 0)) return null;
  return {
    armKg: round1(Math.max(0.1, -0.401 + 0.0796 * fatMassKg)),
    legKg: round1(Math.max(0.1, 0.437 + 0.1346 * fatMassKg)),
    trunkKg: round1(TRUNK_SHARE_OF_FAT * fatMassKg),
  };
}

/** Nível de gordura visceral (1 a 59, como nas balanças), a partir da massa gorda. */
export function visceralFatLevel(fatMassKg: number, sex: Sex): number | null {
  if (!(fatMassKg >= 0)) return null;
  const level = -2.282 + 0.502 * fatMassKg - (sex === 'male' ? 0.572 : 0);
  return Math.min(59, Math.max(1, Math.round(level)));
}

/** Gordura subcutânea (% do peso), como o app da balança mostra. */
export function subcutaneousFatPercent(bodyFatPercent: number): number | null {
  if (!(bodyFatPercent > 0)) return null;
  return round1(SUBCUTANEOUS_SHARE_OF_BODY_FAT * bodyFatPercent);
}

/** Idade corporal (anos), como o app da balança mostra. */
export function bodyAgeYears(age: number, bodyFatPercent: number, sex: Sex): number | null {
  if (!(age > 0) || !(bodyFatPercent > 0)) return null;
  return Math.max(10, Math.round(-7.577 + 0.904 * age + 0.37 * bodyFatPercent + (sex === 'male' ? 3.875 : 0)));
}

export interface BodyComposition {
  wholeBodyResistance50kHz: number;
  wholeBodyResistance100kHz: number;
  fatFreeMassKg: number;
  fatMassKg: number;
  bodyFatPercent: number;
  skeletalMuscleMassKg: number;
  bodyWaterKg: number;
  bodyWaterPercent: number;
  basalMetabolicRateKcal: number;
  boneMassKg: number;
  muscleMassKg: number;
  muscleRatePercent: number;
  muscleBySegment: MuscleBySegment | null;
  fatBySegment: MuscleBySegment | null;
  visceralFatLevel: number | null;
  subcutaneousFatPercent: number | null;
  bodyAgeYears: number | null;
  proteinKg: number;
  proteinPercent: number;
  idealWeightKg: number;
}

const BONE_SHARE_OF_FAT_FREE_MASS = 0.067;
const SKELETAL_MUSCLE_SHARE_OF_FAT_FREE_MASS: Record<Sex, number> = { male: 0.572, female: 0.557 };
const WATER_SHARE_OF_FAT_FREE_MASS = 0.732;
const IDEAL_BMI = 22;

const round1 = (n: number) => Math.round(n * 10) / 10;

function wholeBody(z: SegmentImpedances): number {
  return (z.arms[0] + z.arms[1]) / 2 + z.trunk + (z.legs[0] + z.legs[1]) / 2;
}

export function resistanceAt50kHz(khz20: SegmentImpedances, khz100: SegmentImpedances): number {
  const r20 = wholeBody(khz20);
  const r100 = wholeBody(khz100);
  return r20 - (r20 - r100) * (Math.log(50 / 20) / Math.log(100 / 20));
}

export function bodyComposition(
  weightKg: number,
  profile: ScaleProfile,
  impedance: { khz20: SegmentImpedances; khz100: SegmentImpedances },
): BodyComposition | null {
  const r50 = resistanceAt50kHz(impedance.khz20, impedance.khz100);
  const r100 = wholeBody(impedance.khz100);
  if (!(r100 > 0) || !(weightKg > 0) || !(profile.heightCm > 0)) return null;
  const index = (profile.heightCm * profile.heightCm) / r100;
  const male = profile.sex === 'male';

  const estimate = -1.518 + 0.962 * index + 0.052 * weightKg - (male ? 8.492 : 0);
  const fatFree = Math.min(weightKg, Math.max(0, estimate));
  const fat = weightKg - fatFree;
  const muscle = SKELETAL_MUSCLE_SHARE_OF_FAT_FREE_MASS[profile.sex] * fatFree;
  const water = WATER_SHARE_OF_FAT_FREE_MASS * fatFree;
  const bone = BONE_SHARE_OF_FAT_FREE_MASS * fatFree;
  const muscleMass = fatFree - bone;
  const protein = Math.max(0, fatFree - water - bone);

  const bodyFat = round1((fat / weightKg) * 100);

  return {
    wholeBodyResistance50kHz: round1(r50),
    wholeBodyResistance100kHz: round1(r100),
    fatFreeMassKg: round1(fatFree),
    fatMassKg: round1(fat),
    bodyFatPercent: bodyFat,
    skeletalMuscleMassKg: round1(Math.max(0, muscle)),
    bodyWaterKg: round1(water),
    bodyWaterPercent: round1((water / weightKg) * 100),
    basalMetabolicRateKcal: Math.round(370 + 21.6 * fatFree),
    boneMassKg: round1(bone),
    muscleMassKg: round1(muscleMass),
    muscleRatePercent: round1((muscleMass / weightKg) * 100),
    muscleBySegment: muscleBySegment(muscleMass, profile.sex),
    fatBySegment: fatBySegment(fat),
    visceralFatLevel: visceralFatLevel(fat, profile.sex),
    subcutaneousFatPercent: subcutaneousFatPercent(bodyFat),
    bodyAgeYears: bodyAgeYears(profile.age, bodyFat, profile.sex),
    proteinKg: round1(protein),
    proteinPercent: round1((protein / weightKg) * 100),
    idealWeightKg: round1(IDEAL_BMI * (profile.heightCm / 100) ** 2),
  };
}
