import type { AiGenerationRequest, AiGenerationResult, AiProvider } from './ai-provider.interface';

export class AiTimeoutError extends Error {
  constructor() {
    super('O provedor de IA não respondeu a tempo.');
  }
}

export interface ResilienceOptions {
  timeoutMs: number;
  /** Máximo de tentativas ADICIONAIS após a primeira falha — nunca recursivo, sempre um laço limitado (decisão 11). */
  maxRetries: number;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new AiTimeoutError());
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Único ponto que chama `provider.generate()` — timeout + retry limitado
 * (nunca em loop, nunca recursivo: no máximo `1 + maxRetries` tentativas,
 * sempre dentro desta função, nada chama esta função de dentro dela mesma).
 */
export async function callProviderWithResilience(
  provider: AiProvider,
  request: AiGenerationRequest,
  options: ResilienceOptions,
): Promise<AiGenerationResult> {
  let lastError: unknown;
  const attempts = 1 + Math.max(0, options.maxRetries);

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Uma tentativa abandonada por timeout é cancelada de fato — sem isso a
    // chamada ao provedor seguiria rodando (e sendo cobrada) em segundo plano.
    const controller = new AbortController();
    try {
      return await withTimeout(provider.generate({ ...request, signal: controller.signal }), options.timeoutMs, () => controller.abort());
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
