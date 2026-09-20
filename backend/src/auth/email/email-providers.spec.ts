import { ConfigService } from '@nestjs/config';
import { ConsoleEmailService } from './console-email.service';
import { SmtpEmailService } from './smtp-email.service';

function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('SmtpEmailService', () => {
  it('falha no construtor (boot) sem SMTP_URL ou EMAIL_FROM', () => {
    expect(() => new SmtpEmailService(configWith({}))).toThrow(/SMTP_URL e EMAIL_FROM/);
    expect(() => new SmtpEmailService(configWith({ SMTP_URL: 'smtp://x' }))).toThrow(/SMTP_URL e EMAIL_FROM/);
    expect(() => new SmtpEmailService(configWith({ EMAIL_FROM: 'a@b.com' }))).toThrow(/SMTP_URL e EMAIL_FROM/);
  });

  it('envia via transporter com remetente configurado (sem rede: transporter injetado)', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'x' });
    const service = new SmtpEmailService(
      configWith({ SMTP_URL: 'smtp://usuario:senha@smtp.exemplo.com:587', EMAIL_FROM: 'Bocado <nao-responda@exemplo.com>' }),
      { sendMail } as never,
    );

    await service.send({ to: 'cliente@example.com', subject: 'Assunto', text: 'corpo' });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'Bocado <nao-responda@exemplo.com>',
      to: 'cliente@example.com',
      subject: 'Assunto',
      text: 'corpo',
    });
  });

  it('falha de envio sobe para quem chamou (não é engolida)', async () => {
    const service = new SmtpEmailService(
      configWith({ SMTP_URL: 'smtp://x', EMAIL_FROM: 'a@b.com' }),
      { sendMail: jest.fn().mockRejectedValue(new Error('smtp fora do ar')) } as never,
    );
    await expect(service.send({ to: 'a@b.com', subject: 's', text: 't' })).rejects.toThrow('smtp fora do ar');
  });
});

describe('ConsoleEmailService em produção', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
    jest.restoreAllMocks();
  });

  it('não imprime o corpo (token de reset) nem guarda a mensagem em memória', async () => {
    process.env.NODE_ENV = 'production';
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const service = new ConsoleEmailService();

    await service.send({ to: 'a@b.com', subject: 'Redefinição de senha', text: 'https://x/reset?token=SEGREDO-DO-TOKEN' });

    const output = write.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('NÃO ENVIADO');
    expect(output).toContain('a@b.com');
    expect(output).not.toContain('SEGREDO-DO-TOKEN');
    expect(service.getSentMessages()).toHaveLength(0);
  });

  it('fora de produção mantém o comportamento de dev/teste (imprime e guarda para os testes)', async () => {
    process.env.NODE_ENV = 'test';
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const service = new ConsoleEmailService();
    await service.send({ to: 'a@b.com', subject: 's', text: 'corpo' });
    expect(service.getSentMessages()).toHaveLength(1);
  });
});
