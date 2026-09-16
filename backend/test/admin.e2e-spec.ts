import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { bootstrapAdmin } from '../src/admin-bootstrap/bootstrap-admin';
import {
  createAdmin,
  createClient,
  createDiet,
  createExercise,
  createFood,
  createWorkout,
  registerProfessional,
  uniqueEmail,
} from './helpers';

const prisma = new PrismaClient();

describe('Administração (e2e — Fase 15)', () => {
  let app: INestApplication;
  let migratedAt: Date;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    // Marco real do backfill, não um timestamp de parede: specs rodam em
    // paralelo (processos separados), então "agora" não separa de forma
    // confiável "existia antes da Fase 15" de "outra suíte criou global
    // pendente ao mesmo tempo que esta". O horário em que a migration da
    // Fase 15 de fato rodou é o único corte correto.
    const rows = await prisma.$queryRaw<{ finished_at: Date }[]>`
      SELECT finished_at FROM "_prisma_migrations" WHERE migration_name = '20260916211131_add_admin_governance'
    `;
    migratedAt = rows[0].finished_at;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // --- RBAC ---------------------------------------------------------------

  describe('RBAC', () => {
    it('client (role real) recebe 403 em rota /admin', async () => {
      const professional = await registerProfessional(app);
      const created = await createClient(app, professional.accessToken);
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: created.client.user.email, password: created.temporaryPassword })
        .expect(200);

      await request(app.getHttpServer())
        .get('/admin/professionals')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(403);
    });

    it('professional sem admin recebe 403 em rota /admin', async () => {
      const professional = await registerProfessional(app);
      await request(app.getHttpServer())
        .get('/admin/professionals')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(403);
    });

    it('usuário não autenticado recebe 401 em rota /admin', async () => {
      await request(app.getHttpServer()).get('/admin/professionals').expect(401);
    });

    it('admin acessa normalmente', async () => {
      const admin = await createAdmin(app);
      await request(app.getHttpServer())
        .get('/admin/professionals')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
    });

    it('professional comum não consegue escalar privilégio alterando só o corpo/parâmetros da requisição', async () => {
      const professional = await registerProfessional(app);
      const other = await registerProfessional(app);

      await request(app.getHttpServer())
        .post(`/admin/professionals/${other.user.id}/suspend`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ role: 'admin' })
        .expect(403);

      await request(app.getHttpServer())
        .get('/admin/metrics')
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .expect(403);
    });
  });

  // --- Bootstrap ------------------------------------------------------------

  describe('Bootstrap do primeiro admin', () => {
    // Suíte roda em paralelo com outras (e a própria RBAC/moderação acima já
    // cria admins via createAdmin()), então "nenhum admin existe" não é uma
    // premissa confiável aqui — a garantia testável é a relativa: a segunda
    // chamada NUNCA cria um admin a mais, tenha ou não existido um antes da
    // primeira. Quando o ambiente realmente está limpo (adminCountBefore
    // === 0), também confirmamos a criação real do primeiro.
    it('idempotente — chamar duas vezes nunca cria dois admins novos', async () => {
      const emailA = uniqueEmail('bootstrap-a');
      const emailB = uniqueEmail('bootstrap-b');
      const adminCountBefore = await prisma.user.count({ where: { role: 'admin' } });

      const first = await bootstrapAdmin(prisma, { email: emailA, password: 'BootstrapForte123' });
      const adminCountAfterFirst = await prisma.user.count({ where: { role: 'admin' } });

      const second = await bootstrapAdmin(prisma, { email: emailB, password: 'OutraSenhaForte123' });
      const adminCountAfterSecond = await prisma.user.count({ where: { role: 'admin' } });

      expect(adminCountAfterSecond).toBe(adminCountAfterFirst);
      expect(second.created).toBe(false);
      expect(await prisma.user.findUnique({ where: { email: emailB } })).toBeNull();

      if (adminCountBefore === 0) {
        expect(first.created).toBe(true);
        const created = await prisma.user.findUnique({ where: { email: emailA } });
        expect(created?.role).toBe('admin');
      }
    });

    it('recusa com erro claro quando faltam variáveis obrigatórias', async () => {
      await expect(bootstrapAdmin(prisma, {})).rejects.toThrow(/ADMIN_BOOTSTRAP_EMAIL/);
    });

    it('recusa e-mail inválido', async () => {
      await expect(bootstrapAdmin(prisma, { email: 'não-é-email', password: 'BootstrapForte123' })).rejects.toThrow();
    });

    it('recusa senha fraca', async () => {
      await expect(bootstrapAdmin(prisma, { email: uniqueEmail('bootstrap-weak'), password: '123' })).rejects.toThrow();
    });

    it('nunca inclui a senha em nenhum resultado retornado', async () => {
      const result = await bootstrapAdmin(prisma, { email: uniqueEmail('bootstrap-nopw'), password: 'BootstrapForte123' });
      expect(JSON.stringify(result)).not.toContain('BootstrapForte123');
    });
  });

  // --- Suspensão / reativação ------------------------------------------------

  describe('Suspensão e reativação de profissional', () => {
    it('suspender bloqueia novo login e revoga sessões mobile e web imediatamente; reativar permite login de novo', async () => {
      const admin = await createAdmin(app);
      const professional = await registerProfessional(app);
      const { client } = await createClient(app, professional.accessToken);

      const webLogin = await request(app.getHttpServer())
        .post('/auth/web/login')
        .set('X-Bocado-Client', 'web')
        .send({ email: professional.user.email, password: professional.password })
        .expect(200);
      const webCookie = webLogin.headers['set-cookie'];

      await request(app.getHttpServer())
        .post(`/admin/professionals/${professional.user.id}/suspend`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      // login novo bloqueado
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: professional.user.email, password: professional.password })
        .expect(401);

      // refresh mobile emitido antes da suspensão agora falha
      await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: professional.refreshToken }).expect(401);

      // refresh web (cookie) emitido antes da suspensão também falha
      await request(app.getHttpServer())
        .post('/auth/web/refresh')
        .set('X-Bocado-Client', 'web')
        .set('Cookie', webCookie)
        .expect(401);

      // dados preservados — cliente cadastrado continua existindo
      const clientStillThere = await prisma.client.findUnique({ where: { id: client.id } });
      expect(clientStillThere).not.toBeNull();

      // reativar
      await request(app.getHttpServer())
        .post(`/admin/professionals/${professional.user.id}/reactivate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: professional.user.email, password: professional.password })
        .expect(200);
    });

    it('suspender/reativar profissional inexistente retorna 404', async () => {
      const admin = await createAdmin(app);
      await request(app.getHttpServer())
        .post('/admin/professionals/00000000-0000-0000-0000-000000000000/suspend')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(404);
    });
  });

  // --- Moderação --------------------------------------------------------------

  describe('Moderação de conteúdo global', () => {
    it('conteúdo privado nunca aparece na fila de moderação', async () => {
      const professional = await registerProfessional(app);
      const admin = await createAdmin(app);
      await createFood(app, professional.accessToken, { name: 'Receita privada de teste', scope: 'private' });
      await createExercise(app, professional.accessToken, { name: 'Movimento privado de teste', scope: 'private' });

      const pendingFoods = await request(app.getHttpServer())
        .get('/admin/moderation/foods')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(pendingFoods.body.find((f: { name: string }) => f.name === 'Receita privada de teste')).toBeUndefined();

      const pendingExercises = await request(app.getHttpServer())
        .get('/admin/moderation/exercises')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(pendingExercises.body.find((e: { name: string }) => e.name === 'Movimento privado de teste')).toBeUndefined();
    });

    it('aprovação exige admin', async () => {
      const professional = await registerProfessional(app);
      const other = await registerProfessional(app);
      const food = await createFood(app, professional.accessToken, { name: uniqueEmail('mod-food') });

      await request(app.getHttpServer())
        .post(`/admin/moderation/foods/${food.id}/approve`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(403);
    });

    it('rejeição exige admin', async () => {
      const professional = await registerProfessional(app);
      const other = await registerProfessional(app);
      const food = await createFood(app, professional.accessToken, { name: uniqueEmail('mod-food-reject') });

      await request(app.getHttpServer())
        .delete(`/admin/moderation/foods/${food.id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(403);
    });

    it('rejeição exclui alimento pendente não utilizado; alimento em uso retorna 409 e não é excluído', async () => {
      const professional = await registerProfessional(app);
      const admin = await createAdmin(app);
      const { client } = await createClient(app, professional.accessToken);

      const unusedFood = await createFood(app, professional.accessToken, { name: uniqueEmail('unused-food') });
      await request(app.getHttpServer())
        .delete(`/admin/moderation/foods/${unusedFood.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(204);
      expect(await prisma.food.findUnique({ where: { id: unusedFood.id } })).toBeNull();

      const usedFood = await createFood(app, professional.accessToken, { name: uniqueEmail('used-food') });
      const diet = await createDiet(app, professional.accessToken, client.id);
      const meal = await request(app.getHttpServer())
        .post(`/clients/${client.id}/diets/${diet.id}/versions/${diet.currentVersion.id}/meals`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ name: 'Refeição de teste' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/clients/${client.id}/diets/${diet.id}/versions/${diet.currentVersion.id}/meals/${meal.body.id}/foods`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ foodId: usedFood.id, quantity: 100, unit: 'g' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/admin/moderation/foods/${usedFood.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);
      expect(await prisma.food.findUnique({ where: { id: usedFood.id } })).not.toBeNull();
    });

    it('rejeição exclui exercício pendente não utilizado; exercício em uso retorna 409 e não é excluído', async () => {
      const professional = await registerProfessional(app);
      const admin = await createAdmin(app);
      const { client } = await createClient(app, professional.accessToken);

      const unusedExercise = await createExercise(app, professional.accessToken, { name: uniqueEmail('unused-exercise') });
      await request(app.getHttpServer())
        .delete(`/admin/moderation/exercises/${unusedExercise.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(204);
      expect(await prisma.exercise.findUnique({ where: { id: unusedExercise.id } })).toBeNull();

      const usedExercise = await createExercise(app, professional.accessToken, { name: uniqueEmail('used-exercise') });
      const workout = await createWorkout(app, professional.accessToken, client.id);
      const day = await request(app.getHttpServer())
        .post(`/clients/${client.id}/workouts/${workout.id}/versions/${workout.currentVersion.id}/days`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ name: 'Dia de teste' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/clients/${client.id}/workouts/${workout.id}/versions/${workout.currentVersion.id}/days/${day.body.id}/exercises`)
        .set('Authorization', `Bearer ${professional.accessToken}`)
        .send({ exerciseId: usedExercise.id })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/admin/moderation/exercises/${usedExercise.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);
      expect(await prisma.exercise.findUnique({ where: { id: usedExercise.id } })).not.toBeNull();
    });

    it('aprovar conteúdo inexistente ou já privado retorna 404', async () => {
      const professional = await registerProfessional(app);
      const admin = await createAdmin(app);
      const privateFood = await createFood(app, professional.accessToken, { name: uniqueEmail('private-approve'), scope: 'private' });

      await request(app.getHttpServer())
        .post(`/admin/moderation/foods/${privateFood.id}/approve`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(404);
    });
  });

  // --- Backfill -----------------------------------------------------------

  describe('Backfill retroativo (Fase 15, decisão 3)', () => {
    it('todo conteúdo global criado antes da Fase 15 permanece aprovado (nenhum some do catálogo)', async () => {
      const unapprovedPreExistingFoods = await prisma.food.count({
        where: { scope: 'global', approvedAt: null, createdAt: { lt: migratedAt } },
      });
      expect(unapprovedPreExistingFoods).toBe(0);

      const unapprovedPreExistingExercises = await prisma.exercise.count({
        where: { scope: 'global', approvedAt: null, createdAt: { lt: migratedAt } },
      });
      expect(unapprovedPreExistingExercises).toBe(0);
    });
  });

  // --- Auditoria ------------------------------------------------------------

  describe('Auditoria administrativa', () => {
    it('registra cada ação administrativa relevante, sem senha/token/dado sensível', async () => {
      const admin = await createAdmin(app);
      const professional = await registerProfessional(app);
      const food = await createFood(app, professional.accessToken, { name: uniqueEmail('audit-food') });

      await request(app.getHttpServer())
        .post(`/admin/professionals/${professional.user.id}/suspend`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/admin/professionals/${professional.user.id}/reactivate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/admin/moderation/foods/${food.id}/approve`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      const logs = await prisma.adminAuditLog.findMany({ where: { adminId: admin.id }, orderBy: { createdAt: 'asc' } });
      const actions = logs.map((l) => l.action);
      expect(actions).toEqual(
        expect.arrayContaining(['professional_suspended', 'professional_reactivated', 'content_approved']),
      );

      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain(admin.password);
      expect(serialized.toLowerCase()).not.toContain('passwordhash');
      expect(serialized.toLowerCase()).not.toContain('token');
    });
  });

  // --- Métricas ---------------------------------------------------------

  describe('Métricas agregadas', () => {
    it('retorna contagens reais, nunca inventadas', async () => {
      const admin = await createAdmin(app);
      const res = await request(app.getHttpServer())
        .get('/admin/metrics')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(res.body.professionals.total).toBeGreaterThan(0);
      expect(typeof res.body.foods.globalApproved).toBe('number');
      expect(typeof res.body.foods.globalPending).toBe('number');
    });
  });
});
