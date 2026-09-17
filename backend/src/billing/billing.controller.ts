import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { PlansService } from './plans.service';
import { SubscriptionsService, RequestMeta } from './subscriptions.service';
import { SubscribeDto } from './dto/subscribe.dto';

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

@Controller('professionals/me/billing')
@Roles(Role.professional)
export class BillingController {
  constructor(
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get('plans')
  listPlans() {
    return this.plans.listActive();
  }

  @Get('subscription')
  async getSubscription(@CurrentUser() user: AuthenticatedUser) {
    // Envelope { subscription } porque o valor pode ser null — mesmo
    // motivo de client-app retornar { diet } / { workout } em vez de um
    // corpo `null` (Nest não serializa um retorno `null` como JSON `null`,
    // manda corpo vazio).
    return { subscription: await this.subscriptions.getMine(user.id) };
  }

  @HttpCode(HttpStatus.OK)
  @Post('subscribe')
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubscribeDto, @Req() req: Request) {
    return this.subscriptions.subscribe(user.id, dto.planCode, meta(req));
  }

  @HttpCode(HttpStatus.OK)
  @Post('cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.subscriptions.cancel(user.id, meta(req));
  }
}
