import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { StorageService } from './storage.service';

// A posse do token assinado é a própria autorização desta rota — mesmo
// modelo de segurança de uma URL pré-assinada de object storage (S3/R2).
@Controller('files')
export class FilesController {
  constructor(private readonly storageService: StorageService) {}

  @Public()
  @Get(':token')
  async download(@Param('token') token: string, @Res() res: Response) {
    const { storageKey, contentType } = this.storageService.verifySignedToken(token);
    const buffer = await this.storageService.read(storageKey);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    // O painel roda em outro domínio que a API: sem isto o navegador recusa mostrar
    // a foto num <img> (o padrão do helmet é "same-origin"). Liberar aqui é seguro
    // porque a rota não usa cookie — quem abre o arquivo é só quem tem o token.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(buffer);
  }
}
