import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ClientAppService } from './client-app.service';
import { UpdateClientSelfDto } from '../clients/dto/update-client-self.dto';
import { CreateExecutionLogDto } from '../workouts/dto/create-execution-log.dto';

@Controller('client')
@Roles(Role.client)
export class ClientAppController {
  constructor(private readonly clientAppService: ClientAppService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.clientAppService.me(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateClientSelfDto) {
    return this.clientAppService.updateMe(user.id, dto);
  }

  @Get('diet')
  getCurrentDiet(@CurrentUser() user: AuthenticatedUser) {
    return this.clientAppService.getCurrentDiet(user.id);
  }

  @Get('workout')
  getCurrentWorkout(@CurrentUser() user: AuthenticatedUser) {
    return this.clientAppService.getCurrentWorkout(user.id);
  }

  @Post('workout/execution-logs')
  logWorkoutExecution(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExecutionLogDto) {
    return this.clientAppService.logWorkoutExecution(user.id, dto);
  }

  @Get('workout/execution-logs')
  listWorkoutExecutions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.clientAppService.listWorkoutExecutions(
      user.id,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @Get('evolution')
  getEvolution(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.clientAppService.getEvolution(
      user.id,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @Get('reports')
  getReports() {
    return this.clientAppService.getReports();
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('accept-privacy-terms')
  async acceptPrivacyTerms(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.clientAppService.acceptPrivacyTerms(user.id);
  }
}
