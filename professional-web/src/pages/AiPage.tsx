import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import styles from './ClientsListPage.module.css';

interface Tool {
  key: string;
  icon: IconName;
  title: string;
  description: string;
  /** Caminho dentro do paciente; null = a ferramenta não se aplica a este paciente agora. */
  path: (clientId: string, lastEvaluationId: string | undefined) => string | null;
  unavailable?: string;
}

const TOOLS: Tool[] = [
  {
    key: 'create-diet',
    icon: 'sparkles',
    title: 'Montar dieta com a IA',
    description: 'Você descreve o objetivo, as calorias e quantas refeições; a IA monta a dieta com os alimentos do catálogo.',
    path: (clientId) => `/clients/${clientId}/diet/assistant?modo=criar`,
  },
  {
    key: 'organize-diet',
    icon: 'apple',
    title: 'Organizar uma dieta pronta',
    description: 'Cole a dieta que você já escreveu (de um PDF ou do Word); a IA organiza em refeições, opções e quantidades sem mudar nada.',
    path: (clientId) => `/clients/${clientId}/diet/assistant`,
  },
  {
    key: 'organize-workout',
    icon: 'dumbbell',
    title: 'Organizar um treino',
    description: 'Cole o treino escrito; a IA separa os dias, exercícios, séries e repetições para você conferir.',
    path: (clientId) => `/clients/${clientId}/workout/assistant`,
  },
  {
    key: 'explain-evaluation',
    icon: 'trendingUp',
    title: 'Explicar a avaliação e a evolução',
    description: 'Na última avaliação física, a IA escreve um resumo em linguagem simples dos resultados e da evolução.',
    path: (clientId, lastEvaluationId) => (lastEvaluationId ? `/clients/${clientId}/evaluations/${lastEvaluationId}` : null),
    unavailable: 'Este paciente ainda não tem avaliação física.',
  },
];

/** Inteligência Artificial: escolhe o paciente e a ferramenta; tudo sai como rascunho para você revisar. */
export function AiPage() {
  const navigate = useNavigate();
  const [clientId, setClientId] = useState('');

  const clients = useQuery({ queryKey: ['clients', '', 'ai-menu'], queryFn: () => api.listClients({ status: 'all', pageSize: 100 }) });
  const summary = useQuery({ queryKey: ['evaluations-summary'], queryFn: api.listEvaluationSummary });
  const patients = (clients.data?.items ?? []).filter((client) => client.status !== 'archived');
  const lastEvaluationId = summary.data?.find((row) => row.clientId === clientId)?.lastEvaluationId;

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Inteligência Artificial</h1>
          <p className={styles.subtitle}>A IA prepara um rascunho; nada chega ao paciente sem você revisar e publicar.</p>
        </div>
      </div>

      <Card>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, maxWidth: 420 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>1. Escolha o paciente</span>
          <select className={styles.select} value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Paciente">
            <option value="">{clients.isLoading ? 'Carregando…' : 'Selecione o paciente…'}</option>
            {patients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.user.fullName}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600 }}>2. Escolha o que a IA vai fazer</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {TOOLS.map((tool) => {
          const target = clientId ? tool.path(clientId, lastEvaluationId) : null;
          const note = !clientId ? 'Escolha o paciente primeiro.' : target ? null : tool.unavailable ?? null;
          return (
            <button
              key={tool.key}
              type="button"
              disabled={!target}
              onClick={() => target && navigate(target)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 8,
                padding: 16,
                minWidth: 0,
                textAlign: 'left',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface)',
                font: 'inherit',
                color: 'inherit',
                cursor: target ? 'pointer' : 'not-allowed',
                opacity: target ? 1 : 0.6,
              }}
            >
              <span
                aria-hidden="true"
                style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}
              >
                <Icon name={tool.icon} size={18} />
              </span>
              <span style={{ fontWeight: 700 }}>{tool.title}</span>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>{tool.description}</span>
              {note ? <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>{note}</span> : null}
            </button>
          );
        })}
      </div>
    </>
  );
}
