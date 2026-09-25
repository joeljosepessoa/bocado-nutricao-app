import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { AiGenerationRequest, AiGenerationResult, AiProvider } from './ai-provider.interface';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';
export const CLAUDE_MAX_TOKENS = 16000;
export const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// Modelos em que `fallbacks: "default"` é documentado — num modelo configurado
// fora desta lista a requisição segue sem fallback em vez de arriscar um 400.
const MODELS_WITH_DEFAULT_FALLBACK = new Set([DEFAULT_CLAUDE_MODEL]);

// Rede de segurança do próprio SDK: o timeout "de verdade" é o de
// callProviderWithResilience, que só abandona a promessa.
const SDK_TIMEOUT_MS = 180_000;

/**
 * Provedor real (Claude, via SDK oficial). A chave vem só de
 * ANTHROPIC_API_KEY no servidor e nunca entra em mensagem de erro, log ou
 * resposta. Retry fica com callProviderWithResilience (o do SDK é desligado
 * para não multiplicar tentativas).
 */
@Injectable()
export class ClaudeAiProvider implements AiProvider {
  readonly id = 'claude';
  readonly supportsStructuredOutput = true;

  constructor(private readonly config: ConfigService) {}

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('Provedor de IA não configurado no servidor.');
    }
    const model = this.config.get<string>('ANTHROPIC_MODEL') || DEFAULT_CLAUDE_MODEL;
    const client = new Anthropic({
      apiKey,
      baseURL: this.config.get<string>('ANTHROPIC_BASE_URL') || undefined,
      maxRetries: 0,
      timeout: SDK_TIMEOUT_MS,
    });

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create(
        {
          model,
          max_tokens: CLAUDE_MAX_TOKENS,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: JSON.stringify(request.context) }],
          ...(request.responseSchema ? { output_config: { format: { type: 'json_schema' as const, schema: request.responseSchema } } } : {}),
          ...(MODELS_WITH_DEFAULT_FALLBACK.has(model) ? { betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        },
        { signal: request.signal },
      );
    } catch (error) {
      throw toSafeError(error);
    }

    if (response.stop_reason === 'refusal') {
      throw new Error('O provedor de IA recusou gerar este conteúdo.');
    }

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text,
      model: response.model,
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      providerRequestId: response.id,
      truncated: response.stop_reason === 'max_tokens',
    };
  }
}

/** Só status HTTP e tipo do erro (ex.: "overloaded_error") — nunca a mensagem livre do provedor. */
function toSafeError(error: unknown): Error {
  if (error instanceof Anthropic.APIError && typeof error.status === 'number') {
    const type = typeof error.type === 'string' && /^[a-z_]{1,64}$/.test(error.type) ? error.type : undefined;
    return new Error(`O provedor de IA recusou a solicitação (HTTP ${error.status}${type ? `, ${type}` : ''}).`);
  }
  return new Error('Não foi possível contatar o provedor de IA.');
}
