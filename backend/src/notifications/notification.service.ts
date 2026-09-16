export interface PushNotificationMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Mesmo padrão de EmailService (Fase 13): interface abstrata + um único
 * adapter concreto. Nenhum adapter real de push foi escrito nesta fase —
 * exige uma conta de desenvolvedor Expo/Apple/Google com um projeto EAS
 * configurado (extra.eas.projectId em app.json), que não existe neste
 * projeto hoje. Trocar por um adapter real (ex.: expo-server-sdk) depois é
 * só implementar esta interface e trocar o binding em notifications.module.ts.
 */
export abstract class NotificationService {
  abstract send(message: PushNotificationMessage): Promise<void>;
}
