import { Injectable } from '@nestjs/common';
import { EvaluationBiologicalSex } from '@prisma/client';

export interface BmiResult {
  bmi: number;
  classification: string;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

@Injectable()
export class CalculationService {
  computeBmi(weightKg: number | null | undefined, heightCm: number | null | undefined): BmiResult | null {
    if (!weightKg || !heightCm) return null;
    const heightM = heightCm / 100;
    const bmi = weightKg / (heightM * heightM);
    return { bmi: round(bmi, 1), classification: this.classifyBmi(bmi) };
  }

  private classifyBmi(bmi: number): string {
    if (bmi < 18.5) return 'abaixo do peso';
    if (bmi < 25) return 'peso normal';
    if (bmi < 30) return 'sobrepeso';
    if (bmi < 35) return 'obesidade grau I';
    if (bmi < 40) return 'obesidade grau II';
    return 'obesidade grau III';
  }

  computeWaistHipRatio(waistCm: number | null | undefined, hipCm: number | null | undefined): number | null {
    if (!waistCm || !hipCm) return null;
    return round(waistCm / hipCm, 2);
  }

  /**
   * Jackson & Pollock, 7 dobras — densidade corporal (1978 homens / 1980
   * mulheres) convertida para %gordura pela equação de Siri (1961).
   * Devolve null se qualquer uma das 7 dobras exigidas, o sexo para cálculo
   * ou a idade estiverem ausentes — nunca estima com dado parcial.
   */
  computeJacksonPollock7Percent(
    skinfoldsMm: {
      chestMm?: number | null;
      axillaryMidMm?: number | null;
      tricepsMm?: number | null;
      subscapularMm?: number | null;
      abdominalMm?: number | null;
      suprailiacMm?: number | null;
      thighMm?: number | null;
    },
    sex: EvaluationBiologicalSex | null | undefined,
    age: number | null | undefined,
  ): number | null {
    const sites = [
      skinfoldsMm.chestMm,
      skinfoldsMm.axillaryMidMm,
      skinfoldsMm.tricepsMm,
      skinfoldsMm.subscapularMm,
      skinfoldsMm.abdominalMm,
      skinfoldsMm.suprailiacMm,
      skinfoldsMm.thighMm,
    ];
    if (!sex || age == null || sites.some((site) => site == null)) {
      return null;
    }
    const definedSites = sites as number[];

    const sum7 = definedSites.reduce((total, site) => total + site, 0);

    const density =
      sex === EvaluationBiologicalSex.male
        ? 1.112 - 0.00043499 * sum7 + 0.00000055 * sum7 ** 2 - 0.00028826 * age
        : 1.097 - 0.00046971 * sum7 + 0.00000056 * sum7 ** 2 - 0.00012828 * age;

    const bodyFatPercent = 495 / density - 450;
    return round(bodyFatPercent, 1);
  }
}
