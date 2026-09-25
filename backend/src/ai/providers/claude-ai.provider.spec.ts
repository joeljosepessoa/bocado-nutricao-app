import type { ConfigService } from '@nestjs/config';
import { CLAUDE_MAX_TOKENS, ClaudeAiProvider, DEFAULT_CLAUDE_MODEL, SERVER_SIDE_FALLBACK_BETA } from './claude-ai.provider';
import { AiTimeoutError, callProviderWithResilience } from './call-with-resilience';
import type { AiGenerationRequest } from './ai-provider.interface';

const FAKE_KEY = 'sk-ant-chave-falsa-de-teste-123';

function configWith(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

const schema = { type: 'object', additionalProperties: false, required: ['days'], properties: { days: { type: 'array', items: { type: 'string' } } } };

const request: AiGenerationRequest = {
  promptVersion: 'test@v1',
  systemPrompt: 'Instruções do sistema.',
  context: { workoutText: 'Supino 4x6-10' },
  maxOutputChars: 6000,
  responseSchema: schema,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const okBody = {
  id: 'msg_123',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5',
  stop_reason: 'end_turn',
  content: [
    { type: 'thinking', thinking: '', signature: 'sig' },
    { type: 'text', text: '{"days":[]}' },
  ],
  usage: { input_tokens: 42, output_tokens: 7 },
};

function sent(fetchSpy: jest.SpyInstance, call = 0) {
  const [url, init] = fetchSpy.mock.calls[call] as [string | URL, RequestInit];
  return {
    url: String(url),
    headers: new Headers(init.headers as ConstructorParameters<typeof Headers>[0]),
    body: JSON.parse(init.body as string),
    rawBody: init.body as string,
  };
}

describe('ClaudeAiProvider', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('chama a API de Messages com modelo padrão, saída estruturada e fallback de recusa; chave só no header', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, okBody));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));

    await provider.generate(request);

    const { url, headers, body, rawBody } = sent(fetchSpy);
    expect(url.startsWith('https://api.anthropic.com/v1/messages')).toBe(true);
    expect(headers.get('x-api-key')).toBe(FAKE_KEY);
    expect(headers.get('anthropic-beta')).toContain(SERVER_SIDE_FALLBACK_BETA);
    expect(body).toMatchObject({
      model: DEFAULT_CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify(request.context) }],
      output_config: { format: { type: 'json_schema', schema } },
      fallbacks: 'default',
    });
    expect(rawBody).not.toContain(FAKE_KEY);
  });

  it('modelo configurado fora da lista de fallback: sem fallbacks; sem schema: sem output_config', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, okBody));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY, ANTHROPIC_MODEL: 'claude-sonnet-5' }));
    await provider.generate({ ...request, responseSchema: undefined });

    const { headers, body } = sent(fetchSpy);
    expect(body.model).toBe('claude-sonnet-5');
    expect(body.fallbacks).toBeUndefined();
    expect(body.output_config).toBeUndefined();
    expect(headers.get('anthropic-beta') ?? '').not.toContain(SERVER_SIDE_FALLBACK_BETA);
  });

  it('respeita ANTHROPIC_BASE_URL', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, okBody));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY, ANTHROPIC_BASE_URL: 'http://127.0.0.1:4010' }));
    await provider.generate(request);
    expect(sent(fetchSpy).url.startsWith('http://127.0.0.1:4010/v1/messages')).toBe(true);
  });

  it('extrai só os blocos de texto, modelo, uso de tokens e id', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, okBody));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));
    expect(await provider.generate(request)).toEqual({
      text: '{"days":[]}',
      model: 'claude-opus-5',
      tokensUsed: { input: 42, output: 7 },
      providerRequestId: 'msg_123',
      truncated: false,
    });
  });

  it('marca como truncada quando para por limite de tokens', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { ...okBody, stop_reason: 'max_tokens' }));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));
    expect((await provider.generate(request)).truncated).toBe(true);
  });

  it('recusa (mesmo após fallback) vira erro controlado', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { ...okBody, stop_reason: 'refusal', content: [] }));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));
    await expect(provider.generate(request)).rejects.toThrow('O provedor de IA recusou gerar este conteúdo.');
  });

  it('sem ANTHROPIC_API_KEY falha sem fazer chamada de rede', async () => {
    const provider = new ClaudeAiProvider(configWith({}));
    await expect(provider.generate(request)).rejects.toThrow('Provedor de IA não configurado no servidor.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('erro HTTP vira mensagem com status e tipo — nunca a chave nem o texto livre do provedor; sem retry do SDK', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(401, { type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${FAKE_KEY}` } }),
    );
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));

    const error = (await provider.generate(request).catch((e: Error) => e)) as Error;
    expect(error.message).toBe('O provedor de IA recusou a solicitação (HTTP 401, authentication_error).');
    expect(error.message).not.toContain(FAKE_KEY);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('falha de rede vira mensagem genérica', async () => {
    fetchSpy.mockRejectedValue(new TypeError(`fetch failed for key ${FAKE_KEY}`));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));
    const error = (await provider.generate(request).catch((e: Error) => e)) as Error;
    expect(error.message).toBe('Não foi possível contatar o provedor de IA.');
  });

  it('com o wrapper de resiliência: falha transitória é repetida uma vez e a segunda tentativa vale', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }))
      .mockResolvedValueOnce(jsonResponse(200, okBody));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));

    const result = await callProviderWithResilience(provider, request, { timeoutMs: 5000, maxRetries: 1 });
    expect(result.text).toBe('{"days":[]}');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('com o wrapper de resiliência: provedor que não responde vira AiTimeoutError e cada tentativa é cancelada de fato', async () => {
    const aborted: boolean[] = [];
    // Simula uma chamada que só termina quando é abortada (como o fetch real).
    fetchSpy.mockImplementation(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted.push(true);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));

    await expect(callProviderWithResilience(provider, request, { timeoutMs: 20, maxRetries: 1 })).rejects.toBeInstanceOf(AiTimeoutError);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(aborted).toEqual([true, true]);
  });
});
