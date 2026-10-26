import { entryFromKey } from './build-exercise-catalog-from-r2';

describe('catálogo de exercícios a partir das pastas do R2', () => {
  it('ACADEMIA: equipamento e grupo vêm das pastas; nome é o arquivo sem .gif', () => {
    expect(entryFromKey('exercises/ACADEMIA/KETTLEBELL/COSTAS/Remada Curvada com Kettlebell.gif', 1234, 'abc')).toEqual({
      nome: 'Remada Curvada com Kettlebell',
      grupos_musculares: ['Costas'],
      equipamento: 'Kettlebell',
      secao: 'ACADEMIA / KETTLEBELL / COSTAS',
      tipo: 'strength',
      gif_key: 'exercises/ACADEMIA/KETTLEBELL/COSTAS/Remada Curvada com Kettlebell.gif',
      tamanho_bytes: 1234,
      etag: 'abc',
    });
  });

  it('pasta com espaço duplo e grafia diferente é normalizada (cabo/polia, antebraço)', () => {
    expect(entryFromKey('exercises/ACADEMIA/EXERCÍCIOS NO CABO  OU POLIA/ANDEBRAÇO/Rosca de Punho na Polia.gif')).toMatchObject({
      equipamento: 'Cabo / polia',
      grupos_musculares: ['Antebraço'],
    });
  });

  it('perna que é de glúteo ganha Glúteos também', () => {
    expect(entryFromKey('exercises/ACADEMIA/EXERCÍCIOS COM BARRAS/PERNA/Elevação Pélvica com Barra.gif')!.grupos_musculares).toEqual(['Pernas', 'Glúteos']);
  });

  it('cardio da academia e categorias do funcional', () => {
    expect(entryFromKey('exercises/ACADEMIA/CARDIO/Corrida na Esteira.gif')).toMatchObject({ grupos_musculares: ['Cardio'], tipo: 'cardio', equipamento: 'Aparelho de cardio' });
    expect(entryFromKey('exercises/FUNCIONAL/MOBILIDADE/QUADRIL/90-90 de Quadril (Iniciante).gif')).toMatchObject({ grupos_musculares: ['Mobilidade'], tipo: 'mobility' });
    expect(entryFromKey('exercises/FUNCIONAL/TRX/Remada no TRX.gif')).toMatchObject({ equipamento: 'TRX', grupos_musculares: ['Costas'] });
    expect(entryFromKey('exercises/FUNCIONAL/LIBERAÇÃO MIOFASCIAL/ROLINHO/Rolo na Panturrilha.gif')).toMatchObject({ equipamento: 'Rolo', grupos_musculares: ['Liberação miofascial'] });
  });

  it('GIF solto no FUNCIONAL: grupo pelas palavras do nome; sem palpite fica sem grupo', () => {
    expect(entryFromKey('exercises/FUNCIONAL/Coice Unilateral Ajoelhado.gif')!.grupos_musculares).toEqual(['Glúteos']);
    expect(entryFromKey('exercises/FUNCIONAL/Caminhada no Lugar.gif')!.grupos_musculares).toEqual(['Cardio']);
    expect(entryFromKey('exercises/FUNCIONAL/4 Cruzamentos Atrás e 4 Cruzamentos à Frente em Pé.gif')!.grupos_musculares).toEqual([]);
  });

  it('"Tríceps coice" é tríceps, não glúteo; arquivo que não é GIF é ignorado', () => {
    expect(entryFromKey('exercises/FUNCIONAL/Tríceps Coice no Banco.gif')!.grupos_musculares).toEqual(['Tríceps']);
    expect(entryFromKey('exercises/FUNCIONAL/leia-me.txt')).toBeNull();
  });
});
