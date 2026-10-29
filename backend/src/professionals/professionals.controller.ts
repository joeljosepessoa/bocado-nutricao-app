import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ProfessionalsService } from './professionals.service';
import { AlertsService } from './alerts.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';

@Controller('professionals')
@Roles(Role.professional)
export class ProfessionalsController {
  constructor(
    private readonly professionalsService: ProfessionalsService,
    private readonly alertsService: AlertsService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.professionalsService.me(user.id);
  }

  /** A própria conta: só o nome (o e-mail é o login e não muda por aqui). */
  @Patch('me')
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfessionalProfileDto) {
    return this.professionalsService.updateProfile(user.id, dto);
  }

  @Get('me/dashboard')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.professionalsService.getDashboard(user.id);
  }

  /** "Avisos para você": quem está sem registrar, aniversários, mensagens sem ler, dieta/treino antigos. */
  @Get('me/alerts')
  getAlerts(@CurrentUser() user: AuthenticatedUser, @Query('inactiveDays') inactiveDays?: string, @Query('planDays') planDays?: string) {
    return this.alertsService.forProfessional(user.id, {
      inactiveDays: inactiveDays ? Number(inactiveDays) : undefined,
      planDays: planDays ? Number(planDays) : undefined,
    });
  }

  @Post('me/clients')
  createClient(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateClientDto) {
    return this.professionalsService.createClient(user.id, dto);
  }

  @Post('me/clients/:id/reset-password')
  resetClientPassword(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.professionalsService.resetClientPassword(user.id, id);
  }
}
