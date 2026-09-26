import type { ConfigService } from '@nestjs/config';
import { EnvAiCredentialsResolver } from './ai-credentials.resolver';

const resolverWith = (env: Record<string, string>) =>
  new EnvAiCredentialsResolver({ get: (key: string) => env[key] } as unknown as ConfigService);
const scope = { professionalId: 'p1' };

describe('EnvAiCredentialsResolver — credencial e modelo vêm do catálogo + ENV do servidor', () => {
  it('anthropic: ANTHROPIC_MODEL definido é o modelo usado', async () => {
    const resolver = resolverWith({ ANTHROPIC_API_KEY: ' sk-ant-teste ', ANTHROPIC_MODEL: 'claude-sonnet-5' });
    await expect(resolver.resolve('anthropic', scope)).resolves.toEqual({
      apiKey: 'sk-ant-teste',
      model: 'claude-sonnet-5',
      baseUrl: undefined,
    });
  });

  it('anthropic sem ANTHROPIC_MODEL (ou vazio) usa o padrão do catálogo: Claude Haiku 4.5', async () => {
    const envs: Record<string, string>[] = [{ ANTHROPIC_API_KEY: 'k' }, { ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: '  ' }];
    for (const env of envs) {
      await expect(resolverWith(env).resolve('anthropic', scope)).resolves.toMatchObject({ model: 'claude-haiku-4-5-20251001' });
    }
  });

  it('chave vazia conta como ausente', async () => {
    await expect(resolverWith({ ANTHROPIC_API_KEY: '' }).resolve('anthropic', scope)).resolves.toMatchObject({ apiKey: undefined });
  });

  it('openai/gemini (previstos) já leem as próprias variáveis — nunca a chave de outro provedor', async () => {
    const env = { ANTHROPIC_API_KEY: 'chave-anthropic', OPENAI_API_KEY: 'chave-openai', OPENAI_MODEL: 'modelo-openai', GEMINI_API_KEY: 'chave-gemini' };
    await expect(resolverWith(env).resolve('openai', scope)).resolves.toEqual({ apiKey: 'chave-openai', model: 'modelo-openai', baseUrl: undefined });
    // Sem modelo padrão no catálogo para gemini: não inventa nome de modelo.
    await expect(resolverWith(env).resolve('gemini', scope)).resolves.toEqual({ apiKey: 'chave-gemini', model: undefined, baseUrl: undefined });
  });

  it('mock-local e ids desconhecidos não recebem credencial nenhuma', async () => {
    const resolver = resolverWith({ ANTHROPIC_API_KEY: 'sk-ant-teste' });
    await expect(resolver.resolve('mock-local', scope)).resolves.toEqual({});
    await expect(resolver.resolve('xyz', scope)).resolves.toEqual({});
  });
});
