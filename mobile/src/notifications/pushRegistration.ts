import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as api from '../api/endpoints';

/**
 * Registro de push (Fase 16) — separado de restTimerNotification.ts, que é
 * notificação local e não usa nenhuma dessas APIs. getExpoPushTokenAsync
 * exige um projeto EAS configurado (extra.eas.projectId em app.json), que
 * este projeto não tem ainda — dependência de infraestrutura documentada no
 * roadmap (mesma categoria de HealthKit/Health Connect, Fase 11). Por isso
 * tudo aqui falha graciosamente: nenhuma etapa deve travar login/logout.
 */

function currentPlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return Platform.OS;
  }
  return null;
}

async function getPushToken(): Promise<string | null> {
  const platform = currentPlatform();
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!platform || typeof projectId !== 'string' || projectId.length === 0) {
    return null;
  }
  try {
    const permission = await Notifications.getPermissionsAsync();
    let status = permission.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') {
      return null;
    }
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    return result.data;
  } catch {
    // Sem projeto EAS configurado (ambiente atual) ou qualquer outra falha
    // de plataforma — o app segue funcionando normalmente sem push.
    return null;
  }
}

export async function registerPushToken(): Promise<void> {
  const platform = currentPlatform();
  const token = await getPushToken();
  if (!platform || !token) {
    return;
  }
  try {
    await api.registerDeviceToken(platform, token);
  } catch {
    // melhor esforço — nunca bloqueia o login
  }
}

export async function revokeCurrentPushToken(): Promise<void> {
  const token = await getPushToken();
  if (!token) {
    return;
  }
  try {
    await api.revokeDeviceToken(token);
  } catch {
    // melhor esforço — nunca bloqueia o logout
  }
}
