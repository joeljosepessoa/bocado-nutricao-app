# Painel profissional

SPA React + TypeScript (Vite) para o profissional administrar clientes, avaliações físicas, dietas, treinos, evolução e relatórios. Implementado na Fase 9, consumindo o backend já existente das Fases 2–8 quase inteiramente sem alteração — só o dashboard agregado e o sistema de relatórios são endpoints novos.

## Rodando localmente

```bash
npm install
npm run dev --workspace professional-web
```

Configure a URL do backend via `VITE_API_URL` (padrão `http://localhost:3000`).

## Scripts

- `npm run dev` — inicia o Vite dev server
- `npm run typecheck` — `tsc -b --noEmit`
- `npm run lint` — oxlint
- `npm test` — testes de lógica (Vitest), sem dependência de renderização
- `npm run build` — build de produção

## Estrutura

- `src/api` — cliente HTTP (axios) e `endpoints.ts` com wrappers tipados para cada rota consumida.
- `src/auth` — `AuthContext`/`authReducer` (sessão) e o fluxo de login/refresh/logout do painel web.
- `src/evolution` — catálogo de métricas e conversão para pontos de gráfico (mesma filosofia da Fase 8 no mobile: nunca interpola dado faltante).
- `src/layout`, `src/router` — casca do app (sidebar/header) e rota protegida.
- `src/components` — componentes genéricos (tabela, modal, confirmação, abas, badge de status).
- `src/pages` — telas; `src/pages/tabs` — as abas do perfil do cliente (avaliação, evolução, dieta, treino, relatórios).

## Autenticação — diferente do mobile, de propósito

O painel web **não** guarda o refresh token em nenhum lugar acessível a JavaScript. O backend expõe rotas próprias para o navegador (`/auth/web/login`, `/auth/web/refresh`, `/auth/web/logout`) que devolvem o refresh token só como cookie `HttpOnly`; o access token fica em memória, como no mobile. O fluxo mobile (`/auth/login` etc., refresh token no corpo JSON) não foi alterado — são dois fluxos independentes sobre o mesmo `AuthService`/`RefreshTokenService`.

Toda chamada à API envia o cabeçalho `X-Bocado-Client: web`, exigido pelo backend nas rotas que leem o cookie de sessão (defesa complementar a `SameSite` + CORS restrito por origem contra CSRF).

## Decisões desta fase

- **Sem endpoint novo para 8 das 10 áreas do painel** — clientes, avaliação física, dietas, treinos e evolução já tinham backend completo desde as Fases 3–8; só dashboard e relatórios (PDF) são novos.
- **Recharts v2, não v3** — a v3 empacota Redux internamente e gerou conflito de versão de `react` dentro do monorepo; a v2 tem peer deps simples e cobre exatamente o que os gráficos de evolução precisam.
- **Vite `resolve.dedupe`/`alias`** para `react`/`react-dom` — necessário num monorepo com npm workspaces onde mais de um pacote pode acabar com sua própria cópia de React; sem isso, dois React na árvore quebram os hooks com "Invalid hook call".
