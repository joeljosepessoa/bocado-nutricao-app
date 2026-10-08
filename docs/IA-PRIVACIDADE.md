# IA e privacidade — estado técnico

Documento **técnico** do que o sistema faz hoje. Não é política de privacidade nem
parecer jurídico: base legal definitiva, textos para o titular, contrato/DPA com
provedor e RIPD ainda serão revisados (ver "Pendências").

## Política por recurso

Fonte única: `backend/src/ai/ai-consent-policy.ts` (`AI_CONSENT_POLICY`). Cada
interação grava a política aplicada em `AiInteractionLog.processingPolicy`.

| Recurso | Quem usa | O que vai ao provedor | Consentimento da cliente | Política |
|---|---|---|---|---|
| `organize_workout` | profissional (painel) | **só** o texto de treino colado pelo profissional | não exigido | `professional_material` |
| `organize_diet` | profissional (painel) | **só** o texto de dieta colado pelo profissional | não exigido | `professional_material` |
| `create_diet` | profissional (painel) | pedido do profissional + idade, sexo e números da última avaliação (peso, altura, % gordura, massa magra, TMB) + catálogo de alimentos | exigido | `client_consent` |
| `draft_note` | profissional | primeiro nome da cliente + instruções do profissional | exigido | `client_consent` |
| `explain_evaluation` | cliente (app) e profissional | métricas da avaliação liberada (peso, IMC, % gordura, massas, medidas) | exigido | `client_consent` |
| `narrate_trend` | cliente (app) | variação das métricas entre as duas últimas avaliações liberadas | exigido | `client_consent` |

O consentimento do **profissional** (`Professional.aiFeaturesConsentAt`, ativação da
ferramenta na conta dele) continua exigido nas rotas do profissional, para todos os
recursos.

### Minimização do `organize_workout`

O contexto é montado só com `workoutText` (o use case nem lê o cliente). O sistema
não acrescenta nome, id, avaliação, dieta nem histórico. **Limite conhecido:** se o
profissional colar dado pessoal no próprio texto (nome, diagnóstico), ele segue para
o provedor — não há anonimização automática do texto livre.

### Minimização e fidelidade do `organize_diet`

Mesma minimização do `organize_workout`: o contexto é só `dietText` — peso, IMC,
gordura, exames, avaliações e histórico do cliente nunca são lidos nem enviados.
A resposta passa por conferência determinística contra o texto colado
(`organize-diet/diet-fidelity.ts`): alimento, quantidade, unidade, refeição e
horário que não estejam escritos no texto fazem a resposta inteira ser recusada;
o que a IA deixar de fora vira aviso de revisão. Calorias e macros são sempre
calculadas pelo backend, nunca pela IA. O resultado é só um rascunho — publicar
continua sendo ação manual do profissional. Mesmo limite conhecido: dado pessoal
colado no próprio texto segue para o provedor.

### Minimização e conferência do `create_diet` (modo "Deixar a IA montar")

O contexto (`create-diet/create-diet.use-case.ts`) leva:

- o pedido escrito pelo profissional (objetivo, restrições, rotina, meta de kcal e
  número de refeições opcionais);
- do cliente, **só** a idade, o sexo e os números da última avaliação (peso, altura,
  % de gordura, massa magra, TMB da bioimpedância);
- o catálogo calculável (nome e valores por 100 g dos alimentos visíveis ao
  profissional com os 4 macros numéricos).

**Nunca** vão ao provedor: nome, e-mail, telefone, id, observações, pressão,
glicemia, fotos ou histórico.

A IA só pode citar alimentos do catálogo pela referência (`ref`). O backend
resolve cada referência e **descarta com aviso** o que não existir no catálogo.
Calorias e macros são calculadas pelo sistema, com faixa para "escolha 1" e
aviso quando o dia fica fora de ±10% da meta. O resultado é só um rascunho para
revisão. Mesmo limite conhecido: dado pessoal escrito no próprio pedido segue
para o provedor.

## Consentimento da cliente

- Campo: `Client.aiDataProcessingConsentAt` (data/hora; sem versão/texto do termo).
- `GET /client/ai/consent` — estado atual. `POST` — concede. `DELETE` — revoga.
  Rotas só do papel `client`: o profissional nunca concede/revoga pela cliente.
- Auditoria (`AiAuditLog`): `consent_granted_client` e `consent_revoked_client`.
- Revogar bloqueia **novos** usos dos recursos `client_consent`; não apaga
  interações anteriores nem outros dados.
- No app: Privacidade e dados → "Uso de inteligência artificial" (consulta, concede,
  revoga). A tela Evolução mantém o "Concordar e continuar", usando o mesmo módulo.

## Provedores

- Produção: `AI_PROVIDER=mock-local` — nada sai do servidor.
- Com `AI_PROVIDER=anthropic`: os dados da tabela acima vão à API da Anthropic
  (Claude), nos EUA — envolve operador externo e transferência internacional.
  **Não ativar antes das pendências jurídicas abaixo.**

## Registros de interação (`AiInteractionLog`)

Guarda `systemPrompt`, `contextSummary` (o contexto enviado), `responseText`,
provedor, modelo, status e política. Comportamento atual:

- **Exportação LGPD** (`POST /client/data-export`): inclui `aiConsent` e
  `aiInteractions` com **metadados** (recurso, data, status, provedor, modelo,
  política). Prompt, contexto e resposta **não** são exportados (parte é material
  interno do profissional; regra a definir).
- **Exclusão de conta**: segue a regra geral do sistema (`LgpdService.deleteAccount`):
  anonimiza o cadastro (nome, e-mail, senha, telefone, nascimento) e **mantém** os
  registros de acompanhamento — incluindo `AiInteractionLog`. Nada foi alterado.
  **Lacuna documentada:** em `draft_note`, o primeiro nome da cliente fica no
  `contextSummary` (e pode estar no `responseText`) mesmo após a anonimização.
- **Retenção**: não há prazo definido; os registros ficam indefinidamente.

## Pendências (antes de ativar provedor real)

1. Base legal por recurso validada por advogado/DPO.
2. Política de privacidade e texto do app atualizados (o termo atual diz que os
   dados ficam visíveis só para a cliente e o profissional).
3. Contrato/DPA com o provedor e mecanismo de transferência internacional.
4. RIPD (relatório de impacto) para dado de saúde com IA.
5. Decidir retenção de `AiInteractionLog` e o tratamento na exclusão de conta
   (ex.: anonimizar `clientFirstName`/conteúdo) — mudança a documentar antes.
6. Registrar versão do termo aceito (hoje só data/hora).
