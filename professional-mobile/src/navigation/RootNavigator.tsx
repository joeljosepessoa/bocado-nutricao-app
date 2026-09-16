import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ClientsListScreen } from '../screens/ClientsListScreen';
import { EvaluationPickerScreen } from '../screens/EvaluationPickerScreen';
import { ScaleConnectScreen } from '../screens/ScaleConnectScreen';
import { flushScaleReadingQueue } from '../offline/sync';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'authenticated') {
      flushScaleReadingQueue().catch(() => undefined);
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

  return (
    <Stack.Navigator>
      <Stack.Screen name="ClientsList" component={ClientsListScreen} options={{ title: 'Clientes' }} />
      <Stack.Screen
        name="EvaluationPicker"
        component={EvaluationPickerScreen}
        options={({ route }) => ({ title: route.params.clientName })}
      />
      <Stack.Screen name="ScaleConnect" component={ScaleConnectScreen} options={{ title: 'Conectar balança' }} />
    </Stack.Navigator>
  );
}
