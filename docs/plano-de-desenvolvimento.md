# Plano de desenvolvimento — Bocado de Nutrição

Detalhamento completo de cada fase (objetivo, dependências, riscos) está na auditoria técnica. Este arquivo registra o roadmap e o status atual.

| Fase | Nome | Status |
|---|---|---|
| 1 | Fundação | 🟡 Em andamento |
| 2 | Autenticação e usuários | ⬜ Não iniciada |
| 3 | Clientes | ⬜ Não iniciada |
| 4 | Avaliação física | ⬜ Não iniciada |
| 5 | Dieta | ⬜ Não iniciada |
| 6 | Treino | ⬜ Não iniciada |
| 7 | Aplicativo cliente | ⬜ Não iniciada |
| 8 | Evolução | ⬜ Não iniciada |
| 9 | Relatórios PDF | ⬜ Não iniciada |
| 10 | Bluetooth / Balança | ⬜ Não iniciada |
| 11 | Wearables | ⬜ Não iniciada (escopo em aberto) |
| 12 | IA | ⬜ Não iniciada |

## Fase 1 — Fundação (atual)

Escopo: monorepo com npm workspaces, esqueleto do backend NestJS (módulos vazios: `auth`, `users`, `professionals`, `clients`), pacote `shared` com tipos base, schema inicial do banco (`User`, `Professional`, `Client`) em Prisma, placeholders de `professional-web`, `mobile` e `reports-templates`.

Fora do escopo desta fase: lógica de autenticação/JWT, conexão real com PostgreSQL (depende do Docker ser instalado), scaffolding real de frontend/mobile, qualquer schema além do trio inicial de usuários.
