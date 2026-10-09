import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ClientTrackingService } from './client-tracking.service';
import { optionalDays } from './client-tracking.controller';

/**
 * Leitura, pelo nutricionista, do que o paciente registra no app (peso, água
 * e fotos de progresso). Só do próprio paciente; as fotos só com autorização
 * do paciente. Nada aqui grava.
 */
@Controller('clients/:clientId/tracking')
@Roles(Role.professional)
export class ProfessionalTrackingController {
  constructor(private readonly tracking: ClientTrackingService) {}

  @Get('weights')
  weights(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('days') days?: string,
  ) {
    return this.tracking.professionalWeights(user.id, clientId, optionalDays(days));
  }

  @Get('water')
  water(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('days') days?: string,
  ) {
    return this.tracking.professionalWaterHistory(user.id, clientId, optionalDays(days));
  }

  @Get('progress-photos')
  photos(@CurrentUser() user: AuthenticatedUser, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.tracking.professionalPhotos(user.id, clientId);
  }

  @Get('progress-photos/:photoId/download-url')
  photoUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return this.tracking.professionalPhotoUrl(user.id, clientId, photoId);
  }
}
