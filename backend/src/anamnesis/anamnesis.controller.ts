import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AnamnesisService } from './anamnesis.service';
import { SaveAnamnesisDto } from './dto/save-anamnesis.dto';

/** Anamnese: só o profissional (dono do paciente) lê e grava. */
@Controller()
@Roles(Role.professional)
export class AnamnesisController {
  constructor(private readonly anamnesis: AnamnesisService) {}

  /** Situação da ficha de cada paciente — sem conteúdo. */
  @Get('anamneses')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.anamnesis.listStatus(user.id);
  }

  @Get('clients/:clientId/anamnesis')
  get(@CurrentUser() user: AuthenticatedUser, @Param('clientId') clientId: string, @Req() req: Request) {
    return this.anamnesis.get(user.id, clientId, { ipAddress: req.ip });
  }

  @Put('clients/:clientId/anamnesis')
  save(@CurrentUser() user: AuthenticatedUser, @Param('clientId') clientId: string, @Body() dto: SaveAnamnesisDto, @Req() req: Request) {
    return this.anamnesis.save(user.id, clientId, dto, { ipAddress: req.ip });
  }
}
