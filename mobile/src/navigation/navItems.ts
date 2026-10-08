import type { MainTabParamList } from './types';

/**
 * Itens de navegação da área do paciente (menu lateral, barra inferior e
 * títulos do cabeçalho). Só dado — os ícones ficam nos componentes.
 */
export type AppRoute = keyof MainTabParamList;

export interface NavItem {
  route: AppRoute;
  label: string;
}

/** Menu lateral, na ordem da referência. */
export const DRAWER_ITEMS: NavItem[] = [
  { route: 'Home', label: 'Dashboard' },
  { route: 'Diet', label: 'Minha Dieta' },
  { route: 'Workout', label: 'Meus Treinos' },
  { route: 'Evolution', label: 'Evolução' },
  { route: 'Weight', label: 'Registro de Peso' },
  { route: 'Water', label: 'Água' },
  { route: 'Photos', label: 'Fotos' },
  { route: 'History', label: 'Histórico' },
  { route: 'Assessment', label: 'Avaliação' },
];

/** Telas deste app que a referência não tem — continuam acessíveis pelo menu. */
export const DRAWER_EXTRA_ITEMS: NavItem[] = [
  { route: 'Messages', label: 'Mensagens' },
  { route: 'Appointments', label: 'Consultas' },
  { route: 'Reports', label: 'Relatórios' },
  { route: 'Activity', label: 'Atividade e dispositivos' },
];

/** Barra inferior: 4 telas + "Perfil", que abre o painel de perfil (não navega). */
export const BOTTOM_TABS: Array<NavItem | { route: null; label: 'Perfil'; action: 'profile' }> = [
  { route: 'Home', label: 'Dashboard' },
  { route: 'Diet', label: 'Dieta' },
  { route: 'Workout', label: 'Treinos' },
  { route: 'Evolution', label: 'Evolução' },
  { route: null, label: 'Perfil', action: 'profile' },
];

export const ROUTE_TITLES: Record<AppRoute, string> = {
  Home: 'Dashboard',
  Diet: 'Minha Dieta',
  Workout: 'Meus Treinos',
  Evolution: 'Evolução',
  Weight: 'Registro de Peso',
  Water: 'Água',
  Photos: 'Fotos',
  History: 'Histórico',
  Assessment: 'Avaliação',
  Profile: 'Meu Perfil',
  Settings: 'Configurações',
  Activity: 'Atividade',
  Messages: 'Mensagens',
  Appointments: 'Consultas',
  Reports: 'Relatórios',
  NotificationPreferences: 'Notificações',
  Privacy: 'Privacidade e dados',
};

/** Rotas visíveis na barra inferior (as demais ficam só no menu). */
export const TAB_BAR_ROUTES: AppRoute[] = ['Home', 'Diet', 'Workout', 'Evolution'];

/** Iniciais do avatar ("Patrícia Souza" → "P"). */
export function initialOf(name: string | null | undefined): string {
  const first = (name ?? '').trim().charAt(0);
  return first ? first.toLocaleUpperCase('pt-BR') : 'U';
}
