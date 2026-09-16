import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as api from '../api/endpoints';

/**
 * Mesmo código de mobile/src/notifications/pushRegistration.ts (Fase 16) —
 * nenhuma lógica de negócio nova aqui, só duplicado porque os dois apps são
 * bundles Expo independentes (mesma decisão de não compartilhar código
 * entre professional-mobile e mobile já em vigor desde a Fase 10).
 * getExpoPushTokenAsync exige extra.eas.projectId, que este app não tem
 * configurado ainda — falha graciosamente em vez de travar login/logout.
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
