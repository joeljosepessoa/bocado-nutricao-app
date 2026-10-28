import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { UNIT_LABELS } from '../dietAssistant/draft';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import type { Food, FoodDetails, FoodInput, NutritionUnit } from '../types/api';
import { EMPTY_FOOD_FORM, fmt, foodFormResult, formFromDetails, kcalFromMacros, parseDecimal, type FoodFormValues } from './foodFormat';

/** Grupos da TACO, para o alimento próprio aparecer junto no filtro. */
export const TACO_GROUPS = [
  'Alimentos preparados',
  'Bebidas (alcoólicas e não alcoólicas)',
  'Carnes e derivados',
  'Cereais e derivados',
  'Frutas e derivados',
  'Gorduras e óleos',
  'Leguminosas e derivados',
  'Leite e derivados',
  'Miscelâneas',
  'Nozes e sementes',
  'Outros alimentos industrializados',
  'Ovos e derivados',
  'Pescados e frutos do mar',
  'Produtos açucarados',
  'Verduras, hortaliças e derivados',
];

const MEASURE_UNITS: NutritionUnit[] = ['unit', 'tablespoon', 'teaspoon', 'cup', 'slice'];

const input = { border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', width: '100%', boxSizing: 'border-box', background: 'var(--color-surface)', color: 'var(--color-text)' } as const;
const label = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 } as const;

/** Só o que mudou — mexer em caloria/macro de alimento já publicado é recusado pelo servidor. */
function changedFields(next: FoodInput, before: FoodDetails): Partial<FoodInput> {
  const patch: Partial<FoodInput> = {};
  if (next.name !== before.name) patch.name = next.name;
  if (next.baseUnit !== before.baseUnit) patch.baseUnit = next.baseUnit;
  if ((next.foodGroup ?? '') !== (before.foodGroup ?? '')) patch.foodGroup = next.foodGroup;
  const close = (a: number | undefined, b: number | null) => (a === undefined ? true : b != null && Math.abs(a - b) < 0.005);
  if (!close(next.kcalPer100, before.kcalPer100)) patch.kcalPer100 = next.kcalPer100;
  if (!close(next.proteinGPer100, before.proteinGPer100)) patch.proteinGPer100 = next.proteinGPer100;
  if (!close(next.carbGPer100, before.carbGPer100)) patch.carbGPer100 = next.carbGPer100;
  if (!close(next.fatGPer100, before.fatGPer100)) patch.fatGPer100 = next.fatGPer100;
  if (!close(next.fiberGPer100, before.fiberGPer100)) patch.fiberGPer100 = next.fiberGPer100;
  if (!close(next.sodiumMgPer100, before.sodiumMgPer100)) patch.sodiumMgPer100 = next.sodiumMgPer100;
  const key = (list: FoodInput['unitConversions']) => JSON.stringify([...list].sort((a, b) => a.unit.localeCompare(b.unit)));
  if (key(next.unitConversions) !== key(before.unitConversions)) patch.unitConversions = next.unitConversions;
  return patch;
}

/**
 * Cadastrar alimento próprio (só você vê), editar um seu ou duplicar um da TACO como seu.
 * `editing` presente = edição; `from` = duplicar.
 */
export function FoodFormModal({
  editing,
  from,
  initialName = '',
  onClose,
  onSaved,
}: {
  editing?: FoodDetails;
  from?: FoodDetails;
  initialName?: string;
  onClose: () => void;
  onSaved: (food: Food) => void;
}) {
  const [values, setValues] = useState<FoodFormValues>(() =>
    editing ? formFromDetails(editing, false) : from ? formFromDetails(from, true) : { ...EMPTY_FOOD_FORM, name: initialName },
  );
  const [errors, setErrors] = useState<string[]>([]);
  const set = (patch: Partial<FoodFormValues>) => setValues((v) => ({ ...v, ...patch }));
  const per = `por 100 ${values.baseUnit}`;

  const save = useMutation({
    mutationFn: (food: FoodInput) => (editing ? api.updateFood(editing.id, changedFields(food, editing)) : api.createFood(food)),
    onSuccess: onSaved,
    onError: (err) => setErrors([apiErrorMessage(err, 'Não foi possível salvar o alimento.')]),
  });

  const submit = () => {
    const { errors: found, input: food } = foodFormResult(values);
    setErrors(found);
    if (food) save.mutate(food);
  };

  const p = parseDecimal(values.protein);
  const c = parseDecimal(values.carb);
  const f = parseDecimal(values.fat);
  const k = parseDecimal(values.kcal);
  const estimated = p != null && c != null && f != null ? kcalFromMacros(p, c, f) : null;
  const kcalOff = estimated != null && k != null && estimated > 0 && Math.abs(k - estimated) / estimated > 0.2;

  const number = (key: 'kcal' | 'protein' | 'carb' | 'fat' | 'fiber' | 'sodium', text: string, unit: string, required = true) => (
    <label style={label}>
      <span>
        {text} {required ? '' : <span style={{ color: 'var(--color-text-secondary)' }}>(opcional)</span>}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input aria-label={text} inputMode="decimal" style={input} value={values[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<FoodFormValues>)} />
        <span style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{unit}</span>
      </div>
    </label>
  );

  return (
    <Modal
      title={editing ? 'Editar alimento' : from ? 'Duplicar como meu alimento' : 'Cadastrar alimento'}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {editing ? 'Salvar' : 'Cadastrar'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
        {from ? (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--color-primary-light)' }}>
            Cópia de <strong>{from.name}</strong>. O original da TACO continua igual; ajuste a sua cópia como quiser.
          </div>
        ) : null}
        <label style={label}>
          <strong>Nome</strong>
          <input aria-label="Nome do alimento" style={input} maxLength={200} value={values.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Pão de queijo da padaria" autoFocus />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <label style={label}>
            <strong>Grupo</strong>
            <select aria-label="Grupo" style={input} value={values.foodGroup} onChange={(e) => set({ foodGroup: e.target.value })}>
              <option value="">Sem grupo</option>
              {[...new Set([...TACO_GROUPS, ...(values.foodGroup ? [values.foodGroup] : [])])].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <div style={label}>
            <strong>Valores por</strong>
            <div role="radiogroup" aria-label="Base dos valores" style={{ display: 'flex', gap: 14, padding: '8px 0' }}>
              <label>
                <input type="radio" name="food-base" checked={values.baseUnit === 'g'} onChange={() => set({ baseUnit: 'g' })} /> 100 g
              </label>
              <label>
                <input type="radio" name="food-base" checked={values.baseUnit === 'ml'} onChange={() => set({ baseUnit: 'ml' })} /> 100 ml
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong>Informação nutricional {per}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {number('kcal', 'Calorias', 'kcal')}
            {number('protein', 'Proteína', 'g')}
            {number('carb', 'Carboidrato', 'g')}
            {number('fat', 'Gordura', 'g')}
            {number('fiber', 'Fibra', 'g', false)}
            {number('sodium', 'Sódio', 'mg', false)}
          </div>
          {kcalOff ? (
            <span role="status" style={{ color: 'var(--color-primary-dark)' }}>
              Confira: pelos macros daria cerca de {fmt(estimated!, 0)} kcal {per}.
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong>Medidas caseiras</strong>
          <span style={{ color: 'var(--color-text-secondary)' }}>Com elas, a dieta calcula "1 unidade", "2 colheres de sopa" etc.</span>
          {values.measures.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>1</span>
              <select
                aria-label={`Medida ${i + 1}`}
                style={{ ...input, width: 'auto', flex: '1 1 160px' }}
                value={m.unit}
                onChange={(e) => set({ measures: values.measures.map((x, j) => (j === i ? { ...x, unit: e.target.value as NutritionUnit } : x)) })}
              >
                <option value="">Escolha…</option>
                {MEASURE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
              <span>=</span>
              <input
                aria-label={`Gramas da medida ${i + 1}`}
                inputMode="decimal"
                style={{ ...input, width: 90 }}
                value={m.grams}
                onChange={(e) => set({ measures: values.measures.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)) })}
              />
              <span>{values.baseUnit}</span>
              <Button size="small" variant="ghost" aria-label={`Remover medida ${i + 1}`} onClick={() => set({ measures: values.measures.filter((_, j) => j !== i) })}>
                Remover
              </Button>
            </div>
          ))}
          {values.measures.length < MEASURE_UNITS.length ? (
            <div>
              <Button size="small" variant="secondary" onClick={() => set({ measures: [...values.measures, { unit: '', grams: '' }] })}>
                + Medida caseira
              </Button>
            </div>
          ) : null}
        </div>

        {!editing ? <span style={{ color: 'var(--color-text-secondary)' }}>Só você vê os alimentos que cadastra.</span> : null}
        {errors.length > 0 ? (
          <div role="alert" style={{ color: 'var(--color-danger)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {errors.map((e) => (
              <span key={e}>{e}</span>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
