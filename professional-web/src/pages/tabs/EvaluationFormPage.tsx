import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import * as api from '../../api/endpoints';
import type { BioimpedanceNumberKey, BmrReference, BodyFatMethod, ClientDetail, Measurements, Skinfolds } from '../../types/api';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { AiAssistPanel } from '../../components/AiAssistPanel';
import { EvaluationPhotosCard, PendingPhotosCard, type PendingPhotos } from './EvaluationPhotosCard';
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

/** Punho e fêmur são diâmetros ósseos (paquímetro), não circunferências — ficam em bloco próprio. */
const BONE_DIAMETER_KEYS: Array<keyof Measurements> = ['wristCm', 'femurBicondylarCm'];

/** `unitChoice`: o aparelho pode dar o valor em % do peso ou em kg — o profissional escolhe como digitar. */
const BIOIMPEDANCE_FIELDS: Array<{ key: BioimpedanceNumberKey; label: string; unitChoice?: true }> = [
  { key: 'bodyFatPercent', label: 'Gordura corporal (%)' },
  { key: 'skeletalMuscleMassKg', label: 'Músculo esquelético', unitChoice: true },
  { key: 'muscleMassKg', label: 'Massa muscular', unitChoice: true },
  { key: 'visceralFatLevel', label: 'Gordura visceral (nível)' },
  { key: 'basalMetabolicRateKcal', label: 'Metabolismo basal (kcal)' },
  { key: 'bodyAgeYears', label: 'Idade corporal (anos)' },
  { key: 'bodyWaterPercent', label: 'Água corporal (%)' },
  { key: 'boneMassKg', label: 'Massa óssea (kg)' },
];

type MassUnit = 'kg' | 'percent';

const PERCENT_NEEDS_WEIGHT = 'Para informar músculo em % é preciso preencher o peso em "Dados básicos".';

const BMR_REFERENCE_OPTIONS: Array<{ value: BmrReference; label: string }> = [
  { value: 'harris_benedict', label: 'Harris-Benedict' },
  { value: 'cunningham', label: 'Cunningham' },
  { value: 'ten_haaf', label: 'Ten Haaf' },
  { value: 'mifflin_st_jeor', label: 'Mifflin-St. Jeor' },
];

const selectStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)' } as const;
const selectLabelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 } as const;
const selectCaptionStyle = { color: 'var(--color-text-secondary)', fontWeight: 600 } as const;
const groupTitleStyle = { fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)' } as const;

/** As 7 dobras do protocolo Jackson & Pollock — sem qualquer uma delas o % de gordura não é calculado. */
const JP7_SITES: Array<keyof Skinfolds> = ['chestMm', 'axillaryMidMm', 'tricepsMm', 'subscapularMm', 'abdominalMm', 'suprailiacMm', 'thighMm'];

type NumField = Record<string, string>;

function toNumberOrUndefined(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Data no fuso do profissional, no formato do campo de data (AAAA-MM-DD). */
function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Idade completa na data da avaliação; '' quando não há nascimento cadastrado. */
function ageOn(birthDate: string | null | undefined, dateInput: string): string {
  if (!birthDate || !dateInput) return '';
  const [by, bm, bd] = birthDate.slice(0, 10).split('-').map(Number);
  const [y, m, d] = dateInput.split('-').map(Number);
  if (!by || !y) return '';
  const age = y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
  return age >= 0 ? String(age) : '';
}

/** Retrato da bioimpedância na tela — para saber se o profissional mexeu em algo desde que ela foi carregada. */
function bioimpedanceSnapshot(values: NumField, equipment: string, units: Record<string, MassUnit>): string {
  return JSON.stringify({ values, equipment: equipment.trim(), units });
}

function sexFromGender(gender: string | null | undefined): 'male' | 'female' | '' {
  const value = (gender ?? '').trim().toLowerCase();
  if (value === 'masculino') return 'male';
  if (value === 'feminino') return 'female';
  return '';
}

export function EvaluationFormPage() {
  const { clientId, evaluationId } = useParams<{ clientId: string; evaluationId?: string }>();
  const isEdit = !!evaluationId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // A ficha do paciente (nascimento e sexo) vem da página do paciente, que envolve esta tela.
  const client = useOutletContext<{ client?: ClientDetail } | null>()?.client;

  const { data: existing } = useQuery({
    queryKey: ['evaluation', clientId, evaluationId],
    queryFn: () => api.getEvaluation(clientId!, evaluationId!),
    enabled: isEdit,
  });

  const [evaluatedDate, setEvaluatedDate] = useState(() => toDateInput(new Date()));
  // Data como veio do servidor: a edição só reenvia a data se o profissional a trocar (senão perderia a hora original).
  const [originalDate, setOriginalDate] = useState<string | null>(null);
  const [age, setAge] = useState(() => (isEdit ? '' : ageOn(client?.birthDate, toDateInput(new Date()))));
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [biologicalSex, setBiologicalSex] = useState<'male' | 'female' | ''>(() => (isEdit ? '' : sexFromGender(client?.gender)));
  const [protocolCode, setProtocolCode] = useState('jackson_pollock_7');
  const [bodyFatMethod, setBodyFatMethod] = useState<BodyFatMethod>('skinfolds');
  const [bmrReference, setBmrReference] = useState<BmrReference>('harris_benedict');
  const [equipment, setEquipment] = useState('');
  const [massUnits, setMassUnits] = useState<Record<string, MassUnit>>({});
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhotos>({});
  const [bloodPressureSystolic, setBloodPressureSystolic] = useState('');
  const [bloodPressureDiastolic, setBloodPressureDiastolic] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [glucose, setGlucose] = useState('');
  const [notes, setNotes] = useState('');
  const [draftInstructions, setDraftInstructions] = useState('');
  const [measurements, setMeasurements] = useState<NumField>({});
  const [skinfolds, setSkinfolds] = useState<NumField>({});
  const [bioimpedance, setBioimpedance] = useState<NumField>({});
  // Bioimpedância como estava gravada: só é reenviada se mudar — reenviar igual
  // marcaria como "digitada" uma leitura que veio da balança conectada.
  const [originalBioimpedance, setOriginalBioimpedance] = useState<string | null>(null);
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
    if (pendingDraft.evaluatedDate) setEvaluatedDate(pendingDraft.evaluatedDate);
    if (pendingDraft.age != null) setAge(pendingDraft.age);
    setHeightCm(pendingDraft.heightCm);
    setWeightKg(pendingDraft.weightKg);
    setBiologicalSex(pendingDraft.biologicalSex);
    setProtocolCode(pendingDraft.protocolCode);
    if (pendingDraft.bodyFatMethod) setBodyFatMethod(pendingDraft.bodyFatMethod);
    if (pendingDraft.bmrReference) setBmrReference(pendingDraft.bmrReference);
    setEquipment(pendingDraft.equipment ?? '');
    setMassUnits(pendingDraft.massUnits ?? {});
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
    const existingDate = toDateInput(new Date(existing.evaluatedAt));
    setEvaluatedDate(existingDate);
    setOriginalDate(existingDate);
    // Avaliação antiga sem idade: propõe a idade pelo nascimento cadastrado depois.
    setAge(existing.ageAtEvaluation != null ? String(existing.ageAtEvaluation) : ageOn(client?.birthDate, existingDate));
    setHeightCm(String(existing.heightCm));
    setWeightKg(existing.weightKg != null ? String(existing.weightKg) : '');
    setBiologicalSex(existing.biologicalSexForCalculation ?? '');
    if (existing.bodyFatMethod) setBodyFatMethod(existing.bodyFatMethod);
    if (existing.bmrReference) setBmrReference(existing.bmrReference);
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
    if (existing.bioimpedance) {
      const b: NumField = {};
      for (const { key } of BIOIMPEDANCE_FIELDS) {
        const v = existing.bioimpedance[key];
        if (v != null) b[key] = String(v);
      }
      const savedEquipment = existing.bioimpedance.equipment ?? '';
      setBioimpedance(b);
      setEquipment(savedEquipment);
      setMassUnits({}); // o que está gravado está sempre em kg
      setOriginalBioimpedance(bioimpedanceSnapshot(b, savedEquipment, {}));
    }
  }, [existing, client?.birthDate]);

  // Autosave debounced — nunca inclui senha/token/credenciais, só os campos do formulário.
  useEffect(() => {
    if (!draftDecided) return;
    const timer = setTimeout(() => {
      saveEvaluationDraft(draftKey, {
        evaluatedDate,
        age,
        heightCm,
        weightKg,
        biologicalSex,
        protocolCode,
        bodyFatMethod,
        bmrReference,
        equipment,
        massUnits,
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
    evaluatedDate,
    age,
    heightCm,
    weightKg,
    biologicalSex,
    protocolCode,
    bodyFatMethod,
    bmrReference,
    equipment,
    massUnits,
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
    mutationFn: async () => {
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

      // Hoje (avaliação nova) fica com a hora do servidor; outra data vai ao meio-dia,
      // para não escorregar para o dia vizinho por causa do fuso.
      const dateChanged = isEdit ? evaluatedDate !== originalDate : evaluatedDate !== toDateInput(new Date());
      const ageNumber = toNumberOrUndefined(age);

      // Músculo esquelético e massa muscular são gravados sempre em kg; o que
      // foi digitado em % do peso é convertido aqui.
      const weight = toNumberOrUndefined(weightKg);
      const bioimpedanceNumbers: Partial<Record<BioimpedanceNumberKey, number>> = {};
      for (const { key, unitChoice } of BIOIMPEDANCE_FIELDS) {
        const value = toNumberOrUndefined(bioimpedance[key] ?? '');
        if (value === undefined) continue;
        if (unitChoice && massUnits[key] === 'percent') {
          if (!weight) throw new Error(PERCENT_NEEDS_WEIGHT);
          bioimpedanceNumbers[key] = Math.round(weight * value) / 100;
        } else {
          bioimpedanceNumbers[key] = value;
        }
      }
      const equipmentName = equipment.trim();
      const bioimpedancePayload =
        Object.keys(bioimpedanceNumbers).length > 0 ? { ...bioimpedanceNumbers, ...(equipmentName ? { equipment: equipmentName } : {}) } : undefined;

      const payload = {
        evaluatedAt: evaluatedDate && dateChanged ? new Date(`${evaluatedDate}T12:00:00`).toISOString() : undefined,
        ageAtEvaluation: ageNumber != null ? Math.trunc(ageNumber) : undefined,
        heightCm: Number(heightCm),
        weightKg: toNumberOrUndefined(weightKg),
        biologicalSexForCalculation: biologicalSex || undefined,
        protocolCode: protocolCode || undefined,
        bodyFatMethod,
        bmrReference,
        bloodPressureSystolic: toNumberOrUndefined(bloodPressureSystolic),
        bloodPressureDiastolic: toNumberOrUndefined(bloodPressureDiastolic),
        heartRate: toNumberOrUndefined(heartRate),
        glucose: toNumberOrUndefined(glucose),
        notes: notes || undefined,
        measurements: toCleanRecord(measurements),
        skinfolds: toCleanRecord(skinfolds),
        bioimpedance: bioimpedanceSnapshot(bioimpedance, equipment, massUnits) === originalBioimpedance ? undefined : bioimpedancePayload,
      };
      if (isEdit) return api.updateEvaluation(clientId!, evaluationId!, payload).then((result) => ({ result, photosFailed: 0 }));

      // Avaliação nova: as fotos escolhidas sobem depois que ela existe. Foto que
      // falhar não desfaz a avaliação — a tela dela mostra a vista vazia para reenviar.
      const result = await api.createEvaluation(clientId!, payload);
      let photosFailed = 0;
      for (const [angle, file] of Object.entries(pendingPhotos)) {
        try {
          await api.uploadEvaluationPhoto(clientId!, result.id, angle, file as File);
        } catch {
          photosFailed += 1;
        }
      }
      return { result, photosFailed };
    },
    onSuccess: ({ result, photosFailed }) => {
      removeEvaluationDraft(draftKey);
      queryClient.invalidateQueries({ queryKey: ['evaluations', clientId] });
      queryClient.invalidateQueries({ queryKey: ['evolution', clientId] });
      navigate(`/clients/${clientId}/evaluations/${result.id}`, { state: photosFailed ? { photosFailed } : undefined });
    },
    onError: (err) => {
      if (err instanceof Error && err.message === PERCENT_NEEDS_WEIGHT) {
        setError(err.message);
        return;
      }
      // O motivo que o servidor deu, quando deu — "confira os valores" sozinho não diz qual.
      const reason = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const detail = Array.isArray(reason) ? reason.join('; ') : reason;
      setError(detail ? `Não foi possível salvar: ${detail}` : 'Não foi possível salvar. Confira os valores informados e tente de novo.');
    },
  });

  // O % de gordura só sai com as 7 dobras do protocolo, a idade e o sexo — avisa
  // antes de salvar, em vez de a avaliação aparecer depois sem o resultado.
  const filled = (value: string | undefined) => (value ?? '').trim() !== '';
  const anySkinfold = Object.values(skinfolds).some(filled);
  const missingSites = JP7_SITES.filter((site) => !filled(skinfolds[site])).map(
    (site) => SKINFOLD_FIELDS.find((f) => f.key === site)!.label.replace(' (mm)', ''),
  );
  const missingBasics = [!filled(age) ? 'a idade' : null, !biologicalSex ? 'o sexo' : null].filter(Boolean);
  const skinfoldWarning =
    bodyFatMethod !== 'skinfolds' || !anySkinfold
    ? null
    : missingSites.length > 0
      ? `Sem estas dobras o % de gordura não é calculado: ${missingSites.join(', ')}.`
      : missingBasics.length > 0
        ? `Para calcular o % de gordura falta informar ${missingBasics.join(' e ')} em "Dados básicos".`
        : null;

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
          <TextField
            label="Data da avaliação"
            type="date"
            value={evaluatedDate}
            max={toDateInput(new Date())}
            onChange={(e) => {
              setEvaluatedDate(e.target.value);
              // Com nascimento cadastrado, a idade acompanha a data escolhida.
              if (client?.birthDate) setAge(ageOn(client.birthDate, e.target.value));
            }}
          />
          <TextField label="Idade na avaliação (anos)" type="number" min={0} step={1} value={age} onChange={(e) => setAge(e.target.value)} />
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
          <label style={selectLabelStyle}>
            <span style={selectCaptionStyle}>Calcular % de gordura por</span>
            <select value={bodyFatMethod} onChange={(e) => setBodyFatMethod(e.target.value as BodyFatMethod)} style={selectStyle}>
              <option value="skinfolds">Dobras cutâneas</option>
              <option value="bioimpedance">Bioimpedância</option>
            </select>
          </label>
          <label style={selectLabelStyle}>
            <span style={selectCaptionStyle}>Referência do metabolismo basal</span>
            <select value={bmrReference} onChange={(e) => setBmrReference(e.target.value as BmrReference)} style={selectStyle}>
              {BMR_REFERENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!client?.birthDate && !age ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Este paciente não tem data de nascimento cadastrada — informe a idade aqui, ou cadastre o nascimento na anamnese.
          </div>
        ) : null}
      </Card>

      <Card title="Sinais vitais">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <TextField label="Pressão sistólica" type="number" value={bloodPressureSystolic} onChange={(e) => setBloodPressureSystolic(e.target.value)} />
          <TextField label="Pressão diastólica" type="number" value={bloodPressureDiastolic} onChange={(e) => setBloodPressureDiastolic(e.target.value)} />
          <TextField label="Freq. cardíaca" type="number" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} />
          <TextField label="Glicemia" type="number" value={glucose} onChange={(e) => setGlucose(e.target.value)} />
        </div>
      </Card>

      <Card title="Medidas">
        {[
          { title: 'Circunferências (cm) — fita métrica', fields: MEASUREMENT_FIELDS.filter((f) => !BONE_DIAMETER_KEYS.includes(f.key)) },
          { title: 'Diâmetros ósseos (cm) — paquímetro', fields: MEASUREMENT_FIELDS.filter((f) => BONE_DIAMETER_KEYS.includes(f.key)) },
        ].map((group) => (
          <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={groupTitleStyle}>{group.title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {group.fields.map((f) => (
                <TextField
                  key={f.key}
                  label={f.label}
                  type="number"
                  value={measurements[f.key] ?? ''}
                  onChange={(e) => setMeasurements((m) => ({ ...m, [f.key]: e.target.value }))}
                />
              ))}
            </div>
          </div>
        ))}
      </Card>

      <Card title="Dobras cutâneas (mm)">
        <label style={{ ...selectLabelStyle, maxWidth: 320 }}>
          <span style={selectCaptionStyle}>Fórmula e protocolo</span>
          <select value={protocolCode} onChange={(e) => setProtocolCode(e.target.value)} style={selectStyle}>
            <option value="jackson_pollock_7">Pollock — 7 dobras</option>
          </select>
        </label>
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
        {skinfoldWarning ? (
          <div role="alert" style={{ fontSize: 13, color: 'var(--color-danger)' }}>
            {skinfoldWarning}
          </div>
        ) : null}
      </Card>

      <Card title="Bioimpedância">
        <div style={{ maxWidth: 320 }}>
          <TextField label="Equipamento" placeholder="Ex.: Omron" maxLength={60} value={equipment} onChange={(e) => setEquipment(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {BIOIMPEDANCE_FIELDS.map(({ key, label, unitChoice }) => {
            const unit = massUnits[key] ?? 'kg';
            const field = (
              <TextField
                key={key}
                label={unitChoice ? `${label} (${unit === 'percent' ? '%' : 'kg'})` : label}
                type="number"
                value={bioimpedance[key] ?? ''}
                onChange={(e) => setBioimpedance((b) => ({ ...b, [key]: e.target.value }))}
              />
            );
            if (!unitChoice) return field;
            return (
              <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 0 }}>{field}</div>
                <select
                  aria-label={`Unidade de ${label.toLowerCase()}`}
                  value={unit}
                  onChange={(e) => setMassUnits((units) => ({ ...units, [key]: e.target.value as MassUnit }))}
                  style={selectStyle}
                >
                  <option value="kg">kg</option>
                  <option value="percent">%</option>
                </select>
              </div>
            );
          })}
        </div>
        {bodyFatMethod === 'bioimpedance' && !filled(bioimpedance.bodyFatPercent) ? (
          <div role="alert" style={{ fontSize: 13, color: 'var(--color-danger)' }}>
            Você escolheu calcular o % de gordura pela bioimpedância: informe a "Gordura corporal (%)" do aparelho.
          </div>
        ) : null}
      </Card>

      {isEdit ? (
        existing ? <EvaluationPhotosCard clientId={clientId!} evaluationId={evaluationId!} photos={existing.photos ?? []} /> : null
      ) : (
        <PendingPhotosCard files={pendingPhotos} onChange={setPendingPhotos} />
      )}

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
