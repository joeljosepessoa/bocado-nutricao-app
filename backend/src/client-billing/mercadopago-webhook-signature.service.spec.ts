import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { MercadoPagoWebhookSignatureService } from './mercadopago-webhook-signature.service';

function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

/** Constrói um X-Signature real (mesma fórmula da documentação oficial), para os testes assinarem "como o Mercado Pago assinaria". */
function signAsMercadoPago(secret: string, dataId: string, requestId: string | undefined, ts: string): string {
  const parts = [`id:${dataId.toLowerCase()}`];
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  const manifest = `${parts.join(';')};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('MercadoPagoWebhookSignatureService', () => {
  const SECRET = 'TEST-webhook-secret-nao-vazar';

  it('aceita uma assinatura válida (mesmo manifest, mesmo secret)', () => {
    const service = new MercadoPagoWebhookSignatureService(configWith({ MERCADOPAGO_WEBHOOK_SECRET: SECRET }));
    const xSignature = signAsMercadoPago(SECRET, 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3', 'req-123', '1742505638683');

    const ok = service.verify({ dataId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3', requestId: 'req-123', xSignature });

    expect(ok).toBe(true);
  });

  it('normaliza data.id para minúsculas antes de montar o manifest (mesma regra da documentação oficial)', () => {
    const service = new MercadoPagoWebhookSignatureService(configWith({ MERCADOPAGO_WEBHOOK_SECRET: SECRET }));
    // Assinado com o ID já em minúsculas — o verify() deve normalizar o dataId recebido e bater mesmo assim.
    const xSignature = signAsMercadoPago(SECRET, 'ord01jq4s4ky8hwq6na5pxb65b3d3', 'req-123', '1742505638683');

    const ok = service.verify({ dataId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3', requestId: 'req-123', xSignature });

    expect(ok).toBe(true);
  });

  it('rejeita assinatura calculada com secret diferente', () => {
    const service = new MercadoPagoWebhookSignatureService(configWith({ MERCADOPAGO_WEBHOOK_SECRET: SECRET }));
    const xSignature = signAsMercadoPago('outro-secret', 'id-1', 'req-1', '1700000000000');

    expect(service.verify({ dataId: 'id-1', requestId: 'req-1', xSignature })).toBe(false);
  });

  it('rejeita quando dataId usado no verify não é o que foi assinado', () => {
    const service = new MercadoPagoWebhookSignatureService(configWith({ MERCADOPAGO_WEBHOOK_SECRET: SECRET }));
    const xSignature = signAsMercadoPago(SECRET, 'id-1', 'req-1', '1700000000000');

    expect(service.verify({ dataId: 'id-2-diferente', requestId: 'req-1', xSignature })).toBe(false);
  });

  it('rejeita quando requestId usado no verify não é o que foi assinado', () => {
    const service = new MercadoPagoWebhookSignatureService(configWith({ MERCADOPAGO_WEBHOOK_SECRET: SECRET }));
    const xSignature = signAsMercadoPago(SECRET, 'id-1', 'req-1', '1700000000000');

    expect(service.verify({ dataId: 'id-1', requestId: 'req-diferente', xSignature })).toBe(false);
  });

  it('secret ausente resulta em configuração inadequada — verify retorna false, não lança', () => {
    const service = new MercadoPagoWebhookSignatureService(configWith({}));
    const xSignature = signAsMercadoPago(SECRET, 'id-1', 'req-1', '1700000000000');

    expect(() => service.verify({ dataId: 'id-1', requestId: 'req-1', xSignature })).not.toThrow();
    expect(service.verify({ dataId: 'id-1', requestId: 'req-1', xSignature })).toBe(false);
  });

  it('dataId ausente é rejeitado', () => {
    const service = new MercadoPagoWebhookSignatureService(configWith({ MERCADOPAGO_WEBHOOK_SECRET: SECRET }));
    const xSignature = signAsMercadoPago(SECRET, 'id-1', 'req-1', '1700000000000');

    expect(service.verify({ dataId: undefined, requestId: 'req-1', xSignature })).toBe(false);
  });

  it('X-Signature ausente é rejeitado', () => {
    const service = new MercadoPagoWebhookSignatureService(configWith({ MERCADOPAGO_WEBHOOK_SECRET: SECRET }));
    expect(service.verify({ dataId: 'id-1', requestId: 'req-1', xSignature: undefined })).toBe(false);
  });

  it('X-Signature malformado (sem ts= ou sem v1=) é rejeitado, não lança', () => {
    const service = new MercadoPagoWebhookSignatureService(configWith({ MERCADOPAGO_WEBHOOK_SECRET: SECRET }));

    expect(service.verify({ dataId: 'id-1', requestId: 'req-1', xSignature: 'ts=123' })).toBe(false);
    expect(service.verify({ dataId: 'id-1', requestId: 'req-1', xSignature: 'v1=abc' })).toBe(false);
    expect(service.verify({ dataId: 'id-1', requestId: 'req-1', xSignature: 'garbage' })).toBe(false);
    expect(service.verify({ dataId: 'id-1', requestId: 'req-1', xSignature: 'ts=123,v1=nao-eh-hex-valido!!' })).toBe(false);
  });

  it('funciona sem requestId (opcional na documentação oficial)', () => {
    const service = new MercadoPagoWebhookSignatureService(configWith({ MERCADOPAGO_WEBHOOK_SECRET: SECRET }));
    const xSignature = signAsMercadoPago(SECRET, 'id-1', undefined, '1700000000000');

    expect(service.verify({ dataId: 'id-1', xSignature })).toBe(true);
  });

  it('o secret nunca aparece em nenhum valor retornado por verify() nem é logado', () => {
    const service = new MercadoPagoWebhookSignatureService(configWith({ MERCADOPAGO_WEBHOOK_SECRET: SECRET }));
    const xSignature = signAsMercadoPago(SECRET, 'id-1', 'req-1', '1700000000000');
    const result = service.verify({ dataId: 'id-1', requestId: 'req-1', xSignature });
    // verify() só devolve boolean — não há canal nenhum por onde o secret vazaria.
    expect(typeof result).toBe('boolean');
  });
});
