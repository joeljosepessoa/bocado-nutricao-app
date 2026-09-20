# App do cliente

Aplicativo React Native + Expo (TypeScript) para o cliente acompanhar dieta, treino e evolução prescritos pelo profissional. Implementado na Fase 7, sobre a base definida nas Fases 1–6.

## Rodando localmente

```bash
npm install
npm run start --workspace mobile
```

Configure a URL do backend por `EXPO_PUBLIC_API_URL=http://IP-DO-PC:3000 npx expo start` (tem precedência) ou em `app.json` → `expo.extra.apiUrl` (padrão `http://localhost:3000`, que um aparelho físico NÃO alcança).

## Scripts

- `npm run start` — inicia o Metro/Expo dev server
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint
- `npm test` — testes de lógica (Jest), sem dependência de renderização nativa

## Estrutura

- `src/api` — cliente HTTP (axios) com interceptor de access token e renovação automática via refresh token; `endpoints.ts` mapeia as rotas `/client/*` do backend.
- `src/auth` — `AuthContext` (sessão), `authReducer` (máquina de estados: loading → unauthenticated → mustChangePassword → mustAcceptPrivacy → authenticated) e `tokenStorage` (refresh token no SecureStore; access token só em memória).
- `src/timer` — matemática do timer de descanso, baseada em timestamp (não em contagem por tick), para sobreviver ao app em segundo plano.
- `src/offline` — fila de registros de execução de treino pendentes de envio (persistida via AsyncStorage), reenviada oportunisticamente quando a sessão está autenticada.
- `src/screens`, `src/navigation` — telas e navegação (stack raiz + abas principais + modal de execução de treino).

## Decisões desta fase

- **Ordem do primeiro acesso**: quando o cliente tem senha temporária pendente **e** ainda não aceitou os termos de privacidade, a troca de senha é exigida primeiro, depois o aceite de privacidade — ver `authReducer.ts`.
- **Execução de treino é independente da prescrição**: registrar uma execução nunca altera a versão publicada do treino (endpoint e tela distintos).
- **Relatórios**: tela e endpoint são um stub proposital — a entidade `Report` fica fora da Fase 7.
- **Notificação local**: só é usada para avisar o fim do descanso do timer; não há push notification nem servidor de notificação envolvido.
