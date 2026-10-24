import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Role, TemplateKind } from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  ApplyTemplateDto,
  CreateDietTemplateDto,
  CreateWorkoutTemplateDto,
  ListTemplatesQueryDto,
  TemplateFromClientDto,
  UpdateDietTemplateDto,
  UpdateWorkoutTemplateDto,
} from './dto/template.dto';
import { TemplatesService } from './templates.service';

/** Modelos de dieta da biblioteca: criar, editar, duplicar, lixeira e atribuir a um paciente. */
@Controller('templates/diets')
@Roles(Role.professional)
export class DietTemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTemplatesQueryDto) {
    return this.templates.list(user.id, TemplateKind.diet, query.trash === 'true');
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.get(user.id, TemplateKind.diet, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDietTemplateDto) {
    return this.templates.create(user.id, TemplateKind.diet, dto);
  }

  /** "Salvar como modelo" a partir da dieta do paciente. */
  @Post('from-client')
  fromClient(@CurrentUser() user: AuthenticatedUser, @Body() dto: TemplateFromClientDto) {
    return this.templates.fromClient(user.id, TemplateKind.diet, dto.clientId, dto.name, dto.description);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDietTemplateDto) {
    return this.templates.update(user.id, TemplateKind.diet, id, dto);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.duplicate(user.id, TemplateKind.diet, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.templates.remove(user.id, TemplateKind.diet, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.restore(user.id, TemplateKind.diet, id);
  }

  @Post(':id/apply')
  apply(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplyTemplateDto, @Req() req: Request) {
    return this.templates.apply(user.id, TemplateKind.diet, id, dto.clientId, dto.replaceDraft === true, { ipAddress: req.ip });
  }
}

/** Modelos de treino da biblioteca: mesmas ações dos modelos de dieta. */
@Controller('templates/workouts')
@Roles(Role.professional)
export class WorkoutTemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTemplatesQueryDto) {
    return this.templates.list(user.id, TemplateKind.workout, query.trash === 'true');
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.get(user.id, TemplateKind.workout, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWorkoutTemplateDto) {
    return this.templates.create(user.id, TemplateKind.workout, dto);
  }

  /** "Salvar como modelo" a partir do treino do paciente. */
  @Post('from-client')
  fromClient(@CurrentUser() user: AuthenticatedUser, @Body() dto: TemplateFromClientDto) {
    return this.templates.fromClient(user.id, TemplateKind.workout, dto.clientId, dto.name, dto.description);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkoutTemplateDto) {
    return this.templates.update(user.id, TemplateKind.workout, id, dto);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.duplicate(user.id, TemplateKind.workout, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.templates.remove(user.id, TemplateKind.workout, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.restore(user.id, TemplateKind.workout, id);
  }

  @Post(':id/apply')
  apply(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplyTemplateDto, @Req() req: Request) {
    return this.templates.apply(user.id, TemplateKind.workout, id, dto.clientId, false, { ipAddress: req.ip });
  }
}

/** Dieta/treino atual do paciente no formato do editor — ponto de partida da conversa com a IA dentro do paciente. */
@Controller('clients/:clientId')
@Roles(Role.professional)
export class ClientContentController {
  constructor(private readonly templates: TemplatesService) {}

  @Get('diet-content')
  diet(@CurrentUser() user: AuthenticatedUser, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.templates.clientContent(user.id, TemplateKind.diet, clientId);
  }

  @Get('workout-content')
  workout(@CurrentUser() user: AuthenticatedUser, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.templates.clientContent(user.id, TemplateKind.workout, clientId);
  }
}
