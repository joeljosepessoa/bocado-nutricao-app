import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DietStatus, TemplateKind, WorkoutStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CustomFormsService } from '../custom-forms/custom-forms.service';
import { DietsService } from '../diets/diets.service';
import { ReportsService } from '../reports/reports.service';
import { TemplatesService } from '../templates/templates.service';
import { WorkoutsService } from '../workouts/workouts.service';

export const TRASH_KINDS = ['diet', 'workout', 'diet_template', 'workout_template', 'form', 'report', 'form_response'] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];

export interface TrashItem {
  kind: TrashKind;
  id: string;
  title: string;
  clientId: string | null;
  clientName: string | null;
  /** Quando foi para a lixeira (dieta/treino: última alteração, que é a exclusão). */
  deletedAt: Date;
  /** Dieta e treino nunca são apagados de vez (histórico do paciente); formulário com respostas também não. */
  canPurge: boolean;
  /** Relatório: para quem é e de qual avaliação. */
  audience?: string;
  evaluatedAt?: Date;
}

interface Meta {
  ipAddress?: string;
}

/**
 * Lixeira do profissional: junta o que foi excluído nas várias telas (dietas e treinos
 * arquivados, modelos, formulários, relatórios e formulários preenchidos), restaura e
 * apaga de vez. Nada some sozinho. Cada tipo continua com as regras do seu próprio serviço.
 */
@Injectable()
export class TrashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diets: DietsService,
    private readonly workouts: WorkoutsService,
    private readonly templates: TemplatesService,
    private readonly forms: CustomFormsService,
    private readonly reports: ReportsService,
  ) {}

  async list(professionalId: string): Promise<TrashItem[]> {
    const ownClient = { professionalId };
    const clientName = { select: { id: true, user: { select: { fullName: true } } } };
    const lastVersion = { orderBy: { versionNumber: 'desc' as const }, take: 1, select: { objective: true, versionNumber: true } };

    const [diets, workouts, templates, forms, reports, responses] = await Promise.all([
      this.prisma.diet.findMany({
        where: { professionalId, status: DietStatus.archived, client: ownClient },
        select: { id: true, updatedAt: true, client: clientName, versions: lastVersion },
      }),
      this.prisma.workout.findMany({
        where: { professionalId, status: WorkoutStatus.archived, client: ownClient },
        select: { id: true, updatedAt: true, client: clientName, versions: lastVersion },
      }),
      this.prisma.template.findMany({
        where: { professionalId, deletedAt: { not: null } },
        select: { id: true, kind: true, name: true, deletedAt: true },
      }),
      this.prisma.customForm.findMany({
        where: { professionalId, deletedAt: { not: null } },
        select: { id: true, name: true, deletedAt: true, _count: { select: { responses: true } } },
      }),
      this.prisma.report.findMany({
        where: { professionalId, deletedAt: { not: null }, client: ownClient },
        select: { id: true, audience: true, deletedAt: true, client: clientName, evaluation: { select: { evaluatedAt: true } } },
      }),
      this.prisma.customFormResponse.findMany({
        where: { professionalId, deletedAt: { not: null }, client: ownClient },
        select: { id: true, formName: true, deletedAt: true, client: clientName },
      }),
    ]);

    const planTitle = (word: string, versions: Array<{ objective: string | null; versionNumber: number }>) =>
      versions[0]?.objective?.trim() ? `${word}: ${versions[0].objective.trim()}` : word;

    const items: TrashItem[] = [
      ...diets.map((d) => ({
        kind: 'diet' as const,
        id: d.id,
        title: planTitle('Dieta', d.versions),
        clientId: d.client.id,
        clientName: d.client.user.fullName,
        deletedAt: d.updatedAt,
        canPurge: false,
      })),
      ...workouts.map((w) => ({
        kind: 'workout' as const,
        id: w.id,
        title: planTitle('Treino', w.versions),
        clientId: w.client.id,
        clientName: w.client.user.fullName,
        deletedAt: w.updatedAt,
        canPurge: false,
      })),
      ...templates.map((t) => ({
        kind: (t.kind === TemplateKind.diet ? 'diet_template' : 'workout_template') as TrashKind,
        id: t.id,
        title: t.name,
        clientId: null,
        clientName: null,
        deletedAt: t.deletedAt as Date,
        canPurge: true,
      })),
      ...forms.map((f) => ({
        kind: 'form' as const,
        id: f.id,
        title: f.name,
        clientId: null,
        clientName: null,
        deletedAt: f.deletedAt as Date,
        canPurge: f._count.responses === 0,
      })),
      ...reports.map((r) => ({
        kind: 'report' as const,
        id: r.id,
        title: 'Relatório da avaliação',
        clientId: r.client.id,
        clientName: r.client.user.fullName,
        deletedAt: r.deletedAt as Date,
        canPurge: true,
        audience: r.audience,
        evaluatedAt: r.evaluation.evaluatedAt,
      })),
      ...responses.map((r) => ({
        kind: 'form_response' as const,
        id: r.id,
        title: r.formName,
        clientId: r.client.id,
        clientName: r.client.user.fullName,
        deletedAt: r.deletedAt as Date,
        canPurge: true,
      })),
    ];
    return items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
  }

  async restore(professionalId: string, kind: TrashKind, id: string, meta: Meta = {}): Promise<void> {
    switch (kind) {
      case 'diet': {
        const diet = await this.prisma.diet.findFirst({ where: { id, professionalId, status: DietStatus.archived } });
        if (!diet) throw new NotFoundException('Dieta não encontrada na lixeira.');
        const active = await this.prisma.diet.count({ where: { clientId: diet.clientId, status: DietStatus.active } });
        if (active > 0) {
          throw new ConflictException('Este paciente já tem uma dieta. Exclua a dieta atual dele antes de restaurar esta.');
        }
        await this.diets.update(professionalId, diet.clientId, id, { status: DietStatus.active }, meta);
        return;
      }
      case 'workout': {
        const workout = await this.prisma.workout.findFirst({ where: { id, professionalId, status: WorkoutStatus.archived } });
        if (!workout) throw new NotFoundException('Treino não encontrado na lixeira.');
        const active = await this.prisma.workout.count({ where: { clientId: workout.clientId, status: WorkoutStatus.active } });
        if (active > 0) {
          throw new ConflictException('Este paciente já tem um treino. Exclua o treino atual dele antes de restaurar este.');
        }
        await this.workouts.update(professionalId, workout.clientId, id, { status: WorkoutStatus.active }, meta);
        return;
      }
      case 'diet_template':
        await this.templates.restore(professionalId, TemplateKind.diet, id);
        return;
      case 'workout_template':
        await this.templates.restore(professionalId, TemplateKind.workout, id);
        return;
      case 'form':
        await this.forms.restore(professionalId, id);
        return;
      case 'report': {
        const report = await this.trashedReport(professionalId, id);
        await this.reports.restore(professionalId, report.clientId, id, meta);
        return;
      }
      case 'form_response': {
        const response = await this.trashedResponse(professionalId, id);
        await this.forms.restoreResponse(professionalId, response.clientId, id);
        return;
      }
    }
  }

  async purge(professionalId: string, kind: TrashKind, id: string, meta: Meta = {}): Promise<void> {
    switch (kind) {
      case 'diet':
      case 'workout':
        throw new BadRequestException('Dietas e treinos ficam guardados no histórico do paciente e não podem ser apagados de vez.');
      case 'diet_template':
        await this.templates.purge(professionalId, TemplateKind.diet, id);
        return;
      case 'workout_template':
        await this.templates.purge(professionalId, TemplateKind.workout, id);
        return;
      case 'form':
        await this.forms.purge(professionalId, id);
        return;
      case 'report': {
        const report = await this.trashedReport(professionalId, id);
        await this.reports.purge(professionalId, report.clientId, id, meta);
        return;
      }
      case 'form_response': {
        const response = await this.trashedResponse(professionalId, id);
        await this.forms.purgeResponse(professionalId, response.clientId, id);
        return;
      }
    }
  }

  private async trashedReport(professionalId: string, id: string) {
    const report = await this.prisma.report.findFirst({ where: { id, professionalId, deletedAt: { not: null } }, select: { clientId: true } });
    if (!report) throw new NotFoundException('Relatório não encontrado na lixeira.');
    return report;
  }

  private async trashedResponse(professionalId: string, id: string) {
    const response = await this.prisma.customFormResponse.findFirst({
      where: { id, professionalId, deletedAt: { not: null } },
      select: { clientId: true },
    });
    if (!response) throw new NotFoundException('Formulário preenchido não encontrado na lixeira.');
    return response;
  }
}
