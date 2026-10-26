import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { LegalService } from './legal.service';
import { AcceptLegalDto } from './dto/accept-legal.dto';
import { SkipLegalConsent } from './skip-legal-consent.decorator';

/** Textos vigentes — públicos: o app mostra antes do login, na primeira abertura. */
@Controller('legal')
export class LegalDocumentsController {
  constructor(private readonly legal: LegalService) {}

  @Public()
  @Get('documents')
  documents() {
    return this.legal.documents();
  }
}

@Controller('client/legal')
@Roles(Role.client)
@SkipLegalConsent()
export class ClientLegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.legal.status(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Body() dto: AcceptLegalDto, @Req() req: Request) {
    return this.legal.accept(user.id, dto, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  }
}
