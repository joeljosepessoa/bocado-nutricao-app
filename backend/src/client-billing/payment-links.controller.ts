import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { PaymentLinksService, RequestMeta } from './payment-links.service';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

@Controller('professionals/me/payment-links')
@Roles(Role.professional)
export class PaymentLinksController {
  constructor(private readonly paymentLinks: PaymentLinksService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentLinkDto, @Req() req: Request) {
    return this.paymentLinks.create(user.id, dto, meta(req));
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('clientId') clientId?: string) {
    return this.paymentLinks.listMine(user.id, clientId);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.paymentLinks.cancel(user.id, id, meta(req));
  }
}
