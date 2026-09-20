# Operação — Bocado de Nutrição

Guia mínimo para instalar, configurar e publicar o sistema. Variáveis: sempre
a lista completa e comentada em [`.env.example`](../.env.example).

## 1. Visão geral

| Peça | Tecnologia | Pasta |
|---|---|---|
| API | NestJS + Prisma + PostgreSQL | `backend/` |
| Painel do profissional | React + Vite | `professional-web/` |
| App do cliente | React Native + Expo SDK 57 | `mobile/` |
| App do profissional | React Native + Expo SDK 57 (BLE simulado) | `professional-mobile/` |
| Banco | schema Prisma + migrations | `database/` |

A API roda também os jobs agendados (`@nestjs/schedule`, no mesmo processo): lembrete de
consulta (10 min), ciclo do billing SaaS, expiração de links de pagamento e reconciliação de
assinaturas (1 h). **Rode uma única instância** da API, ou aceite que os jobs rodem em
todas (são idempotentes, mas duplicam trabalho).

## 2. Requisitos

Node 20+ (a imagem Docker usa 20), npm 10+, PostgreSQL 16, e Chromium (baixado pelo
`puppeteer`) para gerar PDFs.

## 3. Desenvolvimento

```bash
npm ci                                   # raiz do monorepo
cp .env.example backend/.env             # ajuste DATABASE_URL e JWT_ACCESS_SECRET
npm run prisma:generate --workspace backend
npm run prisma:migrate --workspace backend      # cria/atualiza o banco de dev
npm run reference-data:import --workspace backend   # catálogo de alimentos e exercícios (idempotente)
npm run start:dev --workspace backend           # API em :3000 (GET /health)
npm run dev --workspace professional-web        # painel em :5173
npm run start --workspace mobile                # Expo (app do cliente)
```

Primeiro administrador (não há endpoint público para isso):

```bash
ADMIN_BOOTSTRAP_EMAIL=... ADMIN_BOOTSTRAP_PASSWORD=... npm run admin:bootstrap --workspace backend
```

Testes: `npm test --workspace backend` (unitários), `npm run test:e2e --workspace backend`
(exige PostgreSQL; **grava no banco apontado por `DATABASE_URL`** — use um banco de teste),
`npx vitest run` em `professional-web`, `npx jest` em `mobile` e `professional-mobile`.

## 4. Banco e migrations

Em qualquer ambiente novo ou após atualizar o código: `npm run prisma:migrate:deploy --workspace backend`
(aplica as migrations versionadas em `database/migrations`; nunca use `prisma:migrate`/`dev` em produção).
O compose faz isso no serviço `migrate` antes de subir a API.

## 5. Produção com Docker Compose

```bash
cp .env.example .env    # na RAIZ; preencha pelo menos POSTGRES_PASSWORD, JWT_ACCESS_SECRET, CORS_ORIGIN
docker compose up -d --build
docker compose exec api node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.text()).then(console.log)"
```

- Com `NODE_ENV=production` a API **recusa subir** se `JWT_ACCESS_SECRET` for fraco/de exemplo,
  `CORS_ORIGIN` apontar para localhost, `DATABASE_URL` faltar ou `PAYMENT_GATEWAY_PROVIDER=mercadopago`
  estiver sem `MERCADOPAGO_WEBHOOK_SECRET`. Ela também loga **avisos** para tudo que ainda está
  simulado (cobrança mock, e-mail console, IA mock, storage local, sem Sentry, sem `TRUST_PROXY`).
- Coloque a API atrás de HTTPS (proxy reverso/load balancer) e defina `TRUST_PROXY` (ex.: `1`).
  Se painel e API estiverem em sites diferentes, `AUTH_COOKIE_SAME_SITE=none` (exige HTTPS).
- Build do painel: `VITE_API_URL=https://api.seudominio npm run build --workspace professional-web`
  (gera `professional-web/dist`, estático).
- A imagem tem `HEALTHCHECK` em `/health` (200 só com o banco acessível). O Compose não foi
  exercitado em uma máquina com Docker neste ambiente de desenvolvimento — valide o primeiro
  `docker compose up` antes de depender dele.

## 6. Armazenamento

`STORAGE_PROVIDER=local` grava em `STORAGE_LOCAL_DIR` (o compose monta o volume `bocado-storage`
em `/data/storage`). **Em produção o storage local só serve com volume persistente e com backup**;
em ambiente efêmero (PaaS sem disco) use `STORAGE_PROVIDER=s3` (S3, R2, B2, MinIO) com `S3_*`.
O adapter S3 tem testes unitários, mas **ainda não foi validado contra um bucket real**. Guarda:
fotos de avaliação, PDFs de relatório e os GIFs do piloto (`exercise-media/`).

## 7. Backup e restauração

`database/scripts/backup.sh` e `restore.sh` (`pg_dump`/`pg_restore`), sem agendamento automático:
agende `backup.sh` no seu provedor (diário) e **copie o dump e o volume de storage para fora do
servidor**. Teste uma restauração antes de ir ao ar.

## 8. E-mail

Pronto para qualquer provedor com SMTP; falta só a **conta e as credenciais**. Sem isso
(`EMAIL_PROVIDER=console`, o padrão) nenhum e-mail sai — inclusive o de redefinição de senha.

1. Contrate/escolha o provedor de envio e **verifique o domínio remetente** (SPF, DKIM e DMARC no DNS,
   conforme o provedor — sem isso as mensagens caem no spam ou são recusadas).
2. Configure no `.env`:
   - `EMAIL_PROVIDER=smtp`
   - `SMTP_URL`: `smtps://usuario:senha@host:465` (TLS implícito) **ou** `smtp://usuario:senha@host:587`
     (STARTTLS; acrescente `?requireTLS=true` para recusar conexão sem TLS). Informe sempre a porta.
     Caracteres especiais no usuário/senha precisam de URL-encode (`@` → `%40`, `:` → `%3A`, `/` → `%2F`).
   - `EMAIL_FROM`: `Bocado de Nutrição <nao-responda@seudominio.com.br>` (no domínio verificado)
   - `PASSWORD_RESET_URL`: URL real do painel (`https://painel.seudominio.com.br/reset-password`)
3. **Valide antes de ir ao ar** (confere conexão/autenticação e envia uma mensagem de teste):
   `npm run email:test --workspace backend -- voce@seudominio.com.br` (com as variáveis acima no ambiente).
   Em Docker: `docker compose run --rm migrate npm run email:test --workspace backend -- voce@...`
   (o serviço `migrate` usa a imagem com as ferramentas de desenvolvimento; repasse as variáveis com `-e`).
4. Teste o fluxo real: "esqueci minha senha" no painel → e-mail chega → link abre → senha nova → login.

Comportamento: o envio da redefinição é **em segundo plano** (a resposta é sempre 204, exista ou não o
e-mail, e não depende do SMTP — evita revelar quem está cadastrado pelo tempo ou por erro). Timeouts:
10 s de conexão/saudação, 30 s de socket. **Uma falha de envio aparece só no log**
(`Falha ao enviar e-mail de redefinição de senha (usuário <id>)`, sem o e-mail nem o token) — monitore
esse texto. Resíduo conhecido: o caminho "e-mail existe" ainda faz um `INSERT` a mais (~7 ms mais lento).

## 9. Mercado Pago (comercial do cliente)

Código pronto; falta **conta e credenciais**. Passos:

1. No painel do Mercado Pago, crie a aplicação e copie o **Access Token** → `MERCADOPAGO_ACCESS_TOKEN`.
2. Em Suas integrações > Webhooks, cadastre `https://SUA-API/client-billing/webhook`, marque os
   tópicos `payment` e `subscription_preapproval` e copie a **chave secreta** → `MERCADOPAGO_WEBHOOK_SECRET`.
   (A preferência/assinatura não envia `notification_url` por requisição: a URL fica no painel.)
3. `PAYMENT_GATEWAY_PROVIDER=mercadopago`.
4. **Valide no sandbox antes de produção**: pagamento aprovado/recusado, assinatura autorizada/pausada/
   cancelada, e o cancelamento — a documentação oficial usa `canceled` no `PUT /preapproval/{id}` e
   as consultas devolvem `cancelled`; o código aceita as duas na leitura e envia `canceled`.

Limitações conhecidas: cobranças recorrentes individuais (`subscription_authorized_payment`) não geram
`ClientInvoice`; reconciliação de pagamento único não existe (o link guarda o id da preferência, não o
do pagamento); a expiração do link é local e não é enviada ao Mercado Pago. O billing SaaS (planos dos
profissionais) é sempre simulado. Não há tela de produtos/links/assinaturas no painel nem no app.

## 10. Notificações push

O backend registra tokens e preferências, mas o envio é `ConsoleNotificationService` (só loga). Push
real precisa de um projeto EAS (Expo) e de um adapter de envio (ainda não escrito).

## 11. Apps móveis

Desenvolvimento: Expo Go. URL da API sem editar o `app.json`:
`EXPO_PUBLIC_API_URL=http://IP-DO-PC:3000 npx expo start` (aparelho físico não alcança `localhost`).
Release (APK/AAB/IPA) **ainda não configurado**: faltam `eas.json`, `android.package`,
`ios.bundleIdentifier`, `extra.eas.projectId` e contas Google Play/Apple.

## 12. GIFs de exercício (piloto)

30 exercícios do catálogo têm GIF (`GET /exercise-media/:sha256`, autenticado, cache imutável).
Reimportar: `EXERCISE_MEDIA_SOURCE_DIR=<biblioteca> npm run reference-data:import-exercise-media-pilot --workspace backend`
(`-- --dry-run` só valida). Só storage local. Validação em aparelho Android real: **pendente**.

## 13. Checklist de release

- [ ] `.env` de produção preenchido (nada de valor de exemplo); a API sobe sem erros de configuração
- [ ] `npm run prisma:migrate:deploy` aplicado; `GET /health` = 200
- [ ] Primeiro admin criado; catálogo importado
- [ ] HTTPS + `TRUST_PROXY` + `CORS_ORIGIN` reais; painel publicado com `VITE_API_URL`
- [ ] SMTP funcionando (teste um "esqueci minha senha" de ponta a ponta)
- [ ] Storage persistente (volume ou S3) + backup agendado e restauração testada
- [ ] Sentry (`ERROR_TRACKING_PROVIDER=sentry`) se desejado
- [ ] Mercado Pago validado em sandbox (se a cobrança do cliente for ao ar)
- [ ] Apps: EAS configurado, builds gerados e testados em aparelho real
