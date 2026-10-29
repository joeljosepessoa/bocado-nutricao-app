import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';
import { AccountTermsScreen, AiConsentScreen, FirstOpenTermsScreen } from '../screens/TermsAcceptanceScreen';
import { ReportDetailScreen } from '../screens/ReportDetailScreen';
import { ConnectDeviceScreen } from '../screens/ConnectDeviceScreen';
import { MainTabs } from './MainTabs';
import { AppHeader } from './AppShell';
import type { RootStackParamList } from './types';
import { flushExecutionLogQueue } from '../offline/sync';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { status, deviceTermsAccepted } = useAuth();

  useEffect(() => {
    if (status === 'authenticated') {
      flushExecutionLogQueue().catch(() => undefined);
    }
  }, [status]);

  if (status === 'loading' || (status === 'unauthenticated' && deviceTermsAccepted === null)) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
      </Stack.Navigator>
    );
  }

  // Primeira abertura do app neste aparelho: boas-vindas + aceite dos termos antes do login.
  if (status === 'unauthenticated' && !deviceTermsAccepted) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={FirstOpenTermsScreen} />
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

  // Logado, mas o servidor pede o aceite (quem já usava o app e atualizou, ou documento novo).
  if (status === 'mustAcceptTerms') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="TermsAcceptance" component={AccountTermsScreen} />
      </Stack.Navigator>
    );
  }

  // Termos em dia, mas falta a autorização das análises automáticas (obrigatória).
  if (status === 'mustAuthorizeAi') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AiConsent" component={AiConsentScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ header: ({ navigation, options }) => <AppHeader title={options.title ?? ''} onBack={() => navigation.goBack()} /> }}>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="ReportDetail" component={ReportDetailScreen} options={{ title: 'Meu relatório' }} />
      <Stack.Screen name="ConnectDevice" component={ConnectDeviceScreen} options={{ title: 'Conectar dispositivo' }} />
    </Stack.Navigator>
  );
}
