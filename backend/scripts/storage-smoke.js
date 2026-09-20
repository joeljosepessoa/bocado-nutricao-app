#!/usr/bin/env node
/**
 * Teste operacional de persistência do storage, feito PELA API em execução (HTTP):
 * exercita o mesmo caminho da produção (upload -> banco -> storage -> URL assinada -> download).
 *
 *   node scripts/storage-smoke.js write  <arquivo-de-estado>   # cria dados e grava hashes
 *   node scripts/storage-smoke.js verify <arquivo-de-estado>   # relê tudo e confere hash/tamanho
 *
 * Fluxo de validação de persistência (ver database/scripts/verify-storage-persistence.sh):
 *   write -> (reinicia / recria a API) -> verify
 *
 * API_URL (padrão http://127.0.0.1:3000). Não usa credenciais reais: cria um profissional
 * descartável com e-mail @example.com e senha gerada na hora. O arquivo de estado guarda essa
 * senha descartável e os hashes — apague-o depois; não o versione.
 *
 * Só usa módulos nativos do Node (>= 18): roda igual na máquina e dentro do container.
 */
const { createHash, randomBytes } = require('crypto');
const { readFileSync, writeFileSync } = require('fs');

const API_URL = (process.env.API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

// JPEG 1x1 válido.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function fail(message) {
  console.error(`FALHA: ${message}`);
  process.exit(1);
}

async function call(method, path, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const response = await fetch(`${API_URL}${path}`, { method, headers, body });
  return response;
}

async function jsonOrFail(response, expected, what) {
  if (response.status !== expected) {
    fail(`${what}: esperava HTTP ${expected}, veio ${response.status}`);
  }
  return response.json();
}

async function download(url, what) {
  const response = await call('GET', url);
  if (response.status !== 200) fail(`${what}: download devolveu HTTP ${response.status}`);
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type'), cacheControl: response.headers.get('cache-control') };
}

async function write(statePath) {
  const email = `storage-smoke.${Date.now()}.${randomBytes(4).toString('hex')}@example.com`;
  const password = `Sm0ke-${randomBytes(9).toString('base64url')}`;
  const professional = await jsonOrFail(
    await call('POST', '/auth/register-professional', { json: { email, password, fullName: 'Storage Smoke' } }),
    201,
    'registrar profissional',
  );
  const token = professional.accessToken;
  const created = await jsonOrFail(
    await call('POST', '/professionals/me/clients', { token, json: { email: `cliente.${email}`, fullName: 'Cliente Smoke' } }),
    201,
    'criar cliente',
  );
  const clientId = created.client.id;
  const evaluation = await jsonOrFail(
    await call('POST', `/clients/${clientId}/evaluations`, { token, json: { heightCm: 175, weightKg: 78 } }),
    201,
    'criar avaliação',
  );

  // Foto: conteúdo único por execução (acrescenta bytes após o EOI) para não confundir com dados antigos.
  const photoBytes = Buffer.concat([JPEG, randomBytes(64)]);
  const form = new FormData();
  form.append('angle', 'front');
  form.append('file', new Blob([photoBytes], { type: 'image/jpeg' }), 'foto.jpg');
  const photo = await jsonOrFail(
    await call('POST', `/clients/${clientId}/evaluations/${evaluation.id}/photos`, { token, form }),
    201,
    'enviar foto',
  );

  const report = await jsonOrFail(
    await call('POST', `/clients/${clientId}/evaluations/${evaluation.id}/reports`, { token, json: { audience: 'professional' } }),
    201,
    'gerar PDF',
  );
  if (report.status !== 'ready') fail(`PDF não ficou pronto (status ${report.status})`);

  // Baixa AGORA e guarda o hash do que a API entregou — é isso que precisa voltar idêntico depois.
  const photoUrl = (await jsonOrFail(await call('GET', `/clients/${clientId}/evaluations/${evaluation.id}/photos/${photo.id}`, { token }), 200, 'URL da foto')).url;
  const pdfUrl = (await jsonOrFail(await call('GET', `/clients/${clientId}/reports/${report.id}/download-url`, { token }), 200, 'URL do PDF')).url;
  const photoNow = await download(photoUrl, 'foto');
  const pdfNow = await download(pdfUrl, 'PDF');

  if (sha256(photoNow.buffer) !== sha256(photoBytes)) fail('a foto baixada difere da enviada');
  if (photoNow.contentType !== 'image/jpeg') fail(`foto com content-type ${photoNow.contentType}`);
  if (pdfNow.contentType !== 'application/pdf' || pdfNow.buffer.subarray(0, 5).toString() !== '%PDF-') fail('o PDF baixado não é um PDF');
  if (!/no-store/.test(photoNow.cacheControl || '')) fail('URL assinada sem Cache-Control: no-store');

  const state = {
    email,
    password,
    clientId,
    evaluationId: evaluation.id,
    photoId: photo.id,
    reportId: report.id,
    photoSha256: sha256(photoBytes),
    photoBytes: photoBytes.byteLength,
    pdfSha256: sha256(pdfNow.buffer),
    pdfBytes: pdfNow.buffer.byteLength,
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(`OK write: foto ${state.photoBytes} B (sha256 ${state.photoSha256.slice(0, 12)}…), PDF ${state.pdfBytes} B (sha256 ${state.pdfSha256.slice(0, 12)}…)`);
  console.log(`Estado salvo em ${statePath}`);
}

async function verify(statePath) {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const login = await jsonOrFail(await call('POST', '/auth/login', { json: { email: state.email, password: state.password } }), 200, 'login do profissional de teste');
  const token = login.accessToken;

  const photoUrl = (await jsonOrFail(await call('GET', `/clients/${state.clientId}/evaluations/${state.evaluationId}/photos/${state.photoId}`, { token }), 200, 'URL da foto')).url;
  const pdfUrl = (await jsonOrFail(await call('GET', `/clients/${state.clientId}/reports/${state.reportId}/download-url`, { token }), 200, 'URL do PDF')).url;
  const photo = await download(photoUrl, 'foto');
  const pdf = await download(pdfUrl, 'PDF');

  if (photo.buffer.byteLength !== state.photoBytes || sha256(photo.buffer) !== state.photoSha256) fail('FOTO NÃO PERSISTIU: conteúdo diferente do gravado');
  if (pdf.buffer.byteLength !== state.pdfBytes || sha256(pdf.buffer) !== state.pdfSha256) fail('PDF NÃO PERSISTIU: conteúdo diferente do gravado');

  // Segurança: a URL assinada de um token adulterado não devolve arquivo.
  const tampered = await call('GET', `${photoUrl.slice(0, -2)}xx`);
  if (tampered.status === 200) fail('token adulterado devolveu o arquivo');

  console.log(`OK verify: foto (${photo.buffer.byteLength} B) e PDF (${pdf.buffer.byteLength} B) idênticos ao gravado (sha256 conferido).`);
}

const [mode, statePath] = process.argv.slice(2);
if (!['write', 'verify'].includes(mode) || !statePath) {
  console.error('Uso: node scripts/storage-smoke.js <write|verify> <arquivo-de-estado>');
  process.exit(2);
}
(mode === 'write' ? write : verify)(statePath).catch((error) => fail(error instanceof Error ? error.message : String(error)));
