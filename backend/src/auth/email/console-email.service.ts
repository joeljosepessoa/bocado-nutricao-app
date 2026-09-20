import { Injectable } from '@nestjs/common';
import { EmailMessage, EmailService } from './email.service';

/**
 * Implementação de desenvolvimento/teste — não existe infraestrutura de
 * envio real de e-mail no projeto ainda (LGPD/produção, Fase 20 do
 * roadmap). Escreve direto em stdout (não pelo Logger do Nest — esse canal
 * é deliberadamente separado do log estruturado da aplicação) e guarda em
 * memória para os testes inspecionarem o que "seria" enviado, já que o
 * token nunca é devolvido em nenhuma resposta de API.
 *
 * Nunca usar em produção — substituir por um provedor real é uma
 * dependência de infraestrutura explicitamente pendente, não uma
 * configuração a ativar aqui.
 */
@Injectable()
export class ConsoleEmailService extends EmailService {
  private readonly sentMessages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    // Em produção nada de corpo (o texto traz o token de redefinição de senha)
    // nem retenção em memória: só um aviso de que o e-mail NÃO foi enviado.
    if (process.env.NODE_ENV === 'production') {
      process.stdout.write(`[EMAIL NÃO ENVIADO — nenhum provedor real configurado] para ${message.to} | assunto: ${message.subject}
`);
      return;
    }
    this.sentMessages.push(message);
    process.stdout.write(
      `\n[DEV EMAIL] Para: ${message.to}\nAssunto: ${message.subject}\n${message.text}\n[/DEV EMAIL]\n\n`,
    );
  }

  /** Só para teste — nenhum outro código de produção deve chamar isto. */
  getSentMessages(): readonly EmailMessage[] {
    return this.sentMessages;
  }
}
