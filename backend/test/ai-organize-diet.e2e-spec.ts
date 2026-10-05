import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { MockAiProvider } from '../src/ai/providers/mock-ai.provider';
import type { AiGenerationRequest, AiGenerationResult } from '../src/ai/providers/ai-provider.interface';
import { ORGANIZED_DIET_JSON_SCHEMA } from '../src/ai/use-cases/organize-diet/organized-diet.schema';
import { createClient, createFood, registerProfessional } from './helpers';

const prisma = new PrismaClient();

/**
 * Provedor falso controlado pelo teste, no lugar do mock local (mesmo id) —
 * o pipeline real (autorização, consentimento, conferência de fidelidade,
 * matching, logs) roda inteiro; só a resposta do "modelo" é roteirizada.
 */
const fakeProvider = {
  id: 'mock-local',
  supportsStructuredOutput: true,
  generate: jest.fn<Promise<AiGenerationResult>, [AiGenerationRequest]>(),
};

const reply = (body: unknown) =>
  fakeProvider.generate.mockResolvedValueOnce({ text: typeof body === 'string' ? body : JSON.stringify(body), model: 'fake-model' });

const item = (sourceText: string, food: string, quantity: number | null, unit: string | null) => ({ sourceText, food, quantity, unit, notes: null });

describe('IA — organizar dieta existente (e2e)', () => {
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

  beforeEach(() => {
    fakeProvider.generate.mockReset();
    fakeProvider.supportsStructuredOutput = true;
  });

  async function setup({ professionalConsent = true } = {}) {
    const professional = await registerProfessional(app);
    const { client, temporaryPassword } = await createClient(app, professional.accessToken);
    if (professionalConsent) {
      await request(app.getHttpServer()).post('/professionals/me/ai/consent').set('Authorization', `Bearer ${professional.accessToken}`).expect(201);
    }
    const tag = Date.now().toString(36);
    const bread = await createFood(app, professional.accessToken, { name: `Pão integral ${tag}`, scope: 'private' });
    return { professional, client, temporaryPassword, tag, bread };
  }

  const organize = (token: string, clientId: string, dietText: string) =>
    request(app.getHttpServer()).post(`/clients/${clientId}/ai/generate`).set('Authorization', `Bearer ${token}`).send({ feature: 'organize_diet', dietText });

  it('organiza sem alterar quantidades; gera só PROPOSTA (nenhuma dieta criada/publicada); log com política professional_material', async () => {
    const { professional, client, tag, bread } = await setup();
    const text = `CAFÉ DA MANHÃ\n2 fatias de Pão integral ${tag}\n150 g de fruta`;
    reply({
      meals: [
        {
          name: 'CAFÉ DA MANHÃ',
          time: null,
          notes: null,
          items: [item(`2 fatias de Pão integral ${tag}`, `Pão integral ${tag}`, 2, 'fatias'), item('150 g de fruta', 'fruta', 150, 'g')],
        },
      ],
      warnings: [],
    });

    const res = await organize(professional.accessToken, client.id, text).expect(201);
    const proposal = res.body.structuredData;
    expect(proposal.meals).toHaveLength(1);
    expect(proposal.meals[0].items.map((i: { quantity: number; unit: string }) => [i.quantity, i.unit])).toEqual([
      [2, 'slice'],
      [150, 'g'],
    ]);
    expect(proposal.meals[0].items[0]).toMatchObject({ matchStatus: 'matched', matchedFood: { id: bread.id } });
    expect(proposal.meals[0].items[1]).toMatchObject({ matchStatus: 'not_found', matchedFood: null });
    expect(proposal.meals[0].items[1].warnings[0]).toMatch(/não identificado/);

    // Contexto mínimo e saída estruturada com o schema da dieta.
    const sent = fakeProvider.generate.mock.calls[0][0];
    expect(sent.context).toEqual({ dietText: text });
    expect(sent.responseSchema).toEqual(ORGANIZED_DIET_JSON_SCHEMA);
    expect(JSON.stringify(sent)).not.toContain(client.user.fullName);

    expect(await prisma.diet.count({ where: { clientId: client.id } })).toBe(0);
    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: client.id, feature: 'organize_diet' } });
    expect(log).toMatchObject({ status: 'succeeded', processingPolicy: 'professional_material', promptVersion: 'organize_diet@v1' });
  });

  it.each([
    ['quantidade alterada', item('150 g de fruta', 'fruta', 200, 'g'), /quantidade 200/],
    ['alimento trocado', item('150 g de fruta', 'banana', 150, 'g'), /alimento "banana"/],
    ['alimento inventado', item('1 colher de azeite', 'azeite', 1, 'colher de sopa'), /não está no texto/],
  ])('%s: resposta recusada (invalid_output), nada devolvido', async (_label, fruitItem, message) => {
    const { professional, client } = await setup();
    reply({ meals: [{ name: 'ALMOÇO', time: null, notes: null, items: [fruitItem] }], warnings: [] });
    const res = await organize(professional.accessToken, client.id, 'ALMOÇO\n150 g de fruta').expect(503);
    expect(res.body.message).toMatch(message);
    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: client.id, feature: 'organize_diet' } });
    expect(log.status).toBe('invalid_output');
  });

  it('refeição acrescentada pela IA é recusada; alimento omitido vira aviso de revisão', async () => {
    const { professional, client } = await setup();
    reply({
      meals: [
        { name: 'ALMOÇO', time: null, notes: null, items: [item('150 g de fruta', 'fruta', 150, 'g')] },
        { name: 'CEIA', time: null, notes: null, items: [item('150 g de fruta', 'fruta', 150, 'g')] },
      ],
      warnings: [],
    });
    await organize(professional.accessToken, client.id, 'ALMOÇO\n150 g de fruta').expect(503);

    reply({ meals: [{ name: 'ALMOÇO', time: null, notes: null, items: [item('150 g de fruta', 'fruta', 150, 'g')] }], warnings: [] });
    const res = await organize(professional.accessToken, client.id, 'ALMOÇO\n150 g de fruta\n100 g de feijão').expect(201);
    expect(res.body.structuredData.warnings).toEqual(['Trecho não organizado: "100 g de feijão" — revisar.']);
  });

  it('resposta que não é JSON é recusada', async () => {
    const { professional, client } = await setup();
    reply('Claro! Sua dieta está ótima.');
    await organize(professional.accessToken, client.id, 'ALMOÇO\n150 g de fruta').expect(503);
  });

  it('consentimento: sem o do profissional → 403 e provedor nunca chamado; o da cliente não é exigido', async () => {
    const { professional, client } = await setup({ professionalConsent: false });
    await organize(professional.accessToken, client.id, 'ALMOÇO\n150 g de fruta').expect(403);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });

  it('a cliente não pode pedir organize_diet pelo app', async () => {
    const { client, temporaryPassword } = await setup();
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: client.user.email, password: temporaryPassword }).expect(200);
    await request(app.getHttpServer())
      .post('/client/ai/generate')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ feature: 'organize_diet', dietText: 'ALMOÇO\n150 g de fruta' })
      .expect(400);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });

  it('provedor sem saída estruturada (mock local): erro claro, provedor não chamado, log "failed"', async () => {
    const { professional, client } = await setup();
    fakeProvider.supportsStructuredOutput = false;
    const res = await organize(professional.accessToken, client.id, 'ALMOÇO\n150 g de fruta').expect(503);
    expect(res.body.message).toMatch(/AI_PROVIDER=anthropic/);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
    const log = await prisma.aiInteractionLog.findFirstOrThrow({ where: { clientId: client.id, feature: 'organize_diet' } });
    expect(log.status).toBe('failed');
  });

  it('texto vazio é recusado na validação', async () => {
    const { professional, client } = await setup();
    await organize(professional.accessToken, client.id, '   ').expect(400);
    expect(fakeProvider.generate).not.toHaveBeenCalled();
  });
});
