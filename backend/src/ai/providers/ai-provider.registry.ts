import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProvider } from './ai-provider.interface';
import { MockAiProvider } from './mock-ai.provider';

/**
 * Mesmo papel do ScaleDriverRegistry/WearableDriverRegistry — a aplicação
 * pede "o provedor ativo" a este registry, nunca importa um provedor
 * concreto diretamente. Escolhe por configuração (`AI_PROVIDER`), não por
 * descoberta em tempo real (não há "vários provedores ao mesmo tempo" aqui,
 * diferente do BLE). Hoje só `mock-local` está registrado — nenhum
 * provedor externo (decisão 5/20).
 */
@Injectable()
export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  constructor(
    private readonly config: ConfigService,
    mockAiProvider: MockAiProvider,
  ) {
    this.register(mockAiProvider);
  }

  register(provider: AiProvider): void {
    this.providers.set(provider.id, provider);
  }

  getActiveProvider(): AiProvider {
    const activeId = this.config.get<string>('AI_PROVIDER') ?? 'mock-local';
    const provider = this.providers.get(activeId);
    if (!provider) {
      throw new Error(`Provedor de IA "${activeId}" não está registrado.`);
    }
    return provider;
  }
}
