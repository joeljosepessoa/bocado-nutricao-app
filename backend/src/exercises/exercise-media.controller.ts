import { Controller, Get, Headers, NotFoundException, Param, Res } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { StorageService } from '../storage/storage.service';

export const EXERCISE_MEDIA_KEY_PREFIX = 'exercise-media/';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Entrega dos GIFs de demonstração de exercício (piloto). Não usa
 * `/files/:token` de propósito: aquele fluxo emite tokens de 5 minutos com
 * `no-store`, o que impede o celular de guardar o GIF em cache. Aqui a URL
 * é estável e endereçada pelo conteúdo (SHA-256), então é seguro cachear
 * por muito tempo (`immutable`). Continua autenticado (JWT de qualquer
 * papel logado) — não é uma URL pública.
 */
@Controller('exercise-media')
@Roles(Role.professional, Role.client, Role.admin)
export class ExerciseMediaController {
  constructor(private readonly storage: StorageService) {}

  @Get(':sha256')
  async serve(
    @Param('sha256') sha256: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ) {
    if (!SHA256_PATTERN.test(sha256)) {
      throw new NotFoundException('Mídia não encontrada.');
    }

    const etag = `"${sha256}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    const buffer = await this.storage.read(`${EXERCISE_MEDIA_KEY_PREFIX}${sha256}.gif`);
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.send(buffer);
  }
}
