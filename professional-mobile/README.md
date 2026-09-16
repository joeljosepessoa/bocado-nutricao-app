# Painel profissional — mobile (Bluetooth)

App React Native (Expo) para o profissional conectar a balança de bioimpedância via Bluetooth Low Energy durante a avaliação física. Implementado na Fase 10, decisão §01 do desenho: o app do cliente (`mobile/`, Fase 7) é só do cliente, então o BLE — que exige acesso nativo, indisponível em `professional-web` (browser) — ganhou este pacote próprio, seguindo a mesma lógica que levou a `professional-web/` na Fase 9.

## Rodando localmente

```bash
npm install
npm run start --workspace professional-mobile
```

Configure a URL do backend via `extra.apiUrl` em `app.json` (padrão `http://localhost:3000`).

## Scripts

- `npm run start` — inicia o Expo (Metro)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — eslint
- `npm test` — testes de lógica (Jest), sem dependência de renderização nem de hardware BLE

## Estrutura

- `src/api`, `src/auth` — reaproveitam **sem nenhuma mudança** o mecanismo mobile já existente (`/auth/login`, `/auth/refresh`, `/auth/logout`, refresh token em `expo-secure-store`, access token em memória). Único acréscimo: login recusa localmente uma conta que não seja `role: 'professional'`.
- `src/ble` — o pipeline BLE do desenho da Fase 10: `types.ts` (contratos `ScaleDriver`/`BleTransport`/`NormalizedScaleReading`), `registry.ts` (`ScaleDriverRegistry`), `stateMachine.ts` (máquina de estados da tela de conexão), `idempotency.ts` (chave sha256 via `expo-crypto`), `mockDriver.ts`/`mockTransport.ts`/`simulateReading.ts` (a única implementação existente — simulada, ver abaixo).
- `src/offline` — `ScaleReadingQueue`, mesmo padrão de `ExecutionLogQueue` do app do cliente: uma confirmação é salva localmente antes de tentar a rede.
- `src/screens/ScaleConnectScreen.tsx` — a tela única do fluxo (procurar → conectar → aguardar leitura → revisar → confirmar/descartar), dirigida pela máquina de estados.
- `src/screens/ClientsListScreen.tsx`, `EvaluationPickerScreen.tsx` — só o suficiente do backend já existente (Fases 3/4) para chegar a uma avaliação e conectar a balança; não reimplementa o painel completo, que já existe em `professional-web`.

## Por que não há nenhum driver de fabricante real

Nenhum protocolo, UUID, SDK ou payload de balança real foi fornecido — regra fundamental do desenho da Fase 10. `MockScaleDriver` existe só para provar o pipeline inteiro (detecção → conexão → decodificação → validação → confirmação) ponta a ponta em teste e nesta tela, com um `MockBleTransport` que simula scan/conexão/leitura sem hardware nenhum. Nenhuma biblioteca BLE nativa foi instalada: a camada de transporte real é uma decisão que depende do modelo de balança que for usado (ver `ScaleDriverRegistry` — pronta para registrar um driver real assim que o protocolo for conhecido).

## Decisões desta fase

- **Nada chega ao backend antes de "Confirmar"** — scan, conexão, leitura e revisão são só estado local do app (`ScaleFlowState`); só `submitReading('confirmed' | 'discarded')` fala com a API.
- **Confirmar e descartar usam o mesmo endpoint** (`POST .../scale-readings`), diferenciados por `status` — evita um endpoint extra só para descarte, mantendo um registro auditável mesmo de leituras rejeitadas.
- **Idempotência pela leitura, não pelo envio** — a chave é derivada do payload bruto + timestamp da balança, então reenviar (retry de rede ou fila offline reaberta) nunca duplica no backend.
