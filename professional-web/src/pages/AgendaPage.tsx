import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import type { Appointment, AvailabilitySlot } from '../types/api';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { formatDateTime } from '../lib/format';

function toLocalInputValue(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function AgendaPage() {
  const queryClient = useQueryClient();
  const [startAt, setStartAt] = useState(toLocalInputValue(24));
  const [endAt, setEndAt] = useState(toLocalInputValue(25));
  const [error, setError] = useState<string | null>(null);

  const { data: slots, isLoading: loadingSlots } = useQuery({
    queryKey: ['availability'],
    queryFn: api.listAvailability,
  });
  const { data: appointments, isLoading: loadingAppointments } = useQuery({
    queryKey: ['appointments'],
    queryFn: api.listAppointments,
  });

  const createSlotMutation = useMutation({
    mutationFn: () => api.createAvailabilitySlot(new Date(startAt).toISOString(), new Date(endAt).toISOString()),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'Não foi possível criar esta disponibilidade.');
    },
  });

  const removeSlotMutation = useMutation({
    mutationFn: (id: string) => api.removeAvailabilitySlot(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['availability'] }),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api.confirmAppointment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelAppointment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });

  return (
    <>
      <h1 style={{ fontSize: 22, margin: 0 }}>Agenda</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Disponibilidade</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            Início
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            Término
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
            />
          </label>
          <Button onClick={() => createSlotMutation.mutate()} loading={createSlotMutation.isPending}>
            + Criar horário
          </Button>
        </div>
        {error ? <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</div> : null}

        <DataTable<AvailabilitySlot>
          loading={loadingSlots}
          rows={slots ?? []}
          rowKey={(row) => row.id}
          emptyTitle="Nenhuma disponibilidade cadastrada"
          columns={[
            { key: 'startAt', label: 'Início', render: (row) => formatDateTime(row.startAt) },
            { key: 'endAt', label: 'Término', render: (row) => formatDateTime(row.endAt) },
            { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.isBooked ? 'confirmed' : 'active'} /> },
            {
              key: 'actions',
              label: '',
              render: (row) =>
                row.isBooked ? null : (
                  <Button
                    size="small"
                    variant="danger"
                    loading={removeSlotMutation.isPending && removeSlotMutation.variables === row.id}
                    onClick={() => removeSlotMutation.mutate(row.id)}
                  >
                    Remover
                  </Button>
                ),
            },
          ]}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Consultas</h2>
        {!loadingAppointments && (!appointments || appointments.length === 0) ? (
          <EmptyState title="Nenhuma consulta agendada ainda" />
        ) : (
          <DataTable<Appointment>
            loading={loadingAppointments}
            rows={appointments ?? []}
            rowKey={(row) => row.id}
            emptyTitle="Nenhuma consulta agendada ainda"
            columns={[
              { key: 'client', label: 'Cliente', render: (row) => row.client?.user.fullName ?? '—' },
              { key: 'scheduledAt', label: 'Quando', render: (row) => formatDateTime(row.scheduledAt) },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
              {
                key: 'actions',
                label: '',
                render: (row) =>
                  row.status === 'cancelled' ? null : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {row.status === 'scheduled' ? (
                        <Button
                          size="small"
                          loading={confirmMutation.isPending && confirmMutation.variables === row.id}
                          onClick={() => confirmMutation.mutate(row.id)}
                        >
                          Confirmar
                        </Button>
                      ) : null}
                      <Button
                        size="small"
                        variant="danger"
                        loading={cancelMutation.isPending && cancelMutation.variables === row.id}
                        onClick={() => cancelMutation.mutate(row.id)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ),
              },
            ]}
          />
        )}
      </div>
    </>
  );
}
