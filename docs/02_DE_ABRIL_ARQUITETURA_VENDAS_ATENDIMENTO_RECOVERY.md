# 02 de abril — arquitetura de módulos

## Decisão principal
**Criar o módulo Vendas.**

Não transformar Atendimento em CRM de vendas.
Não misturar prospecção, suporte e cobrança dentro do mesmo módulo.

## Regra-mãe do HBX
Os módulos devem ser divididos pelo objetivo da interação:

- **Vendas** = converter
- **Atendimento** = resolver
- **Recovery** = receber

Essa divisão organiza o produto e evita um módulo Frankenstein.

## Estrutura recomendada do produto
### 1. Vendas
Responsável por prospecção e pipeline comercial.

Funções:
- leads vindos do webscraping
- cadastro manual de empresas
- cards arrastáveis
- follow-up
- agenda comercial
- comentários
- histórico de contato
- próxima ação
- status comercial

### 2. Atendimento
Responsável por conversa ativa, suporte, recepção e encaminhamento.

Funções:
- inbox / chat
- cadastro de clientes
- bot de atendimento
- agenda de atendimento
- histórico de conversa
- encaminhamento para humano
- recepção inicial do cliente

### 3. Recovery
Responsável por cobrança e negociação financeira.

Funções:
- pendências financeiras
- negociação
- envio de cobrança
- status de pagamento
- follow-up financeiro
- acordos
- bot de cobrança

## Onde o webscraping entra
**Webscraping deve alimentar Vendas.**

Motivo:
webscraping gera oportunidade, não suporte.
Lead raspado da internet nasce como prospecção.
Portanto, a origem correta é o módulo **Vendas**.

## Núcleo unificado do HBX
O centro do sistema não deve ser o módulo.
O centro deve ser o **perfil do contato / empresa**.

Esse perfil precisa ser único e compartilhado entre os módulos.

### Dados-base do perfil
- nome da empresa
- telefone
- cidade
- site
- origem
- observações
- responsável
- timeline geral
- tags
- status geral

## Como os módulos se conectam
### Fluxo ideal
1. Empresa entra por webscraping
2. Nasce em **Vendas** como lead
3. Se responde ou pede informações, pode gerar interação no **Atendimento**
4. Se vira cliente e depois fica inadimplente, pode ir para **Recovery**

## Regra de ouro
O mesmo contato pode existir em contextos diferentes sem ser duplicado:
- contexto comercial
- contexto de atendimento
- contexto financeiro

## Menu principal sugerido
- **Vendas**
- **Atendimento**
- **Recovery**
- **Master**

## Submenus sugeridos
### Vendas
- Pipeline
- Leads
- Agenda
- Timeline
- Webscraping

### Atendimento
- Conversas
- Clientes
- Agenda
- Bot

### Recovery
- Pendências
- Conversas
- Acordos
- Pagamentos
- Bot

## Regra visual
Os 3 módulos devem parecer parte da mesma família.

Compartilhar:
- mesma linguagem visual
- mesma base de componentes
- mesmo painel lateral
- mesma timeline
- mesma agenda
- mesmo padrão de cards
- mesmo command palette

Mas cada módulo deve ter personalidade própria:
- **Vendas** = energia comercial, pipeline, follow-up, ritmo
- **Atendimento** = clareza, organização, resposta, conversa ativa
- **Recovery** = prioridade, pressão controlada, pendência financeira

## Estrutura recomendada para Vendas
### Objetivo
Fazer o HBX operar como CRM comercial de prospecção.

### Entrada dos leads
- webscraping
- manual
- indicação
- formulário

### Status do pipeline comercial
- Novo
- Tentar contato
- Falou
- Quem sabe
- Retorno agendado
- Quente
- Ganhou
- Perdeu

### Ações por card
- ligar
- abrir WhatsApp
- registrar resultado
- comentar
- agendar retorno
- mover status

### Views recomendadas
- Kanban
- Lista
- Agenda
- Timeline

## Estrutura recomendada para Atendimento
### Objetivo
Resolver e organizar conversas de clientes ativos.

### Status sugeridos
- Aberto
- Em atendimento
- Aguardando cliente
- Resolvido
- Encerrado

## Estrutura recomendada para Recovery
### Objetivo
Recuperar pagamento com histórico claro e operação controlada.

### Status sugeridos
- Pendente
- Em negociação
- Link enviado
- Pago
- Sem retorno
- Encerrado

## Decisão brutal
**Não editar o conceito de Atendimento para virar CRM.**

O caminho certo é:
- reaproveitar base do Atendimento
- criar um novo módulo **Vendas**
- manter Atendimento e Recovery com papéis claros

## Reaproveitamento inteligente do que já existe
O novo módulo Vendas pode herdar muita base do Atendimento:
- cards
- agenda
- timeline
- cadastro de contatos
- observações
- histórico
- componentes visuais
- integração com WhatsApp

Mas com outra lógica:

- Atendimento pergunta: **quem está falando comigo agora?**
- Vendas pergunta: **quem eu preciso atacar hoje?**

## Frase de posicionamento interno
**Vendas gera cliente.**
**Atendimento sustenta cliente.**
**Recovery recupera cliente.**

## Base de referência para a decisão
Esta arquitetura se inspira em padrões de produtos fortes:
- HubSpot separa pipeline de vendas e pipelines de serviço, mostrando que vendas e atendimento podem compartilhar base sem virar o mesmo fluxo.
- Pipedrive é fortemente orientado a pipeline visual e atividade comercial.
- Linear reforça a importância de triagem, views claras e foco operacional por contexto.

## Prompt-base para Codex / Copilot
Criar no HBX um novo módulo **Vendas**, separado de **Atendimento** e **Recovery**, usando a lógica de arquitetura por objetivo da interação. Vendas deve cuidar de prospecção, pipeline comercial, agenda e follow-up, com cards arrastáveis e views como Kanban, Lista, Agenda e Timeline. Atendimento deve continuar focado em conversa ativa e suporte. Recovery deve continuar focado em cobrança. O núcleo do sistema deve ser o perfil único do contato/empresa, compartilhado entre os três contextos. Reaproveitar componentes, estrutura visual e base de dados do Atendimento sempre que possível, mas sem misturar os conceitos dos módulos.
