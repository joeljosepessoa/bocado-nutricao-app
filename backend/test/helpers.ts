import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 100000)}@example.com`;
}

export async function registerProfessional(app: INestApplication, overrides: Partial<Record<'email' | 'password' | 'fullName', string>> = {}) {
  const payload = {
    email: overrides.email ?? uniqueEmail('professional'),
    password: overrides.password ?? 'SenhaForte123',
    fullName: overrides.fullName ?? 'Profissional de Teste',
  };
  const res = await request(app.getHttpServer())
    .post('/auth/register-professional')
    .send(payload)
    .expect(201);
  return { ...res.body, password: payload.password };
}

export async function createClient(app: INestApplication, professionalAccessToken: string, overrides: Partial<Record<'email' | 'fullName' | 'phone' | 'gender' | 'birthDate', string>> = {}) {
  const payload = {
    email: overrides.email ?? uniqueEmail('client'),
    fullName: overrides.fullName ?? 'Cliente de Teste',
    ...(overrides.phone ? { phone: overrides.phone } : {}),
    ...(overrides.gender ? { gender: overrides.gender } : {}),
    ...(overrides.birthDate ? { birthDate: overrides.birthDate } : {}),
  };
  const res = await request(app.getHttpServer())
    .post('/professionals/me/clients')
    .set('Authorization', `Bearer ${professionalAccessToken}`)
    .send(payload)
    .expect(201);
  return res.body as {
    client: { id: string; professionalId: string; user: { id: string; email: string; fullName: string } };
    temporaryPassword: string;
  };
}

export async function login(app: INestApplication, email: string, password: string) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body;
}

export async function createFood(app: INestApplication, accessToken: string, overrides: Record<string, unknown> = {}) {
  const payload = {
    name: (overrides.name as string) ?? `Alimento ${uniqueEmail('food')}`,
    baseUnit: 'g',
    kcalPer100: 100,
    proteinGPer100: 10,
    carbGPer100: 10,
    fatGPer100: 2,
    ...overrides,
  };
  const res = await request(app.getHttpServer())
    .post('/foods')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(payload)
    .expect(201);
  return res.body;
}

export async function createDiet(app: INestApplication, accessToken: string, clientId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app.getHttpServer())
    .post(`/clients/${clientId}/diets`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send(overrides)
    .expect(201);
  return res.body;
}

export async function createExercise(app: INestApplication, accessToken: string, overrides: Record<string, unknown> = {}) {
  const payload = {
    name: (overrides.name as string) ?? `Exercício ${uniqueEmail('exercise')}`,
    type: 'strength',
    ...overrides,
  };
  const res = await request(app.getHttpServer())
    .post('/exercises')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(payload)
    .expect(201);
  return res.body;
}

export async function createWorkout(app: INestApplication, accessToken: string, clientId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app.getHttpServer())
    .post(`/clients/${clientId}/workouts`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send(overrides)
    .expect(201);
  return res.body;
}
