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
import { PhysicalEvaluationsService } from './physical-evaluations.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { UpdateEvaluationDto } from './dto/update-evaluation.dto';
import { UpdateEvaluationReleaseDto } from './dto/update-evaluation-release.dto';

function meta(req: Request) {
  return { ipAddress: req.ip };
}

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
  @UseInterceptors(FileInterceptor('file'))
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
