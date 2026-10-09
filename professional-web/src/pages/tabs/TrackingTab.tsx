import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as api from '../../api/endpoints';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { formatDate, formatDateTime } from '../../lib/format';
import { shortCalendarDay, WATER_GOAL_SOURCE, waterSummary, weightSummary } from '../../lib/tracking';
import type { TrackingPhotos } from '../../types/api';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
const kg = (n: number | null | undefined) => (n == null ? '—' : `${String(n).replace('.', ',')} kg`);
const ml = (n: number | null | undefined) => (n == null ? '—' : n >= 1000 ? `${String(Math.round(n / 10) / 100).replace('.', ',')} L` : `${n} ml`);
const signed = (n: number) => (n > 0 ? `+${kg(n)}` : kg(n));

const muted = { fontSize: 12, color: 'var(--color-text-secondary)' } as const;
const big = { fontSize: 22, fontWeight: 700, color: 'var(--color-primary-dark)' } as const;

/**
 * Acompanhamento: o que o paciente registra no app (peso, água e fotos de
 * progresso). Só leitura. As fotos aparecem apenas quando o próprio paciente
 * autorizou o compartilhamento no app.
 */
export function TrackingTab() {
  const { clientId } = useParams<{ clientId: string }>();
  const weights = useQuery({ queryKey: ['tracking-weights', clientId], queryFn: () => api.getClientWeights(clientId!), enabled: !!clientId });
  const water = useQuery({ queryKey: ['tracking-water', clientId], queryFn: () => api.getClientWater(clientId!, 30), enabled: !!clientId });
  const photos = useQuery({ queryKey: ['tracking-photos', clientId], queryFn: () => api.getClientProgressPhotos(clientId!), enabled: !!clientId });

  const w = useMemo(() => (weights.data ? weightSummary(weights.data.items, weights.data.targetWeightKg) : null), [weights.data]);
  const chart = useMemo(
    () =>
      (weights.data?.items ?? []).map((item) => ({
        dateLabel: new Date(item.recordedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        value: item.weightKg,
      })),
    [weights.data],
  );
  const water30 = water.data ? waterSummary(water.data) : null;

  return (
    <>
      <h2 style={{ fontSize: 17, margin: 0 }}>Acompanhamento</h2>
      <p style={{ ...muted, margin: 0 }}>O que o paciente registra no app. Pesos de avaliações liberadas também entram na linha do tempo.</p>

      <Card title="Peso">
        {weights.isLoading ? (
          <EmptyState title="Carregando…" />
        ) : !w?.latest ? (
          <EmptyState title="Nenhum peso registrado" description="O paciente ainda não registrou peso no app e não há avaliação liberada com peso." />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div>
                <div style={muted}>Peso atual</div>
                <div style={big}>{kg(w.latest.weightKg)}</div>
                <div style={muted}>{formatDate(w.latest.recordedAt)}</div>
              </div>
              <div>
                <div style={muted}>Meta (ficha)</div>
                <div style={big}>{kg(weights.data?.targetWeightKg)}</div>
                <div style={muted}>{w.toTarget == null ? 'sem meta definida' : w.toTarget === 0 ? 'na meta' : `${signed(w.toTarget)} da meta`}</div>
              </div>
              <div>
                <div style={muted}>Variação no período</div>
                <div style={big}>{w.change == null ? '—' : signed(w.change)}</div>
                <div style={muted}>desde {formatDate(w.first?.recordedAt)}</div>
              </div>
            </div>
            {chart.length >= 2 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit=" kg" domain={['dataMin - 1', 'dataMax + 1']} />
                  <Tooltip formatter={(value) => [`${value} kg`, 'Peso']} />
                  <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={muted}>O gráfico aparece a partir do segundo registro.</div>
            )}
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}>Todos os registros ({weights.data?.items.length})</summary>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                {[...(weights.data?.items ?? [])].reverse().map((item) => (
                  <li key={`${item.source}-${item.recordedAt}`}>
                    {kg(item.weightKg)} — {formatDateTime(item.recordedAt)}
                    {item.source === 'evaluation' ? ' (avaliação)' : ' (app)'}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </Card>

      <Card title="Água — últimos 30 dias">
        {water.isLoading ? (
          <EmptyState title="Carregando…" />
        ) : !water.data || !water30 || water30.daysWithRecords === 0 ? (
          <EmptyState title="Nenhum registro de água nos últimos 30 dias" />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div>
                <div style={muted}>Meta atual</div>
                <div style={big}>{ml(water.data.goalMl)}</div>
                <div style={muted}>{WATER_GOAL_SOURCE[water.data.goalSource]}</div>
              </div>
              <div>
                <div style={muted}>Média nos dias registrados</div>
                <div style={big}>{ml(water30.averageMl)}</div>
                <div style={muted}>{water30.daysWithRecords} dia(s) com registro</div>
              </div>
              <div>
                <div style={muted}>Dias na meta</div>
                <div style={big}>
                  {water30.daysOnGoal} de {water30.daysWithRecords}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {water.data.days.map((d) => (
                <span
                  key={d.date}
                  title={`${shortCalendarDay(d.date)}: ${ml(d.totalMl)}`}
                  style={{
                    fontSize: 12,
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: '1px solid var(--color-border)',
                    background: d.totalMl >= water.data.goalMl ? 'var(--color-success-light)' : 'var(--color-surface)',
                    color: d.totalMl >= water.data.goalMl ? 'var(--color-success)' : 'var(--color-text-secondary)',
                  }}
                >
                  {shortCalendarDay(d.date)} · {ml(d.totalMl)}
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card title="Fotos de progresso">
        {photos.isLoading ? <EmptyState title="Carregando…" /> : <PhotosSection clientId={clientId!} data={photos.data} />}
      </Card>
    </>
  );
}

function PhotosSection({ clientId, data }: { clientId: string; data: TrackingPhotos | undefined }) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  // Links assinados de vida curta: buscados a cada abertura, nunca guardados.
  useEffect(() => {
    if (!data?.shared) return;
    let cancelled = false;
    Promise.all(
      data.items.map(async (photo) => {
        try {
          const { url } = await api.getClientProgressPhotoUrl(clientId, photo.id);
          return [photo.id, `${API_BASE}${url}`] as const;
        } catch {
          return [photo.id, null] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setUrls(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, data]);

  if (!data || !data.shared) {
    return (
      <EmptyState
        title="O paciente não compartilhou as fotos"
        description="As fotos de progresso que o paciente envia pelo app só aparecem aqui se ele ligar “Compartilhar com meu nutricionista” na tela Fotos."
      />
    );
  }
  if (data.items.length === 0) {
    return <EmptyState title="Nenhuma foto enviada ainda" description={`Compartilhamento autorizado em ${formatDate(data.sharedAt)}.`} />;
  }
  return (
    <>
      <div style={muted}>Compartilhamento autorizado pelo paciente em {formatDate(data.sharedAt)}.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
        {data.items.map((photo) => (
          <figure key={photo.id} style={{ margin: 0 }}>
            {urls[photo.id] ? (
              <a href={urls[photo.id] as string} target="_blank" rel="noreferrer">
                <img
                  src={urls[photo.id] as string}
                  alt={`Foto de progresso de ${formatDate(photo.takenAt)}`}
                  style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 8, background: 'var(--color-bg)' }}
                />
              </a>
            ) : (
              <div style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 8, background: 'var(--color-bg)' }} />
            )}
            <figcaption style={{ ...muted, textAlign: 'center', marginTop: 4 }}>{formatDate(photo.takenAt)}</figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
