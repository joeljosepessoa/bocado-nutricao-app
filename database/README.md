# Banco de dados

`schema.prisma` contém apenas o modelo inicial da Fase 1: `User`, `Professional`, `Client`.

O schema completo (avaliações físicas, dietas, treinos, relatórios etc.) está documentado na auditoria técnica e entra por fases — ver `docs/plano-de-desenvolvimento.md`.

Nenhuma migration foi executada ainda: depende do PostgreSQL estar provisionado (Docker, conforme decidido).

Para rodar quando o banco estiver disponível:

```bash
npm run prisma:migrate --workspace backend
```

## Backup e restauração (Fase 20)

`scripts/backup.sh` e `scripts/restore.sh` fazem dump/restore completos via `pg_dump`/`pg_restore`. Não há agendamento automático — nenhum orquestrador de produção está provisionado ainda; aponte o cron/scheduled job do seu provedor de hosting para `backup.sh`, ou rode manualmente.

```bash
DATABASE_URL="postgresql://..." ./scripts/backup.sh ./backups
DATABASE_URL="postgresql://..." ./scripts/restore.sh ./backups/bocado-backup-XXXXXXXXTXXXXXXZ.dump
```
