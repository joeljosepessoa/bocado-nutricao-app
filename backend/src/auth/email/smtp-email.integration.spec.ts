import { ConfigService } from '@nestjs/config';
import { createServer, type Server } from 'net';
import type { AddressInfo } from 'net';
import { SmtpEmailService } from './smtp-email.service';

interface Received {
  from?: string;
  to: string[];
  auth?: { user: string; pass: string };
  raw: string;
}

/** Servidor SMTP mínimo (sem TLS) — só para provar que o nodemailer real conversa com ele. */
function startSmtpServer(): Promise<{ server: Server; port: number; received: Received[] }> {
  const received: Received[] = [];
  const server = createServer((socket) => {
    const session: Received = { to: [], raw: '' };
    let inData = false;
    let buffer = '';
    const send = (line: string) => socket.write(`${line}\r\n`);
    send('220 teste.local ESMTP');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index: number;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            received.push(session);
            send('250 aceito');
          } else {
            session.raw += `${line}\n`;
          }
          continue;
        }
        const command = line.toUpperCase();
        if (command.startsWith('EHLO')) socket.write('250-teste.local\r\n250 AUTH PLAIN\r\n');
        else if (command.startsWith('AUTH PLAIN')) {
          const [, user, pass] = Buffer.from(line.split(' ')[2] ?? '', 'base64').toString().split('\0');
          session.auth = { user, pass };
          send('235 ok');
        } else if (command.startsWith('MAIL FROM')) {
          session.from = line.slice(10).replace(/[<>]/g, '').trim();
          send('250 ok');
        } else if (command.startsWith('RCPT TO')) {
          session.to.push(line.slice(8).replace(/[<>]/g, '').trim());
          send('250 ok');
        } else if (command === 'DATA') {
          inData = true;
          send('354 envie');
        } else if (command === 'QUIT') {
          send('221 tchau');
          socket.end();
        } else send('250 ok');
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port, received }));
  });
}

describe('SmtpEmailService com um servidor SMTP de verdade (nodemailer real, sem mocks)', () => {
  let server: Server;
  let port: number;
  let received: Received[];

  beforeAll(async () => {
    ({ server, port, received } = await startSmtpServer());
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  function serviceFor(smtpUrl: string) {
    const config = { get: (key: string) => ({ SMTP_URL: smtpUrl, EMAIL_FROM: 'Bocado <nao-responda@exemplo.com>' })[key] };
    return new SmtpEmailService(config as unknown as ConfigService);
  }

  it('entrega a mensagem com remetente, destinatário, credenciais SMTP e corpo em UTF-8', async () => {
    const service = serviceFor(`smtp://usuario:senha-secreta@127.0.0.1:${port}`);

    await service.send({
      to: 'cliente@example.com',
      subject: 'Redefinição de senha — Bocado de Nutrição',
      text: 'Use o link: https://painel.exemplo.com.br/reset-password?token=abc123\n\nAtenção: expira em 30 minutos.',
    });

    expect(received).toHaveLength(1);
    const mail = received[0];
    expect(mail.from).toBe('nao-responda@exemplo.com');
    expect(mail.to).toEqual(['cliente@example.com']);
    expect(mail.auth).toEqual({ user: 'usuario', pass: 'senha-secreta' });
    expect(mail.raw).toMatch(/^From: Bocado <nao-responda@exemplo\.com>/m);
    expect(mail.raw).toMatch(/^Content-Type: text\/plain; charset=utf-8/m);
    // quoted-printable: soft line breaks ("=\n") e acentos como =C3=A7 — decodifica para comparar o conteúdo.
    const decoded = mail.raw
      .replace(/=\n/g, '')
      .replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    expect(Buffer.from(decoded, 'binary').toString('utf8')).toContain('token=abc123');
    expect(Buffer.from(decoded, 'binary').toString('utf8')).toContain('Atenção');
  });

  it('usa timeouts curtos de conexão/saudação/socket (não os 2 min padrão do nodemailer)', () => {
    const service = serviceFor(`smtp://127.0.0.1:${port}`);
    const options = (service as unknown as { transporter: { transporter: { options: Record<string, number> } } }).transporter
      .transporter.options;
    expect(options.connectionTimeout).toBe(10_000);
    expect(options.greetingTimeout).toBe(10_000);
    expect(options.socketTimeout).toBe(30_000);
  });

  it('verify() confere conexão e autenticação sem enviar mensagem', async () => {
    const before = received.length;
    await serviceFor(`smtp://usuario:senha@127.0.0.1:${port}`).verify();
    expect(received).toHaveLength(before);
  });

  it('servidor inacessível: send rejeita (quem chama decide o que fazer)', async () => {
    const service = serviceFor('smtp://127.0.0.1:1');
    await expect(service.send({ to: 'a@b.com', subject: 's', text: 't' })).rejects.toThrow();
  });
});
