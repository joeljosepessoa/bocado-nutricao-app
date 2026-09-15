# Banco de dados

`schema.prisma` contém apenas o modelo inicial da Fase 1: `User`, `Professional`, `Client`.

O schema completo (avaliações físicas, dietas, treinos, relatórios etc.) está documentado na auditoria técnica e entra por fases — ver `docs/plano-de-desenvolvimento.md`.

Nenhuma migration foi executada ainda: depende do PostgreSQL estar provisionado (Docker, conforme decidido).

Para rodar quando o banco estiver disponível:

```bash
npm run prisma:migrate --workspace backend
```
