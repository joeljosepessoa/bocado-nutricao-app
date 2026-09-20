# Status por fase — Bocado de Nutrição

Fases entregues (conforme o histórico do Git). O que ainda impede uma versão de produção está em
[OPERACAO.md](OPERACAO.md) (limitações, integrações externas e checklist de release).

| Fase | Entrega |
|---|---|
| 1 | Fundação do monorepo |
| 2 | Autenticação JWT, refresh rotativo, isolamento profissional/cliente |
| 3 | Clientes (busca, status, arquivamento) |
| 4 | Avaliação física (bioimpedância, dobras, auditoria de acesso) |
| 5 | Dietas versionadas, catálogo de alimentos, substituições |
| 6 | Treinos versionados, catálogo de exercícios, execução |
| 7–8 | App do cliente e evolução |
| 9 | Painel profissional (React) e relatórios em PDF |
| 10 | BLE / balança — pipeline com driver simulado (sem protocolo de fabricante real) |
| 11 | Wearables e dispositivos (consentimento, métricas) |
| 12 | IA assistiva (provedor simulado) |
| 13 | Cadastro autônomo e recuperação de senha |
| 14 | Dados de referência (TACO, exercícios) |
| 15 | Administração e moderação |
| 16 | Notificações (registro/preferências; envio simulado) |
| 17 | Mensagens profissional↔cliente |
| 18 | Agenda e consultas |
| 19 | LGPD operacional (exportação, exclusão) |
| 20–21 | Infraestrutura de produção e hardening |
| 22 | Billing SaaS (planos/assinaturas dos profissionais, simulado) |
| 23.2–23.6 | Comercial do cliente: schema, domínio, adapter Mercado Pago, webhook, expiração e reconciliação |
| Piloto GIFs | 30 demonstrações de exercício (validação em aparelho Android real pendente) |
| Release Candidate | Fechamento: correções de segurança/cobrança, validação de configuração de produção, adapter SMTP, documentação |
