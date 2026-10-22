import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { AnamnesisSummaryCard } from '../anamnesis/AnamnesisSummaryCard';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ageAt } from '../dietEditor/nutritionTarget';
import type { ClientDetail } from '../types/api';

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/**
 * "Ficha do paciente" ao lado da tela: o resumo da anamnese (patologias,
 * alergias, restrições…) e a última avaliação, para consultar enquanto monta
 * a dieta ou o treino sem trocar de aba. Só busca os dados quando é aberta.
 */
export function PatientSheetButton({ client }: { client: ClientDetail }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <Button variant="secondary" size="small" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="ficha-do-paciente">
        Ficha do paciente
      </Button>
      {open ? <PatientSheet client={client} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PatientSheet({ client, onClose }: { client: ClientDetail; onClose: () => void }) {
  const latest = useQuery({
    queryKey: ['latest-evaluation', client.id],
    queryFn: async () => {
      const list = await api.listEvaluations(client.id, 1, 1);
      const first = list.items[0];
      return first ? api.getEvaluation(client.id, first.id) : null;
    },
  });
  const age = ageAt(client.birthDate);
  const evaluation = latest.data ?? null;

  const facts = [
    age != null ? `${age} anos` : null,
    client.gender ? client.gender : null,
    client.targetWeightKg != null ? `meta de peso ${decimal.format(client.targetWeightKg)} kg` : null,
    client.waterGoalMl != null ? `água ${decimal.format(client.waterGoalMl / 1000)} L/dia` : null,
  ].filter(Boolean);

  return (
    <aside
      id="ficha-do-paciente"
      aria-label="Ficha do paciente"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(380px, 100vw)',
        background: 'var(--color-bg)',
        borderLeft: '1px solid var(--color-border)',
        boxShadow: '-8px 0 24px rgba(15, 23, 42, 0.12)',
        zIndex: 40,
        overflowY: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{client.user.fullName}</div>
          {facts.length ? <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{facts.join(' · ')}</div> : null}
        </div>
        <Button variant="ghost" size="small" onClick={onClose}>
          Fechar
        </Button>
      </div>

      <Card title="Última avaliação física">
        {latest.isLoading ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Carregando…</div>
        ) : latest.isError ? (
          <div role="alert" style={{ fontSize: 13, color: 'var(--color-danger)' }}>
            Não foi possível carregar a avaliação.
          </div>
        ) : evaluation ? (
          <div style={{ fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 12.5 }}>{new Date(evaluation.evaluatedAt).toLocaleDateString('pt-BR')}</div>
            <div>
              {[
                evaluation.weightKg != null ? `${decimal.format(evaluation.weightKg)} kg` : null,
                `${decimal.format(evaluation.heightCm)} cm`,
                evaluation.calculatedMetrics?.bmi != null ? `IMC ${decimal.format(evaluation.calculatedMetrics.bmi)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {evaluation.calculatedMetrics?.bodyFatPercent != null ? (
              <div>
                Gordura {decimal.format(evaluation.calculatedMetrics.bodyFatPercent)}%
                {evaluation.calculatedMetrics.leanMassKg != null ? ` · massa magra ${decimal.format(evaluation.calculatedMetrics.leanMassKg)} kg` : ''}
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Nenhuma avaliação registrada.</div>
        )}
      </Card>

      <AnamnesisSummaryCard clientId={client.id} />
    </aside>
  );
}
