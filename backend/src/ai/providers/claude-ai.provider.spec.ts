import type { ConfigService } from '@nestjs/config';
import { ANTHROPIC_API_VERSION, ANTHROPIC_MESSAGES_URL, ClaudeAiProvider, DEFAULT_CLAUDE_MODEL, maxTokensFor } from './claude-ai.provider';
import { AiTimeoutError, callProviderWithResilience } from './call-with-resilience';
import type { AiGenerationRequest } from './ai-provider.interface';

const FAKE_KEY = 'sk-ant-chave-falsa-de-teste-123';

function configWith(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

const request: AiGenerationRequest = {
  promptVersion: 'test@v1',
  systemPrompt: 'Instruções do sistema.',
  context: { rawText: 'Supino 4x6-10' },
  maxOutputChars: 6000,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const okBody = {
  id: 'msg_123',
  model: 'claude-sonnet-5',
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: '{"days":[]}' }],
  usage: { input_tokens: 42, output_tokens: 7 },
};

describe('ClaudeAiProvider', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('monta a requisição para a API de Messages com a chave só no header', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, okBody));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));

    await provider.generate(request);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ANTHROPIC_MESSAGES_URL);
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(FAKE_KEY);
    expect(headers['anthropic-version']).toBe(ANTHROPIC_API_VERSION);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      model: DEFAULT_CLAUDE_MODEL,
      max_tokens: maxTokensFor(request.maxOutputChars),
      system: request.systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify(request.context) }],
    });
    expect(init.body as string).not.toContain(FAKE_KEY);
  });

  it('respeita ANTHROPIC_MODEL quando configurado', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, okBody));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY, ANTHROPIC_MODEL: 'claude-haiku-4-5-20251001' }));
    await provider.generate(request);
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string).model).toBe('claude-haiku-4-5-20251001');
  });

  it('extrai texto, modelo, uso de tokens e id da resposta', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, okBody));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));
    const result = await provider.generate(request);
    expect(result).toEqual({
      text: '{"days":[]}',
      model: 'claude-sonnet-5',
      tokensUsed: { input: 42, output: 7 },
      providerRequestId: 'msg_123',
      truncated: false,
    });
  });

  it('marca como truncada quando o provedor para por limite de tokens', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { ...okBody, stop_reason: 'max_tokens' }));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));
    expect((await provider.generate(request)).truncated).toBe(true);
  });

  it('sem ANTHROPIC_API_KEY falha sem fazer chamada de rede', async () => {
    const provider = new ClaudeAiProvider(configWith({}));
    await expect(provider.generate(request)).rejects.toThrow('Provedor de IA não configurado no servidor.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('erro HTTP vira mensagem com status e tipo — nunca a chave nem o texto livre do provedor', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(401, { type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${FAKE_KEY}` } }),
    );
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));

    const error = await provider.generate(request).catch((e: Error) => e);
    expect((error as Error).message).toBe('O provedor de IA recusou a solicitação (HTTP 401, authentication_error).');
    expect((error as Error).message).not.toContain(FAKE_KEY);
  });

  it('falha de rede vira mensagem genérica', async () => {
    fetchSpy.mockRejectedValue(new TypeError(`fetch failed for key ${FAKE_KEY}`));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));
    const error = await provider.generate(request).catch((e: Error) => e);
    expect((error as Error).message).toBe('Não foi possível contatar o provedor de IA.');
  });

  it('com o wrapper de resiliência: uma falha transitória é repetida uma vez e a segunda tentativa vale', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(529, { type: 'error', error: { type: 'overloaded_error' } }))
      .mockResolvedValueOnce(jsonResponse(200, okBody));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));

    const result = await callProviderWithResilience(provider, request, { timeoutMs: 1000, maxRetries: 1 });
    expect(result.text).toBe('{"days":[]}');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('com o wrapper de resiliência: provedor que não responde vira AiTimeoutError (limite de tentativas respeitado)', async () => {
    fetchSpy.mockImplementation(() => new Promise<Response>(() => undefined));
    const provider = new ClaudeAiProvider(configWith({ ANTHROPIC_API_KEY: FAKE_KEY }));

    await expect(callProviderWithResilience(provider, request, { timeoutMs: 20, maxRetries: 1 })).rejects.toBeInstanceOf(AiTimeoutError);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
