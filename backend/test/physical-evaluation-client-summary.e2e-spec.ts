import { PhysicalEvaluationClientSummaryDto } from '../src/physical-evaluations/dto/physical-evaluation-client-summary.dto';

// Teste unitário puro (sem app Nest, sem banco) — só verifica que o mapper
// nunca serializa campo técnico algum, mesmo que a entidade de origem
// carregue dado sensível completo (dobras, notas, protocolo, bioimpedância
// bruta), e que expõe exatamente o allowlist da Fase 8 (Decisão 2):
// composição corporal + circunferências, nunca dobra/protocolo/clínico.
describe('PhysicalEvaluationClientSummaryDto', () => {
  it('expõe composição corporal e circunferências, nunca dado técnico ou clínico', () => {
    const fullEvaluation = {
      id: 'eval-1',
      evaluatedAt: new Date('2026-01-01'),
      weightKg: 80,
      heightCm: 178,
      notes: 'Nota clínica confidencial',
      biologicalSexForCalculation: 'male',
      ageAtEvaluation: 36,
      bloodPressureSystolic: 120,
      bloodPressureDiastolic: 80,
      heartRate: 70,
      glucose: 90,
      protocol: { code: 'jackson_pollock_7', version: 1, requiredSkinfoldSites: ['chest'] },
      calculatedMetrics: {
        bmi: 25.2,
        bmiClassification: 'sobrepeso',
        bodyFatPercent: 12.3,
        bodyFatPercentSource: 'skinfolds',
        fatMassKg: 9.84,
        leanMassKg: 70.16,
      },
      skinfolds: { chestMm: 8, tricepsMm: 9 },
      measurements: {
        chestCm: 100,
        waistCm: 85,
        abdomenCm: 90,
        hipCm: 100,
        armRightCm: 32,
        armLeftCm: 31.5,
        forearmRightCm: 27,
        forearmLeftCm: 26.5,
        thighRightCm: 55,
        thighLeftCm: 54.5,
        calfRightCm: 37,
        calfLeftCm: 36.5,
        wristCm: 17,
        femurBicondylarCm: 9.5,
      },
      bioimpedance: {
        origin: 'manual',
        recordedAt: new Date('2026-01-01'),
        muscleMassKg: 33.2,
        skeletalMuscleMassKg: 30.1,
        bodyWaterPercent: 55.4,
        visceralFatLevel: 8,
        boneMassKg: 3.1,
        basalMetabolicRateKcal: 1750,
        bodyAgeYears: 30,
        segmentalData: { trunk: 1 },
        impedanceData: { raw: [1, 2, 3] },
      },
      photos: [
        { id: 'photo-1', angle: 'front', storageKey: 'private/eval-1/front.jpg', contentType: 'image/jpeg' },
      ],
    };

    const dto = PhysicalEvaluationClientSummaryDto.fromEvaluation(fullEvaluation as never);
    const keys = Object.keys(dto).sort();

    expect(keys).toEqual(
      ['bmi', 'bmiClassification', 'bodyFatPercent', 'composition', 'evaluatedAt', 'fatMassKg', 'id', 'leanMassKg', 'measurements', 'photos', 'weightKg'].sort(),
    );

    expect(dto.photos).toEqual([{ id: 'photo-1', angle: 'front' }]);
    const rawPhoto = dto.photos[0] as unknown as Record<string, unknown>;
    expect(rawPhoto.storageKey).toBeUndefined();
    expect(rawPhoto.contentType).toBeUndefined();

    expect(dto.bmi).toBe(25.2);
    expect(dto.bmiClassification).toBe('sobrepeso');
    expect(dto.bodyFatPercent).toBe(12.3);
    expect(dto.fatMassKg).toBe(9.84);
    expect(dto.leanMassKg).toBe(70.16);

    expect(dto.measurements).toEqual({
      chestCm: 100,
      waistCm: 85,
      abdomenCm: 90,
      hipCm: 100,
      armRightCm: 32,
      armLeftCm: 31.5,
      forearmRightCm: 27,
      forearmLeftCm: 26.5,
      thighRightCm: 55,
      thighLeftCm: 54.5,
      calfRightCm: 37,
      calfLeftCm: 36.5,
      wristCm: 17,
      femurBicondylarCm: 9.5,
    });

    expect(dto.composition).toEqual({
      muscleMassKg: 33.2,
      skeletalMuscleMassKg: 30.1,
      bodyWaterPercent: 55.4,
      visceralFatLevel: 8,
      boneMassKg: 3.1,
      basalMetabolicRateKcal: 1750,
      bodyAgeYears: 30,
    });

    const raw = dto as unknown as Record<string, unknown>;
    expect(raw.notes).toBeUndefined();
    expect(raw.skinfolds).toBeUndefined();
    expect(raw.bloodPressureSystolic).toBeUndefined();
    expect(raw.bloodPressureDiastolic).toBeUndefined();
    expect(raw.heartRate).toBeUndefined();
    expect(raw.glucose).toBeUndefined();
    expect(raw.protocol).toBeUndefined();
    expect(raw.bodyFatPercentSource).toBeUndefined();
    expect((dto.composition as unknown as Record<string, unknown>).origin).toBeUndefined();
    expect((dto.composition as unknown as Record<string, unknown>).segmentalData).toBeUndefined();
    expect((dto.composition as unknown as Record<string, unknown>).impedanceData).toBeUndefined();
    expect((dto.composition as unknown as Record<string, unknown>).recordedAt).toBeUndefined();
  });

  it('funciona sem calculatedMetrics, measurements ou bioimpedance (avaliação ainda incompleta)', () => {
    const dto = PhysicalEvaluationClientSummaryDto.fromEvaluation({
      id: 'eval-2',
      evaluatedAt: new Date('2026-01-01'),
      weightKg: null,
      calculatedMetrics: null,
      measurements: null,
      bioimpedance: null,
    } as never);

    expect(dto.bmi).toBeNull();
    expect(dto.bmiClassification).toBeNull();
    expect(dto.weightKg).toBeNull();
    expect(dto.bodyFatPercent).toBeNull();
    expect(dto.fatMassKg).toBeNull();
    expect(dto.leanMassKg).toBeNull();
    expect(dto.measurements).toBeNull();
    expect(dto.composition).toBeNull();
  });
});
