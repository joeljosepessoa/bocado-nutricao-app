import { Injectable } from '@nestjs/common';
import { ClientsService } from '../clients/clients.service';
import { UpdateClientSelfDto } from '../clients/dto/update-client-self.dto';
import { DietsService } from '../diets/diets.service';
import { DietClientSummaryDto } from '../diets/dto/diet-client-summary.dto';
import { WorkoutsService } from '../workouts/workouts.service';
import { WorkoutClientSummaryDto } from '../workouts/dto/workout-client-summary.dto';
import { PhysicalEvaluationsService } from '../physical-evaluations/physical-evaluations.service';
import { UsersService } from '../users/users.service';
import { ReportsService } from '../reports/reports.service';
import { CreateExecutionLogDto } from '../workouts/dto/create-execution-log.dto';
import { MessagesService, RequestMeta } from '../messages/messages.service';
import { AvailabilityService } from '../appointments/availability.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CreateAppointmentDto } from '../appointments/dto/create-appointment.dto';
import { LgpdService } from '../lgpd/lgpd.service';

@Injectable()
export class ClientAppService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly dietsService: DietsService,
    private readonly workoutsService: WorkoutsService,
    private readonly evaluationsService: PhysicalEvaluationsService,
    private readonly usersService: UsersService,
    private readonly reportsService: ReportsService,
    private readonly messagesService: MessagesService,
    private readonly availabilityService: AvailabilityService,
    private readonly appointmentsService: AppointmentsService,
    private readonly lgpdService: LgpdService,
  ) {}

  me(clientId: string) {
    return this.clientsService.me(clientId);
  }

  updateMe(clientId: string, dto: UpdateClientSelfDto) {
    return this.clientsService.updateSelf(clientId, dto);
  }

  /**
   * Envelope `{ diet: ... }` em vez de devolver o DTO cru: quando não há
   * versão publicada, o valor é `null` — e o Nest, ao ver `null` como corpo
   * de resposta direto, envia corpo vazio (trata `null`/`undefined` da
   * mesma forma), o que quebraria o parse JSON no app. Dentro de um objeto,
   * `null` serializa normalmente.
   */
  async getCurrentDiet(clientId: string): Promise<{ diet: DietClientSummaryDto | null }> {
    return { diet: await this.dietsService.findCurrentPublishedForClient(clientId) };
  }

  async getCurrentWorkout(clientId: string): Promise<{ workout: WorkoutClientSummaryDto | null }> {
    return { workout: await this.workoutsService.findCurrentPublishedForClient(clientId) };
  }

  logWorkoutExecution(clientId: string, dto: CreateExecutionLogDto) {
    return this.workoutsService.createExecutionLogAsClient(clientId, dto);
  }

  listWorkoutExecutions(clientId: string, page?: number, pageSize?: number) {
    return this.workoutsService.listExecutionLogsForClient(clientId, page, pageSize);
  }

  getEvolution(clientId: string, page?: number, pageSize?: number) {
    return this.evaluationsService.listReleasedForClient(clientId, page, pageSize);
  }

  getReports(clientId: string, page?: number, pageSize?: number) {
    return this.reportsService.listReleasedForClient(clientId, page, pageSize);
  }

  getReportDownloadUrl(clientId: string, reportId: string) {
    return this.reportsService.getDownloadUrlForClient(clientId, reportId);
  }

  acceptPrivacyTerms(userId: string) {
    return this.usersService.acceptPrivacyTerms(userId);
  }

  getMessages(clientId: string, meta: RequestMeta = {}) {
    return this.messagesService.listForClient(clientId, meta);
  }

  sendMessage(clientId: string, body: string, meta: RequestMeta = {}) {
    return this.messagesService.sendFromClient(clientId, body, meta);
  }

  getAvailability(clientId: string) {
    return this.availabilityService.listBookableForClient(clientId);
  }

  bookAppointment(clientId: string, dto: CreateAppointmentDto, meta: RequestMeta = {}) {
    return this.appointmentsService.bookForClient(clientId, dto, meta);
  }

  getAppointments(clientId: string) {
    return this.appointmentsService.listForClient(clientId);
  }

  cancelAppointment(clientId: string, appointmentId: string, meta: RequestMeta = {}) {
    return this.appointmentsService.cancelForClient(clientId, appointmentId, meta);
  }

  exportData(clientId: string) {
    return this.lgpdService.exportClientData(clientId);
  }

  deleteAccount(clientId: string, currentPassword: string) {
    return this.lgpdService.deleteAccount(clientId, currentPassword);
  }
}
