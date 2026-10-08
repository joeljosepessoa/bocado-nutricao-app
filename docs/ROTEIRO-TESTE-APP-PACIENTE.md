# Roteiro de teste — novo visual do app do paciente

Ambiente: celular Android com Expo Go, ligado por cabo ao PC, usando o servidor de desenvolvimento (`localhost:3000` no PC). Nada aqui toca a produção.

## Pacientes de teste (criar no painel local)

| Paciente | Como preparar | Serve para |
|---|---|---|
| **A — Completo** | Dieta publicada com **Dia de treino** e **Dia de descanso** e **horários** nas refeições; treino publicado com 2+ dias; **Meta de peso** e **Meta de água** preenchidas na ficha; 1–2 avaliações **liberadas** (de preferência com fotos). | Fluxo cheio |
| **B — Vazio** | Paciente recém-criado, sem nada. | Sem peso, sem dieta, sem treino, sem avaliação, sem metas |
| **C — Só dieta sem horários** (opcional) | Dieta publicada **sem horário** nas refeições e **sem** treino. | Próxima refeição escondida, sem treino |

Na primeira entrada, cada paciente troca a senha temporária e aceita os termos — confira que esse fluxo continua igual ao de antes (o login não mudou).

## Em todas as telas

- [ ] Cabeçalho fixo no topo com o título da tela; seta de voltar fora do Dashboard.
- [ ] Ícone de menu abre o **menu lateral** deslizando; o item atual aparece destacado em laranja; tocar fora fecha.
- [ ] **Barra inferior** com 5 abas: Dashboard, Dieta, Treinos, Evolução, Perfil. A aba atual em laranja. "Perfil" abre o **painel de perfil** (não troca de tela).
- [ ] Não existe **sino de notificações** no cabeçalho.
- [ ] **Puxar para atualizar** funciona (indicador laranja).
- [ ] Ao abrir, aparece "Carregando..." e depois o conteúdo entra com animação suave.
- [ ] Com o Wi-Fi/dados desligados e o cabo solto, a tela mostra erro com "Tentar novamente" (não fica em branco).

## Tema claro e escuro

- [ ] O botão de tema (sol/lua) no cabeçalho alterna claro ↔ escuro na hora.
- [ ] Fechar e abrir o app de novo mantém o tema escolhido.
- [ ] No escuro, percorrer **todas** as telas abaixo: nenhum texto preto em fundo escuro, nenhum card branco "estourando", campos de digitação legíveis.
- [ ] Cronômetro de descanso, menu lateral e painel de perfil também no escuro.

## 1. Dashboard

Paciente A:
- [ ] Saudação (Bom dia/Boa tarde/Boa noite + primeiro nome) e data.
- [ ] **Peso Atual** = último peso registrado (ou o da avaliação liberada, se for mais recente).
- [ ] **Meta** = exatamente a meta de peso da ficha.
- [ ] **Calorias do dia** e **nº de refeições** batem com o dia escolhido da dieta.
- [ ] Seletor **"Hoje é dia de: Treino / Descanso"** aparece; trocar muda calorias e refeições; fechar e abrir o app lembra a escolha.
- [ ] Card de **água**: total/meta da ficha; botão **+250 ml** soma na hora.
- [ ] **Evolução do peso**: com 2+ pesos nos últimos 30 dias, gráfico com um ponto por registro (nada inventado; pesos com mais de 30 dias não entram).
- [ ] **Próximas ações**: próximo treino (dia seguinte ao último concluído), próxima refeição (a próxima pelo horário), quanto falta de água. Cada uma leva à tela certa.

Paciente B:
- [ ] **Peso Atual** mostra **"Registrar"** e leva ao Registro de Peso.
- [ ] **Meta** mostra **"--"** (nunca calculada).
- [ ] **Calorias do dia** "--" e "Sem dieta ativa".
- [ ] No lugar do gráfico: **"Registre seu peso para acompanhar a evolução"** + botão para o Registro de Peso.
- [ ] Meta de água = **2000 ml** (sem peso e sem meta na ficha).
- [ ] Sem seletor Treino/Descanso; sem linha de próximo treino nem de próxima refeição.
- [ ] Registrar 1 peso (ex.: 70): Peso Atual = 70 kg; meta de água vira **2450 ml** (35 ml × 70); gráfico ainda mostra o convite.
- [ ] Registrar o 2º peso: o gráfico aparece.

Paciente C:
- [ ] Calorias e refeições aparecem, mas **sem** linha de próxima refeição (dieta sem horários).

## 2. Minha Dieta

- [ ] Abre no mesmo dia (Treino/Descanso) escolhido no Dashboard.
- [ ] Refeições em cards que **expandem/recolhem** (seta girando); a próxima refeição já vem aberta.
- [ ] Conteúdo igual ao de antes: opções "Escolha 1", alimentos, substituições, suplementos, orientações; nenhum "0 kcal" inventado.
- [ ] Paciente B: mensagem de dieta ainda não publicada.

## 3. Meus Treinos e execução

- [ ] Dias em cards que expandem; o **próximo treino** vem aberto e destacado.
- [ ] Cada exercício com séries prescritas (reps, carga, descanso) e o GIF ao tocar.
- [ ] **Iniciar treino** abre a execução: barra de progresso "X de Y séries".
- [ ] Marcar uma série (círculo → check verde) abre o **cronômetro de descanso** com o tempo da prescrição.
- [ ] Cronômetro: presets **30/45/60/90/120 s**, −15/+15, pausar/continuar, "Pular descanso".
- [ ] Ao chegar a 0: **som** (3 bipes) + **vibração**, e o texto "Descanso concluído!". Testar com música tocando (deve abaixar e voltar) e com o celular no silencioso.
- [ ] Com o app em segundo plano, chega a notificação "Descanso concluído".
- [ ] Alterar reps e carga (aceita vírgula, ex.: 22,5); escrever uma **Observação**.
- [ ] Voltar no meio do treino com séries marcadas pede confirmação.
- [ ] **Finalizar treino** → "Treino salvo!". Depois, em **Histórico › Treinos**, aparecem a data, as séries feitas, as cargas digitadas e a observação.
- [ ] Sem internet ao finalizar: "Salvo no aparelho"; ao voltar a conexão, o treino aparece no Histórico.
- [ ] Paciente B/C: "Nenhum treino publicado".

## 4. Evolução

- [ ] Paciente A: indicadores da última avaliação, medidas, gráfico por indicador, comparação inicial × atual, histórico; tocar numa avaliação abre a tela **Avaliação** dela.
- [ ] Paciente B: estado vazio "Nenhuma avaliação liberada ainda".

## 5. Registro de Peso

- [ ] Registrar com vírgula (72,4); valores inválidos (10, 500, letras) mostram erro.
- [ ] Card com peso atual, meta ("--" sem meta) e variação total.
- [ ] Gráfico a partir do 2º registro; histórico com data/hora e variação para o anterior.
- [ ] Apagar um registro próprio (pede confirmação); pesos de avaliação aparecem marcados "Avaliação" e **sem** lixeira.

## 6. Água

- [ ] Botões 150/250/350/500 ml somam; quantidade digitada (10–3000) também.
- [ ] Texto da meta explica a origem: nutricionista / 35 ml por kg / padrão.
- [ ] Apagar um registro do dia; **Zerar dia** pede confirmação.
- [ ] Barras dos últimos 7 dias (verde quando bateu a meta).
- [ ] Mudar a **Meta de água** na ficha (painel) e puxar para atualizar: a meta muda no app.

## 7. Fotos

- [ ] **Câmera** pede permissão e tira foto; **Galeria** pede permissão e escolhe imagem (com recorte 3:4).
- [ ] A foto enviada aparece em "Minhas fotos" com a data; tocar abre grande; lixeira apaga com confirmação.
- [ ] Paciente A: "Fotos das avaliações" mostra as fotos das avaliações liberadas.
- [ ] Privacidade: entrar com o paciente B e conferir que **não** vê as fotos do A.

## 8. Histórico

- [ ] Abas Treinos, Peso, Água, Avaliações.
- [ ] Treinos expandem e mostram exercícios, séries/cargas e a observação.
- [ ] Água: totais por dia dos últimos 30 dias.
- [ ] Avaliações: tocar abre a tela Avaliação daquela data.
- [ ] Paciente B: estados vazios com atalhos (Registrar peso / Registrar água).

## 9. Avaliação

- [ ] Abre na mais recente; com 2+ avaliações, chips de data para trocar.
- [ ] Relatório visual (resumo/comparação, composição, medidas, fotos).
- [ ] "Explicar em linguagem simples" respeita o consentimento de IA (sem consentimento, pede antes).
- [ ] Paciente B: "Nenhuma avaliação liberada".

## 10. Perfil, painel de perfil e Configurações

- [ ] Painel de perfil (aba Perfil): **Meu Perfil**, **Minhas Avaliações**, tema, **Configurações** e **Sair** — cada um abre a tela certa.
- [ ] Meu Perfil: avatar com a inicial, e-mail, **metas da ficha** ("--" sem meta), editar nome e telefone e salvar.
- [ ] Atalhos: Minhas Avaliações, Mensagens, Consultas, Relatórios, Configurações.
- [ ] Configurações: tema, Notificações e Privacidade e dados abrem.
- [ ] **Sair** pede confirmação e volta ao login.

## 11. Menu lateral

- [ ] Itens: Dashboard, Minha Dieta, Meus Treinos, Evolução, Registro de Peso, Água, Fotos, Histórico, Avaliação, e depois Mensagens, Consultas, Relatórios, Atividade.
- [ ] Logo e "Bocado de Nutrição" no topo; nome do paciente no rodapé; **Sair** com confirmação.

## 12. Telas que já existiam (só conferir que continuam funcionando)

- [ ] Mensagens, Consultas, Relatórios (e "Meu relatório"), Atividade/dispositivos, Notificações, Privacidade e dados (exportar dados inclui peso, água e fotos).

## Ficha do paciente no painel

- [ ] Editar dados mostra **Meta de peso (kg)** e **Meta de água (ml)**; vazio = sem meta; aceita vírgula no peso; valores fora da faixa mostram erro.
- [ ] Depois de salvar, as metas aparecem na visão geral e no app.
