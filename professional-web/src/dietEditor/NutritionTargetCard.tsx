import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import type { ClientDetail, DietVersion } from '../types/api';
import styles from './DietStructure.module.css';
import { CHOICE_KCAL_TOLERANCE, dayFirstChoiceTotals, dayTitle, formatKcalDiff } from './structure';
import {
  ACTIVITY_LEVELS,
  BMR_FORMULAS,
  OBJECTIVE_ADJUSTMENTS,
  ageAt,
  computeTarget,
  differenceFromTarget,
  sexFromText,
  type BmrFormula,
  type Sex,
} from './nutritionTarget';

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

type TargetKey = 'targetCalories' | 'targetProteinG' | 'targetCarbG' | 'targetFatG';

const TARGETS: Array<{ key: TargetKey; label: string; unit: string; total: 'kcal' | 'proteinG' | 'carbG' | 'fatG' }> = [
  { key: 'targetCalories', label: 'Calorias', unit: 'kcal', total: 'kcal' },
  { key: 'targetProteinG', label: 'Proteína', unit: 'g', total: 'proteinG' },
  { key: 'targetCarbG', label: 'Carboidrato', unit: 'g', total: 'carbG' },
  { key: 'targetFatG', label: 'Gordura', unit: 'g', total: 'fatG' },
];

const toText = (value: number | null) => (value == null ? '' : String(value));

function toNumber(text: string): number | null | 'invalid' {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
}

/**
 * Meta nutricional da dieta (kcal e macros) e como cada dia fica perto dela.
 * O dia é somado com a 1ª opção de cada bloco — mesma base do gráfico e do
 * alerta de opções. Em rascunho, a meta pode ser digitada ou calculada.
 */
export function NutritionTargetCard({
  clientId,
  dietId,
  version,
  editable,
  onSaved,
}: {
  clientId: string;
  dietId: string;
  version: DietVersion;
  editable: boolean;
  onSaved?: () => Promise<unknown> | void;
}) {
  const [values, setValues] = useState<Record<TargetKey, string>>({
    targetCalories: toText(version.targetCalories),
    targetProteinG: toText(version.targetProteinG),
    targetCarbG: toText(version.targetCarbG),
    targetFatG: toText(version.targetFatG),
  });
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Partial<Record<TargetKey, number | null>> = {};
      for (const { key, label } of TARGETS) {
        const parsed = toNumber(values[key]);
        if (parsed === 'invalid') throw new Error(`${label}: informe um número maior ou igual a zero.`);
        payload[key] = parsed;
      }
      await api.updateDietVersion(clientId, dietId, version.id, payload);
    },
    onMutate: () => {
      setError(null);
      setSavedMessage(null);
    },
    onSuccess: async () => {
      setSavedMessage('Meta salva.');
      await onSaved?.();
    },
    onError: (err) => setError(err instanceof Error && err.message.includes(':') ? err.message : 'Não foi possível salvar a meta.'),
  });

  const days = version.days ?? [];
  const hasTarget = TARGETS.some(({ key }) => version[key] != null);

  return (
    <Card title="Meta nutricional">
      {editable ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            {TARGETS.map(({ key, label, unit }) => (
              <label key={key} className={styles.field}>
                <span className={styles.fieldLabel}>
                  {label} ({unit})
                </span>
                <input
                  className={styles.input}
                  inputMode="decimal"
                  aria-label={`Meta de ${label.toLowerCase()} (${unit})`}
                  value={values[key]}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  placeholder="Sem meta"
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="small" variant="secondary" onClick={() => save.mutate()} loading={save.isPending}>
              Salvar meta
            </Button>
            <Button size="small" variant="ghost" onClick={() => setCalculatorOpen((o) => !o)} aria-expanded={calculatorOpen}>
              {calculatorOpen ? 'Fechar cálculo' : 'Calcular meta'}
            </Button>
            {savedMessage ? <span className={styles.muted}>{savedMessage}</span> : null}
            {error ? (
              <span role="alert" style={{ fontSize: 12.5, color: 'var(--color-danger)' }}>
                {error}
              </span>
            ) : null}
          </div>
          {calculatorOpen ? (
            <TargetCalculator
              clientId={clientId}
              onApply={(t) => {
                setValues({ targetCalories: String(t.kcal), targetProteinG: String(t.proteinG), targetCarbG: String(t.carbG), targetFatG: String(t.fatG) });
                setSavedMessage('Valores aplicados — clique em "Salvar meta" para gravar.');
              }}
            />
          ) : null}
        </div>
      ) : hasTarget ? (
        <div style={{ fontSize: 13.5 }}>
          Meta:{' '}
          {TARGETS.filter(({ key }) => version[key] != null)
            .map(({ key, label, unit }) => `${label} ${number.format(version[key]!)} ${unit}`)
            .join(' · ')}
        </div>
      ) : (
        <div className={styles.muted}>Nenhuma meta definida para esta dieta.</div>
      )}

      {hasTarget && days.length > 0 ? <PlanVersusTarget version={version} /> : null}
    </Card>
  );
}

/** Cada dia (1ª opção de cada bloco) contra a meta salva. */
function PlanVersusTarget({ version }: { version: DietVersion }) {
  const days = version.days ?? [];
  return (
    <table className={styles.macroTable} aria-label="Plano comparado com a meta">
      <thead>
        <tr>
          <th>Dia (1ª opção de cada bloco)</th>
          {TARGETS.map(({ key, label }) => (version[key] != null ? <th key={key}>{label}</th> : null))}
        </tr>
      </thead>
      <tbody>
        {days.map((day, i) => {
          const totals = dayFirstChoiceTotals(day);
          return (
            <tr key={day.id ?? i}>
              <td>
                {days.length > 1 ? dayTitle(day, i) : 'Dia'}
                {totals.partial ? <span className={styles.muted}> (parcial)</span> : null}
              </td>
              {TARGETS.map(({ key, unit, total }) => {
                const target = version[key];
                if (target == null) return null;
                const diff = differenceFromTarget(totals[total], target);
                const warn = diff !== null && Math.abs(diff) > CHOICE_KCAL_TOLERANCE;
                return (
                  <td key={key}>
                    {number.format(totals[total])} {unit}{' '}
                    {diff !== null ? <span className={[styles.diff, warn ? styles.diffWarn : ''].join(' ')}>{formatKcalDiff(diff)}</span> : null}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface CalculatorValues {
  formula: BmrFormula;
  sex: Sex | '';
  age: string;
  weightKg: string;
  heightCm: string;
  activityFactor: string;
  objectivePercent: string;
  proteinGPerKg: string;
  fatGPerKg: string;
}

/**
 * Calculadora da meta: TMB pela fórmula escolhida, gasto do dia e objetivo.
 * Peso e altura vêm da avaliação física mais recente (podem ser trocados);
 * idade e sexo, do cadastro do paciente. Só busca a avaliação quando aberta.
 */
function TargetCalculator({ clientId, onApply }: { clientId: string; onApply: (t: { kcal: number; proteinG: number; carbG: number; fatG: number }) => void }) {
  const client = useOutletContext<{ client?: ClientDetail } | null>()?.client;
  const latest = useQuery({
    queryKey: ['latest-evaluation', clientId],
    queryFn: async () => {
      const list = await api.listEvaluations(clientId, 1, 1);
      const first = list.items[0];
      return first ? api.getEvaluation(clientId, first.id) : null;
    },
  });

  const [values, setValues] = useState<CalculatorValues | null>(null);
  const evaluation = latest.data ?? null;
  const current: CalculatorValues =
    values ??
    ({
      formula: 'mifflin_st_jeor',
      sex: sexFromText(evaluation?.biologicalSexForCalculation) ?? sexFromText(client?.gender) ?? '',
      age: String(ageAt(client?.birthDate) ?? evaluation?.ageAtEvaluation ?? ''),
      weightKg: evaluation?.weightKg != null ? String(evaluation.weightKg) : '',
      heightCm: evaluation?.heightCm != null ? String(evaluation.heightCm) : '',
      activityFactor: '1.55',
      objectivePercent: '0',
      proteinGPerKg: '2',
      fatGPerKg: '0.8',
    } satisfies CalculatorValues);
  const set = (patch: Partial<CalculatorValues>) => setValues({ ...current, ...patch });

  const n = (text: string) => Number(text.replace(',', '.'));
  const ready = !!current.sex && n(current.age) > 0 && n(current.weightKg) > 0 && n(current.heightCm) > 0;
  const result = ready
    ? computeTarget({
        formula: current.formula,
        sex: current.sex as Sex,
        weightKg: n(current.weightKg),
        heightCm: n(current.heightCm),
        age: n(current.age),
        activityFactor: n(current.activityFactor),
        objectivePercent: n(current.objectivePercent),
        proteinGPerKg: n(current.proteinGPerKg) || 0,
        fatGPerKg: n(current.fatGPerKg) || 0,
      })
    : null;

  const select = (label: string, value: string, onChange: (v: string) => void, options: Array<{ value: string; label: string }>) => (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <select className={styles.input} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const input = (label: string, key: keyof CalculatorValues) => (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input className={styles.input} inputMode="decimal" aria-label={label} value={current[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<CalculatorValues>)} />
    </label>
  );

  return (
    <section aria-label="Calcular meta" style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className={styles.muted}>
        {latest.isLoading
          ? 'Buscando a avaliação física mais recente…'
          : evaluation
            ? `Peso e altura da avaliação de ${new Date(evaluation.evaluatedAt).toLocaleDateString('pt-BR')} — pode alterar.`
            : 'Sem avaliação física: informe peso e altura.'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {select('Fórmula do metabolismo basal', current.formula, (v) => set({ formula: v as BmrFormula }), BMR_FORMULAS)}
        {select('Sexo', current.sex, (v) => set({ sex: v as Sex | '' }), [
          { value: '', label: '—' },
          { value: 'female', label: 'Feminino' },
          { value: 'male', label: 'Masculino' },
        ])}
        {input('Idade (anos)', 'age')}
        {input('Peso (kg)', 'weightKg')}
        {input('Altura (cm)', 'heightCm')}
        {select(
          'Nível de atividade',
          current.activityFactor,
          (v) => set({ activityFactor: v }),
          ACTIVITY_LEVELS.map((a) => ({ value: String(a.factor), label: a.label })),
        )}
        {select(
          'Objetivo',
          current.objectivePercent,
          (v) => set({ objectivePercent: v }),
          OBJECTIVE_ADJUSTMENTS.map((o) => ({ value: String(o.percent), label: o.label })),
        )}
        {input('Proteína (g por kg)', 'proteinGPerKg')}
        {input('Gordura (g por kg)', 'fatGPerKg')}
      </div>

      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 13.5 }}>
            Metabolismo basal <strong>{number.format(result.bmr)} kcal</strong> · Gasto do dia <strong>{number.format(result.tdee)} kcal</strong> · Meta{' '}
            <strong>{number.format(result.kcal)} kcal</strong>
          </div>
          <div style={{ fontSize: 13.5 }}>
            Proteína {number.format(result.proteinG)} g · Carboidrato {number.format(result.carbG)} g · Gordura {number.format(result.fatG)} g
          </div>
          {result.carbWouldBeNegative ? (
            <div role="alert" style={{ fontSize: 12.5, color: 'var(--color-danger)' }}>
              Proteína e gordura já passam das calorias da meta — o carboidrato ficou em 0 g. Reduza os g por kg.
            </div>
          ) : null}
          <div>
            <Button size="small" onClick={() => onApply(result)}>
              Aplicar à meta
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.muted}>Preencha sexo, idade, peso e altura para calcular.</div>
      )}
    </section>
  );
}
