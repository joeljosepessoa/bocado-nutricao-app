import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as api from '../api/endpoints';
import type { Appointment, AvailabilitySlot } from '../types/api';
import { ScreenContainer } from '../components/ScreenContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusPill } from '../components/StatusPill';
import { colors, spacing, typography } from '../theme/tokens';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABEL: Record<Appointment['status'], string> = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
};

const STATUS_TONE: Record<Appointment['status'], 'success' | 'progress' | 'neutral'> = {
  scheduled: 'progress',
  confirmed: 'success',
  cancelled: 'neutral',
};

export function AppointmentsScreen() {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [availabilityRes, appointmentsRes] = await Promise.all([api.getAvailability(), api.getAppointments()]);
      setSlots(availabilityRes);
      setAppointments(appointmentsRes);
    } catch {
      // tela mostra o que já tinha carregado; sem estado de erro dedicado por ora
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleBook(slotId: string) {
    setError(null);
    setBookingSlotId(slotId);
    try {
      await api.bookAppointment(slotId);
      await load();
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'Não foi possível agendar este horário.');
    } finally {
      setBookingSlotId(null);
    }
  }

  async function handleCancel(appointmentId: string) {
    setCancellingId(appointmentId);
    try {
      await api.cancelAppointment(appointmentId);
      await load();
    } catch {
      // melhor esforço — lista recarrega no próximo pull-to-refresh
    } finally {
      setCancellingId(null);
    }
  }

  const upcoming = appointments.filter((a) => a.status !== 'cancelled' && new Date(a.scheduledAt) >= new Date());
  const history = appointments.filter((a) => a.status === 'cancelled' || new Date(a.scheduledAt) < new Date());

  return (
    <ScreenContainer onRefresh={load} refreshing={loading}>
      <Card>
        <Text style={styles.sectionTitle}>Minhas consultas</Text>
        {upcoming.length === 0 ? (
          <Text style={styles.empty}>Nenhuma consulta agendada.</Text>
        ) : (
          upcoming.map((a) => (
            <View key={a.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{formatDateTime(a.scheduledAt)}</Text>
                <StatusPill label={STATUS_LABEL[a.status]} tone={STATUS_TONE[a.status]} />
              </View>
              <Button
                title="Cancelar"
                variant="danger"
                loading={cancellingId === a.id}
                onPress={() => handleCancel(a.id)}
              />
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Horários disponíveis</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {slots.length === 0 ? (
          <Text style={styles.empty}>Nenhum horário disponível no momento.</Text>
        ) : (
          slots.map((slot) => (
            <View key={slot.id} style={styles.row}>
              <Text style={styles.rowTitle}>{formatDateTime(slot.startAt)}</Text>
              <Button
                title="Agendar"
                loading={bookingSlotId === slot.id}
                onPress={() => handleBook(slot.id)}
              />
            </View>
          ))
        )}
      </Card>

      {history.length > 0 ? (
        <Card>
          <Text style={styles.sectionTitle}>Histórico</Text>
          {history.map((a) => (
            <View key={a.id} style={styles.row}>
              <Text style={styles.rowTitle}>{formatDateTime(a.scheduledAt)}</Text>
              <StatusPill label={STATUS_LABEL[a.status]} tone={STATUS_TONE[a.status]} />
            </View>
          ))}
        </Card>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...typography.subtitle, color: colors.textPrimary },
  empty: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowTitle: { ...typography.body, color: colors.textPrimary },
});
