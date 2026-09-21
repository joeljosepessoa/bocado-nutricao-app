import { MAX_PHOTO_SIZE_BYTES } from './physical-evaluations.service';
import { PHOTO_UPLOAD_LIMITS } from './physical-evaluations.controller';

/**
 * Guarda de regressão do hardening do upload: o multer < 2.3.0 tem falhas de DoS (crash do processo
 * e loop de CPU com nomes de campo hostis) e o pino exato do @nestjs/platform-express 10.x o mantém
 * em 2.0.2 — quem garante a versão nova é o "overrides" do package.json da raiz. Se alguém removê-lo,
 * este teste falha em vez de a versão vulnerável voltar em silêncio (os limites abaixo virariam no-op
 * no multer antigo, que ignora opções que não conhece).
 */
function semverAtLeast(version: string, minimum: string): boolean {
  const a = version.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

describe('Hardening do upload de foto', () => {
  it('o multer instalado é >= 2.3.0 (override do package.json da raiz aplicado)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { version } = require('multer/package.json') as { version: string };
    expect(semverAtLeast(version, '2.3.0')).toBe(true);
  });

  it('o multer instalado aceita os limites (valida cada valor) e conhece as opções de nome de campo', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const multer = require('multer') as (options: { limits: Record<string, number> }) => unknown;
    expect(() => multer({ limits: { ...PHOTO_UPLOAD_LIMITS } })).not.toThrow();
    // O multer 2.4 valida os limites e recusa valores que o busboy ignoraria em silêncio.
    expect(() => multer({ limits: { fields: 1.5 } })).toThrow(/limits\.fields/);
  });

  it('os limites cobrem exatamente o contrato: uma foto de até 10 MB + o campo angle', () => {
    expect(PHOTO_UPLOAD_LIMITS.fileSize).toBe(MAX_PHOTO_SIZE_BYTES);
    expect(PHOTO_UPLOAD_LIMITS).toMatchObject({ files: 1, fields: 1, parts: 2, fieldNestingDepth: 0 });
    // side_right é o maior valor de PhotoAngle; `angle` e `file` são os nomes de campo do contrato.
    expect(PHOTO_UPLOAD_LIMITS.fieldSize).toBeGreaterThanOrEqual('side_right'.length);
    expect(PHOTO_UPLOAD_LIMITS.fieldNameSize).toBeGreaterThanOrEqual('angle'.length);
    expect(PHOTO_UPLOAD_LIMITS.fieldNameSize).toBeLessThanOrEqual(32);
  });
});
