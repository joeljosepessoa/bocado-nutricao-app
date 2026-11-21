import { describe, expect, it } from 'vitest';
import { ackFrame, parseFrame, profileFrame, readyFrame, toHex } from '../icomonProtocol';
import { bodyAgeYears, bodyComposition, fatBySegment, muscleBySegment, resistanceAt50kHz, visceralFatLevel } from '../bodyComposition';

const hex = (text: string) => new Uint8Array(text.split(' ').map((b) => parseInt(b, 16)));

// Quadros reais de uma pesagem feita pelo painel (perfil "bocado", 181 cm, 40 anos, masculino).
const DEVICE_INFO = '7c 00 1d 00 aa 33 71 1e 1a 64 25 01 0a 00 00 00 07 41 01 01 00 00 00 ff 00 00 d4 1e 00 00 03 40 00 18';
const LIVE = '2b 00 07 00 a2 01 00 01 93 b6 00 0d';
const LIVE_STABLE = '6d 00 07 00 a2 03 00 01 96 72 00 0e';
const RESULT = '7f 00 23 00 a7 6a e6 54 a2 25 01 96 72 00 0a 00 56 08 6b 08 99 07 e1 07 96 00 13 07 1b 07 51 06 ce 06 8b 02 b0 ca d0 12';
const RESULT_WITHOUT_IMPEDANCE =
  '67 00 23 00 a7 6a e6 52 b6 25 01 93 b6 00 0a 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 02 b0 ca d0 04';

describe('protocolo da balança iComon (FFB0)', () => {
  it('lê a apresentação, o peso ao vivo e o peso firme', () => {
    expect(parseFrame(hex(DEVICE_INFO))).toEqual({ kind: 'device-info', seq: 0x7c });
    expect(parseFrame(hex(LIVE))).toEqual({ kind: 'live', weightKg: 103.35, stable: false });
    expect(parseFrame(hex(LIVE_STABLE))).toEqual({ kind: 'live', weightKg: 104.05, stable: true });
  });

  it('lê o resultado com as impedâncias por segmento a 20 e 100 kHz', () => {
    const result = parseFrame(hex(RESULT));
    expect(result).toMatchObject({ kind: 'result', seq: 0x7f, weightKg: 104.05 });
    if (result?.kind !== 'result') throw new Error('esperava resultado');
    expect(result.measuredAt.toISOString()).toBe('2026-10-31T20:50:42.000Z');
    expect(result.impedance).toEqual({
      khz20: { arms: [213.4, 215.5], legs: [194.5, 201.7], trunk: 15 },
      khz100: { arms: [181.1, 181.9], legs: [161.7, 174.2], trunk: 13.9 },
    });
  });

  it('resultado sem bioimpedância (pessoa calçada) traz só o peso', () => {
    expect(parseFrame(hex(RESULT_WITHOUT_IMPEDANCE))).toMatchObject({ kind: 'result', weightKg: 103.35, impedance: null });
  });

  it('quadro com a conferência errada é ignorado', () => {
    expect(parseFrame(hex(LIVE.replace(/0d$/, '0e')))).toBeNull();
  });

  it('monta os comandos iguais aos aceitos pela balança', () => {
    expect(toHex(ackFrame(0, 0x7c))).toBe('00 00 03 00 b0 7c 00 0c');
    expect(toHex(readyFrame(2))).toBe('02 00 03 00 b6 01 01 18');
    const now = { getTime: () => 0x6ae65487 * 1000, getTimezoneOffset: () => 180 } as Date;
    expect(toHex(profileFrame(1, { heightCm: 181, age: 40, sex: 'male' }, now))).toBe(
      '01 00 1e 00 c0 6a e6 54 87 80 b4 01 b5 28 5f ab 00 00 13 88 2f 02 b0 ca d0 01 01 06 62 6f 63 61 64 6f 0d',
    );
    const female = profileFrame(1, { heightCm: 165, age: 30, sex: 'female' }, now);
    expect(female[12]).toBe(165);
    expect(female[13]).toBe(30);
    expect(female[26]).toBe(0x00);
  });
});

type Seg = [number, number];
interface Comparada {
  sexo: 'male' | 'female';
  alturaCm: number;
  idade: number;
  pesoKg: number;
  khz20: { arms: Seg; legs: Seg; trunk: number };
  khz100: { arms: Seg; legs: Seg; trunk: number };
  /** O que o app da balança mostrou na mesma pesagem. */
  app: { massaMagra: number; gorduraPct: number; visceral: number; idadeCorporal: number; musculoEsq: number };
}

// Pesagens comparadas com o app da balança (sem nomes): relatórios da Relaxmedic com as impedâncias
// impressas (braço D/E, perna D/E, tronco) e uma pesagem gravada do próprio app.
const COMPARADAS: Comparada[] = [
  {
    sexo: 'male', alturaCm: 181, idade: 40, pesoKg: 103.35,
    khz20: { arms: [218.7, 219.1], legs: [224.1, 183.3], trunk: 19.1 },
    khz100: { arms: [187.4, 185.5], legs: [164.3, 178.0], trunk: 18.1 },
    app: { massaMagra: 79.2, gorduraPct: 23.3, visceral: 9, idadeCorporal: 42, musculoEsq: 45.8 },
  },
  {
    sexo: 'male', alturaCm: 172, idade: 36, pesoKg: 77.8,
    khz20: { arms: [245.9, 241.1], legs: [214.1, 210.3], trunk: 13.5 },
    khz100: { arms: [212.3, 206.3], legs: [190.1, 188.5], trunk: 8.5 },
    app: { massaMagra: 63.9, gorduraPct: 17.8, visceral: 4, idadeCorporal: 34, musculoEsq: 36.4 },
  },
  {
    sexo: 'female', alturaCm: 167, idade: 49, pesoKg: 69.2,
    khz20: { arms: [324.2, 339.2], legs: [248.9, 248.9], trunk: 18.1 },
    khz100: { arms: [289.5, 301.1], legs: [223.6, 223.4], trunk: 10.5 },
    app: { massaMagra: 52.6, gorduraPct: 23.9, visceral: 6, idadeCorporal: 46, musculoEsq: 29.6 },
  },
  {
    sexo: 'male', alturaCm: 169, idade: 59, pesoKg: 103.25,
    khz20: { arms: [217.6, 218.3], legs: [206.2, 206.3], trunk: 14.5 },
    khz100: { arms: [193.0, 193.6], legs: [183.6, 185.5], trunk: 9.9 },
    app: { massaMagra: 66.1, gorduraPct: 35.9, visceral: 16, idadeCorporal: 63, musculoEsq: 37.9 },
  },
  {
    sexo: 'female', alturaCm: 156, idade: 39, pesoKg: 65.95,
    khz20: { arms: [364.0, 374.3], legs: [251.9, 262.8], trunk: 27.2 },
    khz100: { arms: [329.2, 339.2], legs: [220.7, 229.4], trunk: 25.3 },
    app: { massaMagra: 41.9, gorduraPct: 36.6, visceral: 10, idadeCorporal: 41, musculoEsq: 23.0 },
  },
];

describe('composição corporal ajustada ao app da balança', () => {
  it('resistência do corpo a 50 kHz por interpolação entre 20 e 100 kHz', () => {
    const { khz20, khz100 } = COMPARADAS[0];
    expect(resistanceAt50kHz(khz20, khz100)).toBeCloseTo(404.1, 1);
  });

  it.each(COMPARADAS.map((c) => [`${c.sexo} ${c.alturaCm} cm ${c.pesoKg} kg`, c] as const))('%s: fica perto do app', (_, p) => {
    const c = bodyComposition(p.pesoKg, { heightCm: p.alturaCm, age: p.idade, sex: p.sexo }, { khz20: p.khz20, khz100: p.khz100 })!;
    expect(Math.abs(c.fatFreeMassKg - p.app.massaMagra)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(c.bodyFatPercent - p.app.gorduraPct)).toBeLessThanOrEqual(0.6);
    expect(Math.abs(c.skeletalMuscleMassKg - p.app.musculoEsq)).toBeLessThanOrEqual(0.6);
    expect(c.visceralFatLevel).toBe(p.app.visceral);
    expect(Math.abs(c.bodyAgeYears! - p.app.idadeCorporal)).toBeLessThanOrEqual(2);
    // Mesmas relações do app: água 73,2%, osso 6,7% da massa magra, músculo = magra − osso, proteína = magra − água − osso.
    expect(c.bodyWaterKg).toBeCloseTo(0.732 * c.fatFreeMassKg, 0);
    expect(c.boneMassKg).toBeCloseTo(0.067 * c.fatFreeMassKg, 1);
    expect(c.muscleMassKg).toBeCloseTo(c.fatFreeMassKg - c.boneMassKg, 0);
    expect(c.proteinKg).toBeCloseTo(c.fatFreeMassKg - c.bodyWaterKg - c.boneMassKg, 0);
    expect(c.basalMetabolicRateKcal).toBeCloseTo(370 + 21.6 * c.fatFreeMassKg, -1);
    expect(c.subcutaneousFatPercent!).toBeCloseTo(0.715 * c.bodyFatPercent, 1);
  });

  it('peso ideal por IMC 22; dados impossíveis não geram números', () => {
    const p = COMPARADAS[0];
    const c = bodyComposition(p.pesoKg, { heightCm: 181, age: 40, sex: 'male' }, { khz20: p.khz20, khz100: p.khz100 })!;
    expect(c.idealWeightKg).toBe(72.1);
    expect(bodyComposition(0, { heightCm: 165, age: 30, sex: 'female' }, { khz20: p.khz20, khz100: p.khz100 })).toBeNull();
  });
});

describe('gordura visceral, idade corporal e gordura por parte do corpo (como o app da balança)', () => {
  // Massa gorda, sexo e nível visceral que o app mostrou nas 9 pessoas comparadas.
  it.each([
    [24.1, 'male', 9],
    [13.1, 'male', 4],
    [22.9, 'female', 9],
    [18.6, 'male', 6],
    [9.2, 'male', 2],
    [13.8, 'male', 4],
    [16.5, 'female', 6],
    [37.1, 'male', 16],
    [24.1, 'female', 10],
  ] as const)('massa gorda %s kg (%s) → visceral %s', (fat, sex, level) => {
    expect(visceralFatLevel(fat, sex)).toBe(level);
  });

  // Idade, % de gordura e sexo → idade corporal do app.
  it.each([
    [40, 23.3, 'male', 42],
    [34, 16.9, 'male', 34],
    [51, 31.8, 'female', 50],
    [52, 21.7, 'male', 51],
    [36, 17.8, 'male', 34],
    [49, 23.9, 'female', 46],
    [59, 35.9, 'male', 63],
    [39, 36.6, 'female', 41],
  ] as const)('idade %s, gordura %s%% (%s) → idade corporal %s', (age, fat, sex, app) => {
    expect(Math.abs(bodyAgeYears(age, fat, sex)! - app)).toBeLessThanOrEqual(1.5);
  });

  const gordura: Array<[number, { arm: number; leg: number; trunk: number }]> = [
    [24.1, { arm: 1.4, leg: 3.65, trunk: 13.5 }],
    [22.9, { arm: 1.5, leg: 3.6, trunk: 12.5 }],
    [18.6, { arm: 1.0, leg: 2.9, trunk: 10.4 }],
    [13.8, { arm: 0.6, leg: 2.3, trunk: 7.8 }],
    [16.5, { arm: 1.0, leg: 2.7, trunk: 9.3 }],
    [37.1, { arm: 2.5, leg: 5.45, trunk: 20.5 }],
  ];
  it.each(gordura)('massa gorda %s kg fica a até 0,4 kg do app em cada parte', (fat, app) => {
    const s = fatBySegment(fat)!;
    expect(Math.abs(s.armKg - app.arm)).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(Math.abs(s.legKg - app.leg)).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(Math.abs(s.trunkKg - app.trunk)).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(fatBySegment(0)).toBeNull();
  });
});

describe('músculo por parte do corpo (frações do app da balança)', () => {
  // Massa muscular, sexo e segmentos que o app mostrou (sem nomes).
  const casos: Array<[number, 'male' | 'female', { arm: number; leg: number; trunk: number }]> = [
    [45.8, 'female', { arm: 2.7, leg: 8.0, trunk: 21.4 }],
    [49.1, 'female', { arm: 2.9, leg: 8.6, trunk: 22.9 }],
    [39.1, 'female', { arm: 2.1, leg: 6.6, trunk: 18.1 }],
    [62.5, 'male', { arm: 3.9, leg: 11.1, trunk: 29.2 }],
    [53.9, 'male', { arm: 3.0, leg: 9.5, trunk: 25.1 }],
    [59.6, 'male', { arm: 3.8, leg: 10.6, trunk: 27.9 }],
    [61.7, 'male', { arm: 3.9, leg: 11.0, trunk: 28.9 }],
    [73.9, 'male', { arm: 4.75, leg: 13.2, trunk: 34.7 }],
  ];

  it.each(casos)('massa muscular %s kg (%s) fica a até 0,35 kg do app em cada parte', (muscle, sex, app) => {
    const s = muscleBySegment(muscle, sex)!;
    expect(Math.abs(s.armKg - app.arm)).toBeLessThanOrEqual(0.35);
    expect(Math.abs(s.legKg - app.leg)).toBeLessThanOrEqual(0.35);
    expect(Math.abs(s.trunkKg - app.trunk)).toBeLessThanOrEqual(0.35);
  });

  it('vem junto na composição e não aparece sem massa muscular', () => {
    const p = COMPARADAS[0];
    const c = bodyComposition(p.pesoKg, { heightCm: p.alturaCm, age: p.idade, sex: p.sexo }, { khz20: p.khz20, khz100: p.khz100 })!;
    expect(c.muscleBySegment).toEqual(muscleBySegment(c.muscleMassKg, 'male'));
    expect(muscleBySegment(0)).toBeNull();
  });
});
