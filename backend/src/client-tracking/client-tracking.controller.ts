import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ClientTrackingService, MAX_PROGRESS_PHOTO_BYTES } from './client-tracking.service';
import { CreateWeightLogDto } from './dto/create-weight-log.dto';
import { CreateWaterLogDto } from './dto/create-water-log.dto';
import { PhotoSharingDto } from './dto/photo-sharing.dto';

/** Limites do multipart do upload de foto de progresso (mesma linha de PHOTO_UPLOAD_LIMITS). */
export const PROGRESS_PHOTO_UPLOAD_LIMITS = {
  fileSize: MAX_PROGRESS_PHOTO_BYTES,
  files: 1,
  fields: 1, // só `takenAt`
  parts: 2,
  fieldNameSize: 16,
  fieldSize: 40, // ISO 8601 com fuso cabe com folga
  fieldNestingDepth: 0,
  fieldArrayIndexLimit: 0,
};

export function optionalDays(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3660) {
    throw new BadRequestException('days deve ser um inteiro entre 1 e 3660.');
  }
  return days;
}

/** Peso, água e fotos de progresso registrados pelo próprio paciente. */
@Controller('client')
@Roles(Role.client)
export class ClientTrackingController {
  constructor(private readonly tracking: ClientTrackingService) {}

  @Get('weights')
  listWeights(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    return this.tracking.listWeights(user.id, optionalDays(days));
  }

  @Post('weights')
  addWeight(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWeightLogDto) {
    return this.tracking.addWeight(user.id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('weights/:id')
  async deleteWeight(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tracking.deleteWeight(user.id, id);
  }

  @Get('water')
  getWaterDay(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string) {
    return this.tracking.getWaterDay(user.id, date);
  }

  @Get('water/history')
  waterHistory(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    return this.tracking.waterHistory(user.id, optionalDays(days));
  }

  @Post('water')
  addWater(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWaterLogDto) {
    return this.tracking.addWater(user.id, dto);
  }

  @Delete('water')
  resetWaterDay(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string) {
    return this.tracking.resetWaterDay(user.id, date);
  }

  @Delete('water/:id')
  deleteWaterEntry(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tracking.deleteWaterEntry(user.id, id);
  }

  @Get('progress-photos')
  listPhotos(@CurrentUser() user: AuthenticatedUser) {
    return this.tracking.listPhotos(user.id);
  }

  @Post('progress-photos')
  @UseInterceptors(FileInterceptor('file', { limits: PROGRESS_PHOTO_UPLOAD_LIMITS }))
  uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('takenAt') takenAt?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    return this.tracking.uploadPhoto(user.id, { buffer: file.buffer, mimetype: file.mimetype, size: file.size }, takenAt);
  }

  @Get('progress-photos/sharing')
  getPhotoSharing(@CurrentUser() user: AuthenticatedUser) {
    return this.tracking.getPhotoSharing(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('progress-photos/sharing')
  setPhotoSharing(@CurrentUser() user: AuthenticatedUser, @Body() dto: PhotoSharingDto) {
    return this.tracking.setPhotoSharing(user.id, dto.shared);
  }

  @Get('progress-photos/:id/download-url')
  getPhotoUrl(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tracking.getPhotoUrl(user.id, id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('progress-photos/:id')
  async deletePhoto(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tracking.deletePhoto(user.id, id);
  }
}
