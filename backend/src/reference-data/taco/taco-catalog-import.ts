import { TacoCatalogRecord } from './taco-catalog';

/**
 * Importação IDEMPOTENTE do catálogo oficial da TACO. A chave estável é
 * `source_key` ("taco4:<número>"): rodar de novo não cria nada, só atualiza um
 * registro cujo conteúdo da fonte mudou (hash). Nunca apaga nada.
 *
 * Os alimentos globais antigos (source "taco", criados pela conta do sistema,
 * sem chave) são ADOTADOS quando o nome bate exatamente com um registro da
 * TACO: ganham a chave e os valores oficiais e mantêm o id, então dietas que
 * já os usam continuam ligadas. Qualquer ambiguidade vai para "duplicados" e
 * não é tocada.
 *
 * O acesso ao banco fica atrás de `TacoCatalogStore`: o schema atual ainda não
 * tem as colunas novas (ver PROPOSTA-SCHEMA.md), então os testes usam um store
 * em memória e um banco Postgres descartável com a estrutura proposta.
 */

/** `foods.source` dos alimentos globais do importador antigo (foods.json). */
export const LEGACY_TACO_SOURCE = 'taco';

/**
 * Alimentos antigos cujo nome NÃO bate exatamente com a TACO, ligados por
 * decisão explícita da nutricionista (2026-10-07): nome antigo → nº na TACO.
 * Ao ser adotado, o registro passa a ter o nome oficial da planilha.
 */
export const EXPLICIT_LEGACY_LINKS: Readonly<Record<string, number>> = {
  'Pão, de forma, trigo, integral': 52, // Pão, trigo, forma, integral
  'Pão, francês': 53, // Pão, trigo, francês
};

export interface StoredCatalogFood {
  id: string;
  name: string;
  source: string;
  sourceKey: string | null;
  contentHash: string | null;
  approvedAt: Date | null;
  /** Criado pela conta técnica do catálogo (nunca adota alimento de profissional). */
  createdBySystem: boolean;
}

export interface TacoCatalogStore {
  /** Alimentos com alguma das chaves + TODOS os antigos do sistema (source "taco", sem chave). */
  findExisting(sourceKeys: string[]): Promise<StoredCatalogFood[]>;
  insert(record: TacoCatalogRecord, approvedAt: Date): Promise<void>;
  /** Grava a fonte no registro. `approvedAt` só é passado quando ainda não havia aprovação. */
  update(id: string, record: TacoCatalogRecord, approvedAt: Date | null): Promise<void>;
}

export type UpdateReason =
  | 'conteudo_da_fonte_mudou'
  | 'adotado_do_catalogo_antigo'
  | 'adotado_por_decisao_explicita'
  | 'aprovacao_pendente';

export interface TacoImportReport {
  encontrados: number;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  duplicados: number;
  detalhes: {
    atualizados: Array<{ chave: string; nome: string; motivo: UpdateReason }>;
    duplicados: Array<{ chave: string; nome: string; motivo: string }>;
    /** Alimentos antigos do sistema que não batem com nenhum nome da TACO: ficam como estão. */
    antigosSemCorrespondencia: string[];
  };
}

export async function importTacoCatalog(
  store: TacoCatalogStore,
  records: TacoCatalogRecord[],
  now: Date = new Date(),
  explicitLinks: Readonly<Record<string, number>> = EXPLICIT_LEGACY_LINKS,
): Promise<TacoImportReport> {
  const report: TacoImportReport = {
    encontrados: records.length,
    inseridos: 0,
    atualizados: 0,
    ignorados: 0,
    duplicados: 0,
    detalhes: { atualizados: [], duplicados: [], antigosSemCorrespondencia: [] },
  };
  const duplicate = (r: TacoCatalogRecord, motivo: string) => {
    report.duplicados += 1;
    report.detalhes.duplicados.push({ chave: r.sourceKey, nome: r.name, motivo });
  };
  const updated = (r: TacoCatalogRecord, motivo: UpdateReason) => {
    report.atualizados += 1;
    report.detalhes.atualizados.push({ chave: r.sourceKey, nome: r.name, motivo });
  };

  // Chave repetida na própria fonte: só o primeiro registro segue.
  const seen = new Set<string>();
  const unique = records.filter((r) => {
    if (!seen.has(r.sourceKey)) return seen.add(r.sourceKey), true;
    duplicate(r, 'chave repetida na fonte');
    return false;
  });
  const recordsPerName = new Map<string, number>();
  for (const r of unique) recordsPerName.set(r.name, (recordsPerName.get(r.name) ?? 0) + 1);

  const existing = await store.findExisting(unique.map((r) => r.sourceKey));
  const byKey = new Map<string, StoredCatalogFood[]>();
  const legacyByName = new Map<string, StoredCatalogFood[]>();
  for (const food of existing) {
    if (food.sourceKey) byKey.set(food.sourceKey, [...(byKey.get(food.sourceKey) ?? []), food]);
    else if (food.source === LEGACY_TACO_SOURCE && food.createdBySystem) legacyByName.set(food.name, [...(legacyByName.get(food.name) ?? []), food]);
  }

  const adopted = new Set<string>();
  for (const record of unique) {
    const linked = byKey.get(record.sourceKey) ?? [];
    if (linked.length > 1) {
      duplicate(record, `${linked.length} alimentos no banco com a mesma chave`);
      continue;
    }
    if (linked.length === 1) {
      const food = linked[0];
      const changed = food.contentHash !== record.contentHash;
      if (!changed && food.approvedAt) {
        report.ignorados += 1;
        continue;
      }
      await store.update(food.id, record, food.approvedAt ? null : now);
      updated(record, changed ? 'conteudo_da_fonte_mudou' : 'aprovacao_pendente');
      continue;
    }

    const byExactName = legacyByName.get(record.name) ?? [];
    const byDecision = Object.entries(explicitLinks)
      .filter(([oldName, numero]) => numero === record.sourceNumber && oldName !== record.name)
      .flatMap(([oldName]) => legacyByName.get(oldName) ?? []);
    const legacy = [...byExactName, ...byDecision];
    if (legacy.length > 1 || (byExactName.length === 1 && (recordsPerName.get(record.name) ?? 0) > 1)) {
      duplicate(record, legacy.length > 1 ? `${legacy.length} alimentos antigos com o mesmo nome` : 'nome repetido na fonte com alimento antigo');
      legacy.forEach((f) => adopted.add(f.id)); // ambíguo: não é tocado nem listado como sem correspondência
      continue;
    }
    if (legacy.length === 1) {
      await store.update(legacy[0].id, record, legacy[0].approvedAt ? null : now);
      adopted.add(legacy[0].id);
      updated(record, byDecision.length ? 'adotado_por_decisao_explicita' : 'adotado_do_catalogo_antigo');
      continue;
    }

    await store.insert(record, now);
    report.inseridos += 1;
  }

  report.detalhes.antigosSemCorrespondencia = existing
    .filter((f) => !f.sourceKey && f.source === LEGACY_TACO_SOURCE && f.createdBySystem && !adopted.has(f.id))
    .map((f) => f.name);
  return report;
}
