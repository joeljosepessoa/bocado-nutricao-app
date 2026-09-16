import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(cookieParser());

  // credentials:true + lista explícita de origens (nunca "*") — obrigatório
  // para o cookie HttpOnly de refresh do painel web (Fase 9) funcionar
  // entre origens diferentes (professional-web em uma porta/domínio,
  // backend em outra).
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',');
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
