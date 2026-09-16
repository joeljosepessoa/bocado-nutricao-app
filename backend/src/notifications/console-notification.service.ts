import { Injectable } from '@nestjs/common';
import { NotificationService, PushNotificationMessage } from './notification.service';

/**
 * Implementação de desenvolvimento/teste — mesmo raciocínio de
 * ConsoleEmailService (Fase 13): não existe projeto EAS configurado (sem
 * extra.eas.projectId em nenhum app.json), então não há como obter nem
 * validar um push token real. Escreve em stdout (não no Logger do Nest,
 * canal deliberadamente separado) e guarda em memória para os testes
 * inspecionarem o que "seria" enviado.
 *
 * Nunca usar em produção — substituir por um provedor real (Expo push
 * assim que existir um projeto EAS) é uma dependência de infraestrutura
 * explicitamente pendente, não uma configuração a ativar aqui.
 */
@Injectable()
export class ConsoleNotificationService extends NotificationService {
  private readonly sentMessages: PushNotificationMessage[] = [];

  async send(message: PushNotificationMessage): Promise<void> {
    this.sentMessages.push(message);
    process.stdout.write(`\n[DEV PUSH] Para: ${message.to}\n${message.title}\n${message.body}\n[/DEV PUSH]\n\n`);
  }

  /** Só para teste — nenhum outro código de produção deve chamar isto. */
  getSentMessages(): readonly PushNotificationMessage[] {
    return this.sentMessages;
  }
}
