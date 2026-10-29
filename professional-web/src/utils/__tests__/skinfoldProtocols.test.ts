import { describe, expect, it } from 'vitest';
import type { Skinfolds } from '../../types/api';
import { requiredSites, SKINFOLD_PROTOCOL_OPTIONS, skinfoldWarningText } from '../skinfoldProtocols';

const label = (site: keyof Skinfolds) => site.replace('Mm', '');
const filled = (...sites: Array<keyof Skinfolds>) => new Set(sites);

describe('protocolos de dobras no formulário', () => {
  it('oferece os 5 protocolos, com o Pollock 7 primeiro', () => {
    expect(SKINFOLD_PROTOCOL_OPTIONS.map((p) => p.code)).toEqual(['jackson_pollock_7', 'jackson_pollock_3', 'guedes_3', 'durnin_womersley_4', 'faulkner_4']);
  });

  it('dobras usadas dependem do sexo quando o protocolo muda por sexo', () => {
    expect(requiredSites('guedes_3', 'male')).toEqual(['tricepsMm', 'suprailiacMm', 'abdominalMm']);
    expect(requiredSites('guedes_3', 'female')).toEqual(['thighMm', 'suprailiacMm', 'subscapularMm']);
    expect(requiredSites('guedes_3', '')).toBeNull();
    expect(requiredSites('faulkner_4', '')).toHaveLength(4);
  });

  it('avisa o que falta, na ordem: sexo (se muda as dobras), dobras, idade/sexo, idade mínima', () => {
    expect(skinfoldWarningText('jackson_pollock_3', '', 30, filled(), label)).toMatch(/Informe o sexo/);
    expect(skinfoldWarningText('jackson_pollock_3', 'male', 30, filled('chestMm'), label)).toBe('Sem estas dobras o % de gordura não é calculado: abdominal, thigh.');
    expect(skinfoldWarningText('jackson_pollock_3', 'male', null, filled('chestMm', 'abdominalMm', 'thighMm'), label)).toBe(
      'Para calcular o % de gordura falta informar a idade em "Dados básicos".',
    );
    // Guedes não usa idade.
    expect(skinfoldWarningText('guedes_3', 'male', null, filled('tricepsMm', 'suprailiacMm', 'abdominalMm'), label)).toBeNull();
    // Faulkner não usa sexo nem idade.
    expect(skinfoldWarningText('faulkner_4', '', null, filled('tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm'), label)).toBeNull();
    const durnin = filled('bicepsMm', 'tricepsMm', 'subscapularMm', 'suprailiacMm');
    expect(skinfoldWarningText('durnin_womersley_4', 'male', 16, durnin, label)).toBe('Durnin & Womersley só vale a partir de 17 anos — escolha outro protocolo.');
    expect(skinfoldWarningText('durnin_womersley_4', 'female', 16, durnin, label)).toBeNull();
  });
});
