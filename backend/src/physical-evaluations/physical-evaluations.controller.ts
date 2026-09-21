import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PhotoAngle, Role } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { MAX_PHOTO_SIZE_BYTES, PhysicalEvaluationsService } from './physical-evaluations.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { UpdateEvaluationDto } from './dto/update-evaluation.dto';
import { UpdateEvaluationReleaseDto } from './dto/update-evaluation-release.dto';

function meta(req: Request) {
  return { ipAddress: req.ip };
}

/**
 * Limites do multipart do upload de foto. O contrato tem exatamente duas partes: o arquivo `file`
 * (uma única foto) e o campo de texto `angle` (enum de até 10 caracteres). O multer processa o
 * corpo ANTES do nosso código e cada campo aceito custa CPU/memória, então tudo que sobra do
 * contrato é rejeitado cedo (400/413). É a mesma classe de falha dos avisos de DoS do multer
 * < 2.3.0 (nomes de campo com colchetes/índices enormes, aninhamento profundo, inundação de
 * campos e partes), que a versão nova corrige e estes limites impedem de reaparecer.
 * Não aumente sem necessidade: qualquer campo novo do formulário exige subir `fields`/`parts`.
 */
export const PHOTO_UPLOAD_LIMITS = {
  fileSize: MAX_PHOTO_SIZE_BYTES, // até 10 MB; sem isso o multer lê o arquivo inteiro na memória
  files: 1, // uma foto por requisição
  fields: 1, // só `angle`
  parts: 2, // `file` + `angle`
  fieldNameSize: 16, // maiores nomes legítimos: `angle` (5) e `file` (4)
  fieldSize: 32, // maior valor legítimo de `angle`: `side_right` (10); o padrão do multer é 1 MB
  fieldNestingDepth: 0, // nomes sem colchetes: rejeita `a[b][c]...` e `a[]`
  fieldArrayIndexLimit: 0, // defesa em profundidade: `a[4294967294]` trava a CPU se o aninhamento for relaxado
  headerPairs: 8, // cada parte legítima traz 2 cabeçalhos (Content-Disposition e Content-Type)
} as const;

@Controller('clients/:clientId/evaluations')
@Roles(Role.professional)
export class PhysicalEvaluationsController {
  constructor(private readonly evaluationsService: PhysicalEvaluationsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Body() dto: CreateEvaluationDto,
    @Req() req: Request,
  ) {
    return this.evaluationsService.create(user.id, clientId, dto, meta(req));
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Req() req: Request,
  ) {
    return this.evaluationsService.list(
      user.id,
      clientId,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
      meta(req),
    );
  }

  @Get('compare')
  compare(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: Request,
  ) {
    if (!from || !to) {
      throw new BadRequestException('Informe os parâmetros "from" e "to".');
    }
    return this.evaluationsService.compare(user.id, clientId, from, to, meta(req));
  }

  // Precisa vir antes de `:id` — rota estática, mesma regra do `compare` acima.
  @Get('evolution')
  getEvolutionSeries(@CurrentUser() user: AuthenticatedUser, @Param('clientId') clientId: string) {
    return this.evaluationsService.getEvolutionSeries(user.id, clientId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.evaluationsService.findOne(user.id, clientId, id, meta(req));
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationDto,
    @Req() req: Request,
  ) {
    return this.evaluationsService.update(user.id, clientId, id, dto, meta(req));
  }

  @Patch(':id/release')
  setRelease(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationReleaseDto,
    @Req() req: Request,
  ) {
    return this.evaluationsService.setRelease(user.id, clientId, id, dto, meta(req));
  }

  @Post(':id/photos')
  // Limites do multipart em PHOTO_UPLOAD_LIMITS. Acima de fileSize o multer aborta o stream e
  // responde 413; violações dos demais limites respondem 400 (ver AllExceptionsFilter).
  @UseInterceptors(FileInterceptor('file', { limits: PHOTO_UPLOAD_LIMITS }))
  uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @Body('angle') angle: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    if (!Object.values(PhotoAngle).includes(angle as PhotoAngle)) {
      throw new BadRequestException(`angle inválido. Use um de: ${Object.values(PhotoAngle).join(', ')}.`);
    }
    return this.evaluationsService.uploadPhoto(
      user.id,
      clientId,
      id,
      angle as PhotoAngle,
      { buffer: file.buffer, mimetype: file.mimetype, size: file.size },
      meta(req),
    );
  }

  @Get(':id/photos/:photoId')
  getPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Req() req: Request,
  ) {
    return this.evaluationsService.getPhotoSignedUrl(user.id, clientId, id, photoId, meta(req));
  }

  @Delete(':id/photos/:photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.evaluationsService.deletePhoto(user.id, clientId, id, photoId, meta(req));
  }
}
