# Banco de dados

`schema.prisma` é o modelo completo (usuários, clientes, avaliações, dietas, treinos, relatórios, mensagens, agenda, billing SaaS e comercial do cliente, auditorias). As migrations em `migrations/` são versionadas e sequenciais.

```bash
npm run prisma:migrate --workspace backend          # desenvolvimento (cria migration)
npm run prisma:migrate:deploy --workspace backend   # produção / CI (só aplica)
```

## Backup e restauração (Fase 20)

`scripts/backup.sh` e `scripts/restore.sh` fazem dump/restore completos via `pg_dump`/`pg_restore`. Não há agendamento automático — nenhum orquestrador de produção está provisionado ainda; aponte o cron/scheduled job do seu provedor de hosting para `backup.sh`, ou rode manualmente.

```bash
DATABASE_URL="postgresql://..." ./scripts/backup.sh ./backups
DATABASE_URL="postgresql://..." ./scripts/restore.sh ./backups/bocado-backup-XXXXXXXXTXXXXXXZ.dump
```
