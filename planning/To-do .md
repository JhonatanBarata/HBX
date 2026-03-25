# To-do Mestre — Atendimento + Recovery + Cadastro + Agenda + Bot Studio

> Arquivo vivo para execucao faseada.
> Regra de uso:
> - so marcar ou apagar item quando estiver implementado e testado
> - nao considerar "parece pronto" como concluido
> - preservar tudo que e unico do Recovery dentro da fusao com Atendimento

## Invariantes obrigatorias

- [ ] Nao perder `Templates Meta` do Recovery
- [ ] Nao perder a sequencia de conversas encaminhadas para inadimplencia
- [ ] Nao perder `currentFlow`, `currentStep`, `flowResult` e eventos do fluxo Recovery
- [ ] Nao perder historico de pagamento, valor em aberto, score e status financeiro
- [ ] Nao perder handoff humano, bloqueio, encerramento e retomada do bot no Recovery
- [ ] Nao perder compatibilidade com dados atuais sempre que possivel
- [ ] Nao esconder problema estrutural com CSS
- [ ] Nao fazer redesign pesado antes da base estrutural estabilizar
- [ ] Nao deixar Atendimento e Recovery como dois chats paralelos no estado final
- [ ] Nao criar agendamento sem vinculo claro com cadastro central
- [ ] Nao criar cadastro duplicado por falha de fluxo

## Fase 1 — Estabilizacao operacional sem redesign pesado

### 1. Chat e fila

- [ ] Garantir que o chat do Atendimento carregue sempre sem precisar "fuçar" ou trocar de aba
- [ ] Garantir que o chat do Recovery carregue sempre sem precisar fallback manual do usuario
- [ ] Garantir que selecionar conversa nunca deixe a tela travada ou cinza
- [ ] Garantir que o polling nao gere piscada no painel central
- [x] Garantir que o WorkspaceShell remonte corretamente quando lista, selecao ou filtros mudarem
- [x] Garantir mensagens de erro claras quando endpoint falhar
- [x] Exibir diagnostico tecnico controlado quando a fila vier vazia e a API estiver com erro

### 2. Workspace unico de conversas

- [x] Criar `ConversationWorkspaceShell`
- [x] Criar `ConversationListPane`
- [x] Criar `ConversationMainPane`
- [x] Criar `ConversationContextPanel`
- [x] Migrar o `Atendimento` para usar a nova base comum
- [x] Migrar o `Recovery` para usar a nova base comum
- [ ] Remover duplicacao grosseira de layout entre Atendimento e Recovery
- [ ] Garantir que a UI principal seja unica

### 3. Recovery como incremento do Atendimento

- [ ] Tratar Recovery como capability/feature do Atendimento
- [x] Quando Recovery estiver ativo, exibir badges de cobranca no Atendimento
- [x] Quando Recovery estiver ativo, exibir contexto de cobranca no painel lateral do Atendimento
- [x] Quando Recovery estiver ativo, exibir valor em aberto no Atendimento
- [x] Quando Recovery estiver ativo, exibir score de risco no Atendimento
- [x] Quando Recovery estiver ativo, exibir historico de pagamento no Atendimento
- [x] Quando Recovery estiver ativo, exibir eventos do fluxo Recovery no Atendimento
- [x] Quando Recovery estiver ativo, exibir acesso a `Templates Meta` dentro da experiencia unificada
- [x] Quando Recovery estiver desligado, esconder tudo isso sem quebrar o Atendimento

### 4. Adapters por dominio/capability

- [x] Criar adapter de dados do Atendimento
- [x] Criar adapter de dados do Recovery
- [x] Criar adapter de acoes do Atendimento
- [x] Criar adapter de acoes do Recovery
- [x] Criar adapter de badges/indicadores do Atendimento
- [x] Criar adapter de badges/indicadores do Recovery
- [ ] Garantir que a UI consuma adapters e nao logica duplicada espalhada

### 5. Layout persistente e coerente

- [x] Salvar layout do workspace de forma unica por modulo/capability
- [x] Compartilhar layout salvo entre `Conversas`, `Conversas encerradas` e `Clientes bloqueados`
- [x] Garantir que o Recovery espelhe o mesmo padrao de layout do Atendimento
- [x] Garantir que troca de filtro nao destrua o layout salvo
- [x] Garantir que troca de conversa nao destrua o layout salvo
- [x] Garantir que refresh da pagina preserve o layout

### 6. Agenda do Recovery

- [x] Remover rota da agenda do Recovery da experiencia principal
- [x] Remover botao da agenda do Recovery
- [x] Remover referencias visuais orfas da agenda do Recovery
- [x] Remover sujeira de navegacao ligada a agenda do Recovery
- [x] Confirmar que nada essencial do Recovery depende dessa agenda antiga

### 7. Tabela e visoes operacionais

- [x] Aproveitar a melhor UI da tabela do Recovery como base de visao operacional unificada
- [x] Encaixar inadimplentes como visao dentro da base operacional
- [x] Garantir que Atendimento continue com clientes comuns
- [x] Garantir que visao de inadimplentes nao vire um mundo separado

### 8. Recovery exclusivo que precisa sobreviver na fusao

- [ ] Preservar `Templates Meta`
- [ ] Preservar inicio de fluxo via template aprovado
- [ ] Preservar historico de pagamento
- [ ] Preservar geracao de link de pagamento
- [ ] Preservar marcacao de pago/manual
- [ ] Preservar nota interna
- [ ] Preservar queue humana do Recovery
- [ ] Preservar bloqueio especifico do Recovery
- [ ] Preservar eventos `sourceModule` do Recovery
- [ ] Preservar fluxo `cobranca_recovery_whatsapp_hibrido`
- [ ] Preservar identificacao de conversas originadas ou mantidas pelo Recovery

### Checklist manual da Fase 1

- [ ] Empresa com Recovery habilitado: conversa comum abre no workspace unificado
- [ ] Empresa com Recovery habilitado: conversa com cobranca abre no mesmo workspace, com extras de Recovery
- [ ] Empresa sem Recovery habilitado: Atendimento fica limpo e funcional
- [ ] Recovery deixa de parecer um segundo chat separado
- [ ] Historico de pagamento continua acessivel
- [ ] Templates Meta continuam acessiveis
- [ ] Agenda do Recovery some da experiencia principal

## Fase 2 — Cadastro central + Agenda via chat

### 1. Dominio central de cadastro

- [ ] Definir modelo central de identidade do cliente/contato
- [ ] Decidir se a base final sera extensao de `Customer` atual ou nova camada `Contact/CustomerProfile`
- [ ] Garantir que nome, telefone e identidade nao fiquem presos a modulo
- [ ] Garantir que perder permissao da tela de Cadastros nao apague o dado
- [ ] Garantir leitura minima do cadastro pelos modulos operacionais

### 2. Conversa nova chegando pelo WhatsApp

- [ ] Ao chegar mensagem de numero desconhecido, tentar localizar cadastro existente
- [ ] Se nao encontrar, criar contato provisiorio sem duplicar
- [ ] Puxar nome do perfil do WhatsApp quando disponivel
- [ ] Perguntar confirmacao do nome
- [ ] Salvar nome confirmado no dominio central
- [ ] Marcar origem como `WhatsApp/Chat`
- [ ] Exibir no chat quando estiver em fluxo de cadastro

### 3. Conversa de contato existente

- [ ] Reutilizar cadastro central pelo telefone
- [ ] Exibir dados do cadastro central no painel lateral
- [ ] Continuar fluxo sem duplicar cadastro
- [ ] Garantir que Recovery e Atendimento leiam a mesma identidade

### 4. Agenda no fluxo conversacional

- [ ] Tratar agenda como parte explicita da arquitetura conversacional
- [ ] Tratar agenda como parte explicita do motor do bot
- [ ] Tratar agenda como parte explicita da interface
- [ ] Permitir consultar datas disponiveis pelo chat
- [ ] Permitir consultar horarios disponiveis pelo chat
- [ ] Permitir listar opcoes para o cliente
- [ ] Registrar tentativa de consulta de agenda
- [ ] Seguir o fluxo conforme disponibilidade encontrada
- [ ] Exibir claramente quando estiver em fluxo de agenda

### 5. Criacao de agendamento

- [ ] Criar compromisso/agendamento vinculado ao cadastro central
- [ ] Salvar data do compromisso
- [ ] Salvar horario do compromisso
- [ ] Salvar tipo de atendimento
- [ ] Salvar observacoes
- [ ] Registrar origem do agendamento como `chat/conversa`
- [ ] Exibir confirmacao no chat
- [ ] Garantir que nunca exista agendamento solto sem cadastro

### 6. Sem disponibilidade

- [ ] Informar indisponibilidade no chat
- [ ] Oferecer novas datas
- [ ] Oferecer novos horarios
- [ ] Permitir encaminhar para atendente humano
- [ ] Registrar evento no historico da conversa

### 7. Entidades e relacoes

- [ ] Formalizar suporte para `Contact`
- [ ] Formalizar suporte para `CustomerProfile`
- [ ] Formalizar suporte para `Conversation`
- [ ] Formalizar suporte para `Appointment` ou `ScheduleEvent`
- [ ] Formalizar suporte para `AvailabilitySlot`
- [ ] Formalizar suporte para `BotExecution`
- [ ] Garantir relacao `Conversation -> Contact`
- [ ] Garantir relacao `Appointment/ScheduleEvent -> Contact`
- [ ] Garantir que consulta de agenda possa partir de `BotExecution` dentro da conversa
- [ ] Garantir que tudo fique vinculado ao cadastro central

### 8. Painel contextual do chat

- [ ] Exibir status do cadastro
- [ ] Exibir ultimo agendamento
- [ ] Exibir proximo agendamento
- [ ] Exibir historico de consultas de agenda
- [ ] Exibir origem do agendamento
- [ ] Exibir se o fluxo atual e cadastro, agenda, atendimento ou cobranca

### 9. Permissoes e sobrevivencia dos vinculos

- [ ] Garantir que restricao de acesso ao modulo visual de Cadastros nao apague vinculos
- [ ] Garantir que agendamentos continuem existindo mesmo sem acesso visual a Cadastros
- [ ] Garantir que conversas continuem vinculadas ao contato central

### Checklist manual da Fase 2

- [ ] Contato novo cria cadastro sem duplicidade
- [ ] Contato existente reutiliza cadastro
- [ ] Chat consulta agenda real
- [ ] Chat cria agendamento vinculado ao cadastro
- [ ] Chat mostra indisponibilidade e oferece alternativas
- [ ] Cadastro e agenda ficam ligados ao mesmo contato central

## Fase 3 — Cadastros como base central do sistema

### 1. Arquitetura

- [ ] Transformar Cadastros em fonte unica de identidade do cliente
- [ ] Fazer Atendimento consumir cadastro central
- [ ] Fazer Recovery consumir cadastro central
- [ ] Fazer WhatsApp criar e atualizar cadastro central
- [ ] Remover conceito de "cliente solto do Recovery" como dono da identidade

### 2. Modelo de dados

- [ ] Definir campos centrais: nome, whatsapp, empresa, email, documento, origem, status, tags, observacoes
- [ ] Garantir `Conversation` vinculada ao cadastro central
- [ ] Garantir `DebtCase` vinculado ao cadastro central
- [ ] Garantir `PaymentHistory` vinculado ao `DebtCase`
- [ ] Garantir `BotExecution` vinculado a `Conversation`
- [ ] Garantir compatibilidade com dados atuais

### 3. Migracao e backfill

- [ ] Mapear dados espalhados entre `AtendimentoCustomer`, `HbxRecoveryCustomer` e conversa
- [ ] Definir estrategia de backfill sem perda de historico
- [ ] Migrar nomes e telefones para a base central
- [ ] Migrar vinculos de cobranca para a base central
- [ ] Migrar vinculos de conversa para a base central
- [ ] Documentar inconsistencias encontradas

### 4. Fluxos operacionais

- [ ] Atendimento nao manter identidade solta propria
- [ ] Recovery nao criar cliente isolado
- [ ] Tela de cobranca buscar cadastro antes de abrir caso
- [ ] Tela de cobranca criar cadastro so quando necessario
- [ ] Abrir `DebtCase` vinculado ao cadastro central

### 5. Importacao em lote

- [ ] Buscar cadastro por WhatsApp
- [ ] Buscar cadastro por documento
- [ ] Buscar cadastro por email
- [ ] Criar cadastro quando nao existir
- [ ] Criar `DebtCase` vinculado ao cadastro
- [ ] Gerar relatorio de encontrados
- [ ] Gerar relatorio de criados
- [ ] Gerar relatorio de duplicados
- [ ] Gerar relatorio de erros

### Checklist manual da Fase 3

- [ ] Contato existente no WhatsApp vincula no cadastro central
- [ ] Contato novo no WhatsApp cria cadastro central
- [ ] Abertura de cobranca com cliente existente reutiliza cadastro
- [ ] Abertura de cobranca com cliente novo cria cadastro e depois caso
- [ ] Importacao em lote vincula cadastro e divida corretamente
- [ ] Restricao da tela Cadastros nao apaga nomes nem vinculos nos outros modulos

## Fase 4 — Editor do bot e runtime unificados

### 1. Separacao de camadas

- [ ] Separar claramente `Flow Builder`
- [ ] Separar claramente `Flow Engine`
- [ ] Separar claramente `Chat Runtime / Inbox`
- [ ] Garantir que o runtime consuma o mesmo schema do builder
- [ ] Garantir que nao exista logica duplicada entre editor e execucao

### 2. Contextos explicitos do bot

- [ ] Exibir claramente `Fluxo de Cadastro`
- [ ] Exibir claramente `Fluxo de Atendimento`
- [ ] Exibir claramente `Fluxo de Recovery`
- [ ] Exibir claramente `Fluxo de Agenda`
- [ ] Deixar evidente no editor quando um node pertence a cada contexto

### 3. Fluxo de agenda no editor

- [ ] Permitir consultar disponibilidade
- [ ] Permitir oferecer opcoes ao cliente
- [ ] Permitir confirmar escolha
- [ ] Permitir criar agendamento
- [ ] Permitir remarcar
- [ ] Permitir cancelar quando a regra existir

### 4. Fluxo de recovery no editor

- [ ] Deixar claro o handoff para cobranca
- [ ] Deixar claro o fluxo iniciado por template Meta
- [ ] Deixar claro o menu principal do Recovery
- [ ] Deixar claro os eventos de pagamento e pausa humana

### 5. Runtime / Inbox

- [ ] Mostrar de qual node do fluxo cada mensagem veio
- [ ] Mostrar quando o bot pausou
- [ ] Mostrar quando transferiu para humano
- [ ] Mostrar quando encerrou
- [ ] Mostrar quando entrou em cadastro
- [ ] Mostrar quando entrou em agenda
- [ ] Mostrar quando entrou em Recovery

### Checklist manual da Fase 4

- [ ] Editor mostra claramente os contextos de fluxo
- [ ] Runtime exibe origem das mensagens pelo fluxo
- [ ] Runtime exibe pausa, transferencia e encerramento
- [ ] Recovery e Atendimento compartilham schema base

## Fase 5 — UI/UX premium sem reabrir estrutura

### 1. Workspace de conversas

- [ ] Redesenhar coluna de lista
- [ ] Redesenhar area central da conversa
- [ ] Redesenhar painel lateral com abas `Perfil`, `Atendimento`, `Recovery`
- [ ] Melhorar estados vazios
- [ ] Melhorar loading
- [ ] Melhorar hierarquia visual
- [ ] Melhorar acoes e badges

### 2. Cadastros como mini CRM

- [ ] Criar visual tabela + cards
- [ ] Criar busca forte
- [ ] Criar filtros por origem
- [ ] Criar filtros por status
- [ ] Criar filtros por cobranca/atendimento
- [ ] Criar timeline do cliente
- [ ] Mostrar ultimo contato
- [ ] Mostrar indicadores uteis

### 3. Nova experiencia de cobranca

- [ ] Criar wizard/stepper: buscar cadastro
- [ ] Criar wizard/stepper: criar cadastro se necessario
- [ ] Criar wizard/stepper: abrir cobranca
- [ ] Melhorar area de importacao em lote
- [ ] Melhorar feedback visual
- [ ] Remover aparencia de formulario duro

### 4. Bot Studio comercial

- [ ] Criar home do Bot Studio
- [ ] Criar cards de entrada
- [ ] Criar templates recomendados
- [ ] Criar ultimos fluxos
- [ ] Criar status do canal
- [ ] Criar modo simples por wizard/template
- [ ] Criar modo avancado para master

### 5. Template gallery

- [ ] Criar galeria de templates
- [ ] Criar template `Cobranca simples`
- [ ] Criar template `Cobranca com parcelamento`
- [ ] Criar template `Cobranca com link de pagamento`
- [ ] Criar template `Cadastro de cliente`
- [ ] Criar template `Triagem de atendimento`
- [ ] Criar template `Agendamento`
- [ ] Criar template `Confirmacao de pagamento`
- [ ] Criar template `Pos-atendimento com avaliacao`
- [ ] Criar template `Encaminhar para atendente humano`
- [ ] Criar template `Recuperar cliente sem resposta`

### 6. Preview realista de WhatsApp

- [ ] Exibir bolhas realistas
- [ ] Exibir botoes
- [ ] Exibir listas
- [ ] Exibir horarios
- [ ] Exibir status
- [ ] Exibir respostas do cliente
- [ ] Exibir mensagens do bot

### 7. Design system interno

- [ ] Consolidar tokens de espacamento
- [ ] Consolidar raios de borda
- [ ] Consolidar sombras
- [ ] Consolidar estados
- [ ] Consolidar cards
- [ ] Consolidar headers
- [ ] Consolidar paineis
- [ ] Consolidar abas
- [ ] Consolidar tabelas
- [ ] Consolidar formularios
- [ ] Consolidar toasts
- [ ] Consolidar modais
- [ ] Consolidar padrao de popup
- [ ] Consolidar padrao de janela flutuante

### Checklist manual da Fase 5

- [ ] Workspace unificado parece outra geracao do produto
- [ ] Cadastros parece base central valiosa
- [ ] Cobranca parece operacao inteligente
- [ ] Bot Studio fica claro e vendavel
- [ ] Templates ficam visiveis e usaveis
- [ ] Preview WhatsApp fica convincente
- [ ] Nada estrutural das fases anteriores foi desfeito

## Testes tecnicos e regressao

- [ ] Testar empresa com Recovery habilitado
- [ ] Testar empresa sem Recovery habilitado
- [ ] Testar conversa comum
- [ ] Testar conversa com cobranca
- [ ] Testar conversa bloqueada
- [ ] Testar conversa encerrada
- [ ] Testar historico de pagamento
- [ ] Testar template Meta
- [ ] Testar editor do bot
- [ ] Testar agenda via chat
- [ ] Testar cadastro via chat
- [ ] Testar importacao em lote
- [ ] Testar permissoes de Cadastros sem perder nomes no restante do sistema
- [ ] Testar persistencia de layout
- [ ] Testar publish/build sem regressao

## Entregas obrigatorias por fase

### Ao finalizar cada fase, sempre entregar:

- [ ] Resumo do que mudou
- [ ] Arquivos principais alterados
- [ ] Riscos de regressao
- [ ] Checklist manual de teste
- [ ] O que ficou para a proxima fase

## Ordem recomendada de execucao

- [ ] Rodar Fase 1
- [ ] Testar e corrigir Fase 1
- [ ] Rodar Fase 2
- [ ] Testar e corrigir Fase 2
- [ ] Rodar Fase 3
- [ ] Testar e corrigir Fase 3
- [ ] Rodar Fase 4
- [ ] Testar e corrigir Fase 4
- [ ] Rodar Fase 5
- [ ] Testar e corrigir Fase 5

## Observacoes de disciplina

- [ ] Nao misturar objetivos da fase atual com a proxima
- [ ] Nao declarar concluido sem teste
- [ ] Nao sacrificar funcionalidade unica do Recovery para simplificar fusao
- [ ] Nao deixar lixo legado sem decisao explicita
- [ ] Nao reabrir decisoes estruturais aprovadas quando estivermos so na fase visual
