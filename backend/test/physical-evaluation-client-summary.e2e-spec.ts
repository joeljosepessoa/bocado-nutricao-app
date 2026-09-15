import { PhysicalEvaluationClientSummaryDto } from '../src/physical-evaluations/dto/physical-evaluation-client-summary.dto';

// Teste unitário puro (sem app Nest, sem banco) — só verifica que o mapper
// nunca serializa campo técnico algum, mesmo que a entidade de origem
// carregue dado sensível completo (dobras, medidas, bioimpedância, notas).
describe('PhysicalEvaluationClientSummaryDto', () => {
  it('expõe só id, data, peso, IMC, %gordura e massa magra — nunca dado técnico', () => {
    const fullEvaluation = {
      id: 'eval-1',
      evaluatedAt: new Date('2026-01-01'),
      weightKg: 80,
      heightCm: 178,
      notes: 'Nota clínica confidencial',
      biologicalSexForCalculation: 'male',
      ageAtEvaluation: 36,
      calculatedMetrics: {
        bmi: 25.2,
        bmiClassification: 'sobrepeso',
        bodyFatPercent: 12.3,
        bodyFatPercentSource: 'skinfolds',
        leanMassKg: 70.16,
      },
      skinfolds: { chestMm: 8, tricepsMm: 9 },
      measurements: { waistCm: 85, hipCm: 100 },
      bioimpedance: { origin: 'manual', segmentalData: { trunk: 1 } },
    };

    const dto = PhysicalEvaluationClientSummaryDto.fromEvaluation(fullEvaluation as never);
    const keys = Object.keys(dto);

    expect(keys.sort()).toEqual(['bmiClassification', 'bodyFatPercent', 'evaluatedAt', 'id', 'leanMassKg', 'weightKg'].sort());
    expect(dto.bmiClassification).toBe('sobrepeso');
    expect(dto.bodyFatPercent).toBe(12.3);
    expect(dto.leanMassKg).toBe(70.16);
    expect((dto as unknown as Record<string, unknown>).notes).toBeUndefined();
    expect((dto as unknown as Record<string, unknown>).skinfolds).toBeUndefined();
    expect((dto as unknown as Record<string, unknown>).measurements).toBeUndefined();
    expect((dto as unknown as Record<string, unknown>).bioimpedance).toBeUndefined();
    expect((dto as unknown as Record<string, unknown>).bodyFatPercentSource).toBeUndefined();
  });

  it('funciona sem calculatedMetrics (avaliação ainda sem cálculo)', () => {
    const dto = PhysicalEvaluationClientSummaryDto.fromEvaluation({
      id: 'eval-2',
      evaluatedAt: new Date('2026-01-01'),
      weightKg: null,
      calculatedMetrics: null,
    } as never);

    expect(dto.bmiClassification).toBeNull();
    expect(dto.weightKg).toBeNull();
    expect(dto.bodyFatPercent).toBeNull();
    expect(dto.leanMassKg).toBeNull();
  });
});
