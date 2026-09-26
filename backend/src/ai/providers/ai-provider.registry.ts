import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderError } from '../ai-errors';
import type { AiProvider } from './ai-provider.interface';
import { resolveAiProviderId } from './ai-provider-catalog';
import { AnthropicAiProvider } from './anthropic-ai.provider';
import { MockAiProvider } from './mock-ai.provider';

/**
 * Mesmo papel do ScaleDriverRegistry/WearableDriverRegistry — a aplicação
 * pede "o provedor ativo" a este registry, nunca importa um provedor
 * concreto diretamente. Escolhe por configuração (`AI_PROVIDER`).
 * Registrados: `mock-local` (padrão, sem rede) e `anthropic` (alias `claude`).
 * `openai`/`gemini` estão previstos em ai-provider-catalog: um novo provedor
 * entra aqui sem tocar em AiService nem nos use cases.
 */
@Injectable()
export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  constructor(
    private readonly config: ConfigService,
    mockAiProvider: MockAiProvider,
    anthropicAiProvider: AnthropicAiProvider,
  ) {
    this.register(mockAiProvider);
    this.register(anthropicAiProvider);
  }

  register(provider: AiProvider): void {
    this.providers.set(provider.id, provider);
  }

  getActiveProvider(): AiProvider {
    const resolution = resolveAiProviderId(this.config.get<string>('AI_PROVIDER'));
    if (resolution.kind === 'unknown') {
      throw new AiProviderError('invalid_provider');
    }
    const provider = resolution.kind === 'available' ? this.providers.get(resolution.id) : undefined;
    if (!provider) {
      throw new AiProviderError('provider_not_implemented');
    }
    return provider;
  }

  /** Id configurado, para o log de interação mesmo quando a resolução falha (nunca o texto cru do ENV). */
  configuredProviderLabel(): string {
    const resolution = resolveAiProviderId(this.config.get<string>('AI_PROVIDER'));
    return resolution.kind === 'unknown' ? 'invalid' : resolution.id;
  }
}
