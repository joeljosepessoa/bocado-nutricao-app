import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { DietsService, RequestMeta } from './diets.service';
import { CreateDietDto } from './dto/create-diet.dto';
import { UpdateDietDto } from './dto/update-diet.dto';
import { UpdateDietVersionDto } from './dto/update-diet-version.dto';
import { CreateMealDto } from './dto/create-meal.dto';
import { UpdateMealDto } from './dto/update-meal.dto';
import { CreateMealFoodDto } from './dto/create-meal-food.dto';
import { UpdateMealFoodDto } from './dto/update-meal-food.dto';

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

@Controller('clients/:clientId/diets')
@Roles(Role.professional)
export class DietsController {
  constructor(private readonly dietsService: DietsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Body() dto: CreateDietDto,
    @Req() req: Request,
  ) {
    return this.dietsService.create(user.id, clientId, dto, meta(req));
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Req() req: Request,
  ) {
    return this.dietsService.list(user.id, clientId, page ? Number(page) : undefined, pageSize ? Number(pageSize) : undefined, meta(req));
  }

  @Get(':dietId')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Req() req: Request,
  ) {
    return this.dietsService.findOne(user.id, clientId, dietId, meta(req));
  }

  @Patch(':dietId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Body() dto: UpdateDietDto,
    @Req() req: Request,
  ) {
    return this.dietsService.update(user.id, clientId, dietId, dto, meta(req));
  }

  @Get(':dietId/versions')
  listVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Req() req: Request,
  ) {
    return this.dietsService.listVersions(user.id, clientId, dietId, meta(req));
  }

  @Post(':dietId/versions')
  createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Req() req: Request,
  ) {
    return this.dietsService.createVersion(user.id, clientId, dietId, meta(req));
  }

  @Get(':dietId/versions/:versionId')
  findVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Param('versionId') versionId: string,
    @Req() req: Request,
  ) {
    return this.dietsService.findVersion(user.id, clientId, dietId, versionId, meta(req));
  }

  @Patch(':dietId/versions/:versionId')
  updateVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Param('versionId') versionId: string,
    @Body() dto: UpdateDietVersionDto,
    @Req() req: Request,
  ) {
    return this.dietsService.updateVersion(user.id, clientId, dietId, versionId, dto, meta(req));
  }

  @Post(':dietId/versions/:versionId/publish')
  @HttpCode(HttpStatus.OK)
  publishVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Param('versionId') versionId: string,
    @Req() req: Request,
  ) {
    return this.dietsService.publishVersion(user.id, clientId, dietId, versionId, meta(req));
  }

  @Post(':dietId/versions/:versionId/meals')
  createMeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Param('versionId') versionId: string,
    @Body() dto: CreateMealDto,
    @Req() req: Request,
  ) {
    return this.dietsService.createMeal(user.id, clientId, dietId, versionId, dto, meta(req));
  }

  @Patch(':dietId/versions/:versionId/meals/:mealId')
  updateMeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Param('versionId') versionId: string,
    @Param('mealId') mealId: string,
    @Body() dto: UpdateMealDto,
    @Req() req: Request,
  ) {
    return this.dietsService.updateMeal(user.id, clientId, dietId, versionId, mealId, dto, meta(req));
  }

  @Delete(':dietId/versions/:versionId/meals/:mealId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Param('versionId') versionId: string,
    @Param('mealId') mealId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.dietsService.deleteMeal(user.id, clientId, dietId, versionId, mealId, meta(req));
  }

  @Post(':dietId/versions/:versionId/meals/:mealId/foods')
  createMealFood(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Param('versionId') versionId: string,
    @Param('mealId') mealId: string,
    @Body() dto: CreateMealFoodDto,
    @Req() req: Request,
  ) {
    return this.dietsService.createMealFood(user.id, clientId, dietId, versionId, mealId, dto, meta(req));
  }

  @Patch(':dietId/versions/:versionId/meals/:mealId/foods/:mealFoodId')
  updateMealFood(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Param('versionId') versionId: string,
    @Param('mealId') mealId: string,
    @Param('mealFoodId') mealFoodId: string,
    @Body() dto: UpdateMealFoodDto,
    @Req() req: Request,
  ) {
    return this.dietsService.updateMealFood(user.id, clientId, dietId, versionId, mealId, mealFoodId, dto, meta(req));
  }

  @Delete(':dietId/versions/:versionId/meals/:mealId/foods/:mealFoodId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMealFood(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('dietId') dietId: string,
    @Param('versionId') versionId: string,
    @Param('mealId') mealId: string,
    @Param('mealFoodId') mealFoodId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.dietsService.deleteMealFood(user.id, clientId, dietId, versionId, mealId, mealFoodId, meta(req));
  }
}
