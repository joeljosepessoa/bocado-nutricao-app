import { ConfigService } from '@nestjs/config';
import { MockPaymentGatewayService } from './mock-payment-gateway.service';
import { MercadoPagoPaymentGatewayService } from './mercadopago-payment-gateway.service';

/**
 * Replica exatamente a factory de billing.module.ts em vez de subir o
 * módulo Nest inteiro — mesmo raciocínio de storage/gateway-selection
 * (storage.module.spec.ts, Fase 20): o que se quer comprovar é só a regra
 * de seleção por PAYMENT_GATEWAY_PROVIDER, sem arrastar PrismaModule/
 * ScheduleModule/etc.
 */
const VALID_PROVIDERS = ['mock', 'mercadopago'] as const;

function selectGateway(config: ConfigService) {
  const provider = config.get<string>('PAYMENT_GATEWAY_PROVIDER') ?? 'mock';
  if (!VALID_PROVIDERS.includes(provider as (typeof VALID_PROVIDERS)[number])) {
    throw new Error(`PAYMENT_GATEWAY_PROVIDER inválido: "${provider}". Use "mock" ou "mercadopago".`);
  }
  return provider === 'mercadopago' ? new MercadoPagoPaymentGatewayService(config) : new MockPaymentGatewayService(config);
}

function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('Seleção de PaymentGatewayService (Fase 23.4)', () => {
  it('sem PAYMENT_GATEWAY_PROVIDER definido, usa MockPaymentGatewayService (default)', () => {
    const gateway = selectGateway(configWith({}));
    expect(gateway).toBeInstanceOf(MockPaymentGatewayService);
  });

  it('PAYMENT_GATEWAY_PROVIDER=mock usa MockPaymentGatewayService', () => {
    const gateway = selectGateway(configWith({ PAYMENT_GATEWAY_PROVIDER: 'mock' }));
    expect(gateway).toBeInstanceOf(MockPaymentGatewayService);
  });

  it('PAYMENT_GATEWAY_PROVIDER=mercadopago usa MercadoPagoPaymentGatewayService (com token configurado)', () => {
    const gateway = selectGateway(
      configWith({ PAYMENT_GATEWAY_PROVIDER: 'mercadopago', MERCADOPAGO_ACCESS_TOKEN: 'TEST-token' }),
    );
    expect(gateway).toBeInstanceOf(MercadoPagoPaymentGatewayService);
  });

  it('PAYMENT_GATEWAY_PROVIDER=mercadopago sem MERCADOPAGO_ACCESS_TOKEN falha de forma clara, não em silêncio', () => {
    expect(() => selectGateway(configWith({ PAYMENT_GATEWAY_PROVIDER: 'mercadopago' }))).toThrow(
      /MERCADOPAGO_ACCESS_TOKEN/,
    );
  });

  it('valor inválido de PAYMENT_GATEWAY_PROVIDER falha explicitamente — nunca cai em mock por padrão', () => {
    expect(() => selectGateway(configWith({ PAYMENT_GATEWAY_PROVIDER: 'stripe' }))).toThrow(
      /PAYMENT_GATEWAY_PROVIDER inválido/,
    );
  });
});
