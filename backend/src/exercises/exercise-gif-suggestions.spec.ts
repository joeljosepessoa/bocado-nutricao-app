import { baseExerciseName, suggestGifCandidates } from './exercise-gif-suggestions';

const lib = [
  { id: '1', name: 'Cadeira Abdutora', section: 'ACADEMIA / MAQUINA' },
  { id: '2', name: 'Elevação Pélvica Sapo', section: 'FUNCIONAL' },
  { id: '3', name: 'Elevação Pélvica com Barra', section: 'ACADEMIA / BARRAS' },
  { id: '4', name: 'Elevação Pélvica com Halter', section: 'ACADEMIA / HALTERES' },
  { id: '5', name: 'Remada Curvada com Halteres', section: 'ACADEMIA / HALTERES' },
  { id: '6', name: 'Remada Curvada com Elástico', section: 'FUNCIONAL / SUPERBAND' },
];

describe('sugestões de GIF para exercício particular', () => {
  it('ignora o que está entre parênteses, acento e caixa', () => {
    expect(baseExerciseName('Cadeira abdutora (3 s de contração no pico)')).toBe('cadeira abdutora');
    expect(suggestGifCandidates('Cadeira abdutora (3 s de contração no pico)', lib).map((c) => c.id)).toEqual(['1']);
  });

  it('o equivalente conhecido vem primeiro, depois academia antes de funcional', () => {
    expect(suggestGifCandidates('Elevação pélvica', lib).map((c) => c.id)).toEqual(['3', '4', '2']);
  });

  it('plural e singular contam igual ("halter" acha "Halteres")', () => {
    expect(suggestGifCandidates('Remada curvada halter', lib).map((c) => c.id)[0]).toBe('5');
  });

  it('sem nada parecido, não sugere', () => {
    expect(suggestGifCandidates('Natação', lib)).toEqual([]);
  });
});
