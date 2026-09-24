import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiGenerationRequest, AiGenerationResult, AiProvider } from './ai-provider.interface';

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_API_VERSION = '2023-06-01';
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5';

// Rede de segurança: o timeout "de verdade" é o de callProviderWithResilience,
// mas ele só abandona a promessa — isto garante que o fetch não fique pendurado.
const HARD_ABORT_MS = 180_000;
const MAX_TOKENS_CAP = 8192;
const MIN_TOKENS = 256;

/** Aproximação conservadora (~3 caracteres por token em português/JSON). */
export function maxTokensFor(maxOutputChars: number): number {
  return Math.min(MAX_TOKENS_CAP, Math.max(MIN_TOKENS, Math.ceil(maxOutputChars / 3)));
}

interface AnthropicMessageResponse {
  id?: string;
  model?: string;
  stop_reason?: string | null;
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Provedor real (Claude, API de Messages da Anthropic). A chave vem só de
 * ANTHROPIC_API_KEY no servidor e nunca entra em mensagem de erro, log ou
 * resposta — os erros carregam apenas o status HTTP e o tipo de erro.
 */
@Injectable()
export class ClaudeAiProvider implements AiProvider {
  readonly id = 'claude';

  constructor(private readonly config: ConfigService) {}

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('Provedor de IA não configurado no servidor.');
    }
    const model = this.config.get<string>('ANTHROPIC_MODEL') || DEFAULT_CLAUDE_MODEL;

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokensFor(request.maxOutputChars),
          system: request.systemPrompt,
          messages: [{ role: 'user', content: JSON.stringify(request.context) }],
        }),
        signal: AbortSignal.timeout(HARD_ABORT_MS),
      });
    } catch {
      throw new Error('Não foi possível contatar o provedor de IA.');
    }

    if (!response.ok) {
      const errorType = await readErrorType(response);
      throw new Error(`O provedor de IA recusou a solicitação (HTTP ${response.status}${errorType ? `, ${errorType}` : ''}).`);
    }

    let body: AnthropicMessageResponse;
    try {
      body = (await response.json()) as AnthropicMessageResponse;
    } catch {
      throw new Error('O provedor de IA devolveu uma resposta ilegível.');
    }

    const text = (body.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');

    return {
      text,
      model: body.model ?? model,
      tokensUsed:
        body.usage?.input_tokens != null && body.usage?.output_tokens != null
          ? { input: body.usage.input_tokens, output: body.usage.output_tokens }
          : undefined,
      providerRequestId: body.id,
      truncated: body.stop_reason === 'max_tokens',
    };
  }
}

async function readErrorType(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: { type?: unknown } };
    const type = body?.error?.type;
    // Só um identificador curto (ex.: "overloaded_error") — nunca a mensagem livre.
    return typeof type === 'string' && /^[a-z_]{1,64}$/.test(type) ? type : undefined;
  } catch {
    return undefined;
  }
}
