import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { formatDate } from '../lib/format';
import type { AnamnesisView } from '../types/api';
import {
  CONDITION_OPTIONS,
  emptyItem,
  FAMILY_HISTORY_OPTIONS,
  GENDER_OPTIONS,
  GOAL_OPTIONS,
  SLEEP_QUALITY_OPTIONS,
  STEPS,
  STRESS_LEVEL_OPTIONS,
  toForm,
  toPayload,
  type AnamnesisForm,
  type ItemForm,
  type Option,
} from './options';

const SHORT = 200;
const LONG = 2000;

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 100,
};
const dialog: CSSProperties = {
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-lg)',
  width: '100%',
  maxWidth: 900,
  maxHeight: '92vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};
const input: CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '9px 11px',
  fontSize: 14,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
};
const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 };
const grid3: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 };

function errorMessage(err: unknown): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' ? message : 'Não foi possível salvar a anamnese. Tente de novo.';
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5, fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}

function Text({ label, value, onChange, placeholder, type = 'text', readOnly = false }: { label: string; value: string; onChange?: (value: string) => void; placeholder?: string; type?: string; readOnly?: boolean }) {
  return (
    <Field label={label}>
      <input
        style={{ ...input, ...(readOnly ? { background: 'var(--color-bg)', color: 'var(--color-text-secondary)' } : {}) }}
        type={type}
        value={value}
        maxLength={SHORT}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </Field>
  );
}

function Area({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) {
  return (
    <Field label={label}>
      <textarea style={{ ...input, resize: 'vertical' }} rows={rows} value={value} maxLength={LONG} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Option[] }) {
  return (
    <Field label={label}>
      <select style={input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function CheckGrid({ legend, options, selected, onChange }: { legend: string; options: Option[]; selected: string[]; onChange: (selected: string[]) => void }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <legend style={{ fontSize: 15, fontWeight: 600, padding: 0, marginBottom: 10 }}>{legend}</legend>
      <div style={grid3}>
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: checked ? 'var(--color-primary-light)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                // Mantém a ordem da lista de opções, não a ordem dos cliques.
                onChange={() => onChange(options.map((o) => o.value).filter((value) => (value === option.value ? !checked : selected.includes(value))))}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ItemList({ title, items, onChange }: { title: string; items: ItemForm[]; onChange: (items: ItemForm[]) => void }) {
  const update = (key: string, patch: Partial<ItemForm>) => onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
        <Button size="small" variant="secondary" onClick={() => onChange([...items, emptyItem()])}>
          + Adicionar
        </Button>
      </div>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '18px 0', fontSize: 13.5, color: 'var(--color-text-secondary)' }}>Nenhum item adicionado</div>
      ) : (
        items.map((item, index) => (
          <div key={item.key} role="group" aria-label={`${title} — item ${index + 1}`} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)' }}>
            <input style={input} aria-label="Nome" placeholder="Nome" maxLength={SHORT} value={item.name} onChange={(e) => update(item.key, { name: e.target.value })} />
            <input style={input} aria-label="Dosagem" placeholder="Dosagem" maxLength={SHORT} value={item.dosage} onChange={(e) => update(item.key, { dosage: e.target.value })} />
            <input style={input} aria-label="Frequência" placeholder="Frequência" maxLength={SHORT} value={item.frequency} onChange={(e) => update(item.key, { frequency: e.target.value })} />
            <button
              type="button"
              aria-label={`Remover item ${index + 1}`}
              onClick={() => onChange(items.filter((other) => other.key !== item.key))}
              style={{ border: 0, background: 'none', color: 'var(--color-danger)', fontSize: 18, cursor: 'pointer', padding: '0 6px' }}
            >
              ✕
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Anamnese do paciente em 12 etapas, como uma janela sobre a lista. Cada troca
 * de etapa grava o que mudou (nada se perde ao fechar no meio); "Concluir
 * Anamnese" grava e marca a ficha como concluída.
 */
export function AnamnesisWizard({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({ queryKey: ['anamnesis', clientId], queryFn: () => api.getAnamnesis(clientId), gcTime: 0, staleTime: 0 });

  return (
    <div style={overlay} onClick={onClose}>
      <div style={dialog} role="dialog" aria-modal="true" aria-label="Anamnese" onClick={(e) => e.stopPropagation()}>
        {data ? (
          <WizardBody key={clientId} view={data} onClose={onClose} />
        ) : (
          <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
            <div role={isError ? 'alert' : 'status'} style={{ fontSize: 14, color: isError ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
              {isLoading ? 'Carregando anamnese…' : 'Não foi possível abrir a anamnese deste paciente.'}
            </div>
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function WizardBody({ view, onClose }: { view: AnamnesisView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AnamnesisForm>(() => toForm(view));
  const [saved, setSaved] = useState(() => JSON.stringify(toPayload(toForm(view))));
  const [completedAt, setCompletedAt] = useState(view.anamnesis.completedAt);
  const [stepIndex, setStepIndex] = useState(0);
  // Ficha já concluída abre com todas as etapas marcadas.
  const [reached, setReached] = useState(view.anamnesis.completedAt ? STEPS.length : 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A barra de etapas rola sozinha para mostrar a etapa atual.
  const activeTab = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeTab.current?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [stepIndex]);

  const step = STEPS[stepIndex];
  const last = stepIndex === STEPS.length - 1;
  const set = (patch: Partial<AnamnesisForm>) => setForm((current) => ({ ...current, ...patch }));
  const dirty = JSON.stringify(toPayload(form)) !== saved;

  /** Grava só se algo mudou (ou se está concluindo). false = não gravou; a tela mostra o erro e fica onde está. */
  async function save(completed?: boolean): Promise<boolean> {
    if (!dirty && completed === undefined) return true;
    setSaving(true);
    setError(null);
    try {
      const result = await api.saveAnamnesis(view.client.id, toPayload(form, completed));
      setSaved(JSON.stringify(toPayload(form)));
      setCompletedAt(result.anamnesis.completedAt);
      await queryClient.invalidateQueries({ queryKey: ['anamneses'] });
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function goTo(index: number) {
    if (index === stepIndex || index < 0 || index >= STEPS.length) return;
    if (!(await save())) return;
    setReached((current) => Math.max(current, stepIndex + 1, index));
    setStepIndex(index);
  }

  async function close() {
    if (await save()) onClose();
  }

  async function finish() {
    if (await save(true)) onClose();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Anamnese — {view.client.fullName}</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {STEPS.length} etapas{completedAt ? ` · concluída em ${formatDate(completedAt)}` : ''}
          </div>
        </div>
        <Button variant="ghost" onClick={close} disabled={saving}>
          Fechar
        </Button>
      </div>

      <div role="tablist" aria-label="Etapas da anamnese" style={{ display: 'flex', gap: 8, padding: '14px 24px 0', overflowX: 'auto', flexShrink: 0 }}>
        {STEPS.map((item, index) => {
          const active = index === stepIndex;
          const done = !active && index < reached;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              ref={active ? activeTab : undefined}
              onClick={() => goTo(index)}
              disabled={saving}
              style={{
                whiteSpace: 'nowrap',
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${active ? 'var(--color-primary)' : done ? 'var(--color-success)' : 'var(--color-border)'}`,
                background: active ? 'var(--color-primary)' : done ? 'var(--color-success-light)' : 'var(--color-bg)',
                color: active ? '#fff' : done ? 'var(--color-success)' : 'var(--color-text-secondary)',
              }}
            >
              {item.label}
              {done ? ' ✓' : ''}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={step.label} style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>{step.label}</h3>

        {step.key === 'personal' ? (
          <>
            <div style={grid2}>
              <Text label="Nome completo" value={view.client.fullName} readOnly />
              <Text label="Data de nascimento" type="date" value={form.birthDate} onChange={(birthDate) => set({ birthDate })} />
              <Select label="Sexo" value={form.gender} onChange={(gender) => set({ gender })} options={GENDER_OPTIONS} />
              <Text label="Estado civil" value={form.maritalStatus} onChange={(maritalStatus) => set({ maritalStatus })} />
              <Text label="CPF" value={form.cpf} onChange={(cpf) => set({ cpf })} />
              <Text label="RG" value={form.rg} onChange={(rg) => set({ rg })} />
              <Text label="Profissão" value={form.occupation} onChange={(occupation) => set({ occupation })} />
              <Text label="E-mail" value={view.client.email} readOnly />
              <Text label="WhatsApp" value={form.phone} onChange={(phone) => set({ phone })} />
            </div>
            <Text label="Endereço completo" value={form.address} onChange={(address) => set({ address })} />
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Nome e e-mail são do cadastro do paciente e são alterados na ficha dele, em Pacientes.</div>
          </>
        ) : null}

        {step.key === 'goal' ? (
          <>
            <CheckGrid legend="Selecione os objetivos do paciente" options={GOAL_OPTIONS} selected={form.goals} onChange={(goals) => set({ goals })} />
            <Area label="Descrição do objetivo" value={form.goalDescription} onChange={(goalDescription) => set({ goalDescription })} />
          </>
        ) : null}

        {step.key === 'clinical' ? (
          <>
            <CheckGrid legend="Patologias diagnosticadas" options={CONDITION_OPTIONS} selected={form.conditions} onChange={(conditions) => set({ conditions })} />
            <Area label="Outras patologias" value={form.otherConditions} onChange={(otherConditions) => set({ otherConditions })} rows={2} />
          </>
        ) : null}

        {step.key === 'medications' ? <ItemList title="Medicamentos em uso" items={form.medications} onChange={(medications) => set({ medications })} /> : null}
        {step.key === 'supplements' ? <ItemList title="Suplementos utilizados" items={form.supplements} onChange={(supplements) => set({ supplements })} /> : null}
        {step.key === 'hormones' ? <ItemList title="Hormônios em uso" items={form.hormones} onChange={(hormones) => set({ hormones })} /> : null}

        {step.key === 'surgeries' ? (
          <>
            <Area label="Cirurgias realizadas" placeholder="Descreva cirurgias, datas..." value={form.surgeries} onChange={(surgeries) => set({ surgeries })} />
            <Area label="Alergias conhecidas" placeholder="Alergias a medicamentos, alimentos..." value={form.allergies} onChange={(allergies) => set({ allergies })} />
          </>
        ) : null}

        {step.key === 'family' ? (
          <CheckGrid legend="Histórico familiar de doenças" options={FAMILY_HISTORY_OPTIONS} selected={form.familyHistory} onChange={(familyHistory) => set({ familyHistory })} />
        ) : null}

        {step.key === 'habits' ? (
          <div style={grid2}>
            <Text label="Tabagismo" placeholder="Ex: Não fumante / Fuma X cigarros/dia" value={form.smoking} onChange={(smoking) => set({ smoking })} />
            <Text label="Consumo de álcool" placeholder="Ex: Social / Diário / Não consome" value={form.alcohol} onChange={(alcohol) => set({ alcohol })} />
            <Text label="Consumo de água" placeholder="Ex: 2 litros/dia" value={form.waterIntake} onChange={(waterIntake) => set({ waterIntake })} />
            <Text label="Horas de sono" placeholder="Ex: 7h" value={form.sleepHours} onChange={(sleepHours) => set({ sleepHours })} />
            <Select label="Qualidade do sono" value={form.sleepQuality} onChange={(sleepQuality) => set({ sleepQuality })} options={SLEEP_QUALITY_OPTIONS} />
            <Select label="Nível de estresse" value={form.stressLevel} onChange={(stressLevel) => set({ stressLevel })} options={STRESS_LEVEL_OPTIONS} />
            <Text label="Frequência intestinal" placeholder="Ex: 1x ao dia" value={form.bowelFrequency} onChange={(bowelFrequency) => set({ bowelFrequency })} />
          </div>
        ) : null}

        {step.key === 'activity' ? (
          <div style={grid2}>
            <Text label="Frequência semanal" placeholder="Ex: 4x por semana" value={form.trainingFrequency} onChange={(trainingFrequency) => set({ trainingFrequency })} />
            <Text label="Tempo de treino" placeholder="Ex: 60 min" value={form.trainingDuration} onChange={(trainingDuration) => set({ trainingDuration })} />
            <Text label="Modalidade" placeholder="Ex: Musculação, Crossfit" value={form.trainingModality} onChange={(trainingModality) => set({ trainingModality })} />
            <Text label="Cardio" placeholder="Ex: 30 min corrida 3x/sem" value={form.cardio} onChange={(cardio) => set({ cardio })} />
            <Text label="Passos diários" placeholder="Ex: 8000" value={form.dailySteps} onChange={(dailySteps) => set({ dailySteps })} />
          </div>
        ) : null}

        {step.key === 'food' ? (
          <>
            <div style={grid2}>
              <Text label="Número de refeições/dia" value={form.mealsPerDay} onChange={(mealsPerDay) => set({ mealsPerDay })} />
              <Text label="Horários das refeições" placeholder="Ex: 7h, 10h, 13h, 16h, 20h" value={form.mealTimes} onChange={(mealTimes) => set({ mealTimes })} />
            </div>
            <Area label="Preferências alimentares" value={form.foodPreferences} onChange={(foodPreferences) => set({ foodPreferences })} rows={2} />
            <div style={grid3}>
              <Area label="Intolerâncias" placeholder="Lactose, glúten..." value={form.intolerances} onChange={(intolerances) => set({ intolerances })} rows={2} />
              <Area label="Restrições" placeholder="Vegetariano, vegano..." value={form.restrictions} onChange={(restrictions) => set({ restrictions })} rows={2} />
              <Area label="Aversões" placeholder="Alimentos que não gosta" value={form.aversions} onChange={(aversions) => set({ aversions })} rows={2} />
            </div>
          </>
        ) : null}

        {step.key === 'notes' ? (
          <Area label="Observações gerais e anotações" placeholder="Qualquer informação relevante..." value={form.notes} onChange={(notes) => set({ notes })} rows={6} />
        ) : null}

        {error ? (
          <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13.5 }}>
            {error}{' '}
            <button type="button" onClick={onClose} style={{ border: 0, background: 'none', color: 'var(--color-danger)', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}>
              Fechar sem salvar
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 24px', borderTop: '1px solid var(--color-border)' }}>
        <Button variant="secondary" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0 || saving}>
          ← Anterior
        </Button>
        <span style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
          {stepIndex + 1} de {STEPS.length}
        </span>
        {last ? (
          <Button onClick={finish} loading={saving} style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)' }}>
            ✓ Concluir Anamnese
          </Button>
        ) : (
          <Button onClick={() => goTo(stepIndex + 1)} loading={saving}>
            Próximo →
          </Button>
        )}
      </div>
    </>
  );
}
