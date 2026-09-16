import { Injectable } from '@nestjs/common';
import { ExerciseScope, FoodScope } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface PlatformMetrics {
  professionals: { total: number; suspended: number };
  clients: { total: number };
  evaluations: { total: number };
  diets: { total: number };
  workouts: { total: number };
  foods: { globalApproved: number; globalPending: number };
  exercises: { globalApproved: number; globalPending: number };
}

/**
 * Só contagens agregadas derivadas diretamente do banco (mesmo princípio já
 * usado no dashboard do profissional, Fase 9) — nenhuma métrica inventada.
 */
@Injectable()
export class AdminMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(): Promise<PlatformMetrics> {
    const [
      totalProfessionals,
      suspendedProfessionals,
      totalClients,
      totalEvaluations,
      totalDiets,
      totalWorkouts,
      foodsApproved,
      foodsPending,
      exercisesApproved,
      exercisesPending,
    ] = await this.prisma.$transaction([
      this.prisma.professional.count(),
      this.prisma.user.count({ where: { suspendedAt: { not: null } } }),
      this.prisma.client.count(),
      this.prisma.physicalEvaluation.count(),
      this.prisma.diet.count(),
      this.prisma.workout.count(),
      this.prisma.food.count({ where: { scope: FoodScope.global, approvedAt: { not: null } } }),
      this.prisma.food.count({ where: { scope: FoodScope.global, approvedAt: null } }),
      this.prisma.exercise.count({ where: { scope: ExerciseScope.global, approvedAt: { not: null } } }),
      this.prisma.exercise.count({ where: { scope: ExerciseScope.global, approvedAt: null } }),
    ]);

    return {
      professionals: { total: totalProfessionals, suspended: suspendedProfessionals },
      clients: { total: totalClients },
      evaluations: { total: totalEvaluations },
      diets: { total: totalDiets },
      workouts: { total: totalWorkouts },
      foods: { globalApproved: foodsApproved, globalPending: foodsPending },
      exercises: { globalApproved: exercisesApproved, globalPending: exercisesPending },
    };
  }
}
