import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ExercisesService } from './exercises.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { LinkLibraryGifDto } from './dto/link-library-gif.dto';

@Controller('exercises')
@Roles(Role.professional)
export class ExercisesController {
  constructor(private readonly exercisesService: ExercisesService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExerciseDto) {
    return this.exercisesService.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('search') search?: string, @Query('type') type?: string) {
    return this.exercisesService.list(user.id, search, type);
  }

  /** Tela "Exercícios": busca, filtros por grupo/equipamento com contagem e paginação. */
  @Get('library')
  library(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('group') group?: string,
    @Query('equipment') equipment?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.exercisesService.library(user.id, {
      search,
      group,
      equipment,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /** Tela "Sem GIF": exercícios particulares sem GIF, quanto são usados e sugestões da biblioteca. */
  @Get('without-gif')
  withoutGif(@CurrentUser() user: AuthenticatedUser) {
    return this.exercisesService.withoutGif(user.id);
  }

  /** Liga ao exercício particular o GIF de um exercício da biblioteca (nome e treinos não mudam). */
  @Post(':id/gif')
  @HttpCode(200)
  linkLibraryGif(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: LinkLibraryGifDto) {
    return this.exercisesService.linkLibraryGif(user.id, id, dto.fromExerciseId);
  }

  /** Desfaz a ligação acima. */
  @Delete(':id/gif')
  @HttpCode(204)
  async unlinkLibraryGif(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.exercisesService.unlinkLibraryGif(user.id, id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exercisesService.findVisibleForDisplay(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateExerciseDto) {
    return this.exercisesService.update(user, id, dto);
  }
}
