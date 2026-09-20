import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { EmailMessage, EmailService } from './email.service';

/**
 * Adapter SMTP genérico (Nodemailer) — funciona com qualquer provedor que
 * ofereça SMTP (SES, SendGrid, Mailgun, Brevo, servidor próprio...). Só
 * depende de configuração externa: `EMAIL_PROVIDER=smtp`, `SMTP_URL`
 * (ex.: `smtps://usuario:senha@smtp.exemplo.com:465`) e `EMAIL_FROM`.
 * Falta de configuração falha no boot, não no primeiro envio.
 *
 * O corpo da mensagem (que traz o token de redefinição de senha) nunca é
 * logado; falhas de envio sobem para quem chamou.
 */
@Injectable()
export class SmtpEmailService extends EmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService, transporter?: Transporter) {
    super();
    const url = config.get<string>('SMTP_URL');
    const from = config.get<string>('EMAIL_FROM');
    if (!url || !from) {
      throw new Error('EMAIL_PROVIDER=smtp requer SMTP_URL e EMAIL_FROM configurados (.env).');
    }
    this.from = from;
    this.transporter = transporter ?? createTransport(url);
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}
