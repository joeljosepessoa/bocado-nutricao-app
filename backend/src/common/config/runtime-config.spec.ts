import { checkRuntimeConfig, parseTrustProxy } from './runtime-config';

const getter = (env: Record<string, string>) => (key: string) => env[key];
const goodProd = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
  DATABASE_URL: 'postgresql://u:p@db:5432/bocado',
  CORS_ORIGIN: 'https://painel.exemplo.com.br',
};

describe('checkRuntimeConfig', () => {
  it('fora de produção não exige nada (dev/teste continuam livres)', () => {
    expect(checkRuntimeConfig(getter({}))).toEqual({ errors: [], warnings: [] });
    expect(checkRuntimeConfig(getter({ NODE_ENV: 'test', JWT_ACCESS_SECRET: 'curto' })).errors).toEqual([]);
  });

  it('produção com configuração mínima válida não tem erros (só avisos de modo simulado)', () => {
    const report = checkRuntimeConfig(getter(goodProd));
    expect(report.errors).toEqual([]);
    expect(report.warnings.join(' ')).toMatch(/mock/i);
  });

  it('recusa JWT_ACCESS_SECRET ausente, curto ou de exemplo', () => {
    for (const secret of [undefined, 'curto', 'troque-por-um-segredo-gerado']) {
      const env: Record<string, string> = { ...goodProd };
      if (secret === undefined) delete env.JWT_ACCESS_SECRET;
      else env.JWT_ACCESS_SECRET = secret;
      expect(checkRuntimeConfig(getter(env)).errors.join(' ')).toMatch(/JWT_ACCESS_SECRET/);
    }
  });

  it('recusa CORS_ORIGIN ausente ou com localhost, e DATABASE_URL ausente', () => {
    expect(checkRuntimeConfig(getter({ ...goodProd, CORS_ORIGIN: 'http://localhost:5173' })).errors.join(' ')).toMatch(/CORS_ORIGIN/);
    const noCors = { ...goodProd } as Record<string, string>;
    delete noCors.CORS_ORIGIN;
    expect(checkRuntimeConfig(getter(noCors)).errors.join(' ')).toMatch(/CORS_ORIGIN/);
    const noDb = { ...goodProd } as Record<string, string>;
    delete noDb.DATABASE_URL;
    expect(checkRuntimeConfig(getter(noDb)).errors.join(' ')).toMatch(/DATABASE_URL/);
  });

  it('mercadopago sem MERCADOPAGO_WEBHOOK_SECRET é erro; com o segredo, não', () => {
    const base = { ...goodProd, PAYMENT_GATEWAY_PROVIDER: 'mercadopago' };
    expect(checkRuntimeConfig(getter(base)).errors.join(' ')).toMatch(/MERCADOPAGO_WEBHOOK_SECRET/);
    expect(checkRuntimeConfig(getter({ ...base, MERCADOPAGO_WEBHOOK_SECRET: 'x' })).errors).toEqual([]);
  });

  it('avisa sobre PASSWORD_RESET_URL, storage local, TRUST_PROXY e provedores simulados', () => {
    const w = checkRuntimeConfig(getter(goodProd)).warnings.join(' | ');
    for (const k of ['PASSWORD_RESET_URL', 'EMAIL_PROVIDER=console', 'STORAGE_PROVIDER=local', 'TRUST_PROXY', 'AI_PROVIDER=mock-local', 'ERROR_TRACKING_PROVIDER']) {
      expect(w).toContain(k);
    }
  });

  it('configuração totalmente real não gera avisos', () => {
    const env = {
      ...goodProd,
      PASSWORD_RESET_URL: 'https://painel.exemplo.com.br/reset-password',
      PAYMENT_GATEWAY_PROVIDER: 'mercadopago',
      MERCADOPAGO_WEBHOOK_SECRET: 'x',
      EMAIL_PROVIDER: 'smtp',
      STORAGE_PROVIDER: 's3',
      ERROR_TRACKING_PROVIDER: 'sentry',
      AI_PROVIDER: 'openai',
      TRUST_PROXY: '1',
    };
    expect(checkRuntimeConfig(getter(env))).toEqual({ errors: [], warnings: [] });
  });
});

describe('parseTrustProxy', () => {
  it('interpreta vazio, booleanos, número de hops e lista', () => {
    expect(parseTrustProxy(undefined)).toBeUndefined();
    expect(parseTrustProxy('  ')).toBeUndefined();
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('loopback,10.0.0.0/8')).toBe('loopback,10.0.0.0/8');
  });
});
