import type { NavigatorScreenParams } from '@react-navigation/native';
import type { WorkoutClientDay, WorkoutClientSummary } from '../types/api';

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
  ConnectDevice: undefined;
  NotificationPreferences: undefined;
};
