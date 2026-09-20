import type { ConfigService } from '@nestjs/config';
import { SmtpEmailService } from './smtp-email.service';

/**
 * Valida a configuração SMTP de produção ANTES de depender dela: confere
 * conexão/autenticação e envia uma mensagem de teste.
 *
 * Uso (a partir de backend/, com as variáveis do .env de produção):
 *   npm run email:test -- destinatario@exemplo.com
 * Lê EMAIL_PROVIDER, SMTP_URL e EMAIL_FROM do ambiente (`--env-file=.env`).
 */
async function main() {
  const to = process.argv[2];
  if (!to) {
    throw new Error('Informe o destinatário: npm run email:test -- destinatario@exemplo.com');
  }
  if ((process.env.EMAIL_PROVIDER ?? 'console') !== 'smtp') {
    throw new Error('EMAIL_PROVIDER precisa ser "smtp" para testar o envio real.');
  }

  const config = { get: (key: string) => process.env[key] } as unknown as ConfigService;
  const service = new SmtpEmailService(config);

  await service.verify();
  console.log('OK  conexão e autenticação SMTP.');

  await service.send({
    to,
    subject: 'Teste de e-mail — Bocado de Nutrição',
    text: 'Se você recebeu esta mensagem, o envio de e-mails (incluindo a redefinição de senha) está configurado corretamente.',
  });
  console.log(`OK  mensagem de teste enviada para ${to}. Confira a caixa de entrada (e o spam).`);
}

main().catch((error) => {
  // Só a mensagem: o objeto de erro do nodemailer pode carregar a URL com a senha.
  console.error(`FALHA  ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
