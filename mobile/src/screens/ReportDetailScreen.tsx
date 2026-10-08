import React from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { ScreenContainer } from '../components/ScreenContainer';
import { EvaluationReport } from '../components/EvaluationReport';
import type { RootStackParamList } from '../navigation/types';

/** "Meu relatório" aberto a partir de Relatórios: o relatório visual da avaliação escolhida. */
export function ReportDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ReportDetail'>>();
  const { entries, evaluationId } = route.params;
  return (
    <ScreenContainer>
      <EvaluationReport entries={entries} evaluationId={evaluationId} />
    </ScreenContainer>
  );
}
