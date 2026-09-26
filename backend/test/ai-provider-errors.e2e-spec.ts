import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AiProviderError } from '../src/ai/ai-errors';
import { AiProviderRegistry } from '../src/ai/providers/ai-provider.registry';
import { MockAiProvider } from '../src/ai/providers/mock-ai.provider';
import type { AiGenerationRequest, AiGenerationResult, AiProviderCredentials } from '../src/ai/providers/ai-provider.interface';
import { createClient, login, registerProfessional } from './helpers';

const prisma = new PrismaClient();

// Provedor falso no lugar do mock local (mesmo id): o pipeline real de
// AiService roda inteiro; só o comportamento do "provedor" é roteirizado.
const fakeProvider = {
  id: 'mock-local',
  generate: jest.fn<Promise<AiGenerationResult>, [AiGenerationRequest, AiProviderCredentials?]>(),
};

describe('IA — erros de provedor chegam em formato controlado (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MockAiProvider)
      .useValue(fakeProvider)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fakeProvider.generate.mockReset();
  });

  async function setup() {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    const session = await login(app, client.user.email, temporaryPassword);
    await request(app.getHttpServer()).post('/professionals/me/ai/consent').set('Authorization', `Bearer ${professional.accessToken}`).expect(201);
    await request(app.getHttpServer()).post('/client/ai/consent').set('Authorization', `Bearer ${session.accessToken}`).expect(201);
    return { professional, client };
  }

  const draftNote = (token: string, clientId: string) =>
    request(app.getHttpServer())
      .post(`/clients/${clientId}/ai/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ feature: 'draft_note', entityType: 'evaluation', instructions: 'Resumo da consulta de hoje.' });

  it('mock-local continua funcionando igual (Fase 12 preservada) e o provedor não recebe credencial', async () => {
    const { professional, client } = await setup();
    fakeProvider.generate.mockResolvedValue({ text: 'Rascunho gerado.', model: 'mock-v1' });

    const res = await draftNote(professional.accessToken, client.id).expect(201);
    expect(res.body).toMatchObject({ feature: 'draft_note', provider: 'mock-local', model: 'mock-v1', text: 'Rascunho gerado.', isAiGenerated: true });
    expect(fakeProvider.generate.mock.calls[0][1]).toEqual({});
  });

  it('provedor inválido: 503 com mensagem segura, interação registrada como failed, nenhum 500', async () => {
    const { professional, client } = await setup();
    jest.spyOn(app.get(AiProviderRegistry), 'getActiveProvider').mockImplementation(() => {
      throw new AiProviderError('invalid_provider');
    });

    const res = await draftNote(professional.accessToken, client.id).expect(503);
    expect(res.body.message).toBe('O provedor de IA configurado no servidor é inválido.');
    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: client.id } });
    expect(log).toMatchObject({ status: 'failed', errorMessage: 'O provedor de IA configurado no servidor é inválido.' });
  });

  it('erro de autenticação do provedor: 503 controlado e SEM nova tentativa', async () => {
    const { professional, client } = await setup();
    fakeProvider.generate.mockRejectedValue(new AiProviderError('authentication'));

    const res = await draftNote(professional.accessToken, client.id).expect(503);
    expect(res.body.message).toMatch(/Falha de autenticação com o provedor de IA/);
    expect(fakeProvider.generate).toHaveBeenCalledTimes(1);
  });

  it('rate limit: uma nova tentativa; se passar, a resposta sai normal', async () => {
    const { professional, client } = await setup();
    fakeProvider.generate.mockRejectedValueOnce(new AiProviderError('rate_limited')).mockResolvedValueOnce({ text: 'ok', model: 'mock-v1' });

    await draftNote(professional.accessToken, client.id).expect(201);
    expect(fakeProvider.generate).toHaveBeenCalledTimes(2);
  });

  it('resposta inválida vira invalid_output; timeout do provedor vira timeout', async () => {
    const { professional, client } = await setup();
    fakeProvider.generate.mockRejectedValueOnce(new AiProviderError('invalid_response'));
    await draftNote(professional.accessToken, client.id).expect(503);
    fakeProvider.generate.mockRejectedValue(new AiProviderError('timeout'));
    await draftNote(professional.accessToken, client.id).expect(503);

    const statuses = (await prisma.aiInteractionLog.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'asc' } })).map((l) => l.status);
    expect(statuses).toEqual(['invalid_output', 'timeout']);
  });

  it('erro inesperado (não controlado) nunca vaza o detalhe interno', async () => {
    const { professional, client } = await setup();
    fakeProvider.generate.mockRejectedValue(new Error('connection string postgres://usuario:senha@host'));

    const res = await draftNote(professional.accessToken, client.id).expect(503);
    expect(res.body.message).toBe('Não foi possível gerar o conteúdo agora.');
    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: client.id } });
    expect(log.errorMessage).toBe('Não foi possível gerar o conteúdo agora.');
  });

  it('métrica de uso registra só metadados (provedor, modelo, status, duração, tokens) — nada do conteúdo', async () => {
    const { professional, client } = await setup();
    fakeProvider.generate.mockResolvedValue({ text: 'CONTEUDO-SENSIVEL-DA-RESPOSTA', model: 'mock-v1', tokensUsed: { input: 11, output: 22 } });
    const logSpy = jest.spyOn(Logger.prototype, 'log');

    await draftNote(professional.accessToken, client.id).expect(201);
    const metric = logSpy.mock.calls.map((c) => String(c[0])).find((m) => m.startsWith('ai_generation '));
    expect(metric).toMatch(/feature=draft_note provider=mock-local model=mock-v1 status=succeeded durationMs=\d+ inputTokens=11 outputTokens=22/);
    expect(metric).not.toContain('CONTEUDO-SENSIVEL');
    expect(metric).not.toContain('Resumo da consulta');
  });
});
