import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AiProviderError } from '../ai-errors';
import type { AiGenerationRequest, AiGenerationResult, AiProvider, AiProviderCredentials } from './ai-provider.interface';

export const ANTHROPIC_MAX_TOKENS = 16000;
export const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// Capacidade da API, não escolha de modelo: `fallbacks: "default"` só é
// documentado para estes modelos. Qualquer outro (ex.: o Haiku padrão) segue
// sem fallback em vez de arriscar um 400. O modelo em uso vem do catálogo/ENV.
const MODELS_WITH_DEFAULT_FALLBACK: ReadonlySet<string> = new Set(['claude-opus-5']);

// Rede de segurança do próprio SDK: o timeout "de verdade" é o de
// callProviderWithResilience, que cancela a chamada via AbortSignal.
const SDK_TIMEOUT_MS = 180_000;

/** Só o que o provedor usa do SDK — permite substituir o cliente nos testes. */
export type AnthropicClient = Pick<Anthropic, 'beta'>;

/**
 * Provedor Anthropic (Claude) via SDK oficial. Credencial vem do
 * AiCredentialsResolver (hoje, ENV do servidor) e nunca entra em erro, log ou
 * resposta. Retry fica com callProviderWithResilience (o do SDK é desligado).
 */
@Injectable()
export class AnthropicAiProvider implements AiProvider {
  readonly id = 'anthropic';
  readonly supportsStructuredOutput = true;

  async generate(request: AiGenerationRequest, credentials: AiProviderCredentials = {}): Promise<AiGenerationResult> {
    if (!credentials.apiKey) {
      throw new AiProviderError('missing_api_key');
    }
    // O modelo sempre chega resolvido (ENV ou padrão do catálogo); o provedor não escolhe modelo.
    const model = credentials.model;
    if (!model) {
      throw new AiProviderError('invalid_model');
    }
    const client = this.createClient(credentials);

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create(
        {
          model,
          max_tokens: ANTHROPIC_MAX_TOKENS,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: JSON.stringify(request.context) }],
          ...(request.responseSchema ? { output_config: { format: { type: 'json_schema' as const, schema: request.responseSchema } } } : {}),
          ...(MODELS_WITH_DEFAULT_FALLBACK.has(model) ? { betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        },
        { signal: request.signal },
      );
    } catch (error) {
      throw toAiProviderError(error);
    }

    if (!response || !Array.isArray(response.content)) {
      throw new AiProviderError('invalid_response');
    }
    if (response.stop_reason === 'refusal') {
      throw new AiProviderError('refused');
    }

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');

    return {
      // Mesmo teto do mock-local para texto livre; JSON estruturado nunca é cortado (quebraria o JSON).
      text: request.responseSchema ? text : text.slice(0, request.maxOutputChars),
      model: response.model ?? model,
      tokensUsed: response.usage ? { input: response.usage.input_tokens, output: response.usage.output_tokens } : undefined,
      providerRequestId: response.id,
      truncated: response.stop_reason === 'max_tokens',
    };
  }

  protected createClient(credentials: AiProviderCredentials): AnthropicClient {
    return new Anthropic({
      apiKey: credentials.apiKey,
      baseURL: credentials.baseUrl || undefined,
      maxRetries: 0,
      timeout: SDK_TIMEOUT_MS,
    });
  }
}

/** Classe de erro do SDK → categoria controlada. Nada do erro original (mensagem, headers) passa adiante. */
export function toAiProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiProviderError('timeout');
  }
  if (error instanceof Anthropic.APIConnectionError) return new AiProviderError('network');
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiProviderError('authentication');
  }
  if (error instanceof Anthropic.RateLimitError) return new AiProviderError('rate_limited');
  // A API responde 404 not_found_error para modelo inexistente.
  if (error instanceof Anthropic.NotFoundError) return new AiProviderError('invalid_model');
  if (error instanceof Anthropic.InternalServerError) return new AiProviderError('unavailable');
  if (error instanceof Anthropic.APIError && typeof error.status === 'number') {
    return new AiProviderError(error.status >= 500 ? 'unavailable' : 'bad_request');
  }
  return new AiProviderError('network');
}
