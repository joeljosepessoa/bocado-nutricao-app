import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import type { IncomingMessage } from 'http';
import { AppModule } from './app.module';
import { JsonLoggerService } from './common/logging/json-logger.service';
import { checkRuntimeConfig, parseTrustProxy } from './common/config/runtime-config';

// JSON estruturado em produção (para um coletor de log indexar); texto
// colorido do ConsoleLogger padrão do Nest em dev/teste — sem mudar nada
// além do formato da linha de log.
const useJsonLogs = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

const BODY_SIZE_LIMIT = '1mb';

async function bootstrap() {
  // bodyParser:false + parser manual abaixo: é a única forma de trocar o
  // limite de tamanho do corpo no Express (o parser default do Nest já
  // roda dentro de NestFactory.create e prevaleceria sobre qualquer
  // app.use(json(...)) registrado depois).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: useJsonLogs ? new JsonLoggerService() : undefined,
    bodyParser: false,
  });

  // Configuração de produção: erros impedem o boot (segredo de exemplo, CORS em
  // localhost, webhook sem segredo); avisos listam o que ainda está simulado.
  const config = app.get(ConfigService);
  const report = checkRuntimeConfig((key) => config.get<string>(key));
  const logger = new Logger('Bootstrap');
  report.warnings.forEach((warning) => logger.warn(warning));
  if (report.errors.length > 0) {
    report.errors.forEach((error) => logger.error(error));
    await app.close();
    throw new Error(`Configuração de produção inválida (${report.errors.length} erro(s)) — veja os logs acima.`);
  }

  // Atrás de proxy/load balancer, sem isto req.ip é o do proxy: o rate limit
  // passa a ser compartilhado por todos os usuários e a auditoria grava o IP errado.
  const trustProxy = parseTrustProxy(config.get<string>('TRUST_PROXY'));
  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy);
  }

  app.use(helmet());
  app.use(cookieParser());
  // `verify` guarda o corpo cru em req.rawBody — o webhook de cobrança
  // (Fase 22) precisa dos bytes exatos para validar a assinatura HMAC
  // (reparsear o JSON e reserializar não garante byte-a-byte idêntico).
  app.use(
    json({
      limit: BODY_SIZE_LIMIT,
      verify: (req: IncomingMessage & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: BODY_SIZE_LIMIT }));

  // credentials:true + lista explícita de origens (nunca "*") — obrigatório
  // para o cookie HttpOnly de refresh do painel web (Fase 9) funcionar
  // entre origens diferentes (professional-web em uma porta/domínio,
  // backend em outra).
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',');
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
