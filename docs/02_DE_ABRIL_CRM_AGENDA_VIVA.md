# 02 de abril — CRM agenda viva

## Pergunta central
Estou desviando?

## Resposta brutal
**Não.**

Você só vai desviar se tentar construir tudo de uma vez.

O que foi desenhado aqui ainda está totalmente dentro do foco do HBX:
- colocar o sistema para uso real
- transformar webscraping em ação comercial
- organizar follow-up
- criar memória de contato
- testar o próprio HBX na prática

Isso é evolução direta do produto.

## O que seria desvio de verdade
- inventar ERP agora
- criar módulo financeiro completo
- montar discador complexo
- refazer tudo do zero
- virar HubSpot completo
- gastar dias em efeitos visuais antes do fluxo funcionar

## Recorte correto
O foco deve ser um **CRM com agenda operacional viva**.

Não é um CRM genérico gigantesco.
Não é só uma tabela de leads.
Não é só pipeline bonito.

É um fluxo real:

**Webscraping → transferir para CRM → agenda do dia → contato → retorno → memória → encerramento**

## Ideia central
Quando o webscraping terminar, os números encontrados devem poder ser enviados para o CRM.
Esse CRM precisa ter cara de agenda operacional.

### Regras principais
1. O webscraping encontra empresas e números
2. O usuário pode clicar em **transferir para CRM**
3. O card entra automaticamente na **agenda do dia**
4. O card pode receber contato, comentário, observação e agendamento
5. Quando o card for encerrado/finalizado, ele some da agenda ativa
6. Se esse mesmo número aparecer de novo em novo scraping, o sistema deve avisar que esse contato já foi trabalhado

## Memória de contato
Essa é uma das partes mais fortes da ideia.

Se o número reaparecer, o HBX não pode tratar como lead virgem.
Tem que mostrar algo como:
- já contatado em data anterior
- já encerrado
- sem interesse
- pediu retorno
- já existe no CRM
- último responsável

### Regra
**O scraping gera oportunidade. O CRM tem memória.**

## Agenda viva
O CRM deve parecer uma agenda comercial viva, não uma planilha morta.

### Blocos sugeridos
- Hoje
- Atrasados
- Amanhã
- Retornos agendados
- Encerrados recentes

## Card ideal
Cada card deve ter:
- nome da empresa
- telefone
- cidade
- origem
- status
- prioridade
- próxima ação
- data do retorno
- observação curta
- selo de já contatado / reincidente / finalizado anteriormente

## Encerramento
Quando marcar:
- encerrado
- sem interesse
- finalizado

O card:
- sai da agenda ativa
- vai para histórico/encerrados
- continua existindo para memória futura

## Reaparecimento de número já conhecido
Se um número já existente voltar em novo scraping:
- não criar lead cego automaticamente
- avisar que já existe histórico
- permitir reabrir card antigo
- permitir atualizar card atual
- permitir ignorar duplicado

## Sem ação = atraso
Se o card entrar na agenda do dia e não receber ação:
- mover para o próximo dia
- marcar como pendente
- destacar atraso visualmente

### Prioridade visual sugerida
- hoje = normal
- 1 dia atrasado = amarelo forte
- 2+ dias atrasado = vermelho
- muito atrasado = topo da agenda

## Link com agenda futura
Se o usuário marcar algo como:
- ligar amanhã
- retornar em 3 dias
- mandar mensagem sexta
- lembrar depois

O sistema deve:
- criar compromisso na agenda futura
- mostrar esse compromisso no dia correto
- avisar vencimento/atraso se não for tratado

## Possibilidade de bot
Se existir agendamento futuro de contato, o HBX pode permitir duas rotas:

### Rota manual
- entra na agenda
- operador liga ou chama manualmente

### Rota automática
- entra agendamento
- no dia/hora marcada, o bot pode disparar template da Meta
- registrar isso na timeline
- alterar status do card

## Regra importante sobre Meta
A Meta não é obrigatória para o CRM funcionar.

O CRM precisa funcionar mesmo sem Meta ativa.
A Meta entra como reforço para follow-up automático futuro.

## Regra de foco para amanhã
Amanhã, o HBX precisa fazer só o necessário:
1. webscraping encontrar leads
2. botão **transferir para CRM**
3. card entrar na **agenda do dia**
4. registrar contato
5. agendar retorno
6. esconder encerrados da agenda ativa
7. lembrar quando o número já apareceu antes

**Acabou.**

Isso já é forte o suficiente.

## Definição final
Você não está desviando.
Você está finalmente encostando em algo muito útil:

**um CRM agenda viva para prospecção real.**

## Prompt-base para Codex / Copilot
Implementar no HBX o conceito de **CRM agenda viva** dentro do módulo Vendas/CRM. O fluxo deve começar no webscraping, com opção de transferir leads encontrados para o CRM. Ao entrar no CRM, cada lead deve virar um card e cair automaticamente na agenda do dia. O sistema deve permitir registrar contato, comentário, observação, próxima ação e retorno agendado. Cards encerrados devem sumir da agenda ativa, mas continuar registrados no histórico. Se o mesmo número aparecer novamente em novo scraping, o sistema deve reconhecer que já existe histórico de contato e mostrar isso claramente. Também preparar a lógica para follow-up futuro manual ou automático via bot/template da Meta.
