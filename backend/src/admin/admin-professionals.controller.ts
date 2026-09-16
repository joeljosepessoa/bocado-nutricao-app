import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AdminProfessionalsService } from './admin-professionals.service';

@Controller('admin/professionals')
@Roles(Role.admin)
export class AdminProfessionalsController {
  constructor(private readonly professionalsService: AdminProfessionalsService) {}

  @Get()
  list(@Query('search') search?: string, @Query('status') status?: 'all' | 'active' | 'suspended', @Query('page') page?: string) {
    return this.professionalsService.list({ search, status, page: page ? Number(page) : undefined });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.professionalsService.findOne(id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/suspend')
  suspend(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.professionalsService.suspend(admin.id, id, req.ip);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/reactivate')
  reactivate(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.professionalsService.reactivate(admin.id, id, req.ip);
  }
}
