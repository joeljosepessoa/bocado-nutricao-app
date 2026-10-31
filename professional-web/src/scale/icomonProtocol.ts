/**
 * Protocolo das balanças com circuito iComon no serviço Bluetooth 0xFFB0
 * (ex.: Relaxmedic 2419, modelo FG2419LB). Decifrado a partir das leituras
 * da própria balança: nenhum código ou SDK do fabricante é usado.
 *
 * Quadro: [seq][tamanho 2 bytes, big-endian][parte][tipo + dados][conferência]
 * conferência = (soma de tipo + dados) & 0x1F
 *
 * - A balança se apresenta com AA; o painel confirma com B0 [seq do AA] 00.
 * - O painel manda o perfil (C0: data/hora, fuso, altura, idade, sexo) e B6 01 01.
 *   Sem o perfil a balança mede só o peso, nunca a bioimpedância.
 * - A2 (FFB2): peso ao vivo; flags 03 = peso firme, medindo a bioimpedância.
 * - A7 (FFB3): resultado — data/hora, peso e as impedâncias por segmento.
 *   O painel confirma com B0 [seq do A7] 00, senão a balança repete o resultado.
 */

export const ICOMON_SERVICE = 0xffb0;
export const ICOMON_WRITE = 0xffb1;
export const ICOMON_LIVE = 0xffb2;
export const ICOMON_RESULT = 0xffb3;

export const FRAME_DEVICE_INFO = 0xaa;
export const FRAME_LIVE_WEIGHT = 0xa2;
export const FRAME_RESULT = 0xa7;

/** Identificação do perfil do painel na balança (não é de nenhum paciente). */
const PANEL_USER_ID = [0xb0, 0xca, 0xd0];
const PANEL_USER_NAME = 'bocado';

export interface ScaleProfile {
  heightCm: number;
  age: number;
  sex: 'male' | 'female';
}

export interface LiveWeight {
  kind: 'live';
  weightKg: number;
  /** Peso firme: a balança já está medindo a bioimpedância. */
  stable: boolean;
}

/** Impedâncias em ohms, por segmento, a 20 kHz e 100 kHz (balança de 8 eletrodos). */
export interface SegmentImpedances {
  arms: [number, number];
  legs: [number, number];
  trunk: number;
}

export interface ScaleResult {
  kind: 'result';
  seq: number;
  measuredAt: Date;
  weightKg: number;
  /** null = a balança não mediu a bioimpedância (pessoa calçada, mexeu, pés secos demais). */
  impedance: { khz20: SegmentImpedances; khz100: SegmentImpedances } | null;
}

export interface DeviceInfo {
  kind: 'device-info';
  seq: number;
}

export type ScaleFrame = LiveWeight | ScaleResult | DeviceInfo | { kind: 'other'; type: number };

export function checksum(payload: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < payload.length; i++) sum += payload[i];
  return sum & 0x1f;
}

/** Quadro enviado pelo painel; `seq` é o contador do próprio painel. */
export function buildFrame(seq: number, payload: number[]): Uint8Array {
  return new Uint8Array([seq & 0xff, (payload.length >> 8) & 0xff, payload.length & 0xff, 0x00, ...payload, checksum(payload)]);
}

export function ackFrame(seq: number, ackedSeq: number): Uint8Array {
  return buildFrame(seq, [0xb0, ackedSeq & 0xff, 0x00]);
}

export function readyFrame(seq: number): Uint8Array {
  return buildFrame(seq, [0xb6, 0x01, 0x01]);
}

/** Perfil de quem vai se pesar: sem ele a balança não mede a bioimpedância. */
export function profileFrame(seq: number, profile: ScaleProfile, now: Date = new Date()): Uint8Array {
  const seconds = Math.floor(now.getTime() / 1000);
  const offsetMinutes = -now.getTimezoneOffset();
  const tz = offsetMinutes < 0 ? 0x8000 | -offsetMinutes : offsetMinutes;
  const height = clampByte(profile.heightCm);
  const age = clampByte(profile.age);
  const name = Array.from(new TextEncoder().encode(PANEL_USER_NAME));
  return buildFrame(seq, [
    0xc0,
    (seconds >>> 24) & 0xff,
    (seconds >>> 16) & 0xff,
    (seconds >>> 8) & 0xff,
    seconds & 0xff,
    (tz >> 8) & 0xff,
    tz & 0xff,
    0x01,
    height,
    age,
    0x5f,
    0xab,
    0x00,
    0x00,
    0x13,
    0x88,
    0x2f,
    0x02,
    ...PANEL_USER_ID,
    0x01,
    profile.sex === 'male' ? 0x01 : 0x00,
    name.length,
    ...name,
  ]);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
/** Peso: bits 0–17 em gramas. */
const kgAt = (b: Uint8Array, i: number) => (u32(b, i) & 0x3ffff) / 1000;

export function parseFrame(bytes: Uint8Array): ScaleFrame | null {
  if (bytes.length < 6 || bytes[3] !== 0x00) return null;
  const length = (bytes[1] << 8) | bytes[2];
  const type = bytes[4];
  if (bytes.length >= 5 + length && checksum(bytes.subarray(4, 4 + length)) !== (bytes[4 + length] & 0x1f)) return null;

  if (type === FRAME_DEVICE_INFO) return { kind: 'device-info', seq: bytes[0] };
  if (type === FRAME_LIVE_WEIGHT && bytes.length >= 10) {
    return { kind: 'live', weightKg: kgAt(bytes, 6), stable: bytes[5] === 0x03 };
  }
  if (type === FRAME_RESULT && bytes.length >= 35) {
    const ohms = (i: number) => u16le(bytes, i) / 10;
    const khz20: SegmentImpedances = { arms: [ohms(16), ohms(18)], legs: [ohms(20), ohms(22)], trunk: ohms(24) };
    const khz100: SegmentImpedances = { arms: [ohms(26), ohms(28)], legs: [ohms(30), ohms(32)], trunk: bytes[34] / 10 };
    const measured = [...khz20.arms, ...khz20.legs, khz20.trunk].every((v) => v > 0);
    return {
      kind: 'result',
      seq: bytes[0],
      measuredAt: new Date(u32(bytes, 5) * 1000),
      weightKg: kgAt(bytes, 9),
      impedance: measured ? { khz20, khz100 } : null,
    };
  }
  return { kind: 'other', type };
}

export function toHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}
