import { AiOutputValidationError } from '../../ai-errors';
import { DIET_LIMITS, parseOrganizedDiet } from './organized-diet.schema';

const diet = (warnings: unknown) =>
  JSON.stringify({
    days: [
      {
        label: null,
        kind: 'other',
        usageNotes: null,
        meals: [
          {
            name: 'Almoço',
            time: null,
            notes: null,
            groups: [
              {
                kind: 'fixed',
                label: null,
                choices: [
                  {
                    label: null,
                    items: [{ sourceText: 'Arroz cozido — 100 g', food: 'Arroz cozido', quantity: 100, quantityMax: null, unit: 'g', freeQuantity: false, notes: null }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    supplements: [],
    guidelines: [],
    warnings,
  });

describe('parseOrganizedDiet — avisos da IA', () => {
  it('aviso longo demais é encurtado em vez de recusar a dieta inteira', () => {
    const result = parseOrganizedDiet(diet(['b'.repeat(DIET_LIMITS.maxWarningLength + 150), '  curto  ', '   ']));
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toHaveLength(DIET_LIMITS.maxWarningLength);
    expect(result.warnings[0].endsWith('…')).toBe(true);
    expect(result.warnings[1]).toBe('curto');
  });

  it('avisos além do limite são cortados, não recusados', () => {
    const many = Array.from({ length: DIET_LIMITS.maxWarnings + 5 }, (_, i) => `aviso ${i}`);
    expect(parseOrganizedDiet(diet(many)).warnings).toHaveLength(DIET_LIMITS.maxWarnings);
  });

  it('aviso que não é texto continua sendo recusado', () => {
    expect(() => parseOrganizedDiet(diet([123]))).toThrow(AiOutputValidationError);
  });
});
