import Anthropic from '@anthropic-ai/sdk';
import { AiProviderError } from '../ai-errors';
import { ANTHROPIC_MAX_TOKENS, AnthropicAiProvider, type AnthropicClient, SERVER_SIDE_FALLBACK_BETA } from './anthropic-ai.provider';
import { AI_PROVIDERS } from './ai-provider-catalog';
import { AiTimeoutError, callProviderWithResilience } from './call-with-resilience';
import type { AiGenerationRequest, AiProviderCredentials } from './ai-provider.interface';

const FAKE_KEY = 'sk-ant-chave-falsa-de-teste-123';
const CATALOG_DEFAULT_MODEL = AI_PROVIDERS.anthropic.defaultModel!;
// Como o resolvedor entrega: chave + modelo já resolvido.
const creds = (overrides: AiProviderCredentials = {}): AiProviderCredentials => ({ apiKey: FAKE_KEY, model: CATALOG_DEFAULT_MODEL, ...overrides });

const request: AiGenerationRequest = {
  promptVersion: 'test@v1',
  systemPrompt: 'Instruções do sistema.',
  context: { workoutText: 'Supino 4x6-10' },
  maxOutputChars: 20,
};

const okMessage = (text = 'Texto gerado pela IA.', overrides: Record<string, unknown> = {}) => ({
  id: 'msg_123',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5',
  stop_reason: 'end_turn',
  content: [
    { type: 'thinking', thinking: '', signature: 'sig' },
    { type: 'text', text },
  ],
  usage: { input_tokens: 42, output_tokens: 7 },
  ...overrides,
});

/** Erro REAL do SDK (mesma classe que a API geraria), com texto livre contendo a chave — que não pode vazar. */
const sdkError = (status: number, type: string) =>
  Anthropic.APIError.generate(status, { type: 'error', error: { type, message: `detalhe livre ${FAKE_KEY}` } }, undefined, new Headers());

/** SDK simulado: substitui só a criação do cliente. */
class ProviderWithFakeSdk extends AnthropicAiProvider {
  readonly create = jest.fn();
  clientsCreated = 0;
  lastCredentials?: AiProviderCredentials;

  protected override createClient(credentials: AiProviderCredentials): AnthropicClient {
    this.clientsCreated += 1;
    this.lastCredentials = credentials;
    return { beta: { messages: { create: this.create } } } as unknown as AnthropicClient;
  }
}

async function failureOf(promise: Promise<unknown>): Promise<AiProviderError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AiProviderError);
  return error as AiProviderError;
}

describe('AnthropicAiProvider (SDK simulado)', () => {
  it('sucesso: normaliza para o mesmo formato do mock-local (texto, modelo, tokens, id)', async () => {
    const provider = new ProviderWithFakeSdk();
    provider.create.mockResolvedValue(okMessage('curto'));

    await expect(provider.generate(request, creds())).resolves.toEqual({
      text: 'curto',
      model: 'claude-opus-5',
      tokensUsed: { input: 42, output: 7 },
      providerRequestId: 'msg_123',
      truncated: false,
    });
  });

  it('usa o modelo resolvido (padrão do catálogo: Haiku 4.5) sem fallback de recusa; só o Opus 5 leva fallback', async () => {
    const provider = new ProviderWithFakeSdk();
    provider.create.mockResolvedValue(okMessage());
    const signal = new AbortController().signal;

    await provider.generate({ ...request, signal }, creds());
    const [params, options] = provider.create.mock.calls[0];
    expect(CATALOG_DEFAULT_MODEL).toBe('claude-haiku-4-5-20251001');
    expect(params).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify(request.context) }],
    });
    expect(params.fallbacks).toBeUndefined();
    expect(params.betas).toBeUndefined();
    expect(options).toEqual({ signal });
    expect(provider.lastCredentials).toEqual(creds());

    await provider.generate(request, creds({ model: 'claude-opus-5' }));
    expect(provider.create.mock.calls[1][0]).toMatchObject({ model: 'claude-opus-5', betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: 'default' });
  });

  it('sem modelo resolvido: erro controlado, sem chamar a API', async () => {
    const provider = new ProviderWithFakeSdk();
    const error = await failureOf(provider.generate(request, { apiKey: FAKE_KEY }));
    expect(error.kind).toBe('invalid_model');
    expect(provider.create).not.toHaveBeenCalled();
  });

  it('texto livre respeita maxOutputChars (como o mock-local); JSON estruturado nunca é cortado', async () => {
    const provider = new ProviderWithFakeSdk();
    const long = 'x'.repeat(50);
    provider.create.mockResolvedValue(okMessage(long));

    expect((await provider.generate(request, creds())).text).toHaveLength(20);

    const schema = { type: 'object', additionalProperties: false, required: [], properties: {} };
    const structured = await provider.generate({ ...request, responseSchema: schema }, creds());
    expect(structured.text).toHaveLength(50);
    expect(provider.create.mock.calls[1][0].output_config).toEqual({ format: { type: 'json_schema', schema } });
  });

  it('API key ausente: erro controlado sem criar cliente nem chamar a API', async () => {
    const provider = new ProviderWithFakeSdk();
    const error = await failureOf(provider.generate(request, {}));
    expect(error.kind).toBe('missing_api_key');
    expect(error.retryable).toBe(false);
    expect(provider.clientsCreated).toBe(0);
    expect(provider.create).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'authentication_error', 'authentication', false],
    [403, 'permission_error', 'authentication', false],
    [429, 'rate_limit_error', 'rate_limited', true],
    [404, 'not_found_error', 'invalid_model', false],
    [400, 'invalid_request_error', 'bad_request', false],
    [500, 'api_error', 'unavailable', true],
    [529, 'overloaded_error', 'unavailable', true],
  ])('HTTP %i (%s) vira "%s" (retryable=%s), sem vazar chave nem texto livre do provedor', async (status, type, kind, retryable) => {
    const provider = new ProviderWithFakeSdk();
    provider.create.mockRejectedValue(sdkError(status, type));

    const error = await failureOf(provider.generate(request, creds()));
    expect(error.kind).toBe(kind);
    expect(error.retryable).toBe(retryable);
    expect(error.message).not.toContain(FAKE_KEY);
    expect(error.message).not.toContain('detalhe livre');
  });

  it('timeout de conexão e falha de rede do SDK viram "timeout" e "network"', async () => {
    const provider = new ProviderWithFakeSdk();
    provider.create.mockRejectedValueOnce(new Anthropic.APIConnectionTimeoutError());
    expect((await failureOf(provider.generate(request, creds()))).kind).toBe('timeout');

    provider.create.mockRejectedValueOnce(new Anthropic.APIConnectionError({ message: `falhou ${FAKE_KEY}` }));
    const network = await failureOf(provider.generate(request, creds()));
    expect(network.kind).toBe('network');
    expect(network.message).not.toContain(FAKE_KEY);
  });

  it('resposta inválida (sem blocos de conteúdo) vira "invalid_response"', async () => {
    const provider = new ProviderWithFakeSdk();
    provider.create.mockResolvedValue({ id: 'msg_x', model: 'claude-opus-5' });
    expect((await failureOf(provider.generate(request, creds()))).kind).toBe('invalid_response');
  });

  it('recusa do classificador vira "refused"; parada por limite marca truncated', async () => {
    const provider = new ProviderWithFakeSdk();
    provider.create.mockResolvedValueOnce(okMessage('', { stop_reason: 'refusal', content: [] }));
    expect((await failureOf(provider.generate(request, creds()))).kind).toBe('refused');

    provider.create.mockResolvedValueOnce(okMessage('parcial', { stop_reason: 'max_tokens' }));
    expect((await provider.generate(request, creds())).truncated).toBe(true);
  });
});

describe('AnthropicAiProvider com o wrapper de resiliência', () => {
  const options = { timeoutMs: 5000, maxRetries: 1 };

  it('erro permanente (autenticação) não é repetido', async () => {
    const provider = new ProviderWithFakeSdk();
    provider.create.mockRejectedValue(sdkError(401, 'authentication_error'));
    await expect(callProviderWithResilience(provider, request, options, creds())).rejects.toMatchObject({ kind: 'authentication' });
    expect(provider.create).toHaveBeenCalledTimes(1);
  });

  it('erro transitório (rate limit) é repetido uma vez e a segunda tentativa vale', async () => {
    const provider = new ProviderWithFakeSdk();
    provider.create.mockRejectedValueOnce(sdkError(429, 'rate_limit_error')).mockResolvedValueOnce(okMessage('ok'));
    await expect(callProviderWithResilience(provider, request, options, creds())).resolves.toMatchObject({ text: 'ok' });
    expect(provider.create).toHaveBeenCalledTimes(2);
  });

  it('provedor que não responde: AiTimeoutError e cada tentativa é cancelada de fato', async () => {
    const provider = new ProviderWithFakeSdk();
    const aborted: boolean[] = [];
    provider.create.mockImplementation(
      (_params: unknown, opts: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            aborted.push(true);
            reject(new Anthropic.APIUserAbortError());
          });
        }),
    );
    await expect(callProviderWithResilience(provider, request, { timeoutMs: 20, maxRetries: 1 }, creds())).rejects.toBeInstanceOf(AiTimeoutError);
    expect(aborted).toEqual([true, true]);
  });
});

describe('AnthropicAiProvider com o SDK real (fetch interceptado, sem rede)', () => {
  it('a chave vai só no header x-api-key, nunca no corpo; ANTHROPIC_BASE_URL é respeitado', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(okMessage('ok')), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    try {
      await new AnthropicAiProvider().generate(request, creds({ baseUrl: 'http://127.0.0.1:4010' }));
      const [url, init] = fetchSpy.mock.calls[0] as [string | URL, RequestInit];
      expect(String(url).startsWith('http://127.0.0.1:4010/v1/messages')).toBe(true);
      expect(new Headers(init.headers as ConstructorParameters<typeof Headers>[0]).get('x-api-key')).toBe(FAKE_KEY);
      expect(init.body as string).not.toContain(FAKE_KEY);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
