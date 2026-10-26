import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateExercisePresetDto } from './exercise-preset.dto';
import { ExercisePresetsService } from './exercise-presets.service';

@Controller('exercise-presets')
@Roles(Role.professional)
export class ExercisePresetsController {
  constructor(private readonly presets: ExercisePresetsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.presets.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExercisePresetDto) {
    return this.presets.create(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.presets.remove(user.id, id);
  }
}
