import { useEffect, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import type { ScaleReadingInput } from '../types/api';
import { FAT_FREE_MASS_REFERENCE, bodyComposition, type BodyComposition } from './bodyComposition';
import type { ScaleProfile, ScaleResult } from './icomonProtocol';
import { ScaleSession } from './scaleSession';

const DRIVER_ID = 'icomon-ffb0';
const PROTOCOL_VERSION = 'icomon-ffb0@1';

type Step =
  | { kind: 'intro' }
  | { kind: 'connecting' }
  | { kind: 'waiting' }
  | { kind: 'weighing'; weightKg: number; stable: boolean }
  | { kind: 'result'; result: ScaleResult; rawHex: string; composition: BodyComposition | null }
  | { kind: 'error'; message: string };

interface Props {
  heightCm: number;
  age: number | null;
  sex: 'male' | 'female' | null;
  /** Recebe a leitura confirmada (ou descartada, se `recordDiscard`). */
  onSubmit: (input: ScaleReadingInput, deviceName: string) => Promise<void> | void;
  onClose: () => void;
  confirmLabel?: string;
  /** false = "Descartar" só fecha a janela, sem registrar a leitura descartada. */
  recordDiscard?: boolean;
  /** Leitura completa (com bioimpedância) segue direto para `onSubmit`, sem clique. */
  autoConfirm?: boolean;
}

interface ResultData {
  result: ScaleResult;
  rawHex: string;
  composition: BodyComposition | null;
}

const fmt = (n: number, digits = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

async function readingKey(rawHex: string, deviceId: string): Promise<string> {
  const data = new TextEncoder().encode(`${deviceId}|${rawHex}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** O relógio da balança é acertado a cada conexão; se ainda assim vier fora, vale a hora do computador. */
function recordedAt(result: ScaleResult): string {
  const drift = Math.abs(result.measuredAt.getTime() - Date.now());
  return (drift < 24 * 3600 * 1000 ? result.measuredAt : new Date()).toISOString();
}

export function ScaleModal({ heightCm, age, sex, onSubmit, onClose, confirmLabel = 'Salvar na avaliação', recordDiscard = true, autoConfirm = false }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const [ageInput, setAgeInput] = useState(age != null ? String(age) : '');
  const [sexInput, setSexInput] = useState<'male' | 'female' | ''>(sex ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const session = useRef<ScaleSession | null>(null);
  const profileRef = useRef<ScaleProfile | null>(null);

  useEffect(() => () => session.current?.close(), []);

  const ageNumber = Number(ageInput);
  const profileReady = heightCm > 0 && Number.isInteger(ageNumber) && ageNumber >= 5 && ageNumber <= 110 && (sexInput === 'male' || sexInput === 'female');

  function weighAgain() {
    setSaveError(null);
    if (session.current?.isConnected) setStep({ kind: 'waiting' });
    else start();
  }

  function start() {
    if (!profileReady) return;
    const profile: ScaleProfile = { heightCm, age: ageNumber, sex: sexInput as 'male' | 'female' };
    profileRef.current = profile;
    session.current?.close();
    setSaveError(null);
    setStep({ kind: 'connecting' });
    const current = new ScaleSession(profile, {
      onConnected: () => setStep({ kind: 'waiting' }),
      onLive: (reading) => setStep((prev) => (prev.kind === 'result' ? prev : { kind: 'weighing', weightKg: reading.weightKg, stable: reading.stable })),
      onResult: (result, rawHex) => {
        const composition = result.impedance ? bodyComposition(result.weightKg, profile, result.impedance) : null;
        setStep({ kind: 'result', result, rawHex, composition });
        if (autoConfirm && composition) void submit('confirmed', { result, rawHex, composition });
      },
      onDisconnected: () => setStep((prev) => (prev.kind === 'result' ? prev : { kind: 'intro' })),
      onError: (message) => setStep({ kind: 'error', message }),
    });
    session.current = current;
    void current.connect();
  }

  async function submit(status: 'confirmed' | 'discarded', data?: ResultData) {
    const current = data ?? (step.kind === 'result' ? step : null);
    if (!current || !session.current) return;
    if (status === 'discarded' && !recordDiscard) {
      session.current.close();
      onClose();
      return;
    }
    const { result, rawHex, composition } = current;
    setSaving(true);
    setSaveError(null);
    try {
      const input: ScaleReadingInput = {
        status,
        driverId: DRIVER_ID,
        deviceIdentifier: session.current.deviceName || 'Balança',
        protocolVersion: PROTOCOL_VERSION,
        recordedAt: recordedAt(result),
        idempotencyKey: await readingKey(rawHex, session.current.deviceId),
        rawPayload: { resultFrameHex: rawHex },
      };
      if (status === 'confirmed') {
        input.normalized = {
          weightKg: result.weightKg,
          ...(composition
            ? {
                bodyFatPercent: composition.bodyFatPercent,
                fatMassKg: composition.fatMassKg,
                leanMassKg: composition.fatFreeMassKg,
                skeletalMuscleMassKg: composition.skeletalMuscleMassKg,
                muscleMassKg: composition.muscleMassKg,
                boneMassKg: composition.boneMassKg,
                bodyWaterPercent: composition.bodyWaterPercent,
                basalMetabolicRateKcal: composition.basalMetabolicRateKcal,
                impedanceData: {
                  khz20: result.impedance!.khz20,
                  khz100: result.impedance!.khz100,
                  wholeBodyResistance50kHz: composition.wholeBodyResistance50kHz,
                  profile: profileRef.current,
                  derived: { proteinKg: composition.proteinKg, proteinPercent: composition.proteinPercent, muscleRatePercent: composition.muscleRatePercent, idealWeightKg: composition.idealWeightKg, bodyWaterKg: composition.bodyWaterKg },
                  equations: { fatFreeMass: FAT_FREE_MASS_REFERENCE, skeletalMuscle: 'Janssen et al. 2000', water: '73,2% da massa magra', bmr: 'Katch-McArdle', bone: '6,7% da massa magra' },
                },
              }
            : {}),
        };
      }
      await onSubmit(input, session.current.deviceName || 'Balança');
      session.current.close();
      onClose();
    } catch {
      setSaveError('Não foi possível salvar a leitura. Confira a internet e tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  const actions =
    step.kind === 'result' ? (
      <>
        <Button variant="ghost" onClick={() => void submit('discarded')} disabled={saving}>
          Descartar
        </Button>
        <Button variant="secondary" onClick={weighAgain} disabled={saving}>
          Pesar de novo
        </Button>
        <Button onClick={() => void submit('confirmed')} loading={saving}>
          {confirmLabel}
        </Button>
      </>
    ) : step.kind === 'intro' || step.kind === 'error' ? (
      <Button onClick={start} disabled={!profileReady}>
        {step.kind === 'error' ? 'Tentar de novo' : 'Conectar'}
      </Button>
    ) : null;

  return (
    <Modal title="Balança de bioimpedância" onClose={onClose} actions={actions}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
        {step.kind === 'intro' || step.kind === 'error' ? (
          <>
            {step.kind === 'error' ? (
              <div role="alert" style={{ color: 'var(--color-danger)' }}>
                {step.message}
              </div>
            ) : null}
            <div>
              A balança usa a altura, a idade e o sexo do paciente para medir a bioimpedância. Antes de conectar, peça para o paciente{' '}
              <strong>tirar meias e sapatos</strong> e deixe o Bluetooth do celular desligado (para o app da balança não se conectar antes).
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Altura</div>
                <strong>{heightCm > 0 ? `${fmt(heightCm, 0)} cm` : '—'}</strong>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: 'var(--color-text-secondary)', gap: 2 }}>
                Idade
                <input type="number" min={5} max={110} value={ageInput} onChange={(e) => setAgeInput(e.target.value)} style={{ width: 80, padding: 6 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: 'var(--color-text-secondary)', gap: 2 }}>
                Sexo
                <select value={sexInput} onChange={(e) => setSexInput(e.target.value as 'male' | 'female' | '')} style={{ padding: 6 }}>
                  <option value="">—</option>
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                </select>
              </label>
            </div>
            {!(heightCm > 0) ? (
              <div role="alert" style={{ fontSize: 13, color: 'var(--color-danger)' }}>
                Preencha a altura em "Dados básicos" antes de conectar a balança.
              </div>
            ) : null}
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
              Suba na balança para acordá-la e clique em Conectar. Na janela do navegador, escolha a balança (ex.: Relaxmedic-2419).
            </div>
          </>
        ) : null}

        {step.kind === 'connecting' ? <div>Procurando a balança… escolha-a na janela do navegador.</div> : null}

        {step.kind === 'waiting' ? (
          <div>
            <strong>Balança conectada.</strong> Peça para o paciente subir descalço e ficar parado, segurando a alça, até o visor terminar.
          </div>
        ) : null}

        {step.kind === 'weighing' ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 36, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(step.weightKg, 2)} kg</div>
            <div style={{ color: 'var(--color-text-secondary)' }}>
              {step.stable ? 'Peso firme — medindo a bioimpedância. Fique parado, segurando a alça…' : 'Pesando…'}
            </div>
          </div>
        ) : null}

        {step.kind === 'result' ? <ResultView result={step.result} composition={step.composition} /> : null}
        {saveError ? (
          <div role="alert" style={{ color: 'var(--color-danger)' }}>
            {saveError}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function ResultView({ result, composition }: { result: ScaleResult; composition: BodyComposition | null }) {
  const rows: Array<[string, string]> = [['Peso', `${fmt(result.weightKg, 2)} kg`]];
  if (composition) {
    rows.push(
      ['Gordura corporal', `${fmt(composition.bodyFatPercent)}%`],
      ['Massa gorda', `${fmt(composition.fatMassKg)} kg`],
      ['Massa magra', `${fmt(composition.fatFreeMassKg)} kg`],
      ['Músculo esquelético', `${fmt(composition.skeletalMuscleMassKg)} kg`],
      ['Massa muscular', `${fmt(composition.muscleMassKg)} kg (${fmt(composition.muscleRatePercent)}%)`],
      ['Massa óssea', `${fmt(composition.boneMassKg)} kg`],
      ['Proteína', `${fmt(composition.proteinPercent)}% (${fmt(composition.proteinKg)} kg)`],
      ['Água corporal', `${fmt(composition.bodyWaterPercent)}% (${fmt(composition.bodyWaterKg)} kg)`],
      ['Metabolismo basal', `${composition.basalMetabolicRateKcal.toLocaleString('pt-BR')} kcal`],
      ['Peso ideal (IMC 22)', `${fmt(composition.idealWeightKg)} kg`],
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <table aria-label="Resultado da balança" style={{ borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} style={{ borderTop: '1px solid var(--color-border)' }}>
              <td style={{ padding: '5px 4px' }}>{label}</td>
              <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 600 }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {composition ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Calculado a partir da bioimpedância medida pela balança: massa magra por Sun et al. (2003), músculo esquelético por Janssen et al. (2000),
          água como 73,2% da massa magra e metabolismo basal por Katch-McArdle. Os valores podem diferir um pouco do app da balança.
        </div>
      ) : (
        <div role="alert" style={{ fontSize: 13, color: 'var(--color-warning, #b45309)' }}>
          A balança mediu só o peso, sem a bioimpedância. Confira se o paciente está descalço, com os pés e as mãos em contato com as placas, e
          pese de novo — ou salve só o peso.
        </div>
      )}
    </div>
  );
}
