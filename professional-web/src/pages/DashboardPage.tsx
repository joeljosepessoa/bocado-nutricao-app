import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as api from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { CreateClientModal } from '../components/CreateClientModal';
import { EmptyState } from '../components/EmptyState';
import { Icon, type IconName } from '../components/Icon';
import { StatusBadge } from '../components/StatusBadge';
import { PRIMARY_METRICS, toChartPoints } from '../evolution/metricCatalog';
import { firstName, formatDate, formatRelativeTime, initials } from '../lib/format';
import type { Appointment, ClientListItem, DashboardSummary } from '../types/api';
import styles from './DashboardPage.module.css';

type Tone = 'blue' | 'green' | 'violet' | 'orange' | 'pink' | 'amber';

// --- Indicadores -----------------------------------------------------------

function StatCard({
  icon,
  tone,
  value,
  label,
  hint,
  trend,
}: {
  icon: IconName;
  tone: Tone;
  value: number | null;
  label: string;
  hint?: string;
  /** Variação real em relação a um período anterior — só quando a API fornecer. */
  trend?: { label: string; positive: boolean };
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statTop}>
        <span className={[styles.statIcon, styles[tone]].join(' ')}>
          <Icon name={icon} size={20} />
        </span>
        {trend ? (
          <span className={[styles.trend, trend.positive ? styles.trendUp : styles.trendDown].join(' ')}>{trend.label}</span>
        ) : null}
      </div>
      <div className={styles.statValue}>{value ?? '—'}</div>
      <div className={styles.statLabel}>{label}</div>
      {hint ? <div className={styles.statHint}>{hint}</div> : null}
    </div>
  );
}

function isToday(iso: string, now: Date): boolean {
  const date = new Date(iso);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

// --- Evolução --------------------------------------------------------------

const RECENT_POINTS = 6;

function EvolutionCard({ clients, preferredClientId }: { clients: ClientListItem[]; preferredClientId?: string }) {
  const [chosenClientId, setChosenClientId] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState('weightKg');
  const [onlyRecent, setOnlyRecent] = useState(true);

  const fallbackId = clients.some((c) => c.id === preferredClientId) ? preferredClientId : clients[0]?.id;
  const clientId = chosenClientId ?? fallbackId ?? null;

  const { data: points, isLoading } = useQuery({
    queryKey: ['evolution', clientId],
    queryFn: () => api.getEvolutionSeries(clientId!),
    enabled: !!clientId,
  });

  const availableMetrics = useMemo(() => (points ? PRIMARY_METRICS.filter((m) => points.some((p) => m.accessor(p) != null)) : []), [points]);
  const metric = availableMetrics.find((m) => m.key === metricKey) ?? availableMetrics[0];
  const chartData = useMemo(() => {
    const all = points && metric ? toChartPoints(points, metric) : [];
    return onlyRecent ? all.slice(-RECENT_POINTS) : all;
  }, [points, metric, onlyRecent]);

  const period =
    chartData.length > 0
      ? chartData.length === 1
        ? chartData[0].dateLabel
        : `${chartData[0].dateLabel} – ${chartData[chartData.length - 1].dateLabel}`
      : null;

  return (
    <section className={[styles.panel, styles.chartPanel].join(' ')}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Evolução Geral dos Pacientes</h2>
          <p className={styles.panelSub}>
            {metric ? metric.label : 'Medições'}
            {period ? ` · ${period}` : ''}
          </p>
        </div>
        <div className={styles.chartControls}>
          {clients.length > 0 ? (
            <select
              className={styles.pill}
              aria-label="Paciente"
              value={clientId ?? ''}
              onChange={(e) => setChosenClientId(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.user.fullName}
                </option>
              ))}
            </select>
          ) : null}
          {availableMetrics.length > 1 ? (
            <select className={styles.pill} aria-label="Indicador" value={metric?.key} onChange={(e) => setMetricKey(e.target.value)}>
              {availableMetrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            className={[styles.pill, onlyRecent ? styles.pillActive : ''].join(' ')}
            onClick={() => setOnlyRecent((v) => !v)}
            aria-pressed={onlyRecent}
            title={onlyRecent ? `Mostrando as ${RECENT_POINTS} últimas medições — clique para ver todo o período` : 'Mostrando todo o período'}
          >
            Últimas medições
          </button>
        </div>
      </div>

      {clients.length === 0 ? (
        <EmptyState title="Nenhum paciente ativo" description="Cadastre um paciente para acompanhar a evolução." />
      ) : isLoading ? (
        <EmptyState title="Carregando evolução…" />
      ) : chartData.length === 0 ? (
        <EmptyState title="Sem medições para este paciente" description="A evolução aparece a partir da primeira avaliação física." />
      ) : (
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="evolutionFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                domain={['auto', 'auto']}
                unit={metric?.unit ? ` ${metric.unit}` : ''}
                width={64}
              />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
                formatter={(value) => [`${value}${metric?.unit ? ` ${metric.unit}` : ''}`, metric?.label ?? '']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#f97316"
                strokeWidth={2.5}
                fill="url(#evolutionFill)"
                dot={{ r: 3.5, fill: '#fff', stroke: '#f97316', strokeWidth: 2 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
          {chartData.length === 1 ? <p className={styles.chartNote}>Só uma medição até agora — a linha aparece a partir da segunda.</p> : null}
        </div>
      )}
    </section>
  );
}

// --- Atividades ------------------------------------------------------------

interface ActivityItem {
  key: string;
  icon: IconName;
  tone: Tone;
  text: string;
  occurredAt: string;
  clientId: string;
}

const ACTIVITY: Record<DashboardSummary['recentActivity'][number]['type'], { icon: IconName; tone: Tone; text: (name: string) => string }> = {
  evaluation_created: { icon: 'ruler', tone: 'violet', text: (name) => `Avaliação física registrada para ${name}` },
  diet_published: { icon: 'apple', tone: 'orange', text: (name) => `Dieta publicada para ${name}` },
  workout_published: { icon: 'dumbbell', tone: 'pink', text: (name) => `Treino publicado para ${name}` },
};

/** Junta as atividades do painel com os cadastros de pacientes recentes (dados reais), mais novas primeiro. */
function buildActivity(dashboard: DashboardSummary, recentClients: ClientListItem[]): ActivityItem[] {
  const items: ActivityItem[] = dashboard.recentActivity.map((a, index) => ({
    key: `${a.type}-${a.clientId}-${index}`,
    icon: ACTIVITY[a.type]?.icon ?? 'clipboard',
    tone: ACTIVITY[a.type]?.tone ?? 'blue',
    text: ACTIVITY[a.type]?.text(a.clientName) ?? a.clientName,
    occurredAt: a.occurredAt,
    clientId: a.clientId,
  }));
  for (const client of recentClients) {
    items.push({
      key: `client-${client.id}`,
      icon: 'userPlus',
      tone: 'blue',
      text: `${client.user.fullName} foi cadastrado(a)`,
      occurredAt: client.createdAt,
      clientId: client.id,
    });
  }
  return items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 6);
}

function ActivityCard({ items }: { items: ActivityItem[] }) {
  return (
    <section className={[styles.panel, styles.activityPanel].join(' ')}>
      <h2 className={styles.panelTitle}>Atividades Recentes</h2>
      {items.length === 0 ? (
        <EmptyState title="Nenhuma atividade ainda" />
      ) : (
        <ul className={styles.activityList}>
          {items.map((item) => (
            <li key={item.key}>
              <Link to={`/clients/${item.clientId}`} className={styles.activityItem}>
                <span className={[styles.activityIcon, styles[item.tone]].join(' ')}>
                  <Icon name={item.icon} size={16} />
                </span>
                <span className={styles.activityText}>
                  <span>{item.text}</span>
                  <span className={styles.activityTime}>{formatRelativeTime(item.occurredAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- Página ----------------------------------------------------------------

export function DashboardPage() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);

  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: api.getDashboard });
  const appointments = useQuery({ queryKey: ['appointments'], queryFn: api.listAppointments });
  const recentClients = useQuery({
    queryKey: ['clients', 'dashboard-recent'],
    queryFn: () => api.listClients({ status: 'all', pageSize: 6 }),
  });
  const activeClients = useQuery({
    queryKey: ['clients', 'dashboard-active'],
    queryFn: () => api.listClients({ status: 'active', pageSize: 100 }),
  });

  const activity = useMemo(
    () => (dashboard.data ? buildActivity(dashboard.data, recentClients.data?.items ?? []) : []),
    [dashboard.data, recentClients.data],
  );

  if (dashboard.isLoading || !dashboard.data) {
    return <EmptyState title={dashboard.isError ? 'Não foi possível carregar o painel' : 'Carregando…'} />;
  }

  const data = dashboard.data;
  const now = new Date();
  const appointmentsToday = appointments.data
    ? appointments.data.filter((a: Appointment) => a.status !== 'cancelled' && isToday(a.scheduledAt, now)).length
    : null;
  const preferredClientId = data.recentActivity.find((a) => a.type === 'evaluation_created')?.clientId;
  const greetingName = firstName(user?.fullName);

  return (
    <>
      <div className={styles.hero}>
        <div>
          <h1 className={styles.greeting}>
            Olá{greetingName ? `, ${greetingName}` : ''}! <span aria-hidden="true">👋</span>
          </h1>
          <p className={styles.welcome}>Bem-vindo ao seu painel administrativo</p>
        </div>
        <button type="button" className={styles.primaryAction} onClick={() => setShowCreate(true)}>
          <Icon name="userPlus" size={18} /> Novo Paciente
        </button>
      </div>

      <div className={styles.stats}>
        <StatCard
          icon="users"
          tone="blue"
          value={data.clients.total}
          label="Total de Pacientes"
          hint={data.clients.archived > 0 ? `${data.clients.archived} arquivado(s)` : undefined}
        />
        <StatCard icon="trendingUp" tone="green" value={data.clients.active} label="Pacientes Ativos" />
        <StatCard icon="calendar" tone="violet" value={appointmentsToday} label="Consultas de Hoje" />
        <StatCard icon="apple" tone="orange" value={data.diets.active} label="Dietas Ativas" />
        <StatCard icon="dumbbell" tone="pink" value={data.workouts.active} label="Treinos Ativos" />
        <StatCard
          icon="clipboardCheck"
          tone="amber"
          value={data.evaluations.pendingRelease}
          label="Avaliações Pendentes"
          hint={`${data.evaluations.last30Days} avaliação(ões) em 30 dias`}
        />
      </div>

      <div className={styles.middle}>
        <EvolutionCard clients={activeClients.data?.items ?? []} preferredClientId={preferredClientId} />
        <ActivityCard items={activity} />
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Últimos Pacientes</h2>
          <Link to="/clients" className={styles.seeAll}>
            Ver todos <Icon name="chevronRight" size={14} />
          </Link>
        </div>
        {recentClients.data && recentClients.data.items.length > 0 ? (
          <div className={styles.patients}>
            {recentClients.data.items.map((client) => (
              <Link key={client.id} to={`/clients/${client.id}`} className={styles.patientCard}>
                <span className={styles.patientAvatar}>{initials(client.user.fullName)}</span>
                <span className={styles.patientName} title={client.user.fullName}>
                  {client.user.fullName}
                </span>
                <span className={styles.patientMeta}>Desde {formatDate(client.createdAt)}</span>
                <StatusBadge status={client.status} />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title={recentClients.isLoading ? 'Carregando…' : 'Nenhum paciente cadastrado'} />
        )}
      </section>

      <button type="button" className={styles.fab} onClick={() => setShowCreate(true)} aria-label="Novo paciente" title="Novo paciente">
        <Icon name="plus" size={24} />
      </button>

      {showCreate ? <CreateClientModal onClose={() => setShowCreate(false)} /> : null}
    </>
  );
}
