import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as api from '../api/endpoints';
import styles from './Alerts.module.css';
import {
  alertsTotal,
  birthdayText,
  INACTIVE_DAYS_OPTIONS,
  inactiveText,
  neverRecordedText,
  PLAN_DAYS_OPTIONS,
  stalePlanText,
  unreadText,
} from './alertsText';

const SHOWN = 5;
const STORAGE_KEY = 'bocado.alerts.settings';

function loadSettings(): { inactiveDays: number; planDays: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { inactiveDays?: number; planDays?: number } | null;
    return {
      inactiveDays: INACTIVE_DAYS_OPTIONS.find((d) => d === saved?.inactiveDays) ?? 7,
      planDays: PLAN_DAYS_OPTIONS.find((d) => d === saved?.planDays) ?? 45,
    };
  } catch {
    return { inactiveDays: 7, planDays: 45 };
  }
}

interface Row {
  key: string;
  to: string;
  name: string;
  detail: string;
}

function Section({ title, tone, rows, empty }: { title: string; tone: 'red' | 'pink' | 'amber' | 'gray' | 'blue'; rows: Row[]; empty?: ReactNode }) {
  const [all, setAll] = useState(false);
  if (rows.length === 0 && !empty) return null;
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <section className={styles.section} aria-label={title}>
      <h3 className={styles.sectionTitle}>
        <span className={[styles.dot, styles[tone]].join(' ')} aria-hidden="true" />
        {title}
        <span className={styles.count}>{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((row) => (
            <li key={row.key}>
              <Link to={row.to} className={styles.item}>
                <span className={styles.name}>{row.name}</span>
                <span className={styles.detail}>{row.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length > SHOWN ? (
        <button type="button" className={styles.more} onClick={() => setAll((v) => !v)}>
          {all ? 'Mostrar menos' : `Ver todos (${rows.length})`}
        </button>
      ) : null}
    </section>
  );
}

/**
 * "Avisos para você" no Dashboard: só aponta quem olhar (nada é enviado ao paciente).
 * Os limites (dias sem registrar, idade do plano) ficam salvos neste navegador.
 */
export function AlertsCard() {
  const [settings, setSettings] = useState(loadSettings);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['professional-alerts', settings.inactiveDays, settings.planDays],
    queryFn: () => api.getProfessionalAlerts(settings),
  });
  const change = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* navegador sem armazenamento: vale só nesta visita */
    }
  };

  const total = data ? alertsTotal(data) : 0;
  return (
    <section className={styles.card} aria-labelledby="alerts-title">
      <div className={styles.header}>
        <div>
          <h2 id="alerts-title" className={styles.title}>
            Avisos para você {data && total > 0 ? <span className={styles.badge}>{total}</span> : null}
          </h2>
          <p className={styles.sub}>Quem precisa de atenção agora. Nada aqui é enviado ao paciente.</p>
        </div>
        <div className={styles.settings}>
          <label>
            Sem registrar há
            <select aria-label="Dias sem registrar" value={settings.inactiveDays} onChange={(e) => change({ inactiveDays: Number(e.target.value) })}>
              {INACTIVE_DAYS_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </select>
          </label>
          <label>
            Plano com mais de
            <select aria-label="Dias desde a publicação do plano" value={settings.planDays} onChange={(e) => change({ planDays: Number(e.target.value) })}>
              {PLAN_DAYS_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {isLoading ? (
        <p className={styles.empty}>Carregando avisos…</p>
      ) : isError || !data ? (
        <p className={styles.empty}>Não foi possível carregar os avisos.</p>
      ) : total === 0 ? (
        <p className={styles.allGood}>Tudo em dia: nenhum paciente precisando de atenção com esses limites.</p>
      ) : (
        <div className={styles.grid}>
          <Section
            title="Mensagens sem ler"
            tone="red"
            rows={data.unreadMessages.map((m) => ({ key: m.clientId, to: `/clients/${m.clientId}/messages`, name: m.name, detail: unreadText(m) }))}
          />
          <Section
            title="Aniversários na semana"
            tone="pink"
            rows={data.birthdays.map((b) => ({ key: b.clientId, to: `/clients/${b.clientId}/messages`, name: b.name, detail: birthdayText(b) }))}
          />
          <Section
            title={`Sem registrar nada há ${data.settings.inactiveDays}+ dias`}
            tone="amber"
            rows={data.inactive.map((c) => ({ key: c.clientId, to: `/clients/${c.clientId}/tracking`, name: c.name, detail: inactiveText(c) }))}
          />
          <Section
            title="Nunca registraram nada no app"
            tone="gray"
            rows={data.neverRecorded.map((c) => ({ key: c.clientId, to: `/clients/${c.clientId}`, name: c.name, detail: neverRecordedText(c) }))}
          />
          <Section
            title={`Dieta ou treino com ${data.settings.planDays}+ dias`}
            tone="blue"
            rows={data.stalePlans.map((p) => ({
              key: `${p.clientId}-${p.kind}`,
              to: `/clients/${p.clientId}/${p.kind === 'diet' ? 'diet' : 'workout'}`,
              name: p.name,
              detail: stalePlanText(p),
            }))}
          />
        </div>
      )}
    </section>
  );
}
