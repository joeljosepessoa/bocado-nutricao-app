import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { SYSTEM_PROFESSIONAL_EMAIL } from '../src/reference-data/import-reference-data';
import { registerProfessional } from './helpers';

const prisma = new PrismaClient();

// Tela "Exercícios": busca, filtros com contagem, paginação, edição pelo editor do catálogo e presets.
describe('Biblioteca de exercícios (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function setup() {
    const professional = await registerProfessional(app);
    const auth = { Authorization: `Bearer ${professional.accessToken}` };
    // Marca única para isolar estes exercícios dos milhares da biblioteca.
    const tag = `Zq${Date.now().toString(36)}`;
    const make = (name: string, muscleGroups: string[], equipment: string | null) =>
      http()
        .post('/exercises')
        .set(auth)
        .send({ name: `${tag} ${name}`, type: 'strength', scope: 'private', muscleGroups, ...(equipment ? { equipment } : {}) })
        .expect(201);
    await make('Elevação Lateral', ['Ombros'], 'Halteres');
    await make('Remada Curvada', ['Costas', 'Lombar'], 'Barra');
    await make('Rosca Martelo', ['Bíceps'], 'Halteres');
    await make('Cruzamentos em Pé', [], null);
    return { professional, auth, tag };
  }

  it('busca sem acento/caixa, contagem por grupo e equipamento, filtros e paginação', async () => {
    const { auth, tag } = await setup();
    const all = await http().get('/exercises/library').query({ search: tag.toLowerCase() }).set(auth).expect(200);
    expect(all.body.total).toBe(4);
    expect(all.body.groups).toEqual(
      expect.arrayContaining([
        { name: 'Ombros', count: 1 },
        { name: 'Costas', count: 1 },
        { name: 'Lombar', count: 1 },
        { name: 'Bíceps', count: 1 },
      ]),
    );
    expect(all.body.withoutGroup).toBe(1);
    expect(all.body.equipments).toEqual([
      { name: 'Halteres', count: 2 },
      { name: 'Barra', count: 1 },
    ]);
    expect(all.body.items[0]).toMatchObject({ name: `${tag} Cruzamentos em Pé`, muscleGroups: [], gifUrl: null, canEdit: true, scope: 'private' });

    const accent = await http().get('/exercises/library').query({ search: `${tag} elevacao` }).set(auth).expect(200);
    expect(accent.body.items.map((i: { name: string }) => i.name)).toEqual([`${tag} Elevação Lateral`]);

    const halteres = await http().get('/exercises/library').query({ search: tag, equipment: 'Halteres' }).set(auth).expect(200);
    expect(halteres.body.total).toBe(2);
    // A contagem de grupos acompanha o equipamento escolhido.
    expect(halteres.body.groups.map((g: { name: string }) => g.name).sort()).toEqual(['Bíceps', 'Ombros']);

    const costas = await http().get('/exercises/library').query({ search: tag, group: 'Costas' }).set(auth).expect(200);
    expect(costas.body.items.map((i: { muscleGroups: string[] }) => i.muscleGroups)).toEqual([['Costas', 'Lombar']]);
    const semGrupo = await http().get('/exercises/library').query({ search: tag, group: '__sem_grupo__' }).set(auth).expect(200);
    expect(semGrupo.body.total).toBe(1);

    const page2 = await http().get('/exercises/library').query({ search: tag, pageSize: 3, page: 2 }).set(auth).expect(200);
    expect(page2.body).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(page2.body.items).toHaveLength(1);
  });

  it('exercício oficial: só quem cuida do catálogo edita nome e grupos (o 1º grupo vira o principal)', async () => {
    const { professional, auth, tag } = await setup();
    const system = await prisma.user.findUniqueOrThrow({ where: { email: SYSTEM_PROFESSIONAL_EMAIL } });
    const official = await prisma.exercise.create({
      data: { name: `${tag} Oficial`, type: 'strength', scope: 'global', approvedAt: new Date(), createdByProfessionalId: system.id, muscleGroups: [], section: 'ACADEMIA / TESTE' },
    });

    const before = await http().get('/exercises/library').query({ search: `${tag} oficial` }).set(auth).expect(200);
    expect(before.body.items[0]).toMatchObject({ id: official.id, canEdit: false, section: 'ACADEMIA / TESTE' });
    await http().patch(`/exercises/${official.id}`).set(auth).send({ muscleGroups: ['Costas'] }).expect(403);

    await prisma.professional.update({ where: { id: professional.user.id }, data: { canEditCatalog: true } });
    const edited = await http().patch(`/exercises/${official.id}`).set(auth).send({ name: `${tag} Oficial Editado`, muscleGroups: ['Costas', 'Lombar'], equipment: 'Barra' }).expect(200);
    expect(edited.body).toMatchObject({ name: `${tag} Oficial Editado`, muscleGroup: 'Costas', muscleGroups: ['Costas', 'Lombar'], equipment: 'Barra' });
    const after = await http().get('/exercises/library').query({ search: `${tag} oficial` }).set(auth).expect(200);
    expect(after.body.items[0].canEdit).toBe(true);
  });

  it('presets: cria (reps exatas ou faixa), lista, recusa as duas juntas; só o dono apaga', async () => {
    const { auth, tag } = await setup();
    const lib = await http().get('/exercises/library').query({ search: `${tag} remada` }).set(auth).expect(200);
    const exerciseId = lib.body.items[0].id;

    const exact = await http().post('/exercise-presets').set(auth).send({ exerciseId, sets: 4, repsMin: 12, repsMax: 15, restSeconds: 60 }).expect(201);
    expect(exact.body).toMatchObject({ sets: 4, reps: null, repsMin: 12, repsMax: 15, restSeconds: 60, exercise: { id: exerciseId, name: `${tag} Remada Curvada`, muscleGroups: ['Costas', 'Lombar'] } });
    await http().post('/exercise-presets').set(auth).send({ exerciseId, sets: 3, reps: 10, repsMin: 8, repsMax: 10 }).expect(400);

    const list = await http().get('/exercise-presets').set(auth).expect(200);
    expect(list.body.map((p: { id: string }) => p.id)).toEqual([exact.body.id]);

    const other = await registerProfessional(app);
    const otherAuth = { Authorization: `Bearer ${other.accessToken}` };
    expect((await http().get('/exercise-presets').set(otherAuth).expect(200)).body).toEqual([]);
    await http().delete(`/exercise-presets/${exact.body.id}`).set(otherAuth).expect(404);
    // Exercício particular de outro profissional não vira preset.
    await http().post('/exercise-presets').set(otherAuth).send({ exerciseId, sets: 3, reps: 10 }).expect(404);

    await http().delete(`/exercise-presets/${exact.body.id}`).set(auth).expect(204);
    expect((await http().get('/exercise-presets').set(auth).expect(200)).body).toEqual([]);
  });
});
