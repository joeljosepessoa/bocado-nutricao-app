import { useState } from 'react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { FoodPickerModal } from '../dietAssistant/FoodPickerModal';
import { UNIT_LABELS, UNITS } from '../dietAssistant/draft';
import type { CatalogFoodRef, DietDayKind, DietSupplement, MealFood } from '../types/api';
import styles from './DietStructure.module.css';
import { DAY_KIND_LABELS, foodItemErrors, foodName, supplementErrors, type FoodItemValues } from './structure';

const toNumber = (text: string): number | undefined => (text.trim() === '' ? undefined : Number(text.replace(',', '.')));

function Errors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div role="alert" style={{ fontSize: 12.5, color: 'var(--color-danger)' }}>
      {errors.map((e) => (
        <div key={e}>{e}</div>
      ))}
    </div>
  );
}

function useSubmit(onSubmit: () => Promise<boolean>, onClose: () => void) {
  const [saving, setSaving] = useState(false);
  return {
    saving,
    submit: async () => {
      setSaving(true);
      try {
        if (await onSubmit()) onClose();
      } finally {
        setSaving(false);
      }
    },
  };
}

/**
 * Adicionar/editar item: alimento do CATÁLOGO (com cálculo) ou NOME LIVRE
 * (sem cálculo), quantidade, faixa ("3 a 5 g") ou "à vontade".
 */
export function FoodItemModal({
  title,
  food,
  catalogOnly = false,
  onSubmit,
  onClose,
}: {
  title: string;
  /** Presente = edição (o alimento em si não muda; para trocar, remova e adicione outro). */
  food?: MealFood;
  catalogOnly?: boolean;
  onSubmit: (values: FoodItemValues) => Promise<boolean>;
  onClose: () => void;
}) {
  const editing = !!food;
  const [source, setSource] = useState<'catalog' | 'custom'>(food && !food.foodId ? 'custom' : 'catalog');
  const [catalogFood, setCatalogFood] = useState<CatalogFoodRef | null>(null);
  const [picking, setPicking] = useState(false);
  const [customName, setCustomName] = useState('');
  const [free, setFree] = useState(food?.isFreeQuantity ?? false);
  const [quantity, setQuantity] = useState(food?.quantity != null ? String(food.quantity) : editing ? '' : '100');
  const [quantityMax, setQuantityMax] = useState(food?.quantityMax != null ? String(food.quantityMax) : '');
  const [unit, setUnit] = useState(food?.unit ?? (editing ? '' : 'g'));
  const [notes, setNotes] = useState(food?.notes ?? '');
  const [errors, setErrors] = useState<string[]>([]);

  const values = (): FoodItemValues => ({
    foodId: editing ? (food.foodId ?? undefined) : source === 'catalog' ? catalogFood?.id : undefined,
    customFoodName: editing ? (food.customFoodName ?? undefined) : source === 'custom' ? customName.trim() : undefined,
    isFreeQuantity: free,
    quantity: free ? undefined : toNumber(quantity),
    quantityMax: free ? null : (toNumber(quantityMax) ?? null),
    unit: free ? undefined : unit || undefined,
    notes: notes.trim() || undefined,
  });

  const { saving, submit } = useSubmit(async () => {
    const v = values();
    const found = foodItemErrors(v);
    setErrors(found);
    return found.length === 0 ? onSubmit(v) : false;
  }, onClose);

  if (picking) {
    return <FoodPickerModal onClose={() => setPicking(false)} onSelect={(chosen) => setCatalogFood(chosen)} />;
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving}>
            {editing ? 'Salvar alimento' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {editing ? (
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {foodName(food)}
            {!food.foodId ? <span className={styles.muted}> · fora do catálogo (sem cálculo)</span> : null}
          </div>
        ) : (
          <>
            {!catalogOnly ? (
              <div role="radiogroup" aria-label="Origem do alimento" style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                <label>
                  <input type="radio" name="food-source" checked={source === 'catalog'} onChange={() => setSource('catalog')} /> Do catálogo
                </label>
                <label>
                  <input type="radio" name="food-source" checked={source === 'custom'} onChange={() => setSource('custom')} /> Nome livre (sem cálculo)
                </label>
              </div>
            ) : null}
            {source === 'catalog' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{catalogFood ? catalogFood.name : 'Nenhum alimento escolhido'}</span>
                <Button size="small" variant="secondary" onClick={() => setPicking(true)}>
                  {catalogFood ? 'Trocar' : 'Escolher no catálogo'}
                </Button>
              </div>
            ) : (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Nome do alimento</span>
                <input className={styles.input} value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Ex.: Salada de folhas" />
                <span className={styles.muted}>Fora do catálogo: aparece como &quot;Sem cálculo&quot; e não entra nas calorias.</span>
              </label>
            )}
          </>
        )}

        {!catalogOnly ? (
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> À vontade (sem quantidade, fora da soma)
          </label>
        ) : null}

        {!free ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Quantidade</span>
              <input className={styles.input} style={{ width: 100 }} inputMode="decimal" aria-label="Quantidade" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            {!catalogOnly ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Até (opcional)</span>
                <input
                  className={styles.input}
                  style={{ width: 100 }}
                  inputMode="decimal"
                  aria-label="Quantidade máxima"
                  value={quantityMax}
                  onChange={(e) => setQuantityMax(e.target.value)}
                />
              </label>
            ) : null}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Unidade</span>
              <select className={styles.input} aria-label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {!catalogOnly ? <option value="">—</option> : null}
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Observação do item (opcional)</span>
          <input className={styles.input} aria-label="Observação do item" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <Errors errors={errors} />
      </div>
    </Modal>
  );
}

export interface DayFormValues {
  label: string;
  kind: DietDayKind;
  usageNotes: string;
}

/** Criar/editar tipo de dia ("Dia de treino", "Dia de descanso"…). */
export function DayFormModal({
  title,
  initial,
  onSubmit,
  onClose,
}: {
  title: string;
  initial?: DayFormValues;
  onSubmit: (values: DayFormValues) => Promise<boolean>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [kind, setKind] = useState<DietDayKind>(initial?.kind ?? 'other');
  const [usageNotes, setUsageNotes] = useState(initial?.usageNotes ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const { saving, submit } = useSubmit(async () => {
    if (!label.trim()) {
      setErrors(['Dê um nome ao dia (ex.: Dia de treino).']);
      return false;
    }
    return onSubmit({ label: label.trim(), kind, usageNotes: usageNotes.trim() });
  }, onClose);

  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving}>
            Salvar dia
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!initial ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(
              [
                ['Dia de treino', 'training'],
                ['Dia de descanso', 'rest'],
              ] as const
            ).map(([preset, presetKind]) => (
              <Button
                key={preset}
                size="small"
                variant="secondary"
                onClick={() => {
                  setLabel(preset);
                  setKind(presetKind);
                }}
              >
                {preset}
              </Button>
            ))}
          </div>
        ) : null}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Nome do dia</span>
          <input className={styles.input} aria-label="Nome do dia" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Tipo</span>
          <select className={styles.input} aria-label="Tipo do dia" value={kind} onChange={(e) => setKind(e.target.value as DietDayKind)}>
            {(Object.keys(DAY_KIND_LABELS) as DietDayKind[]).map((k) => (
              <option key={k} value={k}>
                {DAY_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Quando usar (opcional)</span>
          <textarea
            className={styles.input}
            aria-label="Quando usar"
            rows={2}
            value={usageNotes}
            onChange={(e) => setUsageNotes(e.target.value)}
            placeholder="Ex.: nos dias com musculação"
          />
        </label>
        <Errors errors={errors} />
      </div>
    </Modal>
  );
}

/** Nome curto: bloco ("Carboidrato"), opção ("Opção 1"), alternativa. */
export function LabelModal({
  title,
  fieldLabel,
  initial = '',
  required = false,
  onSubmit,
  onClose,
}: {
  title: string;
  fieldLabel: string;
  initial?: string;
  required?: boolean;
  onSubmit: (label: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const { saving, submit } = useSubmit(async () => {
    if (required && !label.trim()) {
      setErrors([`Informe: ${fieldLabel.toLowerCase()}.`]);
      return false;
    }
    return onSubmit(label.trim());
  }, onClose);
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{fieldLabel}</span>
        <input className={styles.input} aria-label={fieldLabel} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      </label>
      <Errors errors={errors} />
    </Modal>
  );
}

export interface SupplementValues {
  name: string;
  quantity?: number;
  quantityMax?: number;
  unitText: string;
  timing: string;
  notes: string;
}

export function SupplementModal({
  supplement,
  onSubmit,
  onClose,
}: {
  supplement?: DietSupplement;
  onSubmit: (values: SupplementValues) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(supplement?.name ?? '');
  const [quantity, setQuantity] = useState(supplement?.quantity != null ? String(supplement.quantity) : '');
  const [quantityMax, setQuantityMax] = useState(supplement?.quantityMax != null ? String(supplement.quantityMax) : '');
  const [unitText, setUnitText] = useState(supplement?.unitText ?? '');
  const [timing, setTiming] = useState(supplement?.timing ?? '');
  const [notes, setNotes] = useState(supplement?.notes ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const { saving, submit } = useSubmit(async () => {
    const values: SupplementValues = { name: name.trim(), quantity: toNumber(quantity), quantityMax: toNumber(quantityMax), unitText, timing, notes };
    const found = supplementErrors(values);
    // A API não aceita "apagar" uma quantidade já gravada — evita salvar algo diferente do que a tela mostra.
    if (supplement?.quantity != null && values.quantity === undefined) found.push('Para tirar a quantidade, remova o suplemento e adicione de novo.');
    if (supplement?.quantityMax != null && values.quantityMax === undefined) found.push('Para tirar a quantidade máxima, remova o suplemento e adicione de novo.');
    setErrors(found);
    return found.length === 0 ? onSubmit(values) : false;
  }, onClose);

  const field = (label: string, value: string, set: (v: string) => void, props: { width?: number; placeholder?: string } = {}) => (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input className={styles.input} aria-label={label} style={props.width ? { width: props.width } : undefined} value={value} placeholder={props.placeholder} onChange={(e) => set(e.target.value)} />
    </label>
  );

  return (
    <Modal
      title={supplement ? 'Editar suplemento' : 'Adicionar suplemento'}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving}>
            Salvar suplemento
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {field('Nome do suplemento', name, setName, { placeholder: 'Ex.: Creatina' })}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {field('Quantidade', quantity, setQuantity, { width: 100 })}
          {field('Até (opcional)', quantityMax, setQuantityMax, { width: 100 })}
          {field('Unidade', unitText, setUnitText, { width: 140, placeholder: 'g, cápsula, scoop…' })}
        </div>
        {field('Quando tomar', timing, setTiming, { placeholder: 'Ex.: antes do café da manhã' })}
        {field('Observações do suplemento', notes, setNotes)}
        <Errors errors={errors} />
      </div>
    </Modal>
  );
}
