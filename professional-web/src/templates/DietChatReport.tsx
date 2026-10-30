import type { DietChatMacros, DietChatTargets } from '../types/api';
import type { DietReportData } from './chatMemory';

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');

/** "+5%" / "−3%" / "0%" em relação à meta (null = sem meta daquele item). */
function diffText(value: number, target: number | null): string | null {
  if (!target) return null;
  const pct = Math.round(((value - target) / target) * 100);
  return pct === 0 ? '0%' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
}

function targetsText(t: DietChatTargets): string | null {
  const parts = [t.kcal ? `${fmt(t.kcal)} kcal` : null, t.proteinG ? `P ${fmt(t.proteinG)} g` : null, t.carbG ? `C ${fmt(t.carbG)} g` : null, t.fatG ? `G ${fmt(t.fatG)} g` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

const cell = { padding: '3px 6px', textAlign: 'right', whiteSpace: 'nowrap' } as const;
const first = { padding: '3px 6px', textAlign: 'left' } as const;

function Row({ name, values, strong, note }: { name: string; values: DietChatMacros | (string | null)[]; strong?: boolean; note?: string }) {
  const list = Array.isArray(values) ? values : [fmt(values.kcal), `${fmt(values.proteinG)} g`, `${fmt(values.carbG)} g`, `${fmt(values.fatG)} g`];
  return (
    <tr style={{ fontWeight: strong ? 700 : 400, borderTop: '1px solid var(--color-border)' }}>
      <td style={first}>
        {name}
        {note ? <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{note}</div> : null}
      </td>
      {list.map((v, i) => (
        <td key={i} style={cell}>
          {v ?? '—'}
        </td>
      ))}
    </tr>
  );
}

/** Metas da IA + tabela por refeição calculada pelo sistema + total × meta, dentro da bolha do chat. */
export function DietChatReport({ report }: { report: DietReportData }) {
  const { targets, days, revised } = report;
  const goal = targets ? targetsText(targets) : null;
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, whiteSpace: 'normal' }}>
      {goal ? (
        <div style={{ fontSize: 12.5 }}>
          <strong>Metas:</strong> {goal}
          {targets?.calculation ? <div style={{ marginTop: 2, fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{targets.calculation}</div> : null}
        </div>
      ) : null}
      {days.map((day, d) => (
        <div key={d} style={{ overflowX: 'auto' }}>
          {days.length > 1 ? <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>{day.label ?? `Dia ${d + 1}`}</div> : null}
          <table aria-label={`Conferência da dieta${day.label ? ` — ${day.label}` : ''}`} style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ color: 'var(--color-text-secondary)' }}>
                <th style={first}>Refeição</th>
                <th style={cell}>kcal</th>
                <th style={cell}>Prot</th>
                <th style={cell}>Carbo</th>
                <th style={cell}>Gord</th>
              </tr>
            </thead>
            <tbody>
              {day.meals.map((meal, m) => (
                <Row
                  key={m}
                  name={meal.name}
                  values={meal}
                  note={
                    meal.options.length > 1
                      ? meal.options
                          .map((o) => `${o.label}: ${fmt(o.kcal)} kcal${o.diffPercent ? ` (${o.diffPercent > 0 ? '+' : '−'}${Math.abs(o.diffPercent)}%)` : ''} — ${o.foods.join(' + ')}`)
                          .join('\n')
                      : undefined
                  }
                />
              ))}
              <Row name="Total (1ª opção)" values={day.total} strong />
              {targets?.kcal && days.length === 1 ? (
                <>
                  <Row
                    name="Meta"
                    values={[fmt(targets.kcal), targets.proteinG ? `${fmt(targets.proteinG)} g` : null, targets.carbG ? `${fmt(targets.carbG)} g` : null, targets.fatG ? `${fmt(targets.fatG)} g` : null]}
                  />
                  <Row
                    name="Diferença"
                    values={[
                      diffText(day.total.kcal, targets.kcal),
                      diffText(day.total.proteinG, targets.proteinG),
                      diffText(day.total.carbG, targets.carbG),
                      diffText(day.total.fatG, targets.fatG),
                    ]}
                  />
                </>
              ) : null}
            </tbody>
          </table>
          {day.partial ? <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Alguns itens ficaram sem cálculo (fora de g/ml ou à vontade).</div> : null}
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
        ✓ Somado pelo sistema com os valores do catálogo{revised ? ' — as quantidades foram corrigidas numa 2ª conferência' : ''}.
      </div>
    </div>
  );
}
