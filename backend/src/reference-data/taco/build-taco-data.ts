import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildAliases, mapBocadoList, MappingRow } from './taco-mapping';
import { parseTaco } from './taco-parser';

/**
 * Gera os arquivos LOCAIS da TACO a partir da planilha oficial (nada vai para
 * o banco): a representação da tabela, o mapeamento da lista do Bocado e os
 * apelidos de busca. Rodar de novo sobrescreve os mesmos arquivos.
 *
 *   npx ts-node src/reference-data/taco/build-taco-data.ts [caminho.xlsx]
 */
const SOURCE = process.argv[2] ?? join(__dirname, 'source', 'Taco-4a-Edicao.xlsx');
const OUT = join(__dirname, 'data');

function markdownTable(rows: MappingRow[]): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|');
  const lines = [
    '# Mapeamento: lista do Bocado × TACO 4ª edição',
    '',
    'Gerado por `build-taco-data.ts` a partir da planilha oficial. Nenhum valor nutricional é atribuído aqui.',
    '',
    '| alimento_bocado | grupo | candidato_taco | status | observação |',
    '|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const candidates = r.candidato_taco
      ? `${r.candidatos[0].numero} — ${r.candidato_taco}`
      : r.candidatos.map((c) => `${c.numero} — ${c.nome.trim()}`).join('<br>');
    lines.push(`| ${esc(r.alimento_bocado)} | ${esc(r.grupo)} | ${esc(candidates || '—')} | ${r.status} | ${esc(r.observacao)} |`);
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const dataset = parseTaco(SOURCE);
  const rows = mapBocadoList(dataset.alimentos);
  const aliases = buildAliases(rows, dataset.alimentos);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'taco-4a-edicao.json'), `${JSON.stringify(dataset, null, 1)}\n`);
  writeFileSync(join(OUT, 'taco-mapeamento-bocado.json'), `${JSON.stringify(rows, null, 1)}\n`);
  writeFileSync(join(OUT, 'taco-mapeamento-bocado.md'), markdownTable(rows));
  writeFileSync(join(OUT, 'taco-aliases.json'), `${JSON.stringify(aliases, null, 1)}\n`);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  console.log(
    `TACO: ${dataset.alimentos.length} alimentos. Lista do Bocado: ${rows.length} itens — encontrado ${count('encontrado')}, ` +
      `precisa_revisao ${count('precisa_revisao')}, nao_encontrado ${count('nao_encontrado')}, fora_da_taco ${count('fora_da_taco')}. ` +
      `Apelidos: ${aliases.length} (${aliases.filter((a) => a.ligar_automaticamente).length} ligam sozinhos).`,
  );
}

main();
