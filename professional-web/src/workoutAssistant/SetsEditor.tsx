import type React from 'react';
import { Button } from '../components/Button';
import { LOAD_UNIT_OPTIONS } from '../lib/workoutFormat';
import type { LoadUnit } from '../types/api';
import { emptySet, setRepsMode, type DraftSet, type RepsMode } from './draft';

interface Props {
  sets: DraftSet[];
  onChange: (sets: DraftSet[]) => void;
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  padding: '5px 6px',
  fontSize: 13,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
};

const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--color-text-secondary)' };

function NumberInput({
  label,
  value,
  onChange,
  width = 64,
  step = 1,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  width?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      min={0}
      step={step}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        const parsed = Number(raw);
        onChange(raw === '' || Number.isNaN(parsed) ? null : parsed);
      }}
      style={{ ...inputStyle, width }}
    />
  );
}

/** Editor de séries de UM exercício — tudo em estado local até "Criar treino como rascunho". */
export function SetsEditor({ sets, onChange }: Props) {
  const update = (key: string, patch: Partial<DraftSet>) => onChange(sets.map((set) => (set.key === key ? { ...set, ...patch } : set)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sets.map((set, index) => {
        const n = index + 1;
        return (
          <div
            key={set.key}
            role="group"
            aria-label={`Série ${n}`}
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8, padding: '6px 0', borderTop: '1px dashed var(--color-border)' }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, minWidth: 52, alignSelf: 'center' }}>Série {n}</span>

            <label style={fieldLabel}>
              Repetições
              <select
                aria-label={`Série ${n} — tipo de repetição`}
                value={set.repsMode}
                onChange={(e) => onChange(sets.map((s) => (s.key === set.key ? setRepsMode(s, e.target.value as RepsMode) : s)))}
                style={inputStyle}
              >
                <option value="exact">Exatas</option>
                <option value="range">Faixa</option>
                <option value="none">Não informado</option>
              </select>
            </label>

            {set.repsMode === 'exact' ? (
              <label style={fieldLabel}>
                Reps
                <NumberInput label={`Série ${n} — repetições`} value={set.reps} onChange={(reps) => update(set.key, { reps })} width={56} />
              </label>
            ) : null}
            {set.repsMode === 'range' ? (
              <label style={fieldLabel}>
                Mín – máx
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <NumberInput label={`Série ${n} — repetições mínimas`} value={set.repsMin} onChange={(repsMin) => update(set.key, { repsMin })} width={52} />
                  –
                  <NumberInput label={`Série ${n} — repetições máximas`} value={set.repsMax} onChange={(repsMax) => update(set.key, { repsMax })} width={52} />
                </span>
              </label>
            ) : null}

            <label style={fieldLabel}>
              Carga
              <span style={{ display: 'flex', gap: 4 }}>
                <NumberInput label={`Série ${n} — carga`} value={set.loadValue} onChange={(loadValue) => update(set.key, { loadValue })} step={0.5} />
                <select
                  aria-label={`Série ${n} — unidade da carga`}
                  value={set.loadUnit ?? ''}
                  onChange={(e) => update(set.key, { loadUnit: (e.target.value || null) as LoadUnit | null })}
                  style={inputStyle}
                >
                  <option value="">—</option>
                  {LOAD_UNIT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </span>
            </label>

            <label style={fieldLabel}>
              Descanso (s)
              <NumberInput label={`Série ${n} — descanso em segundos`} value={set.restSeconds} onChange={(restSeconds) => update(set.key, { restSeconds })} />
            </label>
            <label style={fieldLabel}>
              Duração (s)
              <NumberInput label={`Série ${n} — duração em segundos`} value={set.durationSeconds} onChange={(durationSeconds) => update(set.key, { durationSeconds })} />
            </label>
            <label style={fieldLabel}>
              Distância (m)
              <NumberInput label={`Série ${n} — distância em metros`} value={set.distanceMeters} onChange={(distanceMeters) => update(set.key, { distanceMeters })} width={72} />
            </label>
            <label style={fieldLabel}>
              Cadência
              <input
                aria-label={`Série ${n} — cadência`}
                value={set.tempo}
                maxLength={50}
                placeholder="ex.: 3-1-2"
                onChange={(e) => update(set.key, { tempo: e.target.value })}
                style={{ ...inputStyle, width: 72 }}
              />
            </label>
            <label style={{ ...fieldLabel, flex: 1, minWidth: 120 }}>
              Observação
              <input
                aria-label={`Série ${n} — observação`}
                value={set.notes}
                maxLength={1000}
                onChange={(e) => update(set.key, { notes: e.target.value })}
                style={inputStyle}
              />
            </label>

            <Button size="small" variant="ghost" aria-label={`Remover série ${n}`} onClick={() => onChange(sets.filter((s) => s.key !== set.key))}>
              Remover
            </Button>
          </div>
        );
      })}
      <div>
        <Button size="small" variant="secondary" onClick={() => onChange([...sets, emptySet()])}>
          + Adicionar série
        </Button>
      </div>
    </div>
  );
}
