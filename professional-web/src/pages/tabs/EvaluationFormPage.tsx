import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import * as api from '../../api/endpoints';
import type { Measurements, Skinfolds } from '../../types/api';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { AiAssistPanel } from '../../components/AiAssistPanel';
import {
  evaluationDraftKey,
  loadEvaluationDraft,
  removeEvaluationDraft,
  saveEvaluationDraft,
  type EvaluationDraftData,
} from '../../utils/evaluationDraft';

const DRAFT_AUTOSAVE_DEBOUNCE_MS = 1500;

const MEASUREMENT_FIELDS: Array<{ key: keyof Measurements; label: string }> = [
  { key: 'chestCm', label: 'Tórax (cm)' }, { key: 'waistCm', label: 'Cintura (cm)' },
  { key: 'abdomenCm', label: 'Abdômen (cm)' }, { key: 'hipCm', label: 'Quadril (cm)' },
  { key: 'armRightCm', label: 'Braço dir. (cm)' }, { key: 'armLeftCm', label: 'Braço esq. (cm)' },
  { key: 'forearmRightCm', label: 'Antebraço dir. (cm)' }, { key: 'forearmLeftCm', label: 'Antebraço esq. (cm)' },
  { key: 'thighRightCm', label: 'Coxa dir. (cm)' }, { key: 'thighLeftCm', label: 'Coxa esq. (cm)' },
  { key: 'calfRightCm', label: 'Panturrilha dir. (cm)' }, { key: 'calfLeftCm', label: 'Panturrilha esq. (cm)' },
  { key: 'wristCm', label: 'Punho (cm)' }, { key: 'femurBicondylarCm', label: 'Fêmur bicondilar (cm)' },
];

const SKINFOLD_FIELDS: Array<{ key: keyof Skinfolds; label: string }> = [
  { key: 'chestMm', label: 'Tórax (mm)' }, { key: 'axillaryMidMm', label: 'Axilar média (mm)' },
  { key: 'subscapularMm', label: 'Subescapular (mm)' }, { key: 'bicepsMm', label: 'Bíceps (mm)' },
  { key: 'tricepsMm', label: 'Tríceps (mm)' }, { key: 'abdominalMm', label: 'Abdominal (mm)' },
  { key: 'suprailiacMm', label: 'Suprailíaca (mm)' }, { key: 'thighMm', label: 'Coxa (mm)' },
  { key: 'calfMm', label: 'Panturrilha (mm)' },
];

type NumField = Record<string, string>;

function toNumberOrUndefined(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

export function EvaluationFormPage() {
  const { clientId, evaluationId } = useParams<{ clientId: string; evaluationId?: string }>();
  const isEdit = !!evaluationId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: existing } = useQuery({
    queryKey: ['evaluation', clientId, evaluationId],
    queryFn: () => api.getEvaluation(clientId!, evaluationId!),
    enabled: isEdit,
  });

  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [biologicalSex, setBiologicalSex] = useState<'male' | 'female' | ''>('');
  const [protocolCode, setProtocolCode] = useState('jackson_pollock_7');
  const [bloodPressureSystolic, setBloodPressureSystolic] = useState('');
  const [bloodPressureDiastolic, setBloodPressureDiastolic] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [glucose, setGlucose] = useState('');
  const [notes, setNotes] = useState('');
  const [draftInstructions, setDraftInstructions] = useState('');
  const [measurements, setMeasurements] = useState<NumField>({});
  const [skinfolds, setSkinfolds] = useState<NumField>({});
  const [bioimpedance, setBioimpedance] = useState<NumField>({});
  const [error, setError] = useState<string | null>(null);

  // Isolado por cliente + avaliação — o rascunho de um nunca aparece pro outro.
  const draftKey = useMemo(() => evaluationDraftKey(clientId!, evaluationId), [clientId, evaluationId]);
  const [pendingDraft, setPendingDraft] = useState<EvaluationDraftData | null>(null);
  // Só liga o autosave depois que o professional decidiu o que fazer com um
  // rascunho pendente — nunca sobrescreve o rascunho antes da escolha explícita.
  const [draftDecided, setDraftDecided] = useState(false);

  useEffect(() => {
    const draft = loadEvaluationDraft(draftKey);
    setPendingDraft(draft);
    setDraftDecided(!draft);
  }, [draftKey]);

  function handleRestoreDraft() {
    if (!pendingDraft) return;
    setHeightCm(pendingDraft.heightCm);
    setWeightKg(pendingDraft.weightKg);
    setBiologicalSex(pendingDraft.biologicalSex);
    setProtocolCode(pendingDraft.protocolCode);
    setBloodPressureSystolic(pendingDraft.bloodPressureSystolic);
    setBloodPressureDiastolic(pendingDraft.bloodPressureDiastolic);
    setHeartRate(pendingDraft.heartRate);
    setGlucose(pendingDraft.glucose);
    setNotes(pendingDraft.notes);
    setDraftInstructions(pendingDraft.draftInstructions);
    setMeasurements(pendingDraft.measurements);
    setSkinfolds(pendingDraft.skinfolds);
    setBioimpedance(pendingDraft.bioimpedance);
    setPendingDraft(null);
    setDraftDecided(true);
  }

  function handleDiscardDraft() {
    removeEvaluationDraft(draftKey);
    setPendingDraft(null);
    setDraftDecided(true);
  }

  useEffect(() => {
    if (!existing) return;
    setHeightCm(String(existing.heightCm));
    setWeightKg(existing.weightKg != null ? String(existing.weightKg) : '');
    setBiologicalSex(existing.biologicalSexForCalculation ?? '');
    setBloodPressureSystolic(existing.bloodPressureSystolic != null ? String(existing.bloodPressureSystolic) : '');
    setBloodPressureDiastolic(existing.bloodPressureDiastolic != null ? String(existing.bloodPressureDiastolic) : '');
    setHeartRate(existing.heartRate != null ? String(existing.heartRate) : '');
    setGlucose(existing.glucose != null ? String(existing.glucose) : '');
    setNotes(existing.notes ?? '');
    if (existing.measurements) {
      const m: NumField = {};
      for (const [k, v] of Object.entries(existing.measurements)) if (v != null) m[k] = String(v);
      setMeasurements(m);
    }
    if (existing.skinfolds) {
      const s: NumField = {};
      for (const [k, v] of Object.entries(existing.skinfolds)) if (v != null) s[k] = String(v);
      setSkinfolds(s);
    }
  }, [existing]);

  // Autosave debounced — nunca inclui senha/token/credenciais, só os campos do formulário.
  useEffect(() => {
    if (!draftDecided) return;
    const timer = setTimeout(() => {
      saveEvaluationDraft(draftKey, {
        heightCm,
        weightKg,
        biologicalSex,
        protocolCode,
        bloodPressureSystolic,
        bloodPressureDiastolic,
        heartRate,
        glucose,
        notes,
        draftInstructions,
        measurements,
        skinfolds,
        bioimpedance,
      });
    }, DRAFT_AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    draftDecided,
    draftKey,
    heightCm,
    weightKg,
    biologicalSex,
    protocolCode,
    bloodPressureSystolic,
    bloodPressureDiastolic,
    heartRate,
    glucose,
    notes,
    draftInstructions,
    measurements,
    skinfolds,
    bioimpedance,
  ]);

  const mutation = useMutation({
    mutationFn: () => {
      // Só inclui measurements/skinfolds/bioimpedance quando ao menos um
      // campo foi preenchido — mandar `{}` faria o backend criar uma linha
      // vazia (measurements/skinfolds/bioimpedance com todo campo null) em
      // vez de simplesmente omitir a informação.
      const toCleanRecord = (fields: NumField): Record<string, number> | undefined => {
        const entries = Object.entries(fields)
          .map(([k, v]) => [k, toNumberOrUndefined(v)] as const)
          .filter((entry): entry is [string, number] => entry[1] !== undefined);
        return entries.length > 0 ? Object.fromEntries(entries) : undefined;
      };

      const payload = {
        heightCm: Number(heightCm),
        weightKg: toNumberOrUndefined(weightKg),
        biologicalSexForCalculation: biologicalSex || undefined,
        protocolCode: protocolCode || undefined,
        bloodPressureSystolic: toNumberOrUndefined(bloodPressureSystolic),
        bloodPressureDiastolic: toNumberOrUndefined(bloodPressureDiastolic),
        heartRate: toNumberOrUndefined(heartRate),
        glucose: toNumberOrUndefined(glucose),
        notes: notes || undefined,
        measurements: toCleanRecord(measurements),
        skinfolds: toCleanRecord(skinfolds),
        bioimpedance: toCleanRecord(bioimpedance),
      };
      return isEdit ? api.updateEvaluation(clientId!, evaluationId!, payload) : api.createEvaluation(clientId!, payload);
    },
    onSuccess: (result) => {
      removeEvaluationDraft(draftKey);
      queryClient.invalidateQueries({ queryKey: ['evaluations', clientId] });
      queryClient.invalidateQueries({ queryKey: ['evolution', clientId] });
      navigate(`/clients/${clientId}/evaluations/${result.id}`);
    },
    onError: () => setError('Não foi possível salvar. Confira os valores informados.'),
  });

  return (
    <>
      <h2 style={{ fontSize: 17, margin: 0 }}>{isEdit ? 'Editar avaliação' : 'Nova avaliação'}</h2>

      {pendingDraft ? (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14 }}>Encontramos um rascunho não salvo desta avaliação.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="small" onClick={handleRestoreDraft}>
                Restaurar rascunho
              </Button>
              <Button size="small" variant="ghost" onClick={handleDiscardDraft}>
                Descartar
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="Dados básicos">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <TextField label="Altura (cm)" type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} required />
          <TextField label="Peso (kg)" type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Sexo biológico (cálculo)</span>
            <select value={biologicalSex} onChange={(e) => setBiologicalSex(e.target.value as 'male' | 'female' | '')} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
              <option value="">—</option>
              <option value="male">Masculino</option>
              <option value="female">Feminino</option>
            </select>
          </label>
          <TextField label="Protocolo" value={protocolCode} onChange={(e) => setProtocolCode(e.target.value)} placeholder="jackson_pollock_7" />
        </div>
      </Card>

      <Card title="Sinais vitais">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <TextField label="Pressão sistólica" type="number" value={bloodPressureSystolic} onChange={(e) => setBloodPressureSystolic(e.target.value)} />
          <TextField label="Pressão diastólica" type="number" value={bloodPressureDiastolic} onChange={(e) => setBloodPressureDiastolic(e.target.value)} />
          <TextField label="Freq. cardíaca" type="number" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} />
          <TextField label="Glicemia" type="number" value={glucose} onChange={(e) => setGlucose(e.target.value)} />
        </div>
      </Card>

      <Card title="Circunferências (cm)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {MEASUREMENT_FIELDS.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              type="number"
              value={measurements[f.key] ?? ''}
              onChange={(e) => setMeasurements((m) => ({ ...m, [f.key]: e.target.value }))}
            />
          ))}
        </div>
      </Card>

      <Card title="Dobras cutâneas (mm)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {SKINFOLD_FIELDS.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              type="number"
              value={skinfolds[f.key] ?? ''}
              onChange={(e) => setSkinfolds((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          ))}
        </div>
      </Card>

      <Card title="Bioimpedância manual">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[
            ['muscleMassKg', 'Massa muscular (kg)'],
            ['bodyWaterPercent', 'Água corporal (%)'],
            ['visceralFatLevel', 'Gordura visceral'],
            ['boneMassKg', 'Massa óssea (kg)'],
            ['basalMetabolicRateKcal', 'Metabolismo basal (kcal)'],
            ['bodyAgeYears', 'Idade corporal (anos)'],
          ].map(([key, label]) => (
            <TextField
              key={key}
              label={label}
              type="number"
              value={bioimpedance[key] ?? ''}
              onChange={(e) => setBioimpedance((b) => ({ ...b, [key]: e.target.value }))}
            />
          ))}
        </div>
      </Card>

      <Card title="Notas internas">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, fontFamily: 'inherit' }}
        />
      </Card>

      <Card title="Rascunho de nota com IA">
        <TextField
          label="O que aconteceu, em poucas palavras"
          placeholder="Ex.: cliente relatou dor leve no joelho direito durante agachamento"
          value={draftInstructions}
          onChange={(e) => setDraftInstructions(e.target.value)}
        />
      </Card>

      <AiAssistPanel
        title="Rascunho gerado por IA"
        helperText="A IA propõe um rascunho de nota a partir do texto acima — revise e edite antes de usar; nada é salvo automaticamente."
        editable
        onUse={(text) => setNotes(text)}
        generate={() => api.generateDraftNote(clientId!, { instructions: draftInstructions, entityType: 'evaluation' })}
      />

      {error ? <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</div> : null}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!heightCm}>
          Salvar
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
      </div>
    </>
  );
}
