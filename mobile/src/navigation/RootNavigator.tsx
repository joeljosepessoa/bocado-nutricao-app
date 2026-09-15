import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';
import { PrivacyConsentScreen } from '../screens/PrivacyConsentScreen';
import { WorkoutExecutionScreen } from '../screens/WorkoutExecutionScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { MainTabs } from './MainTabs';
import type { RootStackParamList } from './types';
import { flushExecutionLogQueue } from '../offline/sync';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'authenticated') {
      flushExecutionLogQueue().catch(() => undefined);
    }
  }, [status]);

  if (status === 'loading') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
      </Stack.Navigator>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  if (status === 'mustChangePassword') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      </Stack.Navigator>
    );
  }

  if (status === 'mustAcceptPrivacy') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="PrivacyConsent" component={PrivacyConsentScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="WorkoutExecution"
        component={WorkoutExecutionScreen}
        options={{ presentation: 'modal', title: 'Execução de treino' }}
      />
      <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Relatórios' }} />
    </Stack.Navigator>
  );
}
