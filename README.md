# Bocado de Nutrição

Plataforma de acompanhamento nutricional e físico: painel do profissional, app do cliente e app do
profissional, sobre uma API NestJS com PostgreSQL.

## Estrutura

| Pasta | O que é |
|---|---|
| `backend/` | API (NestJS + Prisma) e jobs agendados |
| `professional-web/` | Painel do profissional e área admin (React + Vite) |
| `mobile/` | App do cliente (React Native + Expo) |
| `professional-mobile/` | App do profissional — conexão de balança (BLE simulado; nenhum driver de fabricante real) |
| `database/` | `schema.prisma`, migrations, scripts de backup/restauração |
| `shared/` | Tipos compartilhados (mínimo) |
| `reports-templates/` | Reservado; o template do PDF vive em `backend/src/reports/templates` |
| `docs/` | Documentação — comece por [`docs/OPERACAO.md`](docs/OPERACAO.md) |

## Começando

Instalação, banco, variáveis (`.env.example`), produção com Docker Compose, backup, e-mail,
Mercado Pago, apps e checklist de release estão em **[docs/OPERACAO.md](docs/OPERACAO.md)**.
Histórico e status por fase: [docs/plano-de-desenvolvimento.md](docs/plano-de-desenvolvimento.md).
