import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDERS, isAiProviderId } from './ai-provider-catalog';
import type { AiProviderCredentials } from './ai-provider.interface';

export interface AiCredentialsScope {
  professionalId: string;
}

/**
 * De onde vem a configuração de cada chamada (credencial + modelo). Hoje só
 * do ENV do servidor; um BYOK futuro (profissional escolhe provedor/modelo e
 * informa a própria credencial) troca apenas esta implementação —
 * provedores e use cases não mudam.
 */
export abstract class AiCredentialsResolver {
  abstract resolve(providerId: string, scope: AiCredentialsScope): Promise<AiProviderCredentials>;
}

@Injectable()
export class EnvAiCredentialsResolver extends AiCredentialsResolver {
  constructor(private readonly config: ConfigService) {
    super();
  }

  // O escopo (profissional) só importa para o BYOK futuro; pelo ENV a configuração é única.
  async resolve(providerId: string, _scope?: AiCredentialsScope): Promise<AiProviderCredentials> {
    const descriptor = isAiProviderId(providerId) ? AI_PROVIDERS[providerId] : undefined;
    if (!descriptor?.env) {
      return {};
    }
    return {
      apiKey: this.read(descriptor.env.apiKey),
      model: this.read(descriptor.env.model) ?? descriptor.defaultModel,
      baseUrl: descriptor.env.baseUrl ? this.read(descriptor.env.baseUrl) : undefined,
    };
  }

  private read(key: string): string | undefined {
    return this.config.get<string>(key)?.trim() || undefined;
  }
}
