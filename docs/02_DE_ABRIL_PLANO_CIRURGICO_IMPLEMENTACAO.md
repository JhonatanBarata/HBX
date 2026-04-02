# 02 de abril — plano cirúrgico de implementação

## Objetivo
Preparar o HBX para empresas novas com onboarding forte, free trial claro, CRM/Vendas útil desde o primeiro dia, front matador e visão real no MASTER.

## Diagnóstico do repo
### Já existe
- Base de trial e billing na model Company
- Gestão de trial e status no ModulesService
- Histórico de webscraping no banco
- Signup que cria empresa + usuário
- MailService com SMTP configurável
- Estrutura oficial de WhatsApp via token, phoneNumberId, WABA e status

### Falhas atuais encontradas
1. Signup ainda autentica direto após cadastro, sem confirmação de e-mail antes da liberação.
2. O remetente final jhonatan@hbxsystem.com.br ainda não está amarrado como fluxo real.
3. O histórico de webscraping existe, mas a visualização clara de consumo no MASTER não foi confirmada como painel pronto.
4. O HBX está preparado para vínculo oficial de WhatsApp, não para vínculo rápido temporário por QR.
5. O produto ainda está mais em módulos do que em jornada clara para empresa nova.
6. O front ainda precisa virar ferramenta de impacto comercial imediato.

## Ordem de implementação

### Fase 1 — cadastro, e-mail e trial
Implementar:
- novo cadastro com nome da empresa, nome, e-mail, usuário e senha
- confirmação de e-mail antes da ativação final
- ativação do trial só após confirmação
- trial de 30 dias com:
  - paymentStatus = TRIAL
  - subscriptionStatus = trialing
  - premiumAccess = true
  - trialStartsAt = now
  - trialEndsAt = now + 30 dias
  - isActive = true
- configurar MAIL_FROM com jhonatan@hbxsystem.com.br

### Fase 2 — plano free e limites
Regra do free trial:
- liberar módulo Vendas/CRM
- liberar agenda viva, cards, comentários e follow-up
- liberar webscraping apenas 1 vez por dia

Implementar:
- checagem do uso diário por empresa antes de rodar scraping
- se free/trial e já usou 1 vez no dia, bloquear
- se pago, liberar sem esse limite

### Fase 3 — visão MASTER
Implementar painel MASTER com:
- empresas novas
- e-mail confirmado ou não
- trial iniciado em
- trial termina em
- dias restantes
- uso diário do webscraping
- últimas buscas
- usuário que executou
- quantidade de resultados
- alertas de uso excessivo
- alertas de empresa que entrou e não ativou fluxo

### Fase 4 — primeiro login premium
Implementar tela de boas-vindas mostrando:
- que está no plano free trial
- dias restantes
- o que está liberado
- o que é premium
- CTA principal para entrar em Vendas/CRM
- visual forte e premium
- gráfico bonito de ativação / trial / próximos passos

### Fase 5 — vínculo WhatsApp em dois modos
Implementar tela com dois caminhos:

#### Modo rápido / temporário
- fluxo voltado a teste rápido
- visualmente marcado como temporário
- com aviso de limitações

#### Modo oficial / Meta
- fluxo oficial
- status oficial
- pronto para automação séria e escala

Regra:
- UX pode mostrar os dois juntos
- arquitetura não deve tratar os dois como a mesma integração

### Fase 6 — módulo Vendas/CRM agenda viva
Implementar como destino principal do usuário novo:
- agenda do dia
- cards
- leads do webscraping
- adicionar lead manual
- registrar contato
- comentar
- agendar retorno
- esconder encerrados da agenda ativa
- memória de número já trabalhado

### Fase 7 — FRONT MATADOR
Aplicar nas telas críticas:
- cards fortes
- destaque de prioridade
- atraso visível
- badges claros
- agenda viva
- timeline
- ações rápidas
- menos cara de admin template
- mais clareza operacional

## Itens que não podem passar
- não lançar trial sem visão MASTER
- não liberar scraping sem limite no free
- não manter signup sem confirmação de e-mail
- não jogar usuário novo em tela fria
- não misturar vínculo rápido com vínculo oficial como se fossem iguais
- não deixar o CRM nascer feio

## Sprint sugerida
1. Signup + confirmação de e-mail + trial de 30 dias
2. Limite de webscraping no free + painel MASTER de uso
3. Primeiro login premium
4. Vendas/CRM agenda viva
5. Tela de vínculo WhatsApp com dois modos
6. FRONT MATADOR nas telas principais

## Direção final
O HBX precisa sair de um conjunto de módulos e virar um produto com:
- onboarding
- ativação
- controle pelo MASTER
- operação comercial clara
- front forte

## Prompt-base para Codex / Copilot
Executar uma reestruturação cirúrgica do HBX para empresas novas. Criar onboarding com cadastro, confirmação de e-mail antes da ativação, free trial de 30 dias, liberação inicial do módulo Vendas/CRM, webscraping limitado a 1 uso por dia no plano free, painel MASTER para visualizar onboarding, trial e consumo do webscraping, primeiro login premium com indicação clara do plano e dias restantes, módulo Vendas/CRM agenda viva como destino principal do usuário novo, e tela de vínculo WhatsApp com dois modos distintos: rápido/temporário e oficial/Meta. Tratar o FRONT MATADOR como parte central da entrega.
