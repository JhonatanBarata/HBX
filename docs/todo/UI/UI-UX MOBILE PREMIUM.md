# HBX Mobile Premium Redesign

Objetivo: redesenhar o mobile do HBX com componentes reais, dados reais e CSS modular, preservando desktop.

Referencia de validacao visual: `http://localhost:3001`.

Referencia criativa: imagem anexada na conversa com os quatro aparelhos `Login`, `Radar Digital`, `Processando Leads` e `Vendas (Agenda)`. A implementacao deve perseguir essa direcao visual: mobile friendly, premium, vivo, tecnologico, limpo e operacional.

## Regras gerais

- [ ] Validar cada tela em `http://localhost:3001` nas larguras 375px, 390px e 430px.
- [ ] Nao usar mock fake em producao quando houver API real.
- [ ] Antes de criar endpoint, procurar o fluxo existente para `shortNote`, `returnAt`, `status` e `nextAction`.
- [ ] Preservar autenticacao, permissoes, planos, QR, WhatsApp, automacao, opt-out, negativos, bloqueios, duplicidade e ownership.
- [ ] Manter desktop funcional e visualmente preservado.
- [ ] Preferir CSS modular nos arquivos da tela, exceto quando a tela ja usa estilo global estabelecido.
- [ ] Criar experiencias com fundos vivos, estados de carregamento premium e transicoes modernas, sem prejudicar performance mobile.
- [ ] Toda animacao deve ter intencao operacional: guiar foco, indicar progresso, confirmar acao ou melhorar percepcao de resposta.
- [ ] Evitar efeitos decorativos pesados que deixem a tela lenta em Android comum.

## Direcao visual obrigatoria da imagem

- [ ] Login deve seguir o primeiro aparelho da referencia: dark premium, HBX grande, fundo tecnologico sutil, campos elegantes e CTA azul/ciano vivo.
- [ ] Radar setup deve seguir o segundo aparelho: fundo claro premium, fluxo guiado, cards de campos, CTA forte e pouca friccao.
- [ ] Radar processando/carregando deve seguir o terceiro aparelho: fundo escuro, ring de progresso, etapas validadas, sensacao clara de sistema trabalhando.
- [ ] Vendas/Agenda deve seguir o quarto aparelho: cards claros, KPIs no topo, agenda acionavel, bottom sheet de observacao e nav mobile refinada.
- [ ] Validar visualmente contra a imagem em 375px, 390px e 430px antes de marcar pronto.

## 1. Vendas / Agenda Mobile

Arquivos principais:

- `frontend/src/app/vendas/automacao/page.client.tsx`
- `frontend/src/app/vendas/automacao/page.module.css`

Checklist:

- [ ] Mapear tipos existentes de `MobileLeadItem`, `MobileBoardResponse` e `MobileDialPrefs`.
- [ ] Criar helpers de agenda:
  - [ ] `MobileAgendaTab`
  - [ ] `getLeadReturnDate`
  - [ ] `getStartOfToday`
  - [ ] `getStartOfTomorrow`
  - [ ] `isLeadOverdue`
  - [ ] `isLeadToday`
  - [ ] `isLeadUpcoming`
  - [ ] `leadUrgencyLabel`
  - [ ] `sortMobileAgendaLeads`
  - [ ] `resolveRecommendedLead`
- [ ] Substituir KPIs atuais do topo por `Atrasados`, `Hoje`, `Proximos`.
- [ ] Remover `DDD/CSP` da area de KPI principal e mover para configuracao secundaria.
- [ ] Criar bloco `Proximo card recomendado`.
- [ ] Implementar `Executar proximo` focando/abrindo o lead recomendado.
- [ ] Redesenhar cards mobile com nome, localidade, status, WhatsApp, proxima acao, retorno, tentativas, ultimo contato e observacao curta.
- [ ] Diferenciar visualmente atrasados, hoje, futuros e fechados.
- [ ] Manter acoes existentes: WhatsApp, ligar, reagendar, observacao e encerrar.

Aceite em `localhost:3001`:

- [ ] `/vendas/automacao?tab=prospeccao&mode=mobile` nao mostra mais `DDD/CSP` como KPI principal.
- [ ] Existem 3 KPIs principais: `Atrasados`, `Hoje`, `Proximos`.
- [ ] Os dados vem de `mobileBoard`, sem mock.
- [ ] Desktop continua renderizando sem regressao visual obvia.

## 2. Bottom Sheet Agenda de Cards

Arquivos principais:

- `frontend/src/app/vendas/automacao/page.client.tsx`
- `frontend/src/app/vendas/automacao/page.module.css`

Checklist:

- [ ] Criar states `agendaSheetOpen` e `agendaTab`.
- [ ] Criar handler `openAgendaSheet(tab)`.
- [ ] Criar componente `MobileAgendaSheet`.
- [ ] Criar componente `MobileAgendaLeadRow`.
- [ ] Implementar abas/chips: `Agora`, `Atrasados`, `Hoje`, `Proximos`, `Fechados`.
- [ ] Listar leads reais por blocos de `mobileBoard.blocks`.
- [ ] Ordenar agenda por prioridade:
  - [ ] Atrasados mais antigos primeiro.
  - [ ] Hoje por horario.
  - [ ] WhatsApp confirmado antes de desconhecido, se existir.
  - [ ] Menor numero de tentativas primeiro.
  - [ ] Proximos por data.
  - [ ] Fechados por atualizacao recente, se esse dado existir.
- [ ] Adicionar resumo: ativos, atrasados e proximo horario quando possivel.
- [ ] Fechar por backdrop e botao.
- [ ] Abrir lead e fechar sheet ao tocar em um item.

Aceite em `localhost:3001`:

- [ ] Clicar em qualquer KPI abre a bottom sheet.
- [ ] A bottom sheet ocupa cerca de 80% a 90% da altura da tela.
- [ ] Nao usa modal central.
- [ ] Lista cards reais do board mobile.
- [ ] O botao `Observacao` de cada lead abre a sheet de observacao.

## 3. Bottom Sheet Observacao Mobile

Arquivos principais:

- `frontend/src/app/vendas/automacao/page.client.tsx`
- `frontend/src/app/vendas/automacao/page.module.css`

Checklist:

- [ ] Procurar no desktop onde `shortNote` e salvo.
- [ ] Reutilizar o mesmo campo do desktop, preferencialmente `shortNote`.
- [ ] Confirmar endpoint real antes de usar `PATCH /vendas/leads/:id`.
- [ ] Criar states `noteLead`, `noteDraft` e `savingNote`.
- [ ] Criar `openMobileNoteSheet(lead)`.
- [ ] Criar `closeMobileNoteSheet()`, bloqueando fechamento durante save.
- [ ] Criar `saveMobileLeadNote()`.
- [ ] Atualizar `mobileBoard` localmente apos salvar, sem reload completo.
- [ ] Mostrar feedback discreto: `Observacao salva.`
- [ ] Tratar erro de persistencia.
- [ ] Nao perder texto enquanto estiver salvando.

Aceite em `localhost:3001`:

- [ ] O usuario consegue abrir observacao pelo card mobile.
- [ ] Textarea usa placeholder `Digite uma observacao sobre este lead...`.
- [ ] Salvar persiste no backend real.
- [ ] O card atualiza a observacao sem recarregar a pagina.
- [ ] Desktop continua usando o mesmo campo.

## 4. Radar Digital Mobile

Arquivo principal:

- `frontend/src/app/radar-digital/page.client.tsx`

Checklist:

- [ ] Mapear fluxo atual de busca/importacao do Radar.
- [ ] Confirmar se ja existe envio/importacao Radar -> Vendas.
- [ ] Reutilizar filtros e estados reais: segmento, cidade, estado, quantidade e tipo de alvo quando existirem.
- [ ] Criar estado `RadarMobileStep`: `setup`, `processing`, `done`.
- [ ] Criar handler mobile `handleMobileRadarSearch()`.
- [ ] Tela `setup`:
  - [ ] Header `Radar Digital`.
  - [ ] Headline `Conte para o Radar quais leads voce precisa`.
  - [ ] Subtexto `Defina seu publico-alvo e deixe o HBX trabalhar para voce.`
  - [ ] Campos reais de segmento, cidade, estado e quantidade.
  - [ ] Caixa informativa sobre envio automatico para Vendas.
  - [ ] CTA `Buscar leads`.
- [ ] Tela `processing`:
  - [ ] Headline `Trabalhando em seus leads.`
  - [ ] Subtexto `Voce vera tudo automaticamente no Vendas.`
  - [ ] Ring de progresso visual inspirado na imagem.
  - [ ] Fundo vivo escuro com glow azul/ciano, pontos, linhas sutis e movimento leve.
  - [ ] Transicao moderna de `setup` para `processing`, sem piscar layout.
  - [ ] Etapas: segmento validado, localizacao validada, enviando para Vendas.
  - [ ] CTA `Abrir Vendas`.
- [ ] Se faltar backend para importacao, implementar menor endpoint seguro possivel, respeitando owner, negativos, opt-out, no_whatsapp e duplicidade.

Aceite em `localhost:3001`:

- [ ] Mobile do Radar parece fluxo guiado, nao formulario cru.
- [ ] Busca usa endpoints reais.
- [ ] Processamento leva para `/vendas/automacao?tab=prospeccao&mode=mobile`.
- [ ] Nao envia para Vendas leads bloqueados, negativos, opt-out ou de outra empresa.
- [ ] O carregando parece premium e operacional, nao spinner simples.

## 5. Login Mobile

Arquivo principal:

- `frontend/src/app/login/page.tsx`
- `frontend/src/app/globals.css` se o login continuar usando estilos globais existentes.

Checklist:

- [ ] Manter logica real de autenticacao, validacao, loading, erro e recuperacao.
- [ ] Ignorar/remover Google no mobile, se nao fizer parte do fluxo atual.
- [ ] Criar visual escuro premium inspirado no primeiro aparelho da referencia.
- [ ] Criar fundo vivo no login:
  - [ ] Gradientes escuros com profundidade.
  - [ ] Linhas/circuitos sutis.
  - [ ] Pontos/glows discretos.
  - [ ] Movimento leve em camadas, sem poluir a leitura.
- [ ] Mostrar marca `HBX` grande.
- [ ] Usar headline `Automacao que conecta. Inteligencia que vende.`
- [ ] Usar subtexto `Entre na sua conta para continuar.`
- [ ] Inputs modernos para email e senha.
- [ ] CTA principal `Entrar`.
- [ ] Link `Esqueci minha senha`.
- [ ] Remover interferencias visuais do suporte flutuante na tela de login mobile.
- [ ] Garantir que nao haja clipping horizontal em 375px, 390px e 430px.
- [ ] Criar estado de carregamento/autenticacao premium no botao ou painel:
  - [ ] Feedback claro durante login.
  - [ ] Transicao moderna para sucesso/entrada.
  - [ ] Sem bloquear leitura de erro.

Aceite em `localhost:3001`:

- [ ] `/login` em mobile parece premium e alinhado a referencia.
- [ ] Formulario real continua funcionando.
- [ ] Fundo do login tem vida, profundidade e movimento sutil.
- [ ] Loading/autenticacao parece parte do produto, nao estado generico.
- [ ] Desktop nao sofre regressao relevante.

## Validacao final

- [ ] `npm run up` sobe frontend em `http://localhost:3001`.
- [ ] Frontend acessivel em `/login`.
- [ ] Frontend acessivel em `/radar-digital`.
- [ ] Frontend acessivel em `/vendas/automacao?tab=prospeccao&mode=mobile`.
- [ ] Capturar/verificar 375px, 390px e 430px para Login.
- [ ] Capturar/verificar 375px, 390px e 430px para Radar.
- [ ] Capturar/verificar 375px, 390px e 430px para Vendas.
- [ ] Rodar lint/build/test relevantes.
- [ ] Registrar qualquer falha preexistente que nao seja causada pela alteracao.
