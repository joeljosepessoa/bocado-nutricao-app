import type { ConfigService } from '@nestjs/config';
import { AiProviderError } from '../ai-errors';
import { AI_PROVIDER_IDS, AI_PROVIDERS, resolveAiProviderId } from './ai-provider-catalog';
import { AiProviderRegistry } from './ai-provider.registry';
import { AnthropicAiProvider } from './anthropic-ai.provider';
import { MockAiProvider } from './mock-ai.provider';

const registryWith = (aiProvider: string | undefined) =>
  new AiProviderRegistry({ get: () => aiProvider } as unknown as ConfigService, new MockAiProvider(), new AnthropicAiProvider());

const errorOf = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
};

describe('AiProviderRegistry — seleção do provedor por AI_PROVIDER', () => {
  it('sem AI_PROVIDER usa mock-local (padrão de dev, testes e CI)', () => {
    expect(registryWith(undefined).getActiveProvider().id).toBe('mock-local');
    expect(registryWith('  ').getActiveProvider().id).toBe('mock-local');
  });

  it('anthropic (e o alias antigo claude, sem diferença de caixa) seleciona o provedor Anthropic', () => {
    expect(registryWith('anthropic').getActiveProvider()).toBeInstanceOf(AnthropicAiProvider);
    expect(registryWith('Claude').getActiveProvider().id).toBe('anthropic');
  });

  it('todo provedor marcado "available" no catálogo está de fato registrado', () => {
    for (const id of AI_PROVIDER_IDS.filter((p) => AI_PROVIDERS[p].status === 'available')) {
      expect(registryWith(id).getActiveProvider().id).toBe(id);
    }
  });

  it('openai e gemini estão previstos mas não implementados: erro controlado', () => {
    for (const id of ['openai', 'gemini']) {
      const error = errorOf(() => registryWith(id).getActiveProvider());
      expect(error).toBeInstanceOf(AiProviderError);
      expect((error as AiProviderError).kind).toBe('provider_not_implemented');
    }
  });

  it('valor desconhecido é "invalid_provider" e o rótulo de log nunca repete o texto cru do ENV', () => {
    const registry = registryWith('provedor-qualquer<script>');
    const error = errorOf(() => registry.getActiveProvider());
    expect((error as AiProviderError).kind).toBe('invalid_provider');
    expect(registry.configuredProviderLabel()).toBe('invalid');
  });
});

describe('catálogo de provedores', () => {
  it('classifica disponível, previsto e desconhecido', () => {
    expect(resolveAiProviderId('mock-local')).toEqual({ kind: 'available', id: 'mock-local' });
    expect(resolveAiProviderId('anthropic')).toEqual({ kind: 'available', id: 'anthropic' });
    expect(resolveAiProviderId('gemini')).toEqual({ kind: 'planned', id: 'gemini' });
    expect(resolveAiProviderId('xyz')).toEqual({ kind: 'unknown', raw: 'xyz' });
  });

  it('nomes de exibição para a futura tela de configuração; modelo padrão só onde é decidido (Anthropic = Haiku 4.5)', () => {
    expect(AI_PROVIDER_IDS.map((id) => AI_PROVIDERS[id].label)).toEqual([
      'Anthropic — Claude',
      'OpenAI — GPT',
      'Google — Gemini',
      'Mock Local — testes',
    ]);
    expect(AI_PROVIDERS.anthropic.defaultModel).toBe('claude-haiku-4-5-20251001');
    expect(AI_PROVIDERS.openai.defaultModel).toBeUndefined();
    expect(AI_PROVIDERS.gemini.defaultModel).toBeUndefined();
  });
});
