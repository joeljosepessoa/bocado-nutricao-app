import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import type { FoodDetails } from '../types/api';
import styles from './Foods.module.css';
import { fmt, marksUsed, measureOptions, measureText, nutrientText, ORIGIN_LABELS, parseDecimal } from './foodFormat';

function usageText(usage: FoodDetails['usage']): string {
  const parts: string[] = [];
  if (usage.patients > 0) parts.push(`na dieta de ${usage.patients} ${usage.patients === 1 ? 'paciente' : 'pacientes'}`);
  if (usage.templates > 0) parts.push(`em ${usage.templates} ${usage.templates === 1 ? 'modelo' : 'modelos'}`);
  return parts.length > 0 ? `Você usa este alimento ${parts.join(' e ')}.` : 'Você ainda não usou este alimento em dietas nem modelos.';
}

/**
 * Ficha do alimento: macros, calculadora por porção (g/ml ou medida caseira), todos os nutrientes da TACO
 * com os marcadores originais e onde é usado. TACO é só leitura (dá para duplicar como seu).
 */
export function FoodDetailsModal({
  foodId,
  onClose,
  onEdit,
  onDuplicate,
  onDeleted,
}: {
  foodId: string;
  onClose: () => void;
  onEdit: (food: FoodDetails) => void;
  onDuplicate: (food: FoodDetails) => void;
  onDeleted: () => void;
}) {
  const { data: food, isLoading, isError } = useQuery({ queryKey: ['food-details', foodId], queryFn: () => api.getFoodDetails(foodId) });
  const [quantity, setQuantity] = useState('100');
  const [measure, setMeasure] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () => api.deleteFood(foodId),
    onSuccess: onDeleted,
    onError: (err) => setError(apiErrorMessage(err, 'Não foi possível excluir.')),
  });

  if (isLoading || !food) {
    return (
      <Modal title="Alimento" onClose={onClose} wide>
        <span style={{ color: 'var(--color-text-secondary)' }}>{isError ? 'Não foi possível carregar o alimento.' : 'Carregando…'}</span>
      </Modal>
    );
  }

  const options = measureOptions(food);
  const chosen = options[Math.min(measure, options.length - 1)];
  const amount = parseDecimal(quantity);
  const grams = amount != null && amount > 0 ? amount * chosen.grams : null;
  const factor = grams != null ? grams / 100 : null;
  const portionLabel = grams != null ? (chosen.unit === food.baseUnit ? `${fmt(grams, 1)} ${food.baseUnit}` : `${fmt(amount!, 1)} ${chosen.label} (${fmt(grams, 1)} ${food.baseUnit})`) : null;
  const showPortion = factor != null && !(chosen.unit === food.baseUnit && grams === 100);
  const marks = marksUsed(food.sections).map((m) => (food.origin !== 'taco' && m.mark === '—' ? { ...m, meaning: 'não informado' } : m));

  const macro = (title: string, value: number | null, unit: string) => (
    <div className={styles.macro}>
      <span className={styles.macroValue}>
        {value == null ? '—' : fmt(factor != null ? value * factor : value, unit === 'kcal' ? 0 : 1)}
        {value == null ? null : <small> {unit}</small>}
      </span>
      <span className={styles.macroLabel}>{title}</span>
    </div>
  );

  const actions =
    confirming ? (
      <>
        <span style={{ marginRight: 'auto', fontSize: 13 }}>Excluir “{food.name}”? Não dá para desfazer.</span>
        <Button variant="ghost" onClick={() => setConfirming(false)}>
          Não
        </Button>
        <Button variant="danger" onClick={() => remove.mutate()} loading={remove.isPending}>
          Excluir
        </Button>
      </>
    ) : (
      <>
        {food.canEdit ? (
          <>
            <Button variant="ghost" onClick={() => setConfirming(true)} disabled={!food.canDelete} title={food.canDelete ? undefined : 'Já está em dieta ou modelo'}>
              Excluir
            </Button>
            <Button variant="secondary" onClick={() => onEdit(food)}>
              Editar
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => onDuplicate(food)}>
            Duplicar como meu alimento
          </Button>
        )}
        <Button onClick={onClose}>Fechar</Button>
      </>
    );

  return (
    <Modal title={food.name} onClose={onClose} wide actions={actions}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
        <div className={styles.metaLine}>
          <span className={[styles.origin, styles[`origin_${food.origin}`]].join(' ')}>
            {food.origin === 'taco' && food.tacoNumber != null ? `TACO nº ${food.tacoNumber}` : ORIGIN_LABELS[food.origin]}
          </span>
          {food.pending ? <span className={styles.pending}>Aguardando aprovação</span> : null}
          {food.foodGroup ? <span>{food.foodGroup}</span> : null}
          {food.sourceEdition ? <span style={{ color: 'var(--color-text-secondary)' }}>{food.sourceEdition}</span> : null}
        </div>

        <div className={styles.calculator}>
          <span>Porção</span>
          <input aria-label="Quantidade da porção" inputMode="decimal" className={styles.qty} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <select aria-label="Medida da porção" className={styles.measure} value={measure} onChange={(e) => setMeasure(Number(e.target.value))}>
            {options.map((o, i) => (
              <option key={o.unit} value={i}>
                {o.label}
              </option>
            ))}
          </select>
          {grams != null && chosen.unit !== food.baseUnit ? (
            <span style={{ color: 'var(--color-text-secondary)' }}>
              = {fmt(grams, 1)} {food.baseUnit}
            </span>
          ) : null}
        </div>

        <div className={styles.macros} aria-label={portionLabel ? `Na porção de ${portionLabel}` : 'Por 100'}>
          {macro('Calorias', food.kcalPer100, 'kcal')}
          {macro('Proteína', food.proteinGPer100, 'g')}
          {macro('Carboidrato', food.carbGPer100, 'g')}
          {macro('Gordura', food.fatGPer100, 'g')}
          {macro('Fibra', food.fiberGPer100, 'g')}
        </div>

        {food.unitConversions.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong>Medidas caseiras:</strong>
            {food.unitConversions.map((c) => (
              <span key={c.unit} className={styles.measureTag}>
                {measureText(c, food.baseUnit)}
              </span>
            ))}
          </div>
        ) : null}

        <div className={styles.sections}>
          {food.sections.map((section) => (
            <div key={section.title} className={styles.section}>
              <table className={styles.nutrients}>
                <caption>{section.title}</caption>
                <thead>
                  <tr>
                    <th scope="col">Nutriente</th>
                    <th scope="col">100 {food.baseUnit}</th>
                    {showPortion ? <th scope="col">Porção</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={`${row.key}-${row.unit}`}>
                      <th scope="row">{row.label}</th>
                      <td>{nutrientText(row)}</td>
                      {showPortion ? <td>{nutrientText(row, factor!)}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {marks.length > 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
            {marks.map((m) => (
              <span key={m.mark} style={{ marginRight: 12 }}>
                <strong>{m.mark}</strong> = {m.meaning}
              </span>
            ))}
          </div>
        ) : null}

        <div style={{ color: 'var(--color-text-secondary)' }}>
          {usageText(food.usage)}
          {food.canEdit && !food.canDelete ? ' Por isso não dá para excluir — mas dá para editar.' : ''}
          {food.origin === 'taco' ? ' Valores da TACO não são alterados; para ajustar, duplique como seu alimento.' : ''}
        </div>
        {error ? (
          <div role="alert" style={{ color: 'var(--color-danger)' }}>
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
