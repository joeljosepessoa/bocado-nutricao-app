# Piloto com clientes reais — roteiro de publicação

Objetivo: colocar o backend + painel web no ar (Railway) e distribuir o app do cliente e o app do
profissional como APK instalável (EAS), sem cobrança real (`PAYMENT_GATEWAY_PROVIDER=mock`) e sem
domínio próprio ainda (URLs gratuitas dos provedores).

Cada passo diz quem faz: **[VOCÊ]** exige uma conta/cartão seu (não posso criar conta nem pagar por
você); os demais eu resolvo pelo terminal quando você me pedir.

## 0. Ordem recomendada

1. Backend + banco + storage no Railway
2. E-mail (SMTP) — Resend
3. Painel web no Vercel (ou Cloudflare Pages)
4. Apps mobile (Android) via EAS
5. Teste de ponta a ponta com um profissional e um cliente de teste

## 1. Backend + banco + storage — Railway

**[VOCÊ]** Crie a conta em https://railway.app (dá para entrar com a conta do GitHub) e associe um
cartão (o plano Hobby cobra por uso; para um piloto pequeno costuma ficar poucos dólares por mês).

**[VOCÊ]** No painel do Railway: **New Project → Deploy from GitHub repo** → escolha
`joeljosepessoa/bocado-nutricao-app`. O Railway detecta o `Dockerfile` da raiz e builda a imagem
`runtime` (o mesmo Dockerfile já usado no `docker-compose.yml`) — **é a primeira validação real de
Docker do projeto**, nunca rodou localmente.

**[VOCÊ]** No mesmo projeto, **+ New → Database → PostgreSQL** (plugin gerenciado do próprio Railway).

**[VOCÊ]** No serviço do backend → **Volumes → New Volume**, monte em `/data/storage` (mesmo caminho
do `docker-compose.yml`).

**[VOCÊ]** No serviço do backend → **Variables**, cole (gere os segredos com o comando abaixo, cada um
uma vez, e não reaproveite):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referência automática do Railway ao plugin) |
| `JWT_ACCESS_SECRET` | gerado acima (≥ 32 caracteres) |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `CORS_ORIGIN` | a URL do painel web (passo 3) — pode deixar `http://localhost:5173` por enquanto e trocar depois |
| `TRUST_PROXY` | `1` (o Railway fica atrás de proxy) |
| `STORAGE_PROVIDER` | `local` |
| `STORAGE_LOCAL_DIR` | `/data/storage` |
| `PAYMENT_GATEWAY_PROVIDER` | `mock` (decidido: sem cobrança real neste piloto) |
| `PAYMENT_WEBHOOK_SECRET` | outro segredo gerado como acima |
| `EMAIL_PROVIDER` | `console` por enquanto (troca no passo 2) |
| `ERROR_TRACKING_PROVIDER` | `console` |
| `AI_PROVIDER` | `mock-local` |

O Railway expõe automaticamente uma URL pública tipo `https://SEU-SERVICO.up.railway.app` (aba
**Settings → Networking → Generate Domain**). Confirme `GET https://SEU-SERVICO.up.railway.app/health`
= 200 depois do primeiro deploy.

**Migrations e seed (uma vez, depois do 1º deploy) — via Railway CLI, do seu terminal:**

```bash
npm install -g @railway/cli     # ou: npx @railway/cli <comando>
railway login
railway link                    # escolha o projeto criado acima
railway run npm run prisma:migrate:deploy --workspace backend
railway run npm run prisma:seed --workspace backend   # catálogo de planos + protocolo de avaliação — OBRIGATÓRIO, ver OPERACAO.md §4
```

**[VOCÊ]** Primeiro admin (não existe endpoint público para isso):

```bash
railway run bash -c 'ADMIN_BOOTSTRAP_EMAIL=voce@seudominio.com ADMIN_BOOTSTRAP_NAME="Seu Nome" ADMIN_BOOTSTRAP_PASSWORD="senha-forte" npm run admin:bootstrap --workspace backend'
```

**[VOCÊ]** Catálogo de alimentos/exercícios:

```bash
railway run npm run reference-data:import --workspace backend
```

## 2. E-mail (SMTP) — Resend

Sem isso, "esqueci minha senha" não entrega e-mail nenhum.

**[VOCÊ]** Crie a conta em https://resend.com (grátis até ~3.000 e-mails/mês, suficiente para um
piloto). Em **API Keys**, gere uma chave — o Resend também expõe um relay SMTP com essa mesma chave
como senha (usuário `resend`, host `smtp.resend.com`, porta `465`).

Sem domínio próprio verificado, o Resend só deixa enviar a partir de `onboarding@resend.dev` — serve
para o piloto; para produção de verdade, verifique um domínio seu (SPF/DKIM/DMARC).

No Railway, atualize as variáveis do backend:

| Variável | Valor |
|---|---|
| `EMAIL_PROVIDER` | `smtp` |
| `SMTP_URL` | `smtps://resend:SUA_API_KEY@smtp.resend.com:465` |
| `EMAIL_FROM` | `Bocado de Nutrição <onboarding@resend.dev>` |
| `PASSWORD_RESET_URL` | `https://SEU-PAINEL.vercel.app/reset-password` (URL do passo 3) |

Valide antes de depender (do seu terminal, com as variáveis acima exportadas):

```bash
SMTP_URL="smtps://resend:SUA_API_KEY@smtp.resend.com:465" EMAIL_FROM="Bocado de Nutrição <onboarding@resend.dev>" \
  npm run email:test --workspace backend -- voce@seudominio.com
```

## 3. Painel web — Vercel

**[VOCÊ]** Crie a conta em https://vercel.com (grátis para este uso; pode entrar com GitHub) →
**Add New → Project** → importe `joeljosepessoa/bocado-nutricao-app`.

Nas configurações de build do projeto:

| Campo | Valor |
|---|---|
| Root Directory | `professional-web` (ligue **"Include files outside the root directory"**, porque o `package-lock.json` fica na raiz do monorepo) |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment Variable | `VITE_API_URL` = `https://SEU-SERVICO.up.railway.app` (URL do passo 1) |

Depois do deploy, volte no Railway e atualize `CORS_ORIGIN` para a URL real do Vercel
(`https://SEU-PAINEL.vercel.app`) — sem isso o painel não consegue chamar a API (CORS).

## 4. Apps mobile (Android) — EAS

Gera um `.apk` que você manda por link direto pro celular do cliente instalar — sem loja, sem conta
Apple/Google Play necessária nesta etapa. iPhone fica para quando vocês tiverem o Apple Developer
Program (US$ 99/ano, conta própria) — o projeto já está preparado (`ios.bundleIdentifier` definido nos
dois apps), só falta essa conta.

**[VOCÊ]** Crie a conta gratuita em https://expo.dev.

Para cada app (`mobile` = app do cliente, `professional-mobile` = app do profissional), do terminal:

```bash
cd mobile   # depois repita tudo em professional-mobile
npx eas login
npx eas init          # associa este projeto à sua conta Expo e preenche extra.eas.projectId no app.json
```

Antes de buildar, edite `eas.json` (dos dois apps) e troque
`https://SUBSTITUA-PELA-URL-DO-BACKEND` pela URL real do Railway (passo 1), nos perfis `preview` e
`production`.

```bash
npx eas build --platform android --profile preview
```

O EAS builda na nuvem deles (não precisa Android Studio nem SDK aqui) e no final dá um link de
download do `.apk`. Mande esse link pro cliente; no Android ele precisa permitir "instalar de fontes
desconhecidas" na primeira vez.

## 5. Teste de ponta a ponta antes de chamar clientes de verdade

1. Cadastre um profissional de teste pelo painel web publicado.
2. Cadastre um cliente de teste a partir do painel.
3. Instale o app do cliente (APK) num celular real e faça login com a senha temporária.
4. Crie uma avaliação física com foto, gere um relatório PDF, baixe.
5. Teste "esqueci minha senha" de ponta a ponta (e-mail chega, link abre, senha nova, login).
6. Reinicie o serviço no Railway (redeploy) e confirme que a foto e o PDF continuam acessíveis
   (prova de que o volume `/data/storage` persistiu).

Só depois disso chame clientes reais. Apague os dados de teste do passo acima antes (ou deixe claro
para você mesmo quais são de teste).

## Pendências que ficam de fora deste piloto (decidido)

- Cobrança real (Mercado Pago): fica `mock`. Nenhum cliente é cobrado de verdade.
- iPhone: fica para quando houver Apple Developer Program.
- Domínio próprio e certificado: usando as URLs gratuitas do Railway/Vercel por enquanto.
- Backup agendado do banco/storage: os scripts existem (`database/scripts/`, ver `OPERACAO.md` §7),
  mas rodar num cron de produção fica para depois do piloto — rode manualmente antes de cada marco
  importante.
