import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ClientSubscriptionsService, RequestMeta } from './client-subscriptions.service';

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

@Controller('professionals/me/client-subscriptions')
@Roles(Role.professional)
export class ClientSubscriptionsController {
  constructor(private readonly subscriptions: ClientSubscriptionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('clientId') clientId?: string) {
    return this.subscriptions.listForProfessional(user.id, clientId);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.subscriptions.cancelForProfessional(user.id, id, meta(req));
  }
}
