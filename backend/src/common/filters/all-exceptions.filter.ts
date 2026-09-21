import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorTrackingService } from '../../error-tracking/error-tracking.service';

// O middleware `json()`/`urlencoded()` do Express (ver main.ts, limite de
// corpo da Fase 21) rejeita corpo grande demais com um Error simples que
// carrega `.type === 'entity.too.large'` — não é um HttpException do Nest,
// então sem este caso especial caía no branch de erro inesperado (500).
function isPayloadTooLargeError(exception: unknown): boolean {
  return exception instanceof Error && (exception as { type?: string }).type === 'entity.too.large';
}

// O Nest 10 só traduz uma lista fixa de mensagens do multer (multer.utils.transformException).
// Códigos mais novos do multer 2.x (LIMIT_FIELD_NESTING, LIMIT_FIELD_ARRAY_INDEX...) chegariam
// aqui como MulterError cru e virariam 500 + alerta no error tracking, embora sejam sempre falha
// do cliente (multipart fora dos limites do endpoint). A mensagem é fixa: nunca ecoa nome de campo.
function isMulterError(exception: unknown): exception is Error & { code: string } {
  return (
    exception instanceof Error &&
    exception.name === 'MulterError' &&
    typeof (exception as { code?: unknown }).code === 'string'
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly errorTracking: ErrorTrackingService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method?: string; url?: string }>();

    const isHttpException = exception instanceof HttpException;
    const isPayloadTooLarge = !isHttpException && isPayloadTooLargeError(exception);
    const multerError = !isHttpException && isMulterError(exception) ? exception : null;
    const isClientError = isPayloadTooLarge || multerError !== null;

    const status = isHttpException
      ? exception.getStatus()
      : isPayloadTooLarge || multerError?.code === 'LIMIT_FILE_SIZE'
        ? HttpStatus.PAYLOAD_TOO_LARGE
        : multerError
          ? HttpStatus.BAD_REQUEST
          : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = isHttpException
      ? exception.getResponse()
      : isPayloadTooLarge
        ? 'Corpo da requisição excede o tamanho máximo permitido.'
        : multerError
          ? multerError.code === 'LIMIT_FILE_SIZE'
            ? 'Arquivo maior que o limite permitido.'
            : 'Requisição multipart inválida ou fora dos limites permitidos.'
          : 'Erro interno inesperado.';

    if (!isHttpException && !isClientError) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
      this.errorTracking.captureException(exception, { method: request.method, url: request.url });
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message: typeof message === 'string' ? message : (message as any).message ?? message,
    });
  }
}
