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

@Injectable()
export class ClientAppService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly dietsService: DietsService,
    private readonly workoutsService: WorkoutsService,
    private readonly evaluationsService: PhysicalEvaluationsService,
    private readonly usersService: UsersService,
    private readonly reportsService: ReportsService,
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
}
