import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { formatDate } from '../lib/format';
import type { WorkoutHistorySession } from '../types/api';
import { daysAgoText, exerciseProgress, num, progressText, sessionsInLast, setText, setsCount, type ExerciseProgress } from './historyModel';

const PAGE = 10;
const muted = { color: 'var(--color-text-secondary)' } as const;
const row = { borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 } as const;
const segment = (active: boolean) =>
  ({
    border: '1px solid var(--color-border)',
    background: active ? 'var(--color-primary)' : 'var(--color-surface)',
    color: active ? '#fff' : 'var(--color-text)',
    borderRadius: 999,
    padding: '5px 12px',
    font: 'inherit',
    fontSize: 13,
    cursor: 'pointer',
  }) as const;

function SessionRow({ session }: { session: WorkoutHistorySession }) {
  const [open, setOpen] = useState(false);
  const sets = setsCount(session);
  return (
    <div style={row}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}
      >
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(session.performedAt)}</strong>
        <span>{session.dayName}</span>
        <span style={muted}>
          {session.exercises.length} {session.exercises.length === 1 ? 'exercício' : 'exercícios'} · {sets} {sets === 1 ? 'série' : 'séries'}
          {session.loggedBy === 'professional' ? ' · registrado por você' : ''}
        </span>
        <span style={{ ...muted, marginLeft: 'auto' }}>{open ? 'Fechar ▴' : 'Ver séries ▾'}</span>
      </button>
      {open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4 }}>
          {session.exercises.map((exercise) => (
            <div key={exercise.exerciseId} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ minWidth: 200, fontWeight: 600 }}>{exercise.name}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{exercise.sets.map(setText).join('  ·  ')}</span>
            </div>
          ))}
          {session.notes ? <div style={muted}>Obs.: {session.notes}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function ProgressRow({ progress }: { progress: ExerciseProgress }) {
  const [open, setOpen] = useState(false);
  const delta = progress.last - progress.first;
  const color = progress.points.length < 2 || delta === 0 ? 'var(--color-text-secondary)' : delta > 0 ? 'var(--color-success, #1e7a46)' : 'var(--color-danger)';
  const data = progress.points.map((p) => ({ date: formatDate(p.performedAt).slice(0, 5), load: p.load, reps: p.reps }));
  return (
    <div style={row}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={progress.points.length < 2}
        style={{ all: 'unset', cursor: progress.points.length < 2 ? 'default' : 'pointer', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}
      >
        <strong>{progress.name}</strong>
        <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{progressText(progress)}</span>
        <span style={muted}>
          {progress.points.length} {progress.points.length === 1 ? 'sessão' : 'sessões'}
        </span>
        {progress.points.length >= 2 ? <span style={{ ...muted, marginLeft: 'auto' }}>{open ? 'Fechar ▴' : 'Gráfico ▾'}</span> : null}
      </button>
      {open ? (
        <div style={{ width: '100%', height: 200 }} aria-label={`Carga de ${progress.name} por sessão`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
              <Tooltip
                formatter={(value: number, _name, item) => [`${num(value)}${progress.unit ? ` ${progress.unit}` : ''}${item.payload.reps != null ? ` × ${item.payload.reps}` : ''}`, 'Maior carga']}
              />
              <Line type="monotone" dataKey="load" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

/**
 * "Histórico de treino" na aba Treino do paciente: frequência, cada sessão com as séries feitas e a evolução
 * da carga por exercício (de todas as fichas e versões).
 */
export function WorkoutHistoryCard({ clientId }: { clientId: string }) {
  const [view, setView] = useState<'sessions' | 'progress'>('sessions');
  const [shown, setShown] = useState(PAGE);
  const { data, isLoading, isError } = useQuery({ queryKey: ['workout-history', clientId], queryFn: () => api.getWorkoutHistory(clientId) });
  const sessions = useMemo(() => data?.sessions ?? [], [data]);
  const progress = useMemo(() => exerciseProgress(sessions), [sessions]);

  if (isLoading) return <Card title="Histórico de treino">Carregando…</Card>;
  if (isError) return <Card title="Histórico de treino">Não foi possível carregar o histórico.</Card>;
  if (sessions.length === 0)
    return (
      <Card title="Histórico de treino">
        <EmptyState title="Nenhum treino registrado ainda" description="Quando o paciente marcar as séries no app, as cargas aparecem aqui." />
      </Card>
    );

  const last = sessions[0];
  const recent = sessionsInLast(sessions, 28);
  return (
    <Card title="Histórico de treino">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
        <div>
          <strong>
            {recent} {recent === 1 ? 'treino' : 'treinos'} nas últimas 4 semanas
          </strong>
          <span style={muted}>
            {' '}
            · último {daysAgoText(last.performedAt)} ({formatDate(last.performedAt)}, {last.dayName})
          </span>
        </div>
        <div role="tablist" aria-label="Histórico" style={{ display: 'flex', gap: 6 }}>
          <button type="button" role="tab" aria-selected={view === 'sessions'} style={segment(view === 'sessions')} onClick={() => setView('sessions')}>
            Sessões ({data?.total ?? sessions.length})
          </button>
          <button type="button" role="tab" aria-selected={view === 'progress'} style={segment(view === 'progress')} onClick={() => setView('progress')}>
            Evolução por exercício
          </button>
        </div>

        {view === 'sessions' ? (
          <>
            {sessions.slice(0, shown).map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
            {shown < sessions.length ? (
              <div>
                <Button size="small" variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
                  Ver mais
                </Button>
              </div>
            ) : null}
          </>
        ) : progress.length === 0 ? (
          <EmptyState title="Sem cargas registradas" description="A evolução aparece quando o paciente registra a carga das séries." />
        ) : (
          <>
            <span style={muted}>Maior carga de cada sessão, da primeira para a última registrada.</span>
            {progress.map((p) => (
              <ProgressRow key={p.exerciseId} progress={p} />
            ))}
          </>
        )}
      </div>
    </Card>
  );
}
