import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import { AnamnesisPage } from '../../pages/AnamnesisPage';
import type { AnamnesisContent, AnamnesisView, ClientListItem, SaveAnamnesisInput } from '../../types/api';
import { AnamnesisWizard } from '../AnamnesisWizard';
import { STEPS, stepHasContent, toForm, toPayload } from '../options';

vi.mock('../../api/endpoints', () => ({
  getAnamnesis: vi.fn(),
  saveAnamnesis: vi.fn(),
  listAnamneses: vi.fn(),
  listClients: vi.fn(),
}));

const blank: AnamnesisContent = {
  maritalStatus: null,
  cpf: null,
  rg: null,
  occupation: null,
  address: null,
  goals: [],
  goalDescription: null,
  conditions: [],
  otherConditions: null,
  medications: [],
  supplements: [],
  hormones: [],
  surgeries: null,
  allergies: null,
  familyHistory: [],
  smoking: null,
  alcohol: null,
  waterIntake: null,
  sleepHours: null,
  sleepQuality: null,
  stressLevel: null,
  bowelFrequency: null,
  trainingFrequency: null,
  trainingDuration: null,
  trainingModality: null,
  cardio: null,
  dailySteps: null,
  mealsPerDay: null,
  mealTimes: null,
  foodPreferences: null,
  intolerances: null,
  restrictions: null,
  aversions: null,
  notes: null,
};

const view = (content: Partial<AnamnesisContent> = {}, extra: Partial<AnamnesisView['anamnesis']> = {}): AnamnesisView => ({
  client: { id: 'c1', fullName: 'Joel Pessoa', email: 'joel@example.com', birthDate: null, gender: null, phone: '41997163931' },
  anamnesis: { ...blank, ...content, completedAt: null, updatedAt: null, ...extra },
});

/** O servidor devolve a ficha com o que foi enviado. */
function serverEcho() {
  vi.mocked(api.saveAnamnesis).mockImplementation(async (_clientId, input: SaveAnamnesisInput) => {
    const { birthDate, gender, phone, completed, ...content } = input;
    const base = view(content as Partial<AnamnesisContent>, { completedAt: completed ? '2026-10-12T15:00:00.000Z' : null, updatedAt: '2026-10-12T15:00:00.000Z' });
    return { ...base, client: { ...base.client, birthDate: birthDate ?? null, gender: gender ?? null, phone: phone ?? null } };
  });
}

const renderWizard = (onClose = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AnamnesisWizard clientId="c1" onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
};

const lastSaved = () => vi.mocked(api.saveAnamnesis).mock.calls.at(-1)![1];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAnamnesis).mockResolvedValue(view());
  vi.mocked(api.listAnamneses).mockResolvedValue([]);
  serverEcho();
});

describe('Anamnese — as 12 etapas do modelo', () => {
  it('tem as doze etapas, na ordem, e começa em Dados Pessoais com o cadastro do paciente', async () => {
    renderWizard();
    expect(await screen.findByText('Anamnese — Joel Pessoa')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Dados Pessoais',
      'Objetivo',
      'Histórico Clínico',
      'Medicamentos',
      'Suplementos',
      'Hormônios',
      'Cirurgias & Alergias',
      'Histórico Familiar',
      'Hábitos',
      'Atividade Física',
      'Alimentação',
      'Observações',
    ]);
    expect(screen.getByText('1 de 12')).toBeInTheDocument();
    // Nome e e-mail vêm do cadastro e não são editáveis aqui; o WhatsApp vem preenchido e pode mudar.
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Joel Pessoa');
    expect(screen.getByLabelText('Nome completo')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('WhatsApp')).toHaveValue('41997163931');
    expect(screen.getByRole('button', { name: '← Anterior' })).toBeDisabled();
  });

  it('cada etapa mostra os campos do modelo', async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByText('Anamnese — Joel Pessoa');
    const fields: Record<string, string[]> = {
      'Dados Pessoais': ['Data de nascimento', 'Sexo', 'Estado civil', 'CPF', 'RG', 'Profissão', 'Endereço completo'],
      Objetivo: ['Emagrecimento', 'Hipertrofia', 'Ganho de peso', 'Performance esportiva', 'Saúde', 'Reeducação alimentar', 'Redução de gordura', 'Preparação para competição', 'Outro', 'Descrição do objetivo'],
      'Histórico Clínico': ['Hipertensão', 'Diabetes', 'Dislipidemia', 'Hipotireoidismo', 'Hipertireoidismo', 'Resistência à insulina', 'SOP', 'Gastrite', 'Refluxo', 'Doença renal', 'Doença hepática', 'Cardiopatias', 'Ansiedade', 'Depressão', 'Outras patologias'],
      'Cirurgias & Alergias': ['Cirurgias realizadas', 'Alergias conhecidas'],
      'Histórico Familiar': ['Diabetes', 'Hipertensão', 'Obesidade', 'Infarto', 'AVC', 'Câncer'],
      Hábitos: ['Tabagismo', 'Consumo de álcool', 'Consumo de água', 'Horas de sono', 'Qualidade do sono', 'Nível de estresse', 'Frequência intestinal'],
      'Atividade Física': ['Frequência semanal', 'Tempo de treino', 'Modalidade', 'Cardio', 'Passos diários'],
      Alimentação: ['Número de refeições/dia', 'Horários das refeições', 'Preferências alimentares', 'Intolerâncias', 'Restrições', 'Aversões'],
      Observações: ['Observações gerais e anotações'],
    };
    for (const [step, labels] of Object.entries(fields)) {
      await user.click(screen.getByRole('tab', { name: new RegExp(`^${step.replace('&', '&')}`) }));
      const panel = await screen.findByRole('tabpanel', { name: step });
      for (const label of labels) expect(within(panel).getByLabelText(label)).toBeInTheDocument();
    }
    for (const [step, title] of [['Medicamentos', 'Medicamentos em uso'], ['Suplementos', 'Suplementos utilizados'], ['Hormônios', 'Hormônios em uso']]) {
      await user.click(screen.getByRole('tab', { name: new RegExp(`^${step}`) }));
      const panel = await screen.findByRole('tabpanel', { name: step });
      expect(within(panel).getByText(title)).toBeInTheDocument();
      expect(within(panel).getByText('Nenhum item adicionado')).toBeInTheDocument();
    }
    // Só olhar as etapas não grava nada.
    expect(api.saveAnamnesis).not.toHaveBeenCalled();
  });

  it('"Próximo" grava o que foi preenchido e avança; a etapa visitada ganha o ✓', async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByText('Anamnese — Joel Pessoa');

    await user.type(screen.getByLabelText('CPF'), ' 123.456.789-09 ');
    await user.selectOptions(screen.getByLabelText('Sexo'), 'Masculino');
    await user.type(screen.getByLabelText('Data de nascimento'), '1987-03-15');
    await user.click(screen.getByRole('button', { name: 'Próximo →' }));

    expect(await screen.findByText('2 de 12')).toBeInTheDocument();
    expect(lastSaved()).toMatchObject({ cpf: '123.456.789-09', gender: 'masculino', birthDate: '1987-03-15', phone: '41997163931', rg: null, goals: [] });
    expect(lastSaved()).not.toHaveProperty('completed');
    expect(screen.getByRole('tab', { name: 'Dados Pessoais ✓' })).toBeInTheDocument();

    await user.click(screen.getByLabelText('Hipertrofia'));
    await user.click(screen.getByLabelText('Emagrecimento'));
    await user.type(screen.getByLabelText('Descrição do objetivo'), 'Ganhar massa');
    await user.click(screen.getByRole('button', { name: 'Próximo →' }));
    await screen.findByText('3 de 12');
    // Ordem das opções da tela, não a dos cliques.
    expect(lastSaved()).toMatchObject({ goals: ['weight_loss', 'hypertrophy'], goalDescription: 'Ganhar massa' });
    expect(api.saveAnamnesis).toHaveBeenCalledTimes(2);

    // Voltar sem mexer em nada não grava de novo.
    await user.click(screen.getByRole('button', { name: '← Anterior' }));
    await screen.findByText('2 de 12');
    expect(api.saveAnamnesis).toHaveBeenCalledTimes(2);
  });

  it('medicamentos: adiciona linhas, remove e só envia as que têm nome', async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByText('Anamnese — Joel Pessoa');
    await user.click(screen.getByRole('tab', { name: 'Medicamentos' }));
    const panel = await screen.findByRole('tabpanel', { name: 'Medicamentos' });

    await user.click(within(panel).getByRole('button', { name: '+ Adicionar' }));
    await user.click(within(panel).getByRole('button', { name: '+ Adicionar' }));
    await user.click(within(panel).getByRole('button', { name: '+ Adicionar' }));
    const [first, second] = within(panel).getAllByRole('group');
    await user.type(within(first).getByLabelText('Nome'), 'Losartana');
    await user.type(within(first).getByLabelText('Dosagem'), '50 mg');
    await user.type(within(first).getByLabelText('Frequência'), '1x ao dia');
    await user.type(within(second).getByLabelText('Nome'), 'Apagar');
    await user.click(within(panel).getByRole('button', { name: 'Remover item 2' }));
    // A terceira linha ficou em branco: não é enviada.
    await user.click(screen.getByRole('button', { name: 'Próximo →' }));

    await screen.findByText('5 de 12');
    expect(lastSaved().medications).toEqual([{ name: 'Losartana', dosage: '50 mg', frequency: '1x ao dia' }]);
  });

  it('"Concluir Anamnese" na última etapa grava como concluída e fecha', async () => {
    const user = userEvent.setup();
    const onClose = renderWizard();
    await screen.findByText('Anamnese — Joel Pessoa');
    await user.click(screen.getByRole('tab', { name: 'Observações' }));
    await screen.findByText('12 de 12');
    expect(screen.queryByRole('button', { name: 'Próximo →' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Observações gerais e anotações'), 'Trabalha em turnos.');
    await user.click(screen.getByRole('button', { name: '✓ Concluir Anamnese' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(lastSaved()).toMatchObject({ notes: 'Trabalha em turnos.', completed: true });
  });

  it('"Fechar" no meio grava o que foi digitado antes de sair; se não gravar, avisa e fica na tela', async () => {
    const user = userEvent.setup();
    const onClose = renderWizard();
    await screen.findByText('Anamnese — Joel Pessoa');
    await user.type(screen.getByLabelText('Profissão'), 'Motorista');

    vi.mocked(api.saveAnamnesis).mockRejectedValueOnce({ response: { data: { message: 'Falha de rede' } } });
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de rede');
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(lastSaved()).toMatchObject({ occupation: 'Motorista' });
  });

  it('ficha já preenchida e concluída abre com os dados, a data da conclusão e todas as etapas marcadas', async () => {
    vi.mocked(api.getAnamnesis).mockResolvedValue({
      ...view(
        { cpf: '111.222.333-44', goals: ['health'], medications: [{ name: 'Losartana', dosage: '50 mg', frequency: null }], sleepQuality: 'good' },
        { completedAt: '2026-10-10T12:00:00.000Z', updatedAt: '2026-10-10T12:00:00.000Z' },
      ),
      client: { id: 'c1', fullName: 'Joel Pessoa', email: 'joel@example.com', birthDate: '1987-03-15', gender: 'Masculino', phone: null },
    });
    const user = userEvent.setup();
    renderWizard();
    expect(await screen.findByText(/12 etapas · concluída em 10\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByLabelText('CPF')).toHaveValue('111.222.333-44');
    expect(screen.getByLabelText('Data de nascimento')).toHaveValue('1987-03-15');
    // O sexo do cadastro ("Masculino") casa com a opção mesmo com outra caixa.
    expect(screen.getByLabelText('Sexo')).toHaveValue('masculino');
    expect(screen.getAllByRole('tab').filter((tab) => tab.textContent?.endsWith('✓'))).toHaveLength(11);

    await user.click(screen.getByRole('tab', { name: 'Medicamentos ✓' }));
    const panel = await screen.findByRole('tabpanel', { name: 'Medicamentos' });
    expect(within(panel).getByLabelText('Nome')).toHaveValue('Losartana');
    expect(within(panel).getByLabelText('Frequência')).toHaveValue('');
    await user.click(screen.getByRole('tab', { name: 'Hábitos ✓' }));
    expect(screen.getByLabelText('Qualidade do sono')).toHaveValue('good');
  });
});

describe('Anamnese — conversões', () => {
  it('ficha → campos → envio devolve a mesma ficha (em branco continua em branco)', () => {
    const filled = view({ cpf: '1', goals: ['health'], conditions: ['reflux'], familyHistory: ['stroke'], supplements: [{ name: 'Whey', dosage: null, frequency: '1x' }], notes: 'ok' });
    const { birthDate, gender, phone, ...content } = toPayload(toForm(filled));
    expect(content).toEqual({ ...blank, cpf: '1', goals: ['health'], conditions: ['reflux'], familyHistory: ['stroke'], supplements: [{ name: 'Whey', dosage: null, frequency: '1x' }], notes: 'ok' });
    expect({ birthDate, gender, phone }).toEqual({ birthDate: null, gender: null, phone: '41997163931' });
  });

  it('cada etapa sabe dizer se tem algo preenchido', () => {
    const empty = toForm({ ...view(), client: { ...view().client, phone: null } });
    expect(STEPS.filter((step) => stepHasContent(step.key, empty))).toEqual([]);
    const some = toForm(view({ allergies: 'Dipirona', hormones: [{ name: 'Testosterona', dosage: null, frequency: null }], dailySteps: '8000' }));
    expect(STEPS.filter((step) => stepHasContent(step.key, some)).map((step) => step.key)).toEqual(['personal', 'hormones', 'surgeries', 'activity']);
  });
});

describe('tela Anamnese — lista de pacientes', () => {
  const client = (id: string, fullName: string, status: ClientListItem['status'] = 'active'): ClientListItem => ({ id, status, createdAt: '2026-10-01T00:00:00Z', user: { fullName, email: `${id}@example.com` } });

  it('mostra a situação da ficha de cada paciente, esconde arquivados e abre a ficha ao clicar', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listClients).mockResolvedValue({ items: [client('c1', 'Joel Pessoa'), client('c2', 'Patrícia'), client('c3', 'Adriana'), client('c4', 'Arquivado', 'archived')], total: 4, page: 1, pageSize: 100 });
    vi.mocked(api.listAnamneses).mockResolvedValue([
      { clientId: 'c2', completedAt: '2026-10-10T12:00:00.000Z', updatedAt: '2026-10-10T12:00:00.000Z' },
      { clientId: 'c3', completedAt: null, updatedAt: '2026-10-11T12:00:00.000Z' },
    ]);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AnamnesisPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('button', { name: 'Abrir anamnese de Joel Pessoa' })).toHaveTextContent('Não iniciada');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir anamnese de Patrícia' })).toHaveTextContent('Concluída em 10/10/2026'));
    expect(screen.getByRole('button', { name: 'Abrir anamnese de Adriana' })).toHaveTextContent('Em andamento');
    expect(screen.queryByText('Arquivado')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir anamnese de Joel Pessoa' }));
    expect(await screen.findByText('Anamnese — Joel Pessoa')).toBeInTheDocument();
    expect(api.getAnamnesis).toHaveBeenCalledWith('c1');
  });
});
