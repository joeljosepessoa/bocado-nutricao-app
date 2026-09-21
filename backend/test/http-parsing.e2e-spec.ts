import { Controller, Get, INestApplication, Post, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json, Request, urlencoded } from 'express';
import type { IncomingMessage } from 'http';
import request from 'supertest';

/**
 * Parsing HTTP do backend (express + body-parser + qs) — configurado exatamente como o main.ts:
 * `bodyParser: false`, json() com `verify` guardando req.rawBody (a assinatura HMAC do webhook do
 * Mercado Pago precisa dos bytes exatos), urlencoded extended e limite de 1 MB.
 *
 * Guarda de regressão das versões fixadas por "overrides" no package.json da raiz: express,
 * body-parser e qs vêm pinados por @nestjs/platform-express 10.x, então quem mantém a versão
 * corrigida é o override, e estes testes falham se o comportamento de que a API depende mudar.
 * Sem banco: sobe só um controller de eco.
 */
@Controller('echo')
class EchoController {
  @Post('body')
  body(@Req() req: Request & { rawBody?: Buffer }) {
    return { body: req.body, raw: req.rawBody ? req.rawBody.toString('utf8') : null };
  }

  @Get('query')
  query(@Req() req: Request) {
    return { query: req.query };
  }
}

describe('Parsing HTTP: express + body-parser + qs (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [EchoController] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.use(
      json({
        limit: '1mb',
        verify: (req: IncomingMessage & { rawBody?: Buffer }, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
    app.use(urlencoded({ extended: true, limit: '1mb' }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (body: string | Record<string, unknown>, contentType?: string) => {
    const req = request(app.getHttpServer()).post('/echo/body');
    if (contentType) req.set('Content-Type', contentType);
    return req.send(body as never);
  };

  describe('corpo JSON', () => {
    it('JSON normal é parseado e o corpo CRU chega byte a byte (base da assinatura do webhook)', async () => {
      const raw = '{"type":"payment","data":{"id":"123"},"acentuação":"ção ✓"}';
      const res = await post(raw, 'application/json').expect(201);
      expect(res.body.body).toEqual({ type: 'payment', data: { id: '123' }, acentuação: 'ção ✓' });
      expect(res.body.raw).toBe(raw);
    });

    it('JSON malformado → 400', async () => {
      await post('{"a":', 'application/json').expect(400);
    });

    it('corpo acima de 1 MB → 413; logo abaixo do limite passa', async () => {
      const over = JSON.stringify({ x: 'a'.repeat(1024 * 1024 + 1024) });
      await post(over, 'application/json').expect(413);
      const under = JSON.stringify({ x: 'a'.repeat(1024 * 1024 - 1024) });
      const ok = await post(under, 'application/json').expect(201);
      expect(ok.body.body.x).toHaveLength(1024 * 1024 - 1024);
    });

    it('um `limit` inválido na configuração falha ao criar o middleware (não desliga o limite em silêncio)', () => {
      expect(() => json({ limit: 'abc' })).toThrow(/limit/);
      expect(() => urlencoded({ extended: true, limit: 'abc' })).toThrow(/limit/);
      expect(() => json({ limit: '1mb' })).not.toThrow();
    });
  });

  describe('corpo urlencoded (extended)', () => {
    it('pares simples, aninhados e arrays', async () => {
      const res = await post('a=1&b=dois&user[name]=Ana&user[tags][]=x&user[tags][]=y&ids[0]=7&ids[1]=8', 'application/x-www-form-urlencoded').expect(201);
      expect(res.body.body).toEqual({ a: '1', b: 'dois', user: { name: 'Ana', tags: ['x', 'y'] }, ids: ['7', '8'] });
    });

    it('caracteres codificados e acentos', async () => {
      const res = await post('nome=Jos%C3%A9+da+Silva&email=a%40b.com', 'application/x-www-form-urlencoded').expect(201);
      expect(res.body.body).toEqual({ nome: 'José da Silva', email: 'a@b.com' });
    });

    it('acima de 1 MB → 413', async () => {
      await post('x=' + 'a'.repeat(1024 * 1024 + 1024), 'application/x-www-form-urlencoded').expect(413);
    });

    it('até 1000 parâmetros passam e 1001 são rejeitados (parameterLimit padrão)', async () => {
      const make = (n: number) => Array.from({ length: n }, (_, i) => `p${i}=1`).join('&');
      const ok = await post(make(1000), 'application/x-www-form-urlencoded').expect(201);
      expect(Object.keys(ok.body.body)).toHaveLength(1000);
      await post(make(1001), 'application/x-www-form-urlencoded').expect(413);
    });
  });

  describe('query string (parser estendido do Express)', () => {
    const get = (qs: string) => request(app.getHttpServer()).get(`/echo/query?${qs}`);

    it('parâmetros escalares usados pelos endpoints (page, pageSize, search, status, clientId)', async () => {
      const res = await get('page=2&pageSize=25&search=Jos%C3%A9&status=active&clientId=abc-123').expect(200);
      expect(res.body.query).toEqual({ page: '2', pageSize: '25', search: 'José', status: 'active', clientId: 'abc-123' });
    });

    it('chaves com ponto e nomes do webhook do Mercado Pago (data.id, type)', async () => {
      const res = await get('data.id=1234567890&type=payment').expect(200);
      expect(res.body.query['data.id']).toBe('1234567890');
      expect(res.body.query.type).toBe('payment');
    });

    it('chave repetida vira array; colchetes viram array; colchetes aninhados viram objeto', async () => {
      const res = await get('status=a&status=b&ids[]=1&ids[]=2&filter[name]=x&filter[age][gt]=3').expect(200);
      expect(res.body.query).toEqual({ status: ['a', 'b'], ids: ['1', '2'], filter: { name: 'x', age: { gt: '3' } } });
    });

    it('valor vazio e parâmetro sem valor', async () => {
      const res = await get('search=&flag').expect(200);
      expect(res.body.query).toEqual({ search: '', flag: '' });
    });

    it('protótipo nunca é poluído por chaves hostis (__proto__, constructor[prototype])', async () => {
      await get('__proto__[polluted]=1&constructor[prototype][polluted]=1&a[__proto__][polluted]=1').expect(200);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
    });

    it('muitos parâmetros: o qs corta em 1000 (parameterLimit) e a API responde rápido', async () => {
      const many = Array.from({ length: 1500 }, (_, i) => `p${i}=1`).join('&'); // ~12 KB, abaixo do limite de cabeçalho do Node
      const started = Date.now();
      const res = await get(many);
      expect(res.status).toBe(200);
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(Object.keys(res.body.query)).toHaveLength(1000);
    });

    it('URL acima do limite de cabeçalho do Node (16 KB) é recusada com 431, antes do Express', async () => {
      const huge = Array.from({ length: 5000 }, (_, i) => `p${i}=1`).join('&');
      const res = await get(huge);
      expect(res.status).toBe(431);
    });
  });
});
