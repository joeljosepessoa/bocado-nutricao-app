import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { DietStructureService, DraftRef } from './diet-structure.service';
import { RequestMeta } from './diets.service';
import {
  CreateChoiceFoodDto,
  CreateDietDayDto,
  CreateDietSupplementDto,
  CreateMealChoiceDto,
  CreateMealGroupDto,
  UpdateDietDayDto,
  UpdateDietSupplementDto,
  UpdateMealChoiceDto,
  UpdateMealGroupDto,
} from './dto/diet-structure.dto';

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

const BASE = ':dietId/versions/:versionId';

/** Estrutura nova do RASCUNHO: dias, grupos, escolhas, itens das escolhas e suplementos. */
@Controller('clients/:clientId/diets')
@Roles(Role.professional)
export class DietStructureController {
  constructor(private readonly structure: DietStructureService) {}

  private ref(user: AuthenticatedUser, params: { clientId: string; dietId: string; versionId: string }): DraftRef {
    return { professionalId: user.id, clientId: params.clientId, dietId: params.dietId, versionId: params.versionId };
  }

  // --- Dias -----------------------------------------------------------------------

  @Post(`${BASE}/days`)
  createDay(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Body() dto: CreateDietDayDto, @Req() req: Request) {
    return this.structure.createDay(this.ref(user, p as never), dto, meta(req));
  }

  @Patch(`${BASE}/days/:dayId`)
  updateDay(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Body() dto: UpdateDietDayDto, @Req() req: Request) {
    return this.structure.updateDay(this.ref(user, p as never), p.dayId, dto, meta(req));
  }

  @Delete(`${BASE}/days/:dayId`)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDay(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Req() req: Request) {
    await this.structure.deleteDay(this.ref(user, p as never), p.dayId, meta(req));
  }

  // --- Grupos ---------------------------------------------------------------------

  @Post(`${BASE}/meals/:mealId/groups`)
  createGroup(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Body() dto: CreateMealGroupDto, @Req() req: Request) {
    return this.structure.createGroup(this.ref(user, p as never), p.mealId, dto, meta(req));
  }

  @Patch(`${BASE}/meals/:mealId/groups/:groupId`)
  updateGroup(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Body() dto: UpdateMealGroupDto, @Req() req: Request) {
    return this.structure.updateGroup(this.ref(user, p as never), p.mealId, p.groupId, dto, meta(req));
  }

  @Delete(`${BASE}/meals/:mealId/groups/:groupId`)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGroup(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Req() req: Request) {
    await this.structure.deleteGroup(this.ref(user, p as never), p.mealId, p.groupId, meta(req));
  }

  // --- Escolhas -------------------------------------------------------------------

  @Post(`${BASE}/meals/:mealId/groups/:groupId/choices`)
  createChoice(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Body() dto: CreateMealChoiceDto, @Req() req: Request) {
    return this.structure.createChoice(this.ref(user, p as never), p.mealId, p.groupId, dto, meta(req));
  }

  @Patch(`${BASE}/meals/:mealId/groups/:groupId/choices/:choiceId`)
  updateChoice(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Body() dto: UpdateMealChoiceDto, @Req() req: Request) {
    return this.structure.updateChoice(this.ref(user, p as never), p.mealId, p.groupId, p.choiceId, dto, meta(req));
  }

  @Delete(`${BASE}/meals/:mealId/groups/:groupId/choices/:choiceId`)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChoice(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Req() req: Request) {
    await this.structure.deleteChoice(this.ref(user, p as never), p.mealId, p.groupId, p.choiceId, meta(req));
  }

  @Post(`${BASE}/meals/:mealId/groups/:groupId/choices/:choiceId/foods`)
  addChoiceFood(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Body() dto: CreateChoiceFoodDto, @Req() req: Request) {
    return this.structure.addChoiceFood(this.ref(user, p as never), p.mealId, p.groupId, p.choiceId, dto, meta(req));
  }

  // --- Suplementos ----------------------------------------------------------------

  @Post(`${BASE}/supplements`)
  createSupplement(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Body() dto: CreateDietSupplementDto, @Req() req: Request) {
    return this.structure.createSupplement(this.ref(user, p as never), dto, meta(req));
  }

  @Patch(`${BASE}/supplements/:supplementId`)
  updateSupplement(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Body() dto: UpdateDietSupplementDto, @Req() req: Request) {
    return this.structure.updateSupplement(this.ref(user, p as never), p.supplementId, dto, meta(req));
  }

  @Delete(`${BASE}/supplements/:supplementId`)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSupplement(@CurrentUser() user: AuthenticatedUser, @Param() p: Record<string, string>, @Req() req: Request) {
    await this.structure.deleteSupplement(this.ref(user, p as never), p.supplementId, meta(req));
  }
}
