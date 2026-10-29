import { computeSkinfoldSumMm } from './dto/evolution-point.dto';
import { protocolSites, skinfoldBodyFatPercent, SKINFOLD_PROTOCOLS } from './skinfold-protocols';

/** Distribui uma soma entre as dobras pedidas (o resultado só depende da soma). */
function folds(sites: string[], total: number) {
  const each = total / sites.length;
  return Object.fromEntries(sites.map((s) => [`${s}Mm`, each]));
}

describe('protocolos de dobras cutâneas', () => {
  it('Jackson & Pollock 7 continua batendo com o laudo de referência (homem, 39 anos, soma 168 mm → 24,5%)', () => {
    const sites = protocolSites('jackson_pollock_7', 'male')!;
    expect(sites).toHaveLength(7);
    expect(skinfoldBodyFatPercent('jackson_pollock_7', folds(sites, 168), 'male', 39)).toBe(24.5);
  });

  it('Jackson & Pollock 3: dobras e equação diferentes por sexo', () => {
    expect(protocolSites('jackson_pollock_3', 'male')).toEqual(['chest', 'abdominal', 'thigh']);
    expect(protocolSites('jackson_pollock_3', 'female')).toEqual(['triceps', 'suprailiac', 'thigh']);
    expect(skinfoldBodyFatPercent('jackson_pollock_3', folds(['chest', 'abdominal', 'thigh'], 60), 'male', 30)).toBe(17.9);
    expect(skinfoldBodyFatPercent('jackson_pollock_3', folds(['triceps', 'suprailiac', 'thigh'], 70), 'female', 40)).toBe(27.9);
    // Sem idade não calcula.
    expect(skinfoldBodyFatPercent('jackson_pollock_3', folds(['chest', 'abdominal', 'thigh'], 60), 'male', null)).toBeNull();
  });

  it('Guedes 3 (não usa idade)', () => {
    expect(skinfoldBodyFatPercent('guedes_3', folds(['triceps', 'suprailiac', 'abdominal'], 50), 'male', null)).toBe(18.1);
    expect(skinfoldBodyFatPercent('guedes_3', folds(['thigh', 'suprailiac', 'subscapular'], 60), 'female', 25)).toBe(25.5);
  });

  it('Durnin & Womersley 4: coeficiente pela faixa de idade; abaixo da tabela não calcula', () => {
    const sites = ['biceps', 'triceps', 'subscapular', 'suprailiac'];
    expect(skinfoldBodyFatPercent('durnin_womersley_4', folds(sites, 40), 'male', 25)).toBe(16.2);
    expect(skinfoldBodyFatPercent('durnin_womersley_4', folds(sites, 60), 'female', 45)).toBe(33.2);
    expect(skinfoldBodyFatPercent('durnin_womersley_4', folds(sites, 40), 'male', 16)).toBeNull();
    expect(skinfoldBodyFatPercent('durnin_womersley_4', folds(sites, 40), 'female', 16)).not.toBeNull();
  });

  it('Faulkner 4: não depende de sexo nem idade', () => {
    const sites = ['triceps', 'subscapular', 'suprailiac', 'abdominal'];
    expect(skinfoldBodyFatPercent('faulkner_4', folds(sites, 50), null, null)).toBe(13.4);
    expect(protocolSites('faulkner_4', null)).toEqual(sites);
  });

  it('nunca estima com dado parcial', () => {
    const partial = { chestMm: 20, abdominalMm: 20 }; // falta coxa
    expect(skinfoldBodyFatPercent('jackson_pollock_3', partial, 'male', 30)).toBeNull();
    expect(skinfoldBodyFatPercent('guedes_3', folds(['triceps', 'suprailiac', 'abdominal'], 50), null, 30)).toBeNull(); // precisa do sexo
    expect(skinfoldBodyFatPercent('protocolo_inexistente', folds(['triceps'], 10), 'male', 30)).toBeNull();
  });

  it('soma das dobras do gráfico usa as dobras do sexo da avaliação', () => {
    const skinfolds = {
      chestMm: 10, axillaryMidMm: null, subscapularMm: 30, bicepsMm: null, tricepsMm: 12,
      abdominalMm: 25, suprailiacMm: 18, thighMm: 20, calfMm: null,
    };
    const jp3 = { code: 'jackson_pollock_3', requiredSkinfoldSites: ['chest', 'abdominal', 'thigh', 'triceps', 'suprailiac'] };
    expect(computeSkinfoldSumMm(jp3, 'male', skinfolds)).toBe(55);
    expect(computeSkinfoldSumMm(jp3, 'female', skinfolds)).toBe(50);
    expect(computeSkinfoldSumMm(jp3, null, skinfolds)).toBeNull();
    // Protocolo desconhecido no código: vale o cadastro do banco.
    expect(computeSkinfoldSumMm({ code: 'antigo', requiredSkinfoldSites: ['triceps', 'subscapular'] }, null, skinfolds)).toBe(42);
  });

  it('todo protocolo tem nome, descrição e referência', () => {
    for (const p of SKINFOLD_PROTOCOLS) {
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.reference).toBeTruthy();
    }
  });
});
