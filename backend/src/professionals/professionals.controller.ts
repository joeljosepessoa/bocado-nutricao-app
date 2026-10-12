import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ProfessionalsService } from './professionals.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';

@Controller('professionals')
@Roles(Role.professional)
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

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

  @Post('me/clients')
  createClient(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateClientDto) {
    return this.professionalsService.createClient(user.id, dto);
  }

  @Post('me/clients/:id/reset-password')
  resetClientPassword(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.professionalsService.resetClientPassword(user.id, id);
  }
}
