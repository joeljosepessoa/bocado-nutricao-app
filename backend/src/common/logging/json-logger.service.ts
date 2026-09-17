import { LoggerService, LogLevel } from '@nestjs/common';

interface JsonLogEntry {
  timestamp: string;
  level: LogLevel;
  context?: string;
  message: string;
  stack?: string;
}

/**
 * Logger em JSON (uma linha por evento) — formato que um coletor de log de
 * produção (CloudWatch, Datadog, Loki etc.) sabe indexar/filtrar por campo,
 * ao contrário do texto colorido do ConsoleLogger padrão do Nest (bom para
 * `npm run start:dev`, ruim para produção). Ativado só quando
 * LOG_FORMAT=json ou NODE_ENV=production (ver main.ts); em dev/teste o
 * comportamento de log continua exatamente o mesmo de antes.
 */
export class JsonLoggerService implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const [stack, context] = this.splitErrorParams(optionalParams);
    this.write('error', message, [], context, stack);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  private splitErrorParams(optionalParams: unknown[]): [string | undefined, string | undefined] {
    // Nest chama error(message, stack, context) OU error(message, context) —
    // não dá para distinguir com certeza, então tratamos o último como
    // contexto (convenção do próprio Nest) e, se houver um segundo, como stack.
    if (optionalParams.length >= 2) {
      return [String(optionalParams[0]), String(optionalParams[1])];
    }
    if (optionalParams.length === 1) {
      return [undefined, String(optionalParams[0])];
    }
    return [undefined, undefined];
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[], context?: string, stack?: string): void {
    const resolvedContext = context ?? (typeof optionalParams[optionalParams.length - 1] === 'string'
      ? (optionalParams[optionalParams.length - 1] as string)
      : undefined);

    const entry: JsonLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: resolvedContext,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...(stack ? { stack } : {}),
    };

    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(entry)}\n`);
  }
}
