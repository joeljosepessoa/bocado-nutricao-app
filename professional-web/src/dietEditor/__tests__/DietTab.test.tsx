import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import { DietTab } from '../../pages/tabs/DietTab';
import type { DietDayNode, DietVersion } from '../../types/api';
import { choice, day, dietWith, fixed, group, item, legacyDays, meal, range, structuredDays, supplements, version } from './fixtures';

vi.mock('../../api/endpoints', () => ({
  listDiets: vi.fn(),
  getDiet: vi.fn(),
  getDietVersion: vi.fn(),
  createDiet: vi.fn(),
  createDietVersion: vi.fn(),
  publishDietVersion: vi.fn(),
  archiveDiet: vi.fn(),
  updateDietVersion: vi.fn(),
  createMeal: vi.fn(),
  updateMeal: vi.fn(),
  deleteMeal: vi.fn(),
  addMealFood: vi.fn(),
  updateMealFood: vi.fn(),
  deleteMealFood: vi.fn(),
  createDietDay: vi.fn(),
  updateDietDay: vi.fn(),
  deleteDietDay: vi.fn(),
  createMealGroup: vi.fn(),
  updateMealGroup: vi.fn(),
  deleteMealGroup: vi.fn(),
  createMealChoice: vi.fn(),
  updateMealChoice: vi.fn(),
  deleteMealChoice: vi.fn(),
  addChoiceFood: vi.fn(),
  createDietSupplement: vi.fn(),
  updateDietSupplement: vi.fn(),
  deleteDietSupplement: vi.fn(),
  listFoods: vi.fn(),
}));

const REF = { clientId: 'c1', dietId: 'd1', versionId: 'v-draft' };

function renderTab(current: DietVersion) {
  vi.mocked(api.listDiets).mockResolvedValue({ items: [{ id: 'd1', status: 'active', createdAt: '2026-10-01' }] } as never);
  vi.mocked(api.getDiet).mockResolvedValue(dietWith(current));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/clients/c1/diet']}>
        <Routes>
          <Route path="/clients/:clientId/diet" element={<DietTab />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const mealSection = (name: string) => screen.findByRole('region', { name: `Refeição ${name}` });

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(api)) {
    if (vi.isMockFunction(fn)) fn.mockResolvedValue({ id: 'novo' } as never);
  }
});

describe('Dieta antiga / simples (convertida pelo P1)', () => {
  it('aparece como antes: sem abas de dia, refeições com alimentos, quantidades e kcal; total da refeição', async () => {
    renderTab(version('published', legacyDays()));
    const cafe = await mealSection('Café da manhã');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(within(cafe).getByText('07:00')).toBeInTheDocument();
    expect(within(cafe).getByText(/Pão integral/)).toBeInTheDocument();
    expect(within(cafe).getByText('2 fatia(s)')).toBeInTheDocument();
    expect(within(cafe).getByText('140 kcal')).toBeInTheDocument();
    expect(within(cafe).getByText('296 kcal')).toBeInTheDocument();
    expect(within(cafe).getByText('Itens fixos · consumir todos')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Refeição Almoço' })).toBeInTheDocument();
  });

  it('publicada é somente leitura: nada de editar/remover; "Editar" abre um rascunho novo', async () => {
    const user = renderTab(version('published', legacyDays()));
    await mealSection('Café da manhã');
    expect(screen.queryByRole('button', { name: /Remover/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Alimento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Tipo de dia' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nome da refeição')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(api.createDietVersion).toHaveBeenCalledWith('c1', 'd1');
  });

  it('rascunho antigo continua editável do jeito de antes (refeição, alimento, quantidade)', async () => {
    const user = renderTab(version('draft', legacyDays()));
    const cafe = await mealSection('Café da manhã');
    await user.click(within(cafe).getByRole('button', { name: 'Editar Ovo' }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Quantidade'));
    await user.type(within(dialog).getByLabelText('Quantidade'), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar alimento' }));
    await waitFor(() =>
      expect(api.updateMealFood).toHaveBeenCalledWith('c1', 'd1', 'v-draft', 'm-cafe', expect.any(String), {
        isFreeQuantity: false,
        quantity: 3,
        quantityMax: null,
        unit: 'unit',
      }),
    );
  });
});

describe('Dias (treino / descanso)', () => {
  it('mostra o dia selecionado e só as refeições dele; dias não são somados', async () => {
    const user = renderTab(version('published', structuredDays()));
    const training = await screen.findByRole('tab', { name: 'Dia de treino' });
    expect(training).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('region', { name: 'Dia de treino' });
    expect(within(panel).getByText('Faixa do dia: 833–911 kcal')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Refeição Almoço' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Dia de descanso' }));
    expect(screen.getByRole('tab', { name: 'Dia de descanso' })).toHaveAttribute('aria-selected', 'true');
    const rest = screen.getByRole('region', { name: 'Dia de descanso' });
    expect(within(rest).getByText('Total do dia: 98 kcal')).toBeInTheDocument();
    expect(within(rest).getByText(/Castanhas/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Refeição Almoço' })).not.toBeInTheDocument();
    // Nunca a soma dos dois dias.
    expect(screen.queryByText(/931|1\.009/)).not.toBeInTheDocument();
  });

  it('adiciona um tipo de dia (atalho "Dia de treino") no rascunho', async () => {
    const user = renderTab(version('draft', legacyDays()));
    await mealSection('Café da manhã');
    await user.click(screen.getByRole('button', { name: '+ Tipo de dia' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Dia de treino' }));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar dia' }));
    await waitFor(() => expect(api.createDietDay).toHaveBeenCalledWith(REF, { label: 'Dia de treino', kind: 'training', usageNotes: '' }));
  });

  it('edita, reordena e exclui dia — excluir só com o dia vazio (regra do backend)', async () => {
    const days = structuredDays();
    days.push({ ...day('day-vazio', 'Dia livre', 'other', [], range(0)), order: 2 });
    const user = renderTab(version('draft', days));
    await screen.findByRole('tab', { name: 'Dia de treino' });
    expect(screen.getByRole('button', { name: 'Excluir dia' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Mover Dia de treino para a direita' }));
    await waitFor(() => expect(api.updateDietDay).toHaveBeenCalledWith(REF, 'day-descanso', { order: 0 }));
    expect(api.updateDietDay).toHaveBeenCalledWith(REF, 'day-treino', { order: 1 });

    await user.click(screen.getByRole('button', { name: 'Editar dia' }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Quando usar'));
    await user.type(within(dialog).getByLabelText('Quando usar'), 'Dias com musculação');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar dia' }));
    await waitFor(() =>
      expect(api.updateDietDay).toHaveBeenCalledWith(REF, 'day-treino', { label: 'Dia de treino', kind: 'training', usageNotes: 'Dias com musculação' }),
    );

    await user.click(screen.getByRole('tab', { name: 'Dia livre' }));
    await user.click(screen.getByRole('button', { name: 'Excluir dia' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir dia' }));
    await waitFor(() => expect(api.deleteDietDay).toHaveBeenCalledWith(REF, 'day-vazio'));
  });
});

describe('Opções completas (meal_options)', () => {
  it('cada opção é um cartão com seu total; a refeição mostra a faixa 320–350 — nunca 1010', async () => {
    renderTab(version('published', structuredDays()));
    const cafe = await mealSection('Café da manhã');
    expect(within(cafe).getByText('Escolha 1 opção')).toBeInTheDocument();
    const cards = within(cafe).getAllByRole('article');
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual(['Opção 1', 'Opção 2', 'Opção 3']);
    expect(within(cards[0]).getByText('350 kcal')).toBeInTheDocument();
    expect(within(cards[1]).getByText('320 kcal')).toBeInTheDocument();
    expect(within(cards[2]).getByText('340 kcal')).toBeInTheDocument();
    expect(within(cards[1]).getByText(/Whey/)).toBeInTheDocument();
    expect(within(cafe).getByText('Faixa: 320–350 kcal')).toBeInTheDocument();
    expect(cafe.textContent).not.toMatch(/1\.?010/);
  });

  it('rascunho: adiciona, renomeia, reordena e exclui opção; adiciona alimento dentro da opção', async () => {
    const user = renderTab(version('draft', structuredDays()));
    const cafe = await mealSection('Café da manhã');
    await user.click(within(cafe).getByRole('button', { name: '+ Opção' }));
    await waitFor(() => expect(api.createMealChoice).toHaveBeenCalledWith(REF, 'm-cafe', 'g-opcoes', { label: 'Opção 4' }));

    await user.click(within(cafe).getByRole('button', { name: 'Mover Opção 1 para a direita' }));
    await waitFor(() => expect(api.updateMealChoice).toHaveBeenCalledWith(REF, 'm-cafe', 'g-opcoes', 'op-2', { order: 0 }));

    const opcao2 = within(cafe).getByRole('article', { name: 'Opção 2' });
    await user.click(within(opcao2).getByRole('button', { name: 'Renomear' }));
    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), 'Opção com whey');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.updateMealChoice).toHaveBeenCalledWith(REF, 'm-cafe', 'g-opcoes', 'op-2', { label: 'Opção com whey' }));

    await user.click(within(opcao2).getByRole('button', { name: '+ Alimento' }));
    let dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Nome livre/));
    await user.type(within(dialog).getByPlaceholderText('Ex.: Salada de folhas'), 'Café sem açúcar');
    await user.click(within(dialog).getByLabelText(/À vontade/));
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }));
    await waitFor(() =>
      expect(api.addChoiceFood).toHaveBeenCalledWith(REF, 'm-cafe', 'g-opcoes', 'op-2', expect.objectContaining({ customFoodName: 'Café sem açúcar', isFreeQuantity: true })),
    );

    await user.click(within(within(cafe).getByRole('article', { name: 'Opção 3' })).getByRole('button', { name: 'Excluir opção' }));
    dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(api.deleteMealChoice).toHaveBeenCalledWith(REF, 'm-cafe', 'g-opcoes', 'op-3'));
  });

  it('a UI não permite combinação inválida: com opções completas não há "+ Bloco"/"+ Itens fixos"', async () => {
    renderTab(version('draft', structuredDays()));
    const cafe = await mealSection('Café da manhã');
    expect(within(cafe).queryByRole('button', { name: /\+ Bloco/ })).not.toBeInTheDocument();
    expect(within(cafe).queryByRole('button', { name: '+ Itens fixos' })).not.toBeInTheDocument();
    expect(within(cafe).queryByRole('button', { name: 'Usar opções completas' })).not.toBeInTheDocument();
    // Refeição com alimentos não vira "opções completas".
    const almoco = screen.getByRole('region', { name: 'Refeição Almoço' });
    expect(within(almoco).getByRole('button', { name: 'Usar opções completas' })).toBeDisabled();
  });
});

describe('Alternativas e itens fixos', () => {
  it('bloco "escolha 1": cada alternativa com seu kcal e a faixa do bloco — sem somar', async () => {
    renderTab(version('published', structuredDays()));
    const almoco = await mealSection('Almoço');
    const carbo = within(almoco).getByRole('region', { name: 'Carboidrato' });
    expect(within(carbo).getByText('Escolha 1')).toBeInTheDocument();
    expect(within(carbo).getByText('85 kcal')).toBeInTheDocument();
    expect(within(carbo).getByText('120 kcal')).toBeInTheDocument();
    expect(within(carbo).getByText('Faixa: 85–120 kcal')).toBeInTheDocument();
    expect(carbo.textContent).not.toContain('205');
  });

  it('alternativa com mais de um alimento fica junta, com um total só', async () => {
    renderTab(version('published', structuredDays()));
    const almoco = await mealSection('Almoço');
    const prot = within(almoco).getByRole('region', { name: 'Proteína' });
    const opcao1 = within(prot).getByRole('group', { name: 'Alternativa 1' });
    expect(within(opcao1).getByText('Opção 1')).toBeInTheDocument();
    expect(within(opcao1).getByText(/Frango/)).toBeInTheDocument();
    expect(within(opcao1).getByText(/Azeite/)).toBeInTheDocument();
    expect(within(opcao1).getByText('308 kcal')).toBeInTheDocument();
    expect(within(prot).getAllByRole('group')).toHaveLength(2);
  });

  it('itens fixos: "Consumir todos"; à vontade e fora do catálogo aparecem sem kcal e marcam "Total parcial"', async () => {
    renderTab(version('published', structuredDays()));
    const almoco = await mealSection('Almoço');
    const fixos = within(almoco).getByRole('region', { name: 'Itens fixos' });
    expect(within(fixos).getByText('Consumir todos')).toBeInTheDocument();
    expect(within(fixos).getByText('à vontade')).toBeInTheDocument();
    expect(within(fixos).getByText('À vontade')).toBeInTheDocument();
    expect(within(fixos).getByText('Sem cálculo')).toBeInTheDocument();
    expect(within(fixos).getByText('Total parcial: 0 kcal')).toBeInTheDocument();
    expect(within(almoco).getByText('393–441 kcal')).toBeInTheDocument();
    expect(within(almoco).getAllByText('Total parcial').length).toBeGreaterThan(0);
  });

  it('rascunho: nova alternativa (escolha + alimento) e novo bloco', async () => {
    const user = renderTab(version('draft', structuredDays()));
    const almoco = await mealSection('Almoço');
    const carbo = within(almoco).getByRole('region', { name: 'Carboidrato' });
    vi.mocked(api.createMealChoice).mockResolvedValue({ id: 'alt-nova' });
    await user.click(within(carbo).getByRole('button', { name: '+ Alternativa' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Nome livre/));
    await user.type(within(dialog).getByPlaceholderText('Ex.: Salada de folhas'), 'Cuscuz');
    await user.clear(within(dialog).getByLabelText('Quantidade'));
    await user.type(within(dialog).getByLabelText('Quantidade'), '120');
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }));
    await waitFor(() =>
      expect(api.addChoiceFood).toHaveBeenCalledWith(REF, 'm-almoco', 'g-carbo', 'alt-nova', expect.objectContaining({ customFoodName: 'Cuscuz', quantity: 120, unit: 'g' })),
    );
    expect(api.createMealChoice).toHaveBeenCalledWith(REF, 'm-almoco', 'g-carbo', {});

    await user.click(within(almoco).getByRole('button', { name: '+ Bloco "escolha 1"' }));
    await user.type(screen.getByLabelText('Nome do bloco'), 'Leguminosa');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.createMealGroup).toHaveBeenCalledWith(REF, 'm-almoco', { kind: 'alternatives', label: 'Leguminosa' }));
  });

  it('valida no formulário: faixa invertida não é enviada', async () => {
    const user = renderTab(version('draft', legacyDays()));
    const almoco = await mealSection('Almoço');
    await user.click(within(almoco).getByRole('button', { name: '+ Alimento' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Nome livre/));
    await user.type(within(dialog).getByPlaceholderText('Ex.: Salada de folhas'), 'Azeite');
    await user.clear(within(dialog).getByLabelText('Quantidade'));
    await user.type(within(dialog).getByLabelText('Quantidade'), '5');
    await user.type(within(dialog).getByLabelText('Quantidade máxima'), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }));
    expect(await within(dialog).findByText('A quantidade máxima não pode ser menor que a mínima.')).toBeInTheDocument();
    expect(api.addChoiceFood).not.toHaveBeenCalled();
  });
});

describe('Refeições: edição, exclusão e reordenação', () => {
  it('reordena, renomeia e remove refeição (com confirmação)', async () => {
    const user = renderTab(version('draft', legacyDays()));
    const cafe = await mealSection('Café da manhã');
    await user.click(within(cafe).getByRole('button', { name: 'Mover Café da manhã para baixo' }));
    await waitFor(() => expect(api.updateMeal).toHaveBeenCalledWith('c1', 'd1', 'v-draft', 'm-almoco', { order: 0 }));
    expect(api.updateMeal).toHaveBeenCalledWith('c1', 'd1', 'v-draft', 'm-cafe', { order: 1 });

    const name = within(cafe).getByLabelText('Nome da refeição');
    await user.clear(name);
    await user.type(name, 'Desjejum');
    await user.tab();
    await waitFor(() => expect(api.updateMeal).toHaveBeenCalledWith('c1', 'd1', 'v-draft', 'm-cafe', { name: 'Desjejum' }));

    await user.click(within(cafe).getByRole('button', { name: 'Remover refeição' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover refeição' }));
    await waitFor(() => expect(api.deleteMeal).toHaveBeenCalledWith('c1', 'd1', 'v-draft', 'm-cafe'));
  });

  it('nova refeição entra no dia selecionado; remover alimento', async () => {
    const user = renderTab(version('draft', structuredDays()));
    await screen.findByRole('tab', { name: 'Dia de treino' });
    await user.click(screen.getByRole('tab', { name: 'Dia de descanso' }));
    await user.type(screen.getByPlaceholderText('Ex.: Café da manhã'), 'Lanche');
    await user.click(screen.getByRole('button', { name: 'Adicionar refeição' }));
    await waitFor(() => expect(api.createMeal).toHaveBeenCalledWith('c1', 'd1', 'v-draft', { name: 'Lanche', dietDayId: 'day-descanso' }));

    const ceia = screen.getByRole('region', { name: 'Refeição Ceia' });
    await user.click(within(ceia).getByRole('button', { name: 'Remover Castanhas' }));
    await waitFor(() => expect(api.deleteMealFood).toHaveBeenCalledWith('c1', 'd1', 'v-draft', 'm-ceia-d', expect.any(String)));
  });
});

describe('Suplementação e orientações ao paciente', () => {
  it('publicada: mostra suplementos e orientações (separadas das observações internas)', async () => {
    renderTab(version('published', legacyDays(), { supplements, patientGuidelines: 'Beber 2,5 L de água por dia.', notes: 'Paciente com refluxo.' }));
    const supl = await screen.findByRole('region', { name: 'Suplementação' });
    expect(within(supl).getByText('Creatina')).toBeInTheDocument();
    expect(within(supl).getByText('3–5 g')).toBeInTheDocument();
    expect(within(supl).getByText('Antes do café da manhã')).toBeInTheDocument();
    expect(within(supl).getByText('1 cápsula')).toBeInTheDocument();
    const orient = screen.getByRole('region', { name: 'Orientações ao paciente' });
    expect(within(orient).getByText('Beber 2,5 L de água por dia.')).toBeInTheDocument();
    expect(within(orient).queryByText(/refluxo/)).not.toBeInTheDocument();
    expect(screen.getByText('Observações internas: Paciente com refluxo.')).toBeInTheDocument();
  });

  it('rascunho: adiciona, edita, reordena e remove suplemento; salva as orientações', async () => {
    const user = renderTab(version('draft', legacyDays(), { supplements }));
    const supl = await screen.findByRole('region', { name: 'Suplementação' });

    await user.click(within(supl).getByRole('button', { name: '+ Suplemento' }));
    let dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nome do suplemento'), 'Vitamina D');
    await user.type(within(dialog).getByLabelText('Quantidade'), '2000');
    await user.type(within(dialog).getByLabelText('Unidade'), 'UI');
    await user.type(within(dialog).getByLabelText('Quando tomar'), 'Almoço');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar suplemento' }));
    await waitFor(() =>
      expect(api.createDietSupplement).toHaveBeenCalledWith(REF, { name: 'Vitamina D', quantity: 2000, quantityMax: undefined, unitText: 'UI', timing: 'Almoço', notes: '' }),
    );

    await user.click(within(supl).getByRole('button', { name: 'Editar Creatina' }));
    dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Até (opcional)'));
    await user.type(within(dialog).getByLabelText('Até (opcional)'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar suplemento' }));
    expect(await within(dialog).findByText('A quantidade máxima não pode ser menor que a mínima.')).toBeInTheDocument();
    expect(api.updateDietSupplement).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await user.click(within(supl).getByRole('button', { name: 'Mover Ômega-3 para cima' }));
    await waitFor(() => expect(api.updateDietSupplement).toHaveBeenCalledWith(REF, 's-omega', { order: 0 }));

    await user.click(within(supl).getByRole('button', { name: 'Remover Creatina' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover suplemento' }));
    await waitFor(() => expect(api.deleteDietSupplement).toHaveBeenCalledWith(REF, 's-creatina'));

    const orient = screen.getByRole('region', { name: 'Orientações ao paciente' });
    await user.type(within(orient).getByLabelText('Orientações ao paciente'), 'Beber 2,5 L de água por dia.');
    await user.click(within(orient).getByRole('button', { name: 'Salvar orientações' }));
    await waitFor(() => expect(api.updateDietVersion).toHaveBeenCalledWith('c1', 'd1', 'v-draft', { patientGuidelines: 'Beber 2,5 L de água por dia.' }));
  });
});

describe('Publicação', () => {
  it('rascunho válido é publicado', async () => {
    const user = renderTab(version('draft', structuredDays()));
    await screen.findByRole('tab', { name: 'Dia de treino' });
    expect(screen.queryByRole('status', { name: 'Pendências para publicar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publicar versão' }));
    await waitFor(() => expect(api.publishDietVersion).toHaveBeenCalledWith('c1', 'd1', 'v-draft'));
  });

  it('estrutura inválida não é enviada: mostra as pendências', async () => {
    const days: DietDayNode[] = [
      day(
        'day-1',
        null,
        'other',
        [
          meal('m-almoco', 'Almoço', [group('g-carbo', 'alternatives', 'Carboidrato', [], range(0)), fixed('g-fixo', [item('Arroz', 100, 'g', 130)], range(130))], range(130)),
          meal('m-cafe', 'Café', [group('g-op', 'meal_options', null, [choice('op-1', 'Opção 1', [], range(0))], range(0))], range(0)),
        ],
        range(130),
      ),
    ];
    const user = renderTab(version('draft', days));
    const pending = await screen.findByRole('status', { name: 'Pendências para publicar' });
    expect(within(pending).getByText('Almoço: bloco "escolha 1" (Carboidrato) sem nenhuma alternativa.')).toBeInTheDocument();
    expect(within(pending).getByText('Café: Opção 1 sem alimentos.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publicar versão' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Corrija antes de publicar');
    expect(api.publishDietVersion).not.toHaveBeenCalled();
  });

  it('erro do backend (autoridade final) aparece para o profissional', async () => {
    vi.mocked(api.publishDietVersion).mockRejectedValue({ response: { data: { message: 'Corrija a estrutura antes de publicar: X.' } } });
    const user = renderTab(version('draft', legacyDays()));
    await mealSection('Almoço');
    await user.click(screen.getByRole('button', { name: 'Publicar versão' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Corrija a estrutura antes de publicar: X.');
  });
});
