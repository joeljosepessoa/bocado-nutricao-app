export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Abstração de envio de e-mail — mesma ideia de AiProvider (Fase 12) e
 * StorageService (Fase 9): o domínio depende só desta interface, nunca de
 * um provedor concreto. A única implementação registrada nesta fase é
 * ConsoleEmailService (dev/teste); um provedor real (ex.: categoria "envio
 * transacional de e-mail") é uma dependência de infraestrutura futura —
 * trocar exige mudar só o `providers` de AuthModule, nunca o AuthService.
 */
export abstract class EmailService {
  abstract send(message: EmailMessage): Promise<void>;
}
