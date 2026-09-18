import { ConfigService } from '@nestjs/config';
import { RecurrenceInterval } from '@prisma/client';
import { MercadoPagoPaymentGatewayService } from './mercadopago-payment-gateway.service';

function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('MercadoPagoPaymentGatewayService', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('recusa construir sem MERCADOPAGO_ACCESS_TOKEN — falha no boot, não na primeira chamada', () => {
    expect(() => new MercadoPagoPaymentGatewayService(configWith({}))).toThrow(/MERCADOPAGO_ACCESS_TOKEN/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('createOneTimeCheckout: chama POST /checkout/preferences com Authorization Bearer e converte a resposta', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(201, { id: 'pref_123', init_point: 'https://www.mercadopago.com/checkout/pref_123' }),
    );
    const service = new MercadoPagoPaymentGatewayService(configWith({ MERCADOPAGO_ACCESS_TOKEN: 'TEST-token' }));

    const result = await service.createOneTimeCheckout({
      amountCents: 25_900,
      description: 'Acompanhamento 3 meses',
      externalReference: 'link-abc',
    });

    expect(result).toEqual({ externalId: 'pref_123', checkoutUrl: 'https://www.mercadopago.com/checkout/pref_123' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer TEST-token');
    const body = JSON.parse(init.body);
    expect(body.items[0].unit_price).toBeCloseTo(259.0);
    expect(body.items[0].title).toBe('Acompanhamento 3 meses');
    expect(body.external_reference).toBe('link-abc');
  });

  it('createOneTimeCheckout: resposta sem id/init_point é rejeitada', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(201, {}));
    const service = new MercadoPagoPaymentGatewayService(configWith({ MERCADOPAGO_ACCESS_TOKEN: 'TEST-token' }));

    await expect(
      service.createOneTimeCheckout({ amountCents: 1000, description: 'x', externalReference: 'y' }),
    ).rejects.toThrow(/sem id\/init_point/);
  });

  it('createOneTimeCheckout: HTTP não-2xx do Mercado Pago vira erro claro, sem vazar o token', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(400, { message: 'invalid_collector_id' }));
    const service = new MercadoPagoPaymentGatewayService(configWith({ MERCADOPAGO_ACCESS_TOKEN: 'TEST-segredo-nao-vazar' }));

    await expect(
      service.createOneTimeCheckout({ amountCents: 1000, description: 'x', externalReference: 'y' }),
    ).rejects.toThrow(/retornou 400/);

    try {
      await service.createOneTimeCheckout({ amountCents: 1000, description: 'x', externalReference: 'y' });
    } catch (error) {
      expect(String((error as Error).message)).not.toContain('TEST-segredo-nao-vazar');
    }
  });

  it('createOneTimeCheckout: falha de rede (fetch rejeita) vira erro claro, sem vazar o token', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));
    const service = new MercadoPagoPaymentGatewayService(configWith({ MERCADOPAGO_ACCESS_TOKEN: 'TEST-segredo-nao-vazar' }));

    await expect(
      service.createOneTimeCheckout({ amountCents: 1000, description: 'x', externalReference: 'y' }),
    ).rejects.toThrow(/Falha de rede/);
  });

  it('createRecurringCheckout: chama POST /preapproval com payer_email, auto_recurring e converte a resposta', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(201, {
        id: 'preapproval_123',
        init_point: 'https://www.mercadopago.com/subscriptions/checkout?preapproval_id=preapproval_123',
      }),
    );
    const service = new MercadoPagoPaymentGatewayService(configWith({ MERCADOPAGO_ACCESS_TOKEN: 'TEST-token' }));

    const result = await service.createRecurringCheckout({
      amountCents: 9990,
      description: 'Acompanhamento mensal',
      externalReference: 'link-xyz',
      recurrenceInterval: RecurrenceInterval.month,
      payerEmail: 'cliente@example.com',
    });

    expect(result).toEqual({
      externalId: 'preapproval_123',
      checkoutUrl: 'https://www.mercadopago.com/subscriptions/checkout?preapproval_id=preapproval_123',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/preapproval');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer TEST-token');
    const body = JSON.parse(init.body);
    expect(body.payer_email).toBe('cliente@example.com');
    expect(body.external_reference).toBe('link-xyz');
    expect(body.auto_recurring).toEqual({
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 99.9,
      currency_id: 'BRL',
    });
  });

  it('createRecurringCheckout: RecurrenceInterval.year vira frequency=12 com frequency_type "months" (único valor confirmado na documentação)', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(201, { id: 'preapproval_456', init_point: 'https://www.mercadopago.com/subscriptions/checkout?preapproval_id=preapproval_456' }),
    );
    const service = new MercadoPagoPaymentGatewayService(configWith({ MERCADOPAGO_ACCESS_TOKEN: 'TEST-token' }));

    await service.createRecurringCheckout({
      amountCents: 99_900,
      description: 'Acompanhamento anual',
      externalReference: 'link-anual',
      recurrenceInterval: RecurrenceInterval.year,
      payerEmail: 'cliente@example.com',
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.auto_recurring.frequency).toBe(12);
    expect(body.auto_recurring.frequency_type).toBe('months');
  });

  it('createRecurringCheckout: resposta sem id/init_point é rejeitada', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(201, {}));
    const service = new MercadoPagoPaymentGatewayService(configWith({ MERCADOPAGO_ACCESS_TOKEN: 'TEST-token' }));

    await expect(
      service.createRecurringCheckout({
        amountCents: 9990,
        description: 'x',
        externalReference: 'y',
        recurrenceInterval: RecurrenceInterval.month,
        payerEmail: 'cliente@example.com',
      }),
    ).rejects.toThrow(/sem id\/init_point/);
  });

  it('createRecurringCheckout: HTTP não-2xx vira erro claro, sem vazar payerEmail nem token', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(400, { message: 'invalid_payer_email' }));
    const service = new MercadoPagoPaymentGatewayService(
      configWith({ MERCADOPAGO_ACCESS_TOKEN: 'TEST-segredo-nao-vazar' }),
    );

    try {
      await service.createRecurringCheckout({
        amountCents: 9990,
        description: 'x',
        externalReference: 'y',
        recurrenceInterval: RecurrenceInterval.month,
        payerEmail: 'cliente-secreto@example.com',
      });
      throw new Error('deveria ter lançado');
    } catch (error) {
      const message = String((error as Error).message);
      expect(message).not.toContain('TEST-segredo-nao-vazar');
      expect(message).not.toContain('cliente-secreto@example.com');
    }
  });

  it('nextPeriodEnd: cálculo puro, sem chamar rede (month +1 mês, year +1 ano)', () => {
    const service = new MercadoPagoPaymentGatewayService(configWith({ MERCADOPAGO_ACCESS_TOKEN: 'TEST-token' }));
    const from = new Date('2026-01-15T00:00:00.000Z');

    expect(service.nextPeriodEnd(from, 'month' as never).getUTCMonth()).toBe(1);
    expect(service.nextPeriodEnd(from, 'year' as never).getUTCFullYear()).toBe(2027);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('métodos do SaaS (Fase 22) fora de escopo desta fase lançam erro claro em vez de simular sucesso', async () => {
    const service = new MercadoPagoPaymentGatewayService(configWith({ MERCADOPAGO_ACCESS_TOKEN: 'TEST-token' }));
    await expect(service.createCustomer('prof-1', 'a@b.com')).rejects.toThrow(/MockPaymentGatewayService/);
    await expect(service.createSubscription('cus-1', 'plan-1')).rejects.toThrow(/MockPaymentGatewayService/);
    await expect(service.cancelSubscription('sub-1')).rejects.toThrow(/MockPaymentGatewayService/);
    await expect(service.charge('sub-1', 1000)).rejects.toThrow(/MockPaymentGatewayService/);
    expect(() => service.signWebhookPayload('{}')).toThrow(/Fase 23.6/);
    expect(() => service.verifyWebhookSignature('{}', 'sig')).toThrow(/Fase 23.6/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
