import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createClient, registerProfessional } from './helpers';

/**
 * Multipart hostil no upload de foto (POST /clients/:id/evaluations/:id/photos).
 *
 * O objetivo NÃO é só "devolver 4xx": cada requisição hostil precisa ser rejeitada rápido, sem
 * gravar nada e SEM derrubar/travar o processo — provado por um upload legítimo logo em seguida
 * (a API roda dentro do processo do jest: um crash ou um loop de CPU derrubaria/pendurava este teste).
 * Mesma classe de falha dos avisos do multer < 2.3.0 (nomes de campo com colchetes/índices enormes,
 * aninhamento profundo, inundação de campos/partes).
 */

const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
// Teto de tempo por requisição: não mede desempenho, detecta TRAVAMENTO (o loop de CPU do multer antigo passava de 60 s).
const MAX_RESPONSE_MS = 15_000;

const BOUNDARY = '----bocado-hostil-boundary';

interface Part {
  name: string;
  value?: string;
  filename?: string;
  contentType?: string;
  content?: Buffer;
}

/** Monta o corpo multipart na mão: os testes hostis precisam de controle total sobre nomes e partes. */
function multipart(parts: Part[], options: { close?: boolean } = {}): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    let head = `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"`;
    if (part.filename !== undefined) head += `; filename="${part.filename}"`;
    head += '\r\n';
    if (part.contentType) head += `Content-Type: ${part.contentType}\r\n`;
    head += '\r\n';
    chunks.push(Buffer.from(head), part.content ?? Buffer.from(part.value ?? ''), Buffer.from('\r\n'));
  }
  if (options.close !== false) chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

const angle: Part = { name: 'angle', value: 'front' };
const photo: Part = { name: 'file', filename: 'foto.jpg', contentType: 'image/jpeg', content: JPEG };

describe('Upload de foto — multipart hostil (e2e)', () => {
  let app: INestApplication;
  let url: string;
  let auth: string;
  let evaluationUrl: string;
  let legitUploads = 0;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const professional = await registerProfessional(app);
    auth = `Bearer ${professional.accessToken}`;
    const { client } = await createClient(app, professional.accessToken);
    const evaluation = (
      await request(app.getHttpServer())
        .post(`/clients/${client.id}/evaluations`)
        .set('Authorization', auth)
        .send({ heightCm: 178, weightKg: 80 })
        .expect(201)
    ).body;
    evaluationUrl = `/clients/${client.id}/evaluations/${evaluation.id}`;
    url = `${evaluationUrl}/photos`;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  function postRaw(body: Buffer, contentType = `multipart/form-data; boundary=${BOUNDARY}`, authorization: string | null = auth) {
    const req = request(app.getHttpServer()).post(url).set('Content-Type', contentType);
    if (authorization) req.set('Authorization', authorization);
    return req.send(body);
  }

  /** Prova de vida: um upload legítimo funciona (o processo não caiu nem ficou travado). */
  async function expectAlive(contentType = 'image/jpeg', content: Buffer = JPEG, filename = 'ok.jpg') {
    const started = Date.now();
    const res = await request(app.getHttpServer())
      .post(url)
      .set('Authorization', auth)
      .field('angle', 'front')
      .attach('file', content, { filename, contentType });
    expect(res.status).toBe(201);
    expect(res.body.angle).toBe('front');
    expect(Date.now() - started).toBeLessThan(MAX_RESPONSE_MS);
    legitUploads += 1;
  }

  /** A requisição hostil é rejeitada (4xx, nunca 5xx), rápido, sem vazar stack — e a API segue viva. */
  async function expectRejectedAndAlive(body: Buffer, statuses: number[] = [400], contentType?: string) {
    const started = Date.now();
    const res = await postRaw(body, contentType);
    const elapsed = Date.now() - started;
    expect(statuses).toContain(res.status);
    expect(elapsed).toBeLessThan(MAX_RESPONSE_MS);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.(js|ts):\d+|node_modules/);
    await expectAlive();
  }

  describe('contrato legítimo continua funcionando', () => {
    it('aceita JPEG, PNG e WebP', async () => {
      await expectAlive('image/jpeg', JPEG, 'a.jpg');
      await expectAlive('image/png', PNG, 'a.png');
      await expectAlive('image/webp', WEBP, 'a.webp');
    });

    it('aceita exatamente 10 MB e rejeita 10 MB + 1 byte com 413', async () => {
      await expectAlive('image/jpeg', Buffer.alloc(MAX_PHOTO_BYTES, 1), 'limite.jpg');
      await expectRejectedAndAlive(
        multipart([angle, { ...photo, content: Buffer.alloc(MAX_PHOTO_BYTES + 1, 1) }]),
        [413],
      );
    }, 30_000);

    it('todo ângulo válido do contrato (o nome mais longo, side_right) passa pelos limites de campo', async () => {
      for (const value of ['front', 'side_right', 'back', 'side_left']) {
        const res = await postRaw(multipart([{ name: 'angle', value }, photo]));
        expect(res.status).toBe(201);
        legitUploads += 1;
      }
    });
  });

  describe('multipart hostil é rejeitado e a API continua operacional', () => {
    it('1. nome de campo extremamente longo', async () => {
      await expectRejectedAndAlive(multipart([{ name: 'a'.repeat(200_000), value: 'x' }, angle, photo]));
      await expectRejectedAndAlive(multipart([{ name: 'x'.repeat(40), value: 'x' }, angle, photo]));
    });

    it('2. quantidade excessiva de campos', async () => {
      const many = Array.from({ length: 500 }, (_, i) => ({ name: `f${i}`, value: 'x' }));
      await expectRejectedAndAlive(multipart([angle, ...many, photo]));
    });

    it('2b. campo extra além de "angle" (mesmo um só) é rejeitado', async () => {
      await expectRejectedAndAlive(multipart([angle, { name: 'extra', value: '1' }, photo]));
      await expectRejectedAndAlive(multipart([angle, { name: 'angle', value: 'back' }, photo]));
    });

    it('2c. valor de campo grande demais', async () => {
      await expectRejectedAndAlive(multipart([{ name: 'angle', value: 'front'.repeat(5_000) }, photo]));
    });

    it('3. aninhamento profundo (a[b][c]...) — curto e longo', async () => {
      await expectRejectedAndAlive(multipart([{ name: 'a[b][c][d][e]', value: 'x' }, angle, photo]));
      await expectRejectedAndAlive(multipart([{ name: 'angle[]', value: 'x' }, photo]));
      await expectRejectedAndAlive(multipart([{ name: 'a' + '[b]'.repeat(500), value: 'x' }, angle, photo]));
    });

    it('4. partes em excesso (campos e arquivos)', async () => {
      const files = Array.from({ length: 200 }, (_, i) => ({ name: i % 2 ? 'file' : `f${i}`, filename: `${i}.jpg`, contentType: 'image/jpeg', content: Buffer.from('x') }));
      await expectRejectedAndAlive(multipart([angle, photo, ...files]));
      await expectRejectedAndAlive(multipart([angle, photo, photo]));
      await expectRejectedAndAlive(multipart([angle, { ...photo, name: 'outro' }]));
    });

    it('5. arquivo acima do limite → 413', async () => {
      await expectRejectedAndAlive(multipart([angle, { ...photo, content: Buffer.alloc(MAX_PHOTO_BYTES + 5_000, 7) }]), [413]);
    }, 30_000);

    it('6. MIME não permitido', async () => {
      for (const contentType of ['text/plain', 'text/html', 'image/svg+xml', 'image/gif', 'application/x-msdownload', 'application/octet-stream']) {
        const res = await postRaw(multipart([angle, { ...photo, contentType, content: Buffer.from('<script>alert(1)</script>') }]));
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Formato de imagem/);
        await expectAlive();
      }
    });

    it('7. multipart malformado (sem boundary, truncado, sem partes)', async () => {
      await expectRejectedAndAlive(multipart([angle, photo]), [400], 'multipart/form-data');
      await expectRejectedAndAlive(multipart([angle, photo], { close: false }).subarray(0, 300));
      await expectRejectedAndAlive(Buffer.from(`--${BOUNDARY}--\r\n`));
      await expectRejectedAndAlive(Buffer.from('lixo qualquer que não é multipart'));
    });
  });

  describe('nomes de campo das falhas de DoS do multer (colchetes e índices gigantes)', () => {
    it('rejeita rápido, sem crash e sem travar a CPU', async () => {
      const payloads = [
        [{ name: 'items[4294967294]', value: 'a' }, { name: 'items[x]', value: 'b' }],
        [{ name: 'a[4294967295]', value: 'a' }, { name: 'a[4294967296]', value: 'b' }],
        [{ name: 'a[]', value: '1' }, { name: 'a[4294967295]', value: '2' }],
        [{ name: 'a[-1]', value: '1' }, { name: 'a[1e10]', value: '2' }],
        [{ name: '__proto__[x]', value: '1' }, { name: 'constructor[prototype][y]', value: '2' }],
      ];
      for (const fields of payloads) {
        await expectRejectedAndAlive(multipart([...fields, angle, photo]));
      }
    }, 60_000);
  });

  describe('autenticação vem antes do parser de multipart', () => {
    it('hostil sem token → 401 (nem chega ao multer); com token inválido → 401', async () => {
      const hostile = multipart([{ name: 'a' + '[b]'.repeat(500), value: 'x' }, angle, photo]);
      expect((await postRaw(hostile, undefined, null)).status).toBe(401);
      expect((await postRaw(hostile, undefined, 'Bearer isto-nao-e-um-jwt')).status).toBe(401);
      await expectAlive();
    });
  });

  it('nada hostil foi gravado: só os uploads legítimos aparecem na avaliação', async () => {
    const res = await request(app.getHttpServer()).get(evaluationUrl).set('Authorization', auth).expect(200);
    expect(res.body.photos).toHaveLength(legitUploads);
  });
});
