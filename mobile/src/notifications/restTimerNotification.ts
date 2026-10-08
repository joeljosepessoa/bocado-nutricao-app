import { loadNotifications } from './loadNotifications';

/**
 * Notificação local (não push) só para avisar que o descanso acabou quando
 * o app está em segundo plano. Nenhum servidor de push está envolvido —
 * é agendada e cancelada inteiramente no dispositivo.
 */
const Notifications = loadNotifications();

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function scheduleRestTimerNotification(remainingSeconds: number): Promise<string | null> {
  if (remainingSeconds <= 0 || !Notifications) {
    return null;
  }
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Descanso concluído',
        body: 'Hora de voltar para a próxima série.',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: remainingSeconds,
        repeats: false,
      },
    });
  } catch {
    // Permissão negada ou indisponível (ex.: web/simulador): o timer visual
    // continua funcionando normalmente, só sem o aviso em segundo plano.
    return null;
  }
}

export async function cancelRestTimerNotification(notificationId: string | null): Promise<void> {
  if (!notificationId || !Notifications) {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // ignora — se já disparou ou foi cancelada, não há o que fazer
  }
}
