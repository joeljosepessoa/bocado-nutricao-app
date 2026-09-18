process.env.AUTH_THROTTLE_LIMIT = '1000';
process.env.AI_GENERATE_THROTTLE_LIMIT = '1000';
// Só para os testes e2e do webhook do Mercado Pago (Fase 23.5) — nunca um
// valor real; PAYMENT_GATEWAY_PROVIDER continua "mock" (default), então
// nenhuma rede real é usada, só a validação de assinatura em si.
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mercadopago-webhook-secret-e2e';
