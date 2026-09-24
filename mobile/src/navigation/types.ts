import type { NavigatorScreenParams } from '@react-navigation/native';
import type { EvolutionEntry, WorkoutClientDay, WorkoutClientSummary } from '../types/api';

export type MainTabParamList = {
  Home: undefined;
  Diet: undefined;
  Workout: undefined;
  Evolution: undefined;
  Activity: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  ChangePassword: undefined;
  PrivacyConsent: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  WorkoutExecution: { workout: WorkoutClientSummary; day: WorkoutClientDay };
  Reports: undefined;
  // A lista inteira (não só o item) viaja com a navegação: o gráfico de
  // evolução e a comparação "inicial vs. atual" precisam de todo o
  // histórico liberado, não só da avaliação escolhida — mesmo padrão de
  // WorkoutExecution (objeto completo, sem endpoint dedicado por avaliação).
  ReportDetail: { entries: EvolutionEntry[]; evaluationId: string };
  ConnectDevice: undefined;
  NotificationPreferences: undefined;
  Messages: undefined;
  Appointments: undefined;
  Privacy: undefined;
};
