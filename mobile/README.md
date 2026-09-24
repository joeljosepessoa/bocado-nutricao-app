# App do cliente

Aplicativo React Native + Expo (TypeScript) para o cliente acompanhar dieta, treino e evolução prescritos pelo profissional. Implementado na Fase 7, sobre a base definida nas Fases 1–6.

## Rodando localmente

```bash
npm install
npm run start --workspace mobile
```

Para testar contra um backend local, use `EXPO_PUBLIC_API_URL=http://IP-DO-PC:3000 npx expo start` (tem precedência sobre tudo — nunca use `localhost`, um aparelho físico não alcança). Sem essa variável, o app usa `app.json` → `expo.extra.apiUrl`, que aponta para a API de produção (Railway) por padrão — é o valor embutido nos builds EAS (`eas.json` define `EXPO_PUBLIC_API_URL` por perfil, sempre a URL de produção).

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
- **Relatórios**: lista as avaliações liberadas (`/client/evolution`) como cartões e abre um relatório visual por avaliação (resumo, composição corporal, gráfico de evolução, medidas e fotos, quando liberadas) — nunca dobras técnicas, notas internas ou sinais vitais, porque o backend já não envia esses campos ao cliente.
- **Notificação local**: só é usada para avisar o fim do descanso do timer; não há push notification nem servidor de notificação envolvido.
