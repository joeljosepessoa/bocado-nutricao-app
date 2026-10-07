import { join } from 'path';
import { parseTaco } from './taco-parser';

/** Retrato da planilha da TACO (somente leitura): abas, colunas, grupos, situações e inconsistências. */
function main() {
  const dataset = parseTaco(process.argv[2] ?? join(__dirname, 'source', 'Taco-4a-Edicao.xlsx'));
  console.log(JSON.stringify(dataset.arquivo));
  for (const aba of dataset.abas) {
    console.log(`${aba.nome}: ${aba.alimentos} alimentos, ${aba.colunas.length} colunas de valores -> ${aba.colunas.map((c) => `${c.rotulo}${c.unidade ? ` (${c.unidade})` : ''}`).join('; ')}`);
  }
  console.log('grupos:', dataset.grupos.map((g) => `${g.nome} (${g.alimentos})`).join(' | '));
  const situations: Record<string, number> = {};
  for (const food of dataset.alimentos) for (const value of Object.values(food.nutrientes)) situations[value.situacao] = (situations[value.situacao] ?? 0) + 1;
  console.log('situações dos valores (aba principal):', JSON.stringify(situations));
  const macros = ['energia_kcal', 'proteina', 'carboidrato', 'lipideos', 'fibra_alimentar'];
  for (const key of macros) {
    const counts: Record<string, number> = {};
    for (const food of dataset.alimentos) counts[food.nutrientes[key].situacao] = (counts[food.nutrientes[key].situacao] ?? 0) + 1;
    console.log(`  ${key}:`, JSON.stringify(counts));
  }
  console.log('com preparação identificada:', dataset.alimentos.filter((a) => a.preparacao).length, '/', dataset.alimentos.length);
  console.log(`inconsistências (${dataset.inconsistencias.length}):`);
  for (const item of dataset.inconsistencias) console.log(' -', item);
  for (const n of process.argv.slice(3).map(Number)) {
    const food = dataset.alimentos.find((a) => a.numero === n);
    console.log(JSON.stringify(food, null, 1));
  }
}

main();
