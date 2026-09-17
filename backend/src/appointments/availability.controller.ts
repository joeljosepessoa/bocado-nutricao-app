import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AvailabilityService, RequestMeta } from './availability.service';
import { CreateAvailabilitySlotDto } from './dto/create-availability-slot.dto';

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

@Controller('professionals/me/availability')
@Roles(Role.professional)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.availabilityService.listForProfessional(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAvailabilitySlotDto, @Req() req: Request) {
    return this.availabilityService.createSlot(user.id, dto, meta(req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.availabilityService.removeSlot(user.id, id, meta(req));
  }
}
