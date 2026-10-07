# Proposta de schema — catálogo oficial TACO 4ª edição

**Status: aprovada (2026-10-07).** A migration é
`database/migrations/20261007180000_taco_official_catalog`. Foi aplicada SÓ
no banco local de desenvolvimento, e produção ainda não tem essa migration.

Duas mudanças em relação ao rascunho:
- Os macros e o `source_data` são regravados por SQL, a partir do texto do
  número, porque o Prisma grava double/JSON com 16 algarismos.
- A TACO tem 4 carboidratos levemente negativos (cálculo por diferença: nº
  288, 322, 337 e 400). Eles foram preservados como estão.

## Por que o schema atual não comporta

`foods.kcal_per_100`, `protein_g_per_100`, `carb_g_per_100` e `fat_g_per_100`
são `NOT NULL`. 49 alimentos da TACO trazem Tr, NA ou * em um desses campos
(ex.: leite de vaca integral e desnatado inteiros com `*`). Gravar 0 contraria
a fonte, então esses campos precisam aceitar "sem número" e o marcador original
precisa ficar guardado.

## 1. `foods` (alteração)

```prisma
model Food {
  // ...campos atuais...
  kcalPer100      Float?  @map("kcal_per_100")       // era Float
  proteinGPer100  Float?  @map("protein_g_per_100")  // era Float
  carbGPer100     Float?  @map("carb_g_per_100")     // era Float
  fatGPer100      Float?  @map("fat_g_per_100")      // era Float
  sodiumMgPer100  Float?  @map("sodium_mg_per_100")
  sourceKey       String? @unique @map("source_key")  // "taco4:410" — chave da idempotência
  sourceEdition   String? @map("source_edition")      // "TACO 4ª edição"
  sourceNumber    Int?    @map("source_number")       // nº do alimento na TACO
  sourceHash      String? @map("source_hash")         // hash do conteúdo da fonte
  foodGroup       String? @map("food_group")          // grupo da TACO
  preparation     String? @map("preparation")         // "grelhado", "cru"...
  sourceData      Json?   @map("source_data")         // todas as colunas com {valor, situacao, bruto},
                                                      // ácidos graxos, aminoácidos, porção e linha de origem
  @@index([foodGroup])
}
```

Regra no banco: `CHECK (source_key IS NOT NULL OR <os 4 macros NOT NULL>)`.
Só o catálogo oficial pode ter macro sem número. O alimento que o profissional
cadastra continua exigindo os quatro valores, como hoje.

- `name` guarda o nome exato da planilha.
- `source = 'taco4'`.
- O alimento entra aprovado (`approved_at` preenchido), como já acontece com os
  exercícios oficiais.

## 2. Mapeamento da lista do Bocado (tabela separada)

```prisma
enum FoodListMappingStatus { encontrado precisa_revisao nao_encontrado fora_da_taco }

model FoodListMapping {
  id            String                @id @default(uuid())
  listGroup     String                @map("list_group")     // "1. Proteínas"
  listItemName  String                @map("list_item_name") // "Peito de frango"
  status        FoodListMappingStatus
  foodId        String?               @map("food_id")        // só com decisão explícita (ou candidato único)
  candidateKeys String[]              @map("candidate_keys") // ["taco4:406", ...]
  notes         String?
  decidedAt     DateTime?             @map("decided_at")
  food          Food?                 @relation(fields: [foodId], references: [id], onDelete: Restrict)
  @@unique([listGroup, listItemName])
  @@map("food_list_mappings")
}

model FoodAlias {
  id        String  @id @default(uuid())
  alias     String  @unique              // forma normalizada ("arroz branco")
  foodId    String? @map("food_id")       // preenchido só quando liga sozinho
  mappingId String? @map("mapping_id")
  autoLink  Boolean @map("auto_link")
  @@map("food_aliases")
}
```

- Sem decisão explícita, o item fica `precisa_revisao` e `foodId` fica nulo.
- `fora_da_taco` nunca aponta para um alimento da TACO.

## 3. Código que muda junto com a migration

- **`foods/nutrition-calculation.service.ts`.** Hoje multiplica os 4 macros
  direto. Com macro nulo, o item precisa sair do total com um aviso ("valor não
  numérico na TACO: Tr/NA/*"), sem virar 0.
- **`foods/foods.service.ts`, `professional-web/src/types/api.ts`,
  `FoodPickerModal.tsx`, `AdminModerationPage.tsx`.** Os tipos passam a
  `number | null`, e a tela mostra o marcador.
- **Resumo da dieta** (`diet-client-summary`): o total ignora o item sem número
  e sinaliza.
- **Os DTOs de criação e edição continuam exigindo os 4 macros** para alimento
  do profissional.

## 4. Importação (já implementada e testada localmente)

- Arquivos: `taco-catalog.ts` (registros), `taco-catalog-import.ts` (regras) e
  `taco-catalog-stores.ts` (memória e SQL).
- A chave é `source_key`. Na reimportação:
  - **ignorado** quando o hash é igual e o alimento já está aprovado;
  - **atualizado** quando o hash muda ou falta aprovação;
  - **duplicado** em qualquer ambiguidade, sem escrever nada.
- O importador nunca apaga nada.
- Os alimentos antigos (`source='taco'`, conta do sistema, sem chave) são
  adotados pelo **nome exato**: mantêm o id, ganham a chave e os valores
  oficiais.
- Dois alimentos antigos sem nome exato na TACO foram ligados por decisão
  explícita (2026-10-07, `EXPLICIT_LEGACY_LINKS`). Cada um mantém o id e
  passa a usar o nome oficial:
  - "Pão, de forma, trigo, integral" → nº 52, "Pão, trigo, forma, integral";
  - "Pão, francês" → nº 53, "Pão, trigo, francês".

## 5. Ordem sugerida (cada passo com autorização)

1. Aprovar esta proposta.
2. Criar a migration e ajustar o código da seção 3.
3. Rodar o e2e local.
4. Fazer backup de produção, ensaiar e aplicar a migration (manual, antes do
   push).
5. Rodar o importador em produção. Ele adota os 33 antigos (31 pelo nome
   exato e 2 por decisão) e insere 564.
6. Importar o mapeamento dos 197 com as escolhas da página de conferência.
