import type { DietDayNode } from '../types/api';
import styles from './DietStructure.module.css';
import { dayFirstChoiceTotals, mealFirstChoiceTotals } from './structure';

/**
 * Proteína, carboidrato e gordura de cada refeição do dia (com a 1ª escolha de
 * cada bloco — a mesma base do alerta de opções e da comparação com a meta).
 * Cores: as três primeiras da paleta categórica validada; como a 3ª tem pouco
 * contraste com o fundo branco, a tabela logo abaixo traz os números.
 */
const SERIES = [
  { key: 'proteinG', label: 'Proteína', color: '#2a78d6' },
  { key: 'carbG', label: 'Carboidrato', color: '#eb6834' },
  { key: 'fatG', label: 'Gordura', color: '#1baf7a' },
] as const;

const grams = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Topo "redondo" do eixo, em degraus legíveis (10, 20, 25, 50…). */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** Barra com o topo arredondado (4px) e a base reta, apoiada no eixo. */
function barPath(x: number, y: number, width: number, base: number): string {
  const r = Math.min(4, width / 2, base - y);
  return `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${base} Z`;
}

export function MealMacroChart({ day }: { day: Pick<DietDayNode, 'meals'> }) {
  const meals = day.meals.map((meal) => ({ name: meal.name, totals: mealFirstChoiceTotals(meal) }));
  if (meals.length === 0 || meals.every((m) => m.totals.kcal === 0)) return null;
  const dayTotals = dayFirstChoiceTotals(day);

  const width = 720;
  const height = 240;
  const left = 40;
  const right = 8;
  const top = 12;
  const bottom = 34;
  const plotHeight = height - top - bottom;
  const slot = (width - left - right) / meals.length;
  const barWidth = Math.min(22, (slot * 0.7 - 4) / 3);
  const ticks = niceTicks(Math.max(...meals.flatMap((m) => SERIES.map((s) => m.totals[s.key]))));
  const max = ticks[ticks.length - 1] || 1;
  const yFor = (v: number) => top + plotHeight - (v / max) * plotHeight;
  const base = yFor(0);
  const shortName = (name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name);

  return (
    <figure className={styles.macroChart} aria-label="Proteína, carboidrato e gordura por refeição">
      <figcaption className={styles.macroChartHeader}>
        <span className={styles.groupTitle}>Macronutrientes por refeição</span>
        <span className={styles.muted}>com a 1ª opção de cada bloco, em gramas</span>
        <span className={styles.macroLegend}>
          {SERIES.map((s) => (
            <span key={s.key} className={styles.macroLegendItem}>
              <span className={styles.macroSwatch} style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>

      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de barras de proteína, carboidrato e gordura por refeição" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - right} y1={yFor(t)} y2={yFor(t)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={left - 6} y={yFor(t) + 3} textAnchor="end" fontSize={10} fill="var(--color-text-secondary)">
              {grams.format(t)}
            </text>
          </g>
        ))}
        {meals.map((meal, i) => {
          const center = left + slot * i + slot / 2;
          const groupWidth = barWidth * 3 + 4;
          return (
            <g key={`${meal.name}-${i}`}>
              {SERIES.map((s, k) => {
                const value = meal.totals[s.key];
                if (value <= 0) return null;
                const x = center - groupWidth / 2 + k * (barWidth + 2);
                return (
                  <path key={s.key} d={barPath(x, yFor(value), barWidth, base)} fill={s.color}>
                    <title>{`${meal.name} · ${s.label}: ${grams.format(value)} g`}</title>
                  </path>
                );
              })}
              <text x={center} y={height - bottom + 16} textAnchor="middle" fontSize={11} fill="var(--color-text-secondary)">
                <title>{meal.name}</title>
                {shortName(meal.name)}
              </text>
            </g>
          );
        })}
      </svg>

      <table className={styles.macroTable}>
        <thead>
          <tr>
            <th>Refeição</th>
            {SERIES.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
            <th>kcal</th>
          </tr>
        </thead>
        <tbody>
          {meals.map((meal, i) => (
            <tr key={`${meal.name}-${i}`}>
              <td>
                {meal.name}
                {meal.totals.partial ? <span className={styles.muted}> (parcial)</span> : null}
              </td>
              {SERIES.map((s) => (
                <td key={s.key}>{grams.format(meal.totals[s.key])} g</td>
              ))}
              <td>{grams.format(meal.totals.kcal)}</td>
            </tr>
          ))}
          <tr className={styles.macroTotalRow}>
            <td>Total do dia{dayTotals.partial ? ' (parcial)' : ''}</td>
            {SERIES.map((s) => (
              <td key={s.key}>{grams.format(dayTotals[s.key])} g</td>
            ))}
            <td>{grams.format(dayTotals.kcal)}</td>
          </tr>
        </tbody>
      </table>
    </figure>
  );
}
