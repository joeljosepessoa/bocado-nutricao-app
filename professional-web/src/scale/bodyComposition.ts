import type { ScaleProfile, SegmentImpedances } from './icomonProtocol';

/**
 * Composição corporal a partir da bioimpedância da balança — só equações
 * publicadas, nunca a conta (secreta) do app do fabricante.
 *
 * - Resistência do corpo inteiro = braço + tronco + perna (média dos dois lados),
 *   a 50 kHz por interpolação logarítmica entre 20 e 100 kHz.
 * - Massa livre de gordura: Sun SS et al., Am J Clin Nutr 2003;77:331–40 (NHANES III).
 * - Músculo esquelético: Janssen I et al., J Appl Physiol 2000;89:465–71.
 * - Água corporal: 73,2% da massa livre de gordura (Wang Z et al., Am J Clin Nutr 1999;69:833–41).
 * - Metabolismo basal: Katch-McArdle (370 + 21,6 × massa livre de gordura).
 *
 * Massa óssea, gordura visceral e idade corporal não têm equação publicada a
 * partir destes dados — ficam de fora em vez de inventadas.
 */

export const FAT_FREE_MASS_REFERENCE = 'Sun et al. 2003';
/** Ajuste fino da massa livre de gordura, calibrado contra o app da balança (1 = sem ajuste). */
export const FAT_FREE_MASS_CALIBRATION = 1;

export interface BodyComposition {
  wholeBodyResistance50kHz: number;
  fatFreeMassKg: number;
  fatMassKg: number;
  bodyFatPercent: number;
  skeletalMuscleMassKg: number;
  bodyWaterKg: number;
  bodyWaterPercent: number;
  basalMetabolicRateKcal: number;
}

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
  const muscle = 0.401 * index + (male ? 3.825 : 0) - 0.071 * profile.age + 5.102;
  const water = 0.732 * fatFree;

  return {
    wholeBodyResistance50kHz: round1(r),
    fatFreeMassKg: round1(fatFree),
    fatMassKg: round1(fat),
    bodyFatPercent: round1((fat / weightKg) * 100),
    skeletalMuscleMassKg: round1(Math.max(0, muscle)),
    bodyWaterKg: round1(water),
    bodyWaterPercent: round1((water / weightKg) * 100),
    basalMetabolicRateKcal: Math.round(370 + 21.6 * fatFree),
  };
}
