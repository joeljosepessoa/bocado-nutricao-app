import type { FormAnswer, FormQuestion } from '../types/api';

const input = {
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '8px 10px',
  font: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
} as const;

const chip = (active: boolean) =>
  ({
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-primary)' : 'var(--color-surface)',
    color: active ? '#fff' : 'var(--color-text)',
    borderRadius: 999,
    padding: '6px 12px',
    font: 'inherit',
    fontSize: 13,
    cursor: 'pointer',
    minWidth: 36,
  }) as const;

/** Novo valor, ou uma função do valor atual (escolha múltipla: cliques seguidos não se perdem). */
export type AnswerUpdate = FormAnswer | ((current: FormAnswer | undefined) => FormAnswer);

/** Campo de resposta conforme o tipo da pergunta. Número fica como texto até salvar (o servidor aceita vírgula). */
export function AnswerInput({ q, value, onChange }: { q: FormQuestion; value: FormAnswer | undefined; onChange: (v: AnswerUpdate) => void }) {
  const name = q.label;
  switch (q.type) {
    case 'short_text':
      return <input aria-label={name} style={input} maxLength={300} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'long_text':
      return <textarea aria-label={name} style={{ ...input, minHeight: 80, resize: 'vertical' }} maxLength={5000} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 260 }}>
          <input aria-label={name} style={input} inputMode="decimal" value={value == null ? '' : typeof value === 'number' ? String(value).replace('.', ',') : String(value)} onChange={(e) => onChange(e.target.value)} />
          {q.unit ? <span style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{q.unit}</span> : null}
        </div>
      );
    case 'scale':
      return (
        <div role="radiogroup" aria-label={name} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} style={chip(value === n)} onClick={() => onChange(value === n ? null : n)}>
              {n}
            </button>
          ))}
        </div>
      );
    case 'yes_no':
      return (
        <div role="radiogroup" aria-label={name} style={{ display: 'flex', gap: 6 }}>
          {[
            [true, 'Sim'],
            [false, 'Não'],
          ].map(([v, text]) => (
            <button key={String(v)} type="button" role="radio" aria-checked={value === v} style={chip(value === v)} onClick={() => onChange(value === v ? null : (v as boolean))}>
              {text as string}
            </button>
          ))}
        </div>
      );
    case 'single_choice':
      return (
        <div role="radiogroup" aria-label={name} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(q.options ?? []).map((o) => (
            <button key={o} type="button" role="radio" aria-checked={value === o} style={chip(value === o)} onClick={() => onChange(value === o ? null : o)}>
              {o}
            </button>
          ))}
        </div>
      );
    case 'multiple_choice': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div role="group" aria-label={name} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(q.options ?? []).map((o) => {
            const on = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                style={chip(on)}
                onClick={() =>
                  onChange((current) => {
                    const now = Array.isArray(current) ? current : [];
                    return now.includes(o) ? now.filter((x) => x !== o) : (q.options ?? []).filter((x) => x === o || now.includes(x));
                  })
                }
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    default:
      return null;
  }
}
