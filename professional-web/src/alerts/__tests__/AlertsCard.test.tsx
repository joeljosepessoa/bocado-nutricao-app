import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { ProfessionalAlerts } from '../../types/api';
import { AlertsCard } from '../AlertsCard';
import { birthdayText, inactiveText, neverRecordedText, stalePlanText, unreadText } from '../alertsText';

vi.mock('../../api/endpoints', () => ({ getProfessionalAlerts: vi.fn() }));

const NOW = new Date('2026-10-29T15:00:00Z');

const alerts = (over: Partial<ProfessionalAlerts> = {}): ProfessionalAlerts => ({
  generatedAt: NOW.toISOString(),
  settings: { inactiveDays: 7, planDays: 45 },
  inactive: [{ clientId: 'c1', name: 'Ana Teste', lastRecordAt: '2026-10-19T12:00:00Z', lastRecordKind: 'weight', days: 10, lastSeenAt: '2026-10-27T12:00:00Z' }],
  neverRecorded: [{ clientId: 'c2', name: 'Bruno Teste', since: '2026-09-29T12:00:00Z', days: 30, everOpenedApp: false }],
  birthdays: [{ clientId: 'c3', name: 'Carla Teste', date: '2026-11-02', inDays: 4, age: 41 }],
  unreadMessages: [{ clientId: 'c3', name: 'Carla Teste', count: 2, oldestAt: '2026-10-29T10:00:00Z', hours: 5 }],
  stalePlans: [{ clientId: 'c4', name: 'Davi Teste', kind: 'diet', publishedAt: '2026-08-30T12:00:00Z', days: 60 }],
  ...over,
});

function renderCard() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AlertsCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('textos dos avisos', () => {
  it('escreve cada aviso em português simples', () => {
    const data = alerts();
    expect(inactiveText(data.inactive[0], NOW)).toBe('Último registro: peso, há 10 dias · abriu o app há 2 dias');
    expect(inactiveText({ ...data.inactive[0], lastSeenAt: null }, NOW)).toBe('Último registro: peso, há 10 dias');
    expect(neverRecordedText(data.neverRecorded[0])).toBe('Cadastrado há 30 dias · ainda não entrou no app');
    expect(birthdayText(data.birthdays[0])).toBe('Em 4 dias (02/11) — faz 41 anos');
    expect(birthdayText({ ...data.birthdays[0], inDays: 0 })).toBe('Hoje — faz 41 anos');
    expect(unreadText(data.unreadMessages[0])).toBe('2 mensagens sem ler · a mais antiga há 5 h');
    expect(stalePlanText(data.stalePlans[0])).toBe('Dieta publicada há 60 dias');
    expect(stalePlanText({ ...data.stalePlans[0], kind: 'workout' })).toBe('Treino publicado há 60 dias');
  });
});

describe('Avisos para você', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.getProfessionalAlerts).mockReset().mockResolvedValue(alerts());
  });

  it('mostra cada grupo com link para o lugar certo do paciente', async () => {
    renderCard();
    const unread = await screen.findByRole('region', { name: 'Mensagens sem ler' });
    expect(within(unread).getByRole('link', { name: /Carla Teste/ })).toHaveAttribute('href', '/clients/c3/messages');
    expect(within(screen.getByRole('region', { name: 'Sem registrar nada há 7+ dias' })).getByRole('link', { name: /Ana Teste/ })).toHaveAttribute('href', '/clients/c1/tracking');
    expect(within(screen.getByRole('region', { name: 'Dieta ou treino com 45+ dias' })).getByRole('link', { name: /Davi Teste/ })).toHaveAttribute('href', '/clients/c4/diet');
    expect(screen.getByText('5')).toBeInTheDocument(); // total no título
  });

  it('muda o limite e guarda a escolha', async () => {
    renderCard();
    await screen.findByRole('region', { name: 'Mensagens sem ler' });
    await userEvent.selectOptions(screen.getByLabelText('Dias sem registrar'), '14');
    await waitFor(() => expect(api.getProfessionalAlerts).toHaveBeenLastCalledWith({ inactiveDays: 14, planDays: 45 }));
    expect(JSON.parse(localStorage.getItem('bocado.alerts.settings')!)).toEqual({ inactiveDays: 14, planDays: 45 });
  });

  it('sem nada pendente: tudo em dia', async () => {
    vi.mocked(api.getProfessionalAlerts).mockResolvedValue(alerts({ inactive: [], neverRecorded: [], birthdays: [], unreadMessages: [], stalePlans: [] }));
    renderCard();
    expect(await screen.findByText(/Tudo em dia/)).toBeInTheDocument();
  });
});
