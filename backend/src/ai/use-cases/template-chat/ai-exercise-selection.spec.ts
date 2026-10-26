import { AI_CATALOG_LIMIT, selectCatalogForRequest, type AiCatalogItem } from './ai-exercise-selection';

const item = (id: string, name: string, groups: string[], equipment: string | null, hasGif = true): AiCatalogItem => ({ id, name, muscleGroups: groups, equipment, hasGif });

const catalog: AiCatalogItem[] = [
  item('1', 'Supino Reto com Barra', ['Peito'], 'Barra'),
  item('2', 'Supino com Halteres', ['Peito'], 'Halteres'),
  item('3', 'Remada Curvada com Barra', ['Costas'], 'Barra'),
  item('4', 'Agachamento Livre', ['Pernas'], 'Barra'),
  item('5', 'Leg Press 45 Graus', ['Pernas'], 'Máquina'),
  item('6', 'Prancha Frontal', ['Abdômen'], null),
  item('7', 'Crucifixo Sem GIF', ['Peito'], 'Halteres', false),
  item('8', 'Corrida na Esteira', ['Cardio'], 'Aparelho de cardio'),
];

describe('parte da biblioteca que vai para a IA', () => {
  it('só exercícios com GIF, dos grupos citados', () => {
    const ids = selectCatalogForRequest(catalog, 'treino de peito', new Set()).map((e) => e.id);
    expect(ids.sort()).toEqual(['1', '2']);
  });

  it('equipamento citado filtra; exercício já no treino sempre vai, mesmo sem GIF', () => {
    const ids = selectCatalogForRequest(catalog, 'peito só com halteres', new Set(['7'])).map((e) => e.id);
    expect(ids.sort()).toEqual(['2', '7']);
  });

  it('pedido genérico usa os grupos de musculação; nome citado entra', () => {
    const ids = selectCatalogForRequest(catalog, 'monte um treino com leg press', new Set()).map((e) => e.id);
    expect(ids).toContain('5');
    expect(ids).toContain('1');
    expect(ids).not.toContain('8');
  });

  it('nunca passa do limite', () => {
    const big = Array.from({ length: 3000 }, (_, i) => item(String(i), `Exercício ${i}`, ['Peito'], 'Halteres'));
    expect(selectCatalogForRequest(big, 'peito', new Set()).length).toBeLessThanOrEqual(AI_CATALOG_LIMIT);
  });
});
