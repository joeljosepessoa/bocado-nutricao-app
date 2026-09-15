import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { WorkoutsService, RequestMeta } from './workouts.service';
import { CreateWorkoutDto } from './dto/create-workout.dto';
import { UpdateWorkoutDto } from './dto/update-workout.dto';
import { UpdateWorkoutVersionDto } from './dto/update-workout-version.dto';
import { CreateWorkoutDayDto } from './dto/create-workout-day.dto';
import { UpdateWorkoutDayDto } from './dto/update-workout-day.dto';
import { CreateWorkoutExerciseDto } from './dto/create-workout-exercise.dto';
import { UpdateWorkoutExerciseDto } from './dto/update-workout-exercise.dto';
import { CreateWorkoutSetDto } from './dto/create-workout-set.dto';
import { UpdateWorkoutSetDto } from './dto/update-workout-set.dto';
import { CreateExecutionLogDto } from './dto/create-execution-log.dto';

function meta(req: Request): RequestMeta {
  return { ipAddress: req.ip };
}

@Controller('clients/:clientId/workouts')
@Roles(Role.professional)
export class WorkoutsController {
  constructor(private readonly workoutsService: WorkoutsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Param('clientId') clientId: string, @Body() dto: CreateWorkoutDto, @Req() req: Request) {
    return this.workoutsService.create(user.id, clientId, dto, meta(req));
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.workoutsService.list(user.id, clientId, page ? Number(page) : undefined, pageSize ? Number(pageSize) : undefined);
  }

  @Get(':workoutId')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('clientId') clientId: string, @Param('workoutId') workoutId: string, @Req() req: Request) {
    return this.workoutsService.findOne(user.id, clientId, workoutId, meta(req));
  }

  @Patch(':workoutId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Body() dto: UpdateWorkoutDto,
    @Req() req: Request,
  ) {
    return this.workoutsService.update(user.id, clientId, workoutId, dto, meta(req));
  }

  @Get(':workoutId/versions')
  listVersions(@CurrentUser() user: AuthenticatedUser, @Param('clientId') clientId: string, @Param('workoutId') workoutId: string, @Req() req: Request) {
    return this.workoutsService.listVersions(user.id, clientId, workoutId, meta(req));
  }

  @Post(':workoutId/versions')
  createVersion(@CurrentUser() user: AuthenticatedUser, @Param('clientId') clientId: string, @Param('workoutId') workoutId: string, @Req() req: Request) {
    return this.workoutsService.createVersion(user.id, clientId, workoutId, meta(req));
  }

  @Get(':workoutId/versions/compare')
  compareVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: Request,
  ) {
    if (!from || !to) {
      throw new BadRequestException('Informe os parâmetros "from" e "to".');
    }
    return this.workoutsService.compareVersions(user.id, clientId, workoutId, from, to, meta(req));
  }

  @Get(':workoutId/versions/:versionId')
  findVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('versionId') versionId: string,
    @Req() req: Request,
  ) {
    return this.workoutsService.findVersion(user.id, clientId, workoutId, versionId, meta(req));
  }

  @Patch(':workoutId/versions/:versionId')
  updateVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('versionId') versionId: string,
    @Body() dto: UpdateWorkoutVersionDto,
    @Req() req: Request,
  ) {
    return this.workoutsService.updateVersion(user.id, clientId, workoutId, versionId, dto, meta(req));
  }

  @Post(':workoutId/versions/:versionId/publish')
  @HttpCode(HttpStatus.OK)
  publishVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('versionId') versionId: string,
    @Req() req: Request,
  ) {
    return this.workoutsService.publishVersion(user.id, clientId, workoutId, versionId, meta(req));
  }

  @Post(':workoutId/versions/:versionId/days')
  createDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('versionId') versionId: string,
    @Body() dto: CreateWorkoutDayDto,
    @Req() req: Request,
  ) {
    return this.workoutsService.createDay(user.id, clientId, workoutId, versionId, dto, meta(req));
  }

  @Patch(':workoutId/versions/:versionId/days/:dayId')
  updateDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('versionId') versionId: string,
    @Param('dayId') dayId: string,
    @Body() dto: UpdateWorkoutDayDto,
    @Req() req: Request,
  ) {
    return this.workoutsService.updateDay(user.id, clientId, workoutId, versionId, dayId, dto, meta(req));
  }

  @Delete(':workoutId/versions/:versionId/days/:dayId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('versionId') versionId: string,
    @Param('dayId') dayId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.workoutsService.deleteDay(user.id, clientId, workoutId, versionId, dayId, meta(req));
  }

  @Post(':workoutId/versions/:versionId/days/:dayId/exercises')
  createExercise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('versionId') versionId: string,
    @Param('dayId') dayId: string,
    @Body() dto: CreateWorkoutExerciseDto,
    @Req() req: Request,
  ) {
    return this.workoutsService.createExercise(user.id, clientId, workoutId, versionId, dayId, dto, meta(req));
  }

  @Patch(':workoutId/versions/:versionId/days/:dayId/exercises/:weId')
  updateExercise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('versionId') versionId: string,
    @Param('dayId') dayId: string,
    @Param('weId') weId: string,
    @Body() dto: UpdateWorkoutExerciseDto,
    @Req() req: Request,
  ) {
    return this.workoutsService.updateExercise(user.id, clientId, workoutId, versionId, dayId, weId, dto, meta(req));
  }

  @Delete(':workoutId/versions/:versionId/days/:dayId/exercises/:weId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteExercise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('versionId') versionId: string,
    @Param('dayId') dayId: string,
    @Param('weId') weId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.workoutsService.deleteExercise(user.id, clientId, workoutId, versionId, dayId, weId, meta(req));
  }

  @Post(':workoutId/versions/:versionId/days/:dayId/exercises/:weId/sets')
  createSet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('versionId') versionId: string,
    @Param('dayId') dayId: string,
    @Param('weId') weId: string,
    @Body() dto: CreateWorkoutSetDto,
    @Req() req: Request,
  ) {
    return this.workoutsService.createSet(user.id, clientId, workoutId, versionId, dayId, weId, dto, meta(req));
  }

  @Patch(':workoutId/versions/:versionId/days/:dayId/exercises/:weId/sets/:setId')
  updateSet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('versionId') versionId: string,
    @Param('dayId') dayId: string,
    @Param('weId') weId: string,
    @Param('setId') setId: string,
    @Body() dto: UpdateWorkoutSetDto,
    @Req() req: Request,
  ) {
    return this.workoutsService.updateSet(user.id, clientId, workoutId, versionId, dayId, weId, setId, dto, meta(req));
  }

  @Delete(':workoutId/versions/:versionId/days/:dayId/exercises/:weId/sets/:setId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('versionId') versionId: string,
    @Param('dayId') dayId: string,
    @Param('weId') weId: string,
    @Param('setId') setId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.workoutsService.deleteSet(user.id, clientId, workoutId, versionId, dayId, weId, setId, meta(req));
  }

  @Post(':workoutId/execution-logs')
  createExecutionLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Body() dto: CreateExecutionLogDto,
    @Req() req: Request,
  ) {
    return this.workoutsService.createExecutionLog(user.id, clientId, workoutId, dto, meta(req));
  }

  @Get(':workoutId/execution-logs')
  listExecutionLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.workoutsService.listExecutionLogs(user.id, clientId, workoutId, page ? Number(page) : undefined, pageSize ? Number(pageSize) : undefined);
  }

  @Get(':workoutId/execution-logs/:logId')
  findExecutionLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId') clientId: string,
    @Param('workoutId') workoutId: string,
    @Param('logId') logId: string,
  ) {
    return this.workoutsService.findExecutionLog(user.id, clientId, workoutId, logId);
  }
}
