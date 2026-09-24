import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ClientAppService } from './client-app.service';
import { UpdateClientSelfDto } from '../clients/dto/update-client-self.dto';
import { CreateExecutionLogDto } from '../workouts/dto/create-execution-log.dto';
import { CreateMessageDto } from '../messages/dto/create-message.dto';
import { CreateAppointmentDto } from '../appointments/dto/create-appointment.dto';
import { DeleteAccountDto } from '../lgpd/dto/delete-account.dto';

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

  @Get('evolution/:evaluationId/photos/:photoId/download-url')
  getEvaluationPhotoUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('evaluationId') evaluationId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.clientAppService.getEvaluationPhotoUrl(user.id, evaluationId, photoId);
  }

  @Get('reports')
  getReports(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.clientAppService.getReports(
      user.id,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @Get('reports/:reportId/download-url')
  getReportDownloadUrl(@CurrentUser() user: AuthenticatedUser, @Param('reportId') reportId: string) {
    return this.clientAppService.getReportDownloadUrl(user.id, reportId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('accept-privacy-terms')
  async acceptPrivacyTerms(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.clientAppService.acceptPrivacyTerms(user.id);
  }

  @Get('messages')
  getMessages(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.clientAppService.getMessages(user.id, { ipAddress: req.ip });
  }

  @Post('messages')
  sendMessage(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMessageDto, @Req() req: Request) {
    return this.clientAppService.sendMessage(user.id, dto.body, { ipAddress: req.ip });
  }

  @Get('availability')
  getAvailability(@CurrentUser() user: AuthenticatedUser) {
    return this.clientAppService.getAvailability(user.id);
  }

  @Post('appointments')
  bookAppointment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAppointmentDto, @Req() req: Request) {
    return this.clientAppService.bookAppointment(user.id, dto, { ipAddress: req.ip });
  }

  @Get('appointments')
  getAppointments(@CurrentUser() user: AuthenticatedUser) {
    return this.clientAppService.getAppointments(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('appointments/:id/cancel')
  cancelAppointment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.clientAppService.cancelAppointment(user.id, id, { ipAddress: req.ip });
  }

  @Post('data-export')
  exportData(@CurrentUser() user: AuthenticatedUser) {
    return this.clientAppService.exportData(user.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('account-deletion')
  async deleteAccount(@CurrentUser() user: AuthenticatedUser, @Body() dto: DeleteAccountDto): Promise<void> {
    await this.clientAppService.deleteAccount(user.id, dto.currentPassword);
  }

  @Get('payment-links')
  getPaymentLinks(@CurrentUser() user: AuthenticatedUser) {
    return this.clientAppService.getPaymentLinks(user.id);
  }

  @Get('client-subscriptions')
  getClientSubscriptions(@CurrentUser() user: AuthenticatedUser) {
    return this.clientAppService.getClientSubscriptions(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('client-subscriptions/:id/cancel')
  cancelClientSubscription(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.clientAppService.cancelClientSubscription(user.id, id, { ipAddress: req.ip });
  }

  @Get('client-invoices')
  getClientInvoices(@CurrentUser() user: AuthenticatedUser) {
    return this.clientAppService.getClientInvoices(user.id);
  }
}
