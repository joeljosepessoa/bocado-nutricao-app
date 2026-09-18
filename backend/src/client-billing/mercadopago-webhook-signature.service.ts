import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export interface MercadoPagoSignatureInput {
  /** `data.id` da query string do webhook — não normalizado ainda (a normalização, minúsculas, acontece aqui dentro). */
  dataId?: string;
  /** Header `x-request-id`. */
  requestId?: string;
  /** Header `x-signature` completo (`ts=...,v1=...`). */
  xSignature?: string;
}

/**
 * Validação de assinatura de webhook do Mercado Pago (Fase 23.5) —
 * deliberadamente FORA de PaymentGatewayService: o esquema (manifest
 * `id:{data.id};request-id:{x-request-id};ts:{ts};`, HMAC-SHA256 sobre
 * isso, nunca sobre o corpo) é específico deste provedor e não
 * generaliza para "qualquer gateway de pagamento" — é sobre COMO
 * recebemos eventos deste remetente, não sobre criar/consultar recursos
 * de pagamento. Confirmado contra a documentação oficial (referência de
 * notificações Webhooks) na Fase 23.
 *
 * `MERCADOPAGO_WEBHOOK_SECRET` é deliberadamente separado de
 * `PAYMENT_WEBHOOK_SECRET` (usado só pelo HMAC-sobre-corpo do mock,
 * Fase 22/23.3) — esquemas incompatíveis, nomes de variável diferentes.
 *
 * Falha lazy (no `verify()`, não no construtor): este serviço é sempre
 * instanciado, mesmo quando PAYMENT_GATEWAY_PROVIDER=mock (o endpoint do
 * webhook existe independente do provider ativo) — um `MERCADOPAGO_
 * WEBHOOK_SECRET` ausente não pode derrubar o boot da aplicação inteira.
 */
@Injectable()
export class MercadoPagoWebhookSignatureService {
  constructor(private readonly config: ConfigService) {}

  private getSecret(): string {
    const secret = this.config.get<string>('MERCADOPAGO_WEBHOOK_SECRET');
    if (!secret) {
      throw new Error('MERCADOPAGO_WEBHOOK_SECRET não configurado — necessário para validar webhooks do Mercado Pago.');
    }
    return secret;
  }

  /** true só se a assinatura bate — qualquer problema (secret ausente, header malformado, ts/v1 faltando) resulta em false, nunca lança. */
  verify(input: MercadoPagoSignatureInput): boolean {
    if (!input.dataId || !input.xSignature) {
      return false;
    }

    let secret: string;
    try {
      secret = this.getSecret();
    } catch {
      return false;
    }

    const { ts, v1 } = this.parseXSignature(input.xSignature);
    if (!ts || !v1) {
      return false;
    }

    const parts: string[] = [`id:${input.dataId.toLowerCase()}`];
    if (input.requestId) {
      parts.push(`request-id:${input.requestId}`);
    }
    parts.push(`ts:${ts}`);
    const manifest = `${parts.join(';')};`;

    const expectedHex = createHmac('sha256', secret).update(manifest).digest('hex');
    return this.timingSafeEqualHex(expectedHex, v1);
  }

  private parseXSignature(header: string): { ts?: string; v1?: string } {
    const result: { ts?: string; v1?: string } = {};
    for (const part of header.split(',')) {
      const [key, value] = part.split('=').map((s) => s?.trim());
      if (key === 'ts' && value) result.ts = value;
      if (key === 'v1' && value) result.v1 = value;
    }
    return result;
  }

  private timingSafeEqualHex(expectedHex: string, receivedHex: string): boolean {
    let expected: Buffer;
    let received: Buffer;
    try {
      expected = Buffer.from(expectedHex, 'hex');
      received = Buffer.from(receivedHex, 'hex');
    } catch {
      return false;
    }
    if (expected.length === 0 || expected.length !== received.length) {
      return false;
    }
    return timingSafeEqual(expected, received);
  }
}
