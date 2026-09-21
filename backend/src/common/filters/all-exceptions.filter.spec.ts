import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function multerError(code: string, message = 'msg do multer com o campo secreto-do-usuario'): Error {
  const error = new Error(message) as Error & { code: string; field?: string };
  error.name = 'MulterError';
  error.code = code;
  error.field = 'secreto-do-usuario';
  return error;
}

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({ method: 'POST', url: '/x' }) }),
  } as unknown as ArgumentsHost;
  const errorTracking = { captureException: jest.fn() };
  new AllExceptionsFilter(errorTracking as never).catch(exception, host);
  return { status: status.mock.calls[0][0] as number, body: json.mock.calls[0][0], errorTracking };
}

describe('AllExceptionsFilter', () => {
  it('HttpException do Nest passa como está, sem alerta', () => {
    const { status, body, errorTracking } = run(new NotFoundException('não achei'));
    expect(status).toBe(404);
    expect(body.message).toBe('não achei');
    expect(errorTracking.captureException).not.toHaveBeenCalled();
    expect(run(new BadRequestException('x')).status).toBe(400);
  });

  it('erro inesperado vira 500 genérico, sem vazar detalhe, e é enviado ao error tracking', () => {
    const { status, body, errorTracking } = run(new Error('detalhe interno com senha=123'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/senha|detalhe interno/);
    expect(errorTracking.captureException).toHaveBeenCalledTimes(1);
  });

  it('corpo grande demais do body-parser (entity.too.large) vira 413 sem alerta', () => {
    const error = Object.assign(new Error('too large'), { type: 'entity.too.large' });
    const { status, errorTracking } = run(error);
    expect(status).toBe(413);
    expect(errorTracking.captureException).not.toHaveBeenCalled();
  });

  describe('MulterError que o Nest 10 não traduz', () => {
    it.each(['LIMIT_FIELD_NESTING', 'LIMIT_FIELD_ARRAY_INDEX', 'INVALID_FIELD_NAME', 'STREAM_DESTROYED'])(
      '%s vira 400, sem alerta e sem ecoar nome de campo nem mensagem interna',
      (code) => {
        const { status, body, errorTracking } = run(multerError(code));
        expect(status).toBe(400);
        expect(body.message).toBe('Requisição multipart inválida ou fora dos limites permitidos.');
        expect(JSON.stringify(body)).not.toMatch(/secreto-do-usuario|multer/);
        expect(errorTracking.captureException).not.toHaveBeenCalled();
      },
    );

    it('LIMIT_FILE_SIZE vira 413', () => {
      const { status, body, errorTracking } = run(multerError('LIMIT_FILE_SIZE'));
      expect(status).toBe(413);
      expect(body.message).toBe('Arquivo maior que o limite permitido.');
      expect(errorTracking.captureException).not.toHaveBeenCalled();
    });

    it('um Error comum com name "MulterError" mas sem code continua sendo 500 (não é do multer)', () => {
      const error = new Error('x');
      error.name = 'MulterError';
      expect(run(error).status).toBe(500);
    });
  });
});
