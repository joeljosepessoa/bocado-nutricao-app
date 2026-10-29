import { Injectable } from '@nestjs/common';
import { EvaluationBiologicalSex } from '@prisma/client';
import { skinfoldBodyFatPercent, type SkinfoldValues } from './skinfold-protocols';

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
   * % de gordura por dobras cutâneas no protocolo da avaliação (ver skinfold-protocols.ts): null se
   * faltar qualquer dobra exigida, o sexo/idade que a equação usa, ou se o protocolo não for de dobras.
   */
  computeSkinfoldPercent(
    protocolCode: string | null | undefined,
    skinfoldsMm: SkinfoldValues | null | undefined,
    sex: EvaluationBiologicalSex | null | undefined,
    age: number | null | undefined,
  ): number | null {
    return skinfoldBodyFatPercent(protocolCode, skinfoldsMm, sex, age);
  }

  /** Jackson & Pollock, 7 dobras + Siri (mantido para quem já chamava por este nome). */
  computeJacksonPollock7Percent(skinfoldsMm: SkinfoldValues, sex: EvaluationBiologicalSex | null | undefined, age: number | null | undefined): number | null {
    if (age == null) return null;
    return skinfoldBodyFatPercent('jackson_pollock_7', skinfoldsMm, sex, age);
  }
}
