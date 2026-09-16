import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AdminModerationService } from './admin-moderation.service';

@Controller('admin/moderation')
@Roles(Role.admin)
export class AdminModerationController {
  constructor(private readonly moderationService: AdminModerationService) {}

  @Get('foods')
  listPendingFoods() {
    return this.moderationService.listPendingFoods();
  }

  @Get('exercises')
  listPendingExercises() {
    return this.moderationService.listPendingExercises();
  }

  @HttpCode(HttpStatus.OK)
  @Post('foods/:id/approve')
  approveFood(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.moderationService.approveFood(admin.id, id, req.ip);
  }

  @HttpCode(HttpStatus.OK)
  @Post('exercises/:id/approve')
  approveExercise(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.moderationService.approveExercise(admin.id, id, req.ip);
  }

  @Delete('foods/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectFood(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.moderationService.rejectFood(admin.id, id, req.ip);
  }

  @Delete('exercises/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectExercise(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.moderationService.rejectExercise(admin.id, id, req.ip);
  }
}
