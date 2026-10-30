import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AUTH_THROTTLE_LIMIT } from '../auth/auth-http.util';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { PublicSignupDto } from './dto/public-signup.dto';
import { SignupLinkService } from './signup-link.service';

/** O profissional liga, troca ou desliga o próprio link de cadastro. */
@Controller('professionals/me/signup-link')
@Roles(Role.professional)
export class ProfessionalSignupLinkController {
  constructor(private readonly signupLink: SignupLinkService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.signupLink.get(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  renew(@CurrentUser() user: AuthenticatedUser) {
    return this.signupLink.renew(user.id);
  }

  @Delete()
  disable(@CurrentUser() user: AuthenticatedUser) {
    return this.signupLink.disable(user.id);
  }
}

/** Página pública /cadastro/<código>: sem login. */
@Controller('public/signup')
@Public()
export class PublicSignupController {
  constructor(private readonly signupLink: SignupLinkService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':code')
  info(@Param('code') code: string) {
    return this.signupLink.info(code);
  }

  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: 60_000 } })
  @Post(':code')
  register(@Param('code') code: string, @Body() dto: PublicSignupDto, @Req() req: Request) {
    return this.signupLink.register(code, dto, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  }
}
