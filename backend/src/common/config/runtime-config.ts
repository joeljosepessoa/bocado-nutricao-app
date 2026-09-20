export interface RuntimeConfigReport {
  /** Impedem o boot em produção (segurança/funcionamento). */
  errors: string[];
  /** O sistema sobe, mas alguma parte está em modo simulado/inseguro para produção. */
  warnings: string[];
}

type Getter = (key: string) => string | undefined;

const PLACEHOLDER_SECRETS = new Set(['troque-por-um-segredo-gerado', 'ci-secret-nao-usar-em-producao', 'changeme', 'secret']);
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Confere a configuração ao subir em NODE_ENV=production. Fora de produção
 * devolve vazio (dev/teste continuam livres). Não conhece o Nest: recebe um
 * getter (ConfigService ou process.env), o que a torna testável.
 */
export function checkRuntimeConfig(get: Getter): RuntimeConfigReport {
  const report: RuntimeConfigReport = { errors: [], warnings: [] };
  if (get('NODE_ENV') !== 'production') {
    return report;
  }

  const secret = get('JWT_ACCESS_SECRET') ?? '';
  if (secret.length < MIN_JWT_SECRET_LENGTH || PLACEHOLDER_SECRETS.has(secret)) {
    report.errors.push(
      `JWT_ACCESS_SECRET ausente, curto (< ${MIN_JWT_SECRET_LENGTH} caracteres) ou é um valor de exemplo — gere um segredo aleatório.`,
    );
  }

  if (!get('DATABASE_URL')) {
    report.errors.push('DATABASE_URL não definida.');
  }

  const cors = get('CORS_ORIGIN');
  if (!cors || cors.split(',').some((origin) => /localhost|127\.0\.0\.1/.test(origin))) {
    report.errors.push('CORS_ORIGIN ausente ou apontando para localhost — informe a(s) origem(ns) reais do painel web.');
  }

  if ((get('PAYMENT_GATEWAY_PROVIDER') ?? 'mock') === 'mercadopago' && !get('MERCADOPAGO_WEBHOOK_SECRET')) {
    report.errors.push('PAYMENT_GATEWAY_PROVIDER=mercadopago exige MERCADOPAGO_WEBHOOK_SECRET (sem ele todo webhook é rejeitado).');
  }

  // Storage local só é seguro num caminho ABSOLUTO (o volume montado): o padrão relativo
  // ("../storage") cai dentro da camada do container e se perde a cada recriação.
  if ((get('STORAGE_PROVIDER') ?? 'local') === 'local' && !/^(\/|[A-Za-z]:[\\/])/.test(get('STORAGE_LOCAL_DIR') ?? '')) {
    report.errors.push(
      'STORAGE_LOCAL_DIR ausente ou relativo: com STORAGE_PROVIDER=local aponte para o caminho absoluto de um volume persistente (ex.: /data/storage) ou use STORAGE_PROVIDER=s3.',
    );
  }

  if (!get('PASSWORD_RESET_URL')) {
    report.warnings.push('PASSWORD_RESET_URL não definida: o link de redefinição de senha apontará para localhost.');
  }
  if ((get('PAYMENT_GATEWAY_PROVIDER') ?? 'mock') === 'mock') {
    report.warnings.push('PAYMENT_GATEWAY_PROVIDER=mock: cobranças SIMULADAS (nenhum pagamento real).');
  }
  if ((get('EMAIL_PROVIDER') ?? 'console') === 'console') {
    report.warnings.push('EMAIL_PROVIDER=console: e-mails (incl. redefinição de senha) NÃO são enviados — configure EMAIL_PROVIDER=smtp.');
  }
  if ((get('STORAGE_PROVIDER') ?? 'local') === 'local') {
    report.warnings.push('STORAGE_PROVIDER=local: exige volume persistente; em ambiente efêmero fotos, PDFs e GIFs se perdem.');
  }
  if ((get('ERROR_TRACKING_PROVIDER') ?? 'console') === 'console') {
    report.warnings.push('ERROR_TRACKING_PROVIDER=console: erros só vão para o log (sem Sentry).');
  }
  if ((get('AI_PROVIDER') ?? 'mock-local') === 'mock-local') {
    report.warnings.push('AI_PROVIDER=mock-local: IA simulada (nenhum provedor real).');
  }
  if (!get('TRUST_PROXY')) {
    report.warnings.push('TRUST_PROXY não definido: atrás de proxy/load balancer o rate limit e os IPs de auditoria usarão o IP do proxy.');
  }
  return report;
}

/** `true`/`false`, número de hops ("1") ou lista/keywords do Express ("loopback,10.0.0.0/8"). Vazio = não configurar. */
export function parseTrustProxy(raw: string | undefined): boolean | number | string | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
