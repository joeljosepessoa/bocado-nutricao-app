import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import type { Plan } from '../types/api';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { formatCurrencyCents, formatDate } from '../lib/format';

const INTERVAL_LABEL: Record<Plan['interval'], string> = { month: '/mês', year: '/ano' };

export function PlanPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: plans, isLoading: loadingPlans } = useQuery({ queryKey: ['billing', 'plans'], queryFn: api.listPlans });
  const { data: subscription, isLoading: loadingSubscription } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: api.getSubscription,
  });

  const subscribeMutation = useMutation({
    mutationFn: (planCode: string) => api.subscribeToPlan(planCode),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'Não foi possível assinar este plano agora.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelSubscription(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] }),
  });

  return (
    <>
      <h1 style={{ fontSize: 22, margin: 0 }}>Plano e cobrança</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Assinatura atual</h2>
        {!loadingSubscription && !subscription ? (
          <EmptyState title="Nenhuma assinatura ativa" description="Escolha um plano abaixo para começar." />
        ) : subscription ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 16,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong>{subscription.plan.name}</strong>
              <StatusBadge status={subscription.status} />
              {subscription.cancelAtPeriodEnd ? <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Cancelamento agendado</span> : null}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {formatCurrencyCents(subscription.plan.priceCents)}
              {INTERVAL_LABEL[subscription.plan.interval]} · período atual até {formatDate(subscription.currentPeriodEnd)}
            </div>
            {!subscription.cancelAtPeriodEnd && subscription.status !== 'canceled' ? (
              <div>
                <Button variant="danger" size="small" loading={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
                  Cancelar assinatura
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</div> : null}
      </div>

      {!subscription || subscription.status === 'canceled' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Planos disponíveis</h2>
          {loadingPlans ? (
            <EmptyState title="Carregando planos…" />
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {(plans ?? []).map((plan) => (
                <div
                  key={plan.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: 16,
                    minWidth: 220,
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <strong>{plan.name}</strong>
                  <div style={{ fontSize: 18 }}>
                    {formatCurrencyCents(plan.priceCents)}
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{INTERVAL_LABEL[plan.interval]}</span>
                  </div>
                  {plan.trialDays > 0 ? (
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{plan.trialDays} dias grátis</span>
                  ) : null}
                  <Button
                    loading={subscribeMutation.isPending && subscribeMutation.variables === plan.code}
                    onClick={() => subscribeMutation.mutate(plan.code)}
                  >
                    Assinar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Histórico de cobrança</h2>
        {!subscription || subscription.invoices.length === 0 ? (
          <EmptyState title="Nenhuma cobrança registrada ainda" />
        ) : (
          <DataTable
            rows={subscription.invoices}
            rowKey={(row) => row.id}
            emptyTitle="Nenhuma cobrança registrada ainda"
            columns={[
              { key: 'dueDate', label: 'Vencimento', render: (row) => formatDate(row.dueDate) },
              { key: 'amountCents', label: 'Valor', render: (row) => formatCurrencyCents(row.amountCents) },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
              { key: 'paidAt', label: 'Pago em', render: (row) => formatDate(row.paidAt) },
            ]}
          />
        )}
      </div>
    </>
  );
}
