import type { CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { EvolutionEntry, WorkoutClientDay, WorkoutClientSummary } from '../types/api';

/**
 * Área do paciente: Dashboard, Dieta, Treinos e Evolução aparecem na barra
 * inferior; as demais telas também vivem neste navegador (ocultas na barra),
 * para o cabeçalho, o menu lateral e a barra inferior ficarem sempre visíveis
 * e o "voltar" seguir o histórico de navegação.
 */
export type MainTabParamList = {
  Home: undefined;
  Diet: undefined;
  Workout: undefined;
  Evolution: undefined;
  Weight: undefined;
  Water: undefined;
  Photos: undefined;
  History: undefined;
  Assessment: { evaluationId?: string } | undefined;
  Profile: undefined;
  Settings: undefined;
  Activity: undefined;
  Messages: undefined;
  Appointments: undefined;
  Reports: undefined;
  NotificationPreferences: undefined;
  Privacy: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  ChangePassword: undefined;
  PrivacyConsent: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  WorkoutExecution: { workout: WorkoutClientSummary; day: WorkoutClientDay };
  // A lista inteira (não só o item) viaja com a navegação: o gráfico de
  // evolução e a comparação "inicial vs. atual" precisam de todo o
  // histórico liberado, não só da avaliação escolhida — mesmo padrão de
  // WorkoutExecution (objeto completo, sem endpoint dedicado por avaliação).
  ReportDetail: { entries: EvolutionEntry[]; evaluationId: string };
  ConnectDevice: undefined;
};

/** Navegação de qualquer tela da área do paciente (abas + telas empilhadas por cima). */
export type AppNavigation = CompositeNavigationProp<BottomTabNavigationProp<MainTabParamList>, NativeStackNavigationProp<RootStackParamList>>;
