import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import * as api from '../../api/endpoints';
import type { Measurements, Skinfolds } from '../../types/api';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { AiAssistPanel } from '../../components/AiAssistPanel';
import { formatDate, formatNumber } from '../../lib/format';

const MEASUREMENT_LABELS: Record<keyof Measurements, string> = {
  chestCm: 'Tórax', waistCm: 'Cintura', abdomenCm: 'Abdômen', hipCm: 'Quadril',
  armRightCm: 'Braço dir.', armLeftCm: 'Braço esq.',
  forearmRightCm: 'Antebraço dir.', forearmLeftCm: 'Antebraço esq.',
  thighRightCm: 'Coxa dir.', thighLeftCm: 'Coxa esq.',
  calfRightCm: 'Panturrilha dir.', calfLeftCm: 'Panturrilha esq.',
  wristCm: 'Punho', femurBicondylarCm: 'Fêmur (bicondilar)',
};

const SKINFOLD_LABELS: Record<keyof Skinfolds, string> = {
  chestMm: 'Tórax', axillaryMidMm: 'Axilar média', subscapularMm: 'Subescapular',
  bicepsMm: 'Bíceps', tricepsMm: 'Tríceps', abdominalMm: 'Abdominal',
  suprailiacMm: 'Suprailíaca', thighMm: 'Coxa', calfMm: 'Panturrilha',
};

export function EvaluationDetailPage() {
  const { clientId, evaluationId } = useParams<{ clientId: string; evaluationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reportMessage, setReportMessage] = useState<string | null>(null);

  const { data: evaluation, isLoading } = useQuery({
    queryKey: ['evaluation', clientId, evaluationId],
    queryFn: () => api.getEvaluation(clientId!, evaluationId!),
    enabled: !!clientId && !!evaluationId,
  });

  const releaseMutation = useMutation({
    mutationFn: (released: boolean) => api.setEvaluationRelease(clientId!, evaluationId!, released),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['evaluation', clientId, evaluationId] }),
  });

  const reportMutation = useMutation({
    mutationFn: (audience: 'professional' | 'client') => api.generateReport(clientId!, evaluationId!, audience),
    onSuccess: () => {
      setReportMessage('Relatório gerado — veja na aba Relatórios.');
      queryClient.invalidateQueries({ queryKey: ['reports', clientId] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setReportMessage(message ?? 'Não foi possível gerar o relatório.');
    },
  });

  if (isLoading || !evaluation) {
    return <EmptyState title="Carregando avaliação…" />;
  }

  const isReleased = !!evaluation.releasedToClientAt;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Avaliação de {formatDate(evaluation.evaluatedAt)}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => navigate(`/clients/${clientId}/evaluations/${evaluationId}/edit`)}>
            Editar
          </Button>
          <Button variant={isReleased ? 'secondary' : 'primary'} onClick={() => releaseMutation.mutate(!isReleased)} loading={releaseMutation.isPending}>
            {isReleased ? 'Retirar liberação' : 'Liberar ao cliente'}
          </Button>
        </div>
      </div>

      <Card title="Composição corporal">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          <Tile label="Peso" value={formatNumber(evaluation.weightKg, ' kg')} />
          <Tile label="IMC" value={`${formatNumber(evaluation.calculatedMetrics?.bmi ?? null)} (${evaluation.calculatedMetrics?.bmiClassification ?? '—'})`} />
          <Tile label="% de gordura" value={formatNumber(evaluation.calculatedMetrics?.bodyFatPercent ?? null, '%')} />
          <Tile label="Massa gorda" value={formatNumber(evaluation.calculatedMetrics?.fatMassKg ?? null, ' kg')} />
          <Tile label="Massa magra" value={formatNumber(evaluation.calculatedMetrics?.leanMassKg ?? null, ' kg')} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Fonte do %gordura: {evaluation.calculatedMetrics?.bodyFatPercentSource ?? '—'} · Protocolo: {evaluation.protocol?.name ?? '—'}
        </div>
      </Card>

      {evaluation.measurements ? (
        <Card title="Circunferências">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            {(Object.keys(MEASUREMENT_LABELS) as Array<keyof Measurements>)
              .filter((k) => evaluation.measurements![k] != null)
              .map((k) => (
                <Tile key={k} label={MEASUREMENT_LABELS[k]} value={formatNumber(evaluation.measurements![k], ' cm')} />
              ))}
          </div>
        </Card>
      ) : null}

      {evaluation.skinfolds ? (
        <Card title="Dobras cutâneas">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            {(Object.keys(SKINFOLD_LABELS) as Array<keyof Skinfolds>)
              .filter((k) => evaluation.skinfolds![k] != null)
              .map((k) => (
                <Tile key={k} label={SKINFOLD_LABELS[k]} value={formatNumber(evaluation.skinfolds![k], ' mm')} />
              ))}
          </div>
        </Card>
      ) : null}

      {evaluation.bioimpedance ? (
        <Card title={`Bioimpedância (${evaluation.bioimpedance.origin === 'device_confirmed' ? 'balança conectada' : 'manual'})`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <Tile label="Massa muscular" value={formatNumber(evaluation.bioimpedance.muscleMassKg, ' kg')} />
            <Tile label="Água corporal" value={formatNumber(evaluation.bioimpedance.bodyWaterPercent, '%')} />
            <Tile label="Gordura visceral" value={formatNumber(evaluation.bioimpedance.visceralFatLevel)} />
            <Tile label="Massa óssea" value={formatNumber(evaluation.bioimpedance.boneMassKg, ' kg')} />
            <Tile label="Metabolismo basal" value={formatNumber(evaluation.bioimpedance.basalMetabolicRateKcal, ' kcal')} />
            <Tile label="Idade corporal" value={formatNumber(evaluation.bioimpedance.bodyAgeYears, ' anos')} />
          </div>
        </Card>
      ) : null}

      <Card title="Sinais vitais">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          <Tile label="Pressão arterial" value={`${evaluation.bloodPressureSystolic ?? '—'}/${evaluation.bloodPressureDiastolic ?? '—'}`} />
          <Tile label="Freq. cardíaca" value={formatNumber(evaluation.heartRate, ' bpm')} />
          <Tile label="Glicemia" value={formatNumber(evaluation.glucose, ' mg/dL')} />
        </div>
        {evaluation.notes ? <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Notas: {evaluation.notes}</div> : null}
      </Card>

      <Card title="Relatório">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => reportMutation.mutate('professional')} loading={reportMutation.isPending}>
            Gerar relatório profissional
          </Button>
          <Button
            variant="secondary"
            onClick={() => reportMutation.mutate('client')}
            loading={reportMutation.isPending}
            disabled={!isReleased}
            title={!isReleased ? 'Libere a avaliação ao cliente primeiro' : undefined}
          >
            Gerar relatório cliente
          </Button>
        </div>
        {reportMessage ? <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{reportMessage}</div> : null}
      </Card>

      <AiAssistPanel
        title="Explicar em linguagem simples"
        helperText={
          isReleased
            ? 'Descreve, em texto simples, os números já liberados ao cliente — sem diagnosticar nem interpretar além do que os dados mostram.'
            : 'Libere esta avaliação ao cliente primeiro — a explicação só usa dado já liberado.'
        }
        generate={() => api.explainEvaluation(clientId!, evaluationId!)}
      />

      <AiAssistPanel
        title="Narrar tendência"
        helperText="Descreve em texto a tendência entre as duas avaliações liberadas mais recentes deste cliente — o cálculo é sempre feito pelo sistema, a IA só descreve o resultado."
        generate={() => api.narrateTrend(clientId!)}
      />
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary-dark)' }}>{value}</div>
    </div>
  );
}
