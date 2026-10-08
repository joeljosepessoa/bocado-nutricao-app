import Constants, { ExecutionEnvironment } from 'expo-constants';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

/**
 * expo-notifications carregado sob demanda. No Expo Go (Android, SDK 53+) só
 * importar o pacote já derruba o app ("push notifications ... removed from
 * Expo Go"), então lá o app segue sem notificações — push e o aviso de fim de
 * descanso em segundo plano. No APK (build próprio) nada muda.
 */
export function loadNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    cached = null;
    return cached;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- carga tardia proposital (ver acima)
  cached = require('expo-notifications') as NotificationsModule;
  return cached;
}
