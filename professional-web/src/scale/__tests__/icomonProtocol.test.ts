import { describe, expect, it } from 'vitest';
import { ackFrame, parseFrame, profileFrame, readyFrame, toHex } from '../icomonProtocol';
import { bodyComposition, fatBySegment, muscleBySegment, resistanceAt50kHz, visceralFatLevel } from '../bodyComposition';

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

describe('composição corporal pela bioimpedância (equações publicadas)', () => {
  const impedance = {
    khz20: { arms: [218.7, 219.1] as [number, number], legs: [224.1, 183.3] as [number, number], trunk: 19.1 },
    khz100: { arms: [187.4, 185.5] as [number, number], legs: [164.3, 178.0] as [number, number], trunk: 18.1 },
  };

  it('resistência do corpo a 50 kHz por interpolação entre 20 e 100 kHz', () => {
    expect(resistanceAt50kHz(impedance.khz20, impedance.khz100)).toBeCloseTo(404.1, 1);
  });

  it('homem: Sun 2003 calibrada (+2,1 kg), músculo esquelético 57%, água e Katch-McArdle a partir da massa magra', () => {
    const c = bodyComposition(103.35, { heightCm: 181, age: 40, sex: 'male' }, impedance)!;
    expect(c.fatFreeMassKg).toBeCloseTo(77.0 + 2.1, 0);
    expect(c.bodyFatPercent).toBeCloseTo(((103.35 - 77.0 - 2.1) / 103.35) * 100, 0);
    expect(c.fatMassKg).toBeCloseTo(103.35 - c.fatFreeMassKg, 0);
    expect(c.skeletalMuscleMassKg).toBeCloseTo(0.57 * c.fatFreeMassKg, 0);
    expect(c.bodyWaterKg).toBeCloseTo(0.732 * c.fatFreeMassKg, 0);
    // Mesmas relações do app da balança: osso 6,7% da massa magra, músculo = magra − osso, proteína = magra − água − osso.
    expect(c.boneMassKg).toBeCloseTo(0.067 * c.fatFreeMassKg, 1);
    expect(c.muscleMassKg).toBeCloseTo(c.fatFreeMassKg - c.boneMassKg, 0);
    expect(c.proteinKg).toBeCloseTo(c.fatFreeMassKg - c.bodyWaterKg - c.boneMassKg, 0);
    expect(c.muscleRatePercent).toBeCloseTo((c.muscleMassKg / 103.35) * 100, 0);
    expect(c.idealWeightKg).toBe(72.1);
    expect(c.basalMetabolicRateKcal).toBeCloseTo(370 + 21.6 * c.fatFreeMassKg, -1);
    // App da balança nessa pesagem: visceral 9, subcutânea 16,7%.
    expect(c.visceralFatLevel).toBe(9);
    expect(c.subcutaneousFatPercent!).toBeCloseTo(0.715 * c.bodyFatPercent, 1);
  });

  it('relatório do fabricante com as impedâncias por parte do corpo (homem, 172 cm, 36 anos): fica perto do app', () => {
    // Impedâncias impressas no relatório: braço D/E, perna D/E e tronco, a 20 e 100 kHz.
    const c = bodyComposition(77.8, { heightCm: 172, age: 36, sex: 'male' }, {
      khz20: { arms: [245.9, 241.1], legs: [214.1, 210.3], trunk: 13.5 },
      khz100: { arms: [212.3, 206.3], legs: [190.1, 188.5], trunk: 8.5 },
    })!;
    // App: massa magra 63,9 kg, gordura 17,8%, visceral 4, gordura braço 0,6 / perna 2,3 / tronco 7,8 kg.
    expect(Math.abs(c.fatFreeMassKg - 63.9)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.bodyFatPercent - 17.8)).toBeLessThanOrEqual(1.2);
    expect(c.visceralFatLevel).toBe(4);
    expect(Math.abs(c.fatBySegment!.trunkKg - 7.8)).toBeLessThanOrEqual(0.6);
  });

  it('mulher usa os coeficientes femininos; dados impossíveis não geram números', () => {
    const male = bodyComposition(70, { heightCm: 165, age: 30, sex: 'male' }, impedance)!;
    const female = bodyComposition(70, { heightCm: 165, age: 30, sex: 'female' }, impedance)!;
    expect(female.fatFreeMassKg).not.toBe(male.fatFreeMassKg);
    expect(female.skeletalMuscleMassKg).toBeCloseTo(0.57 * female.fatFreeMassKg, 0);
    expect(bodyComposition(0, { heightCm: 165, age: 30, sex: 'female' }, impedance)).toBeNull();
  });
});

describe('gordura visceral e gordura por parte do corpo (como o app da balança)', () => {
  // Massa gorda e nível visceral que o app mostrou em pesagens comparadas (sem nomes).
  it.each([
    [9.2, 2],
    [13.1, 4],
    [13.8, 4],
    [18.6, 6],
    [24.1, 9],
  ])('massa gorda %s kg → visceral %s', (fat, level) => {
    expect(visceralFatLevel(fat)).toBe(level);
  });

  const casos: Array<[number, { arm: number; leg: number; trunk: number }]> = [
    [24.1, { arm: 1.4, leg: 3.65, trunk: 13.5 }],
    [22.9, { arm: 1.5, leg: 3.6, trunk: 12.5 }],
    [18.6, { arm: 1.0, leg: 2.9, trunk: 10.4 }],
    [13.8, { arm: 0.6, leg: 2.3, trunk: 7.8 }],
  ];
  it.each(casos)('massa gorda %s kg fica a até 0,3 kg do app em cada parte', (fat, app) => {
    const s = fatBySegment(fat)!;
    expect(Math.abs(s.armKg - app.arm)).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(Math.abs(s.legKg - app.leg)).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(Math.abs(s.trunkKg - app.trunk)).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(fatBySegment(0)).toBeNull();
  });
});

describe('músculo por parte do corpo (frações do app da balança)', () => {
  // Massa muscular e segmentos que o app da balança mostrou em 3 pessoas comparadas (sem nomes).
  const casos: Array<[number, { arm: number; leg: number; trunk: number }]> = [
    [45.8, { arm: 2.7, leg: 8.0, trunk: 21.4 }],
    [62.5, { arm: 3.9, leg: 11.1, trunk: 29.2 }],
    [53.9, { arm: 3.0, leg: 9.5, trunk: 25.1 }],
    [59.6, { arm: 3.8, leg: 10.6, trunk: 27.9 }],
    [73.9, { arm: 4.75, leg: 13.2, trunk: 34.7 }],
  ];

  it.each(casos)('massa muscular %s kg fica a até 0,3 kg do app em cada parte', (muscle, app) => {
    const s = muscleBySegment(muscle)!;
    expect(Math.abs(s.armKg - app.arm)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(s.legKg - app.leg)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(s.trunkKg - app.trunk)).toBeLessThanOrEqual(0.3);
  });

  it('vem junto na composição e não aparece sem massa muscular', () => {
    const c = bodyComposition(103.35, { heightCm: 181, age: 40, sex: 'male' }, {
      khz20: { arms: [218.7, 219.1], legs: [224.1, 183.3], trunk: 19.1 },
      khz100: { arms: [187.4, 185.5], legs: [164.3, 178.0], trunk: 18.1 },
    })!;
    const esperado = muscleBySegment(c.muscleMassKg)!;
    expect(c.muscleBySegment!.armKg).toBeCloseTo(esperado.armKg, 0);
    expect(c.muscleBySegment!.legKg).toBeCloseTo(esperado.legKg, 0);
    expect(c.muscleBySegment!.trunkKg).toBeCloseTo(esperado.trunkKg, 0);
    expect(muscleBySegment(0)).toBeNull();
  });
});
