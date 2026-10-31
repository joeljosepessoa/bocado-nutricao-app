import { describe, expect, it } from 'vitest';
import { ackFrame, parseFrame, profileFrame, readyFrame, toHex } from '../icomonProtocol';
import { bodyComposition, resistanceAt50kHz } from '../bodyComposition';

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

  it('homem: Sun 2003, Janssen 2000, água e Katch-McArdle a partir da massa magra', () => {
    const c = bodyComposition(103.35, { heightCm: 181, age: 40, sex: 'male' }, impedance)!;
    expect(c.fatFreeMassKg).toBeCloseTo(77.0, 1);
    expect(c.bodyFatPercent).toBeCloseTo(25.5, 1);
    expect(c.fatMassKg).toBeCloseTo(103.35 - c.fatFreeMassKg, 0);
    expect(c.skeletalMuscleMassKg).toBeCloseTo(38.6, 1);
    expect(c.bodyWaterKg).toBeCloseTo(0.732 * c.fatFreeMassKg, 0);
    expect(c.basalMetabolicRateKcal).toBeCloseTo(370 + 21.6 * c.fatFreeMassKg, -1);
  });

  it('mulher usa os coeficientes femininos; dados impossíveis não geram números', () => {
    const male = bodyComposition(70, { heightCm: 165, age: 30, sex: 'male' }, impedance)!;
    const female = bodyComposition(70, { heightCm: 165, age: 30, sex: 'female' }, impedance)!;
    expect(female.fatFreeMassKg).not.toBe(male.fatFreeMassKg);
    expect(female.skeletalMuscleMassKg).toBeCloseTo(male.skeletalMuscleMassKg - 3.825, 0);
    expect(bodyComposition(0, { heightCm: 165, age: 30, sex: 'female' }, impedance)).toBeNull();
  });
});
