export type RecentActivityType = 'evaluation_created' | 'diet_published' | 'workout_published';

export interface RecentActivityItem {
  type: RecentActivityType;
  clientId: string;
  clientName: string;
  occurredAt: Date;
}

/**
 * Só números derivados diretamente do banco — nenhuma métrica inventada.
 * "pendingRelease" = avaliações com releasedToClientAt nulo, ou seja,
 * nunca compartilhadas com o cliente (não é um status novo, é um filtro
 * sobre o campo que já existe desde a Fase 7).
 */
export class DashboardSummaryDto {
  clients!: { total: number; active: number; archived: number };
  evaluations!: { last30Days: number; pendingRelease: number };
  diets!: { active: number };
  workouts!: { active: number };
  recentActivity!: RecentActivityItem[];
}
