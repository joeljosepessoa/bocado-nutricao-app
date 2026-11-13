import type { ScaleProfile, SegmentImpedances } from './icomonProtocol';

/**
 * Composição corporal a partir da bioimpedância da balança — só equações
 * publicadas, nunca a conta (secreta) do app do fabricante.
 *
 * - Resistência do corpo inteiro = braço + tronco + perna (média dos dois lados),
 *   a 50 kHz por interpolação logarítmica entre 20 e 100 kHz.
 * - Massa livre de gordura: Sun SS et al., Am J Clin Nutr 2003;77:331–40 (NHANES III),
 *   × 1,04 — calibração contra o app da balança (pesagens comparadas de 3 pessoas,
 *   homens e mulher: a Sun sozinha dava 3–5% menos massa magra que o app).
 * - Músculo esquelético: 57% da massa livre de gordura — razão que o app da balança
 *   mantém em todas as pesagens comparadas (55,9–57,8%). Janssen 2000 errava até 7 kg
 *   em mulher.
 * - Água corporal: 73,2% da massa livre de gordura (Wang Z et al., Am J Clin Nutr 1999;69:833–41).
 * - Metabolismo basal: Katch-McArdle (370 + 21,6 × massa livre de gordura).
 * - Massa óssea: 6,7% da massa livre de gordura; massa muscular = massa livre de
 *   gordura − osso; proteína = massa livre de gordura − água − osso (mesmas
 *   relações que o app da balança mostra entre esses números).
 * - Peso ideal: IMC 22 para a altura.
 *
 * - Músculo por parte do corpo: o app da balança não mede cada lado — divide a massa
 *   muscular em frações fixas (esquerdo = direito sempre). Frações tiradas de 3 pessoas
 *   comparadas: tronco 46,6–46,7%, cada perna 17,5–17,8%, cada braço 5,6–6,2%.
 *
 * Gordura visceral, subcutânea, idade corporal e a gordura por segmento ficam de
 * fora até a calibração com mais pesagens comparadas ao app da balança.
 */

export const FAT_FREE_MASS_REFERENCE = 'Sun et al. 2003';
/** Ajuste fino da massa livre de gordura, calibrado contra o app da balança (1 = sem ajuste). */
export const FAT_FREE_MASS_CALIBRATION = 1.04;
export const SKELETAL_MUSCLE_REFERENCE = '57% da massa magra (calibrado com o app da balança)';

export interface MuscleBySegment {
  /** Cada braço. */
  armKg: number;
  /** Cada perna. */
  legKg: number;
  trunkKg: number;
}

const ARM_SHARE_OF_MUSCLE = 0.059;
const LEG_SHARE_OF_MUSCLE = 0.176;
const TRUNK_SHARE_OF_MUSCLE = 0.467;

/** Divisão da massa muscular por parte do corpo, nas mesmas frações do app da balança. */
export function muscleBySegment(muscleMassKg: number): MuscleBySegment | null {
  if (!(muscleMassKg > 0)) return null;
  return {
    armKg: round1(ARM_SHARE_OF_MUSCLE * muscleMassKg),
    legKg: round1(LEG_SHARE_OF_MUSCLE * muscleMassKg),
    trunkKg: round1(TRUNK_SHARE_OF_MUSCLE * muscleMassKg),
  };
}

export interface BodyComposition {
  wholeBodyResistance50kHz: number;
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
  proteinKg: number;
  proteinPercent: number;
  idealWeightKg: number;
}

const BONE_SHARE_OF_FAT_FREE_MASS = 0.067;
const SKELETAL_MUSCLE_SHARE_OF_FAT_FREE_MASS = 0.57;
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
  const r = resistanceAt50kHz(impedance.khz20, impedance.khz100);
  if (!(r > 0) || !(weightKg > 0) || !(profile.heightCm > 0)) return null;
  const index = (profile.heightCm * profile.heightCm) / r;
  const male = profile.sex === 'male';

  const sun = male ? -10.68 + 0.65 * index + 0.26 * weightKg + 0.02 * r : -9.53 + 0.69 * index + 0.17 * weightKg + 0.02 * r;
  const fatFree = Math.min(weightKg, Math.max(0, sun * FAT_FREE_MASS_CALIBRATION));
  const fat = weightKg - fatFree;
  const muscle = SKELETAL_MUSCLE_SHARE_OF_FAT_FREE_MASS * fatFree;
  const water = WATER_SHARE_OF_FAT_FREE_MASS * fatFree;
  const bone = BONE_SHARE_OF_FAT_FREE_MASS * fatFree;
  const muscleMass = fatFree - bone;
  const protein = Math.max(0, fatFree - water - bone);

  return {
    wholeBodyResistance50kHz: round1(r),
    fatFreeMassKg: round1(fatFree),
    fatMassKg: round1(fat),
    bodyFatPercent: round1((fat / weightKg) * 100),
    skeletalMuscleMassKg: round1(Math.max(0, muscle)),
    bodyWaterKg: round1(water),
    bodyWaterPercent: round1((water / weightKg) * 100),
    basalMetabolicRateKcal: Math.round(370 + 21.6 * fatFree),
    boneMassKg: round1(bone),
    muscleMassKg: round1(muscleMass),
    muscleRatePercent: round1((muscleMass / weightKg) * 100),
    muscleBySegment: muscleBySegment(muscleMass),
    proteinKg: round1(protein),
    proteinPercent: round1((protein / weightKg) * 100),
    idealWeightKg: round1(IDEAL_BMI * (profile.heightCm / 100) ** 2),
  };
}
