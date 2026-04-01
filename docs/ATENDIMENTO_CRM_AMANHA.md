# Atendimento CRM — plano de amanhã

## Objetivo
Usar o próprio HBX como CRM operacional de prospecção, começando com leads herdados do webscraping.

## Escopo do MVP
Construir dentro do módulo **Atendimento CRM** uma visão simples, rápida e comercial para uso diário.

### Fonte inicial dos leads
- Herdar até 20 empresas vindas do webscraping
- Criar/importar lead no CRM com origem `webscraping`

### Estrutura do card do lead
- Nome da empresa
- Telefone
- Cidade
- Site
- Origem
- Responsável
- Último contato
- Próxima ação
- Data do retorno agendado
- Observação rápida
- Tem WhatsApp?
- Tem bot?
- Automação percebida: nenhuma / leve / forte
- Chance de já usar sistema: baixa / média / alta

### Status do lead
- Novo
- Ligado
- WhatsApp enviado
- Não atendeu
- Ligar depois
- Quem sabe
- Sem interesse
- Tem bot
- Cliente potencial
- Retorno agendado

### Ações rápidas por card
- Ligar
- Abrir WhatsApp
- Registrar resultado
- Comentar
- Agendar retorno
- Mudar status

### Agenda do dia
Separar automaticamente:
- Ligar hoje
- Retornos prometidos
- Quem pediu para falar depois
- Quem caiu em "quem sabe"
- Quem não atendeu ontem

### Timeline do lead
Salvar histórico simples por item:
- ligação realizada
- WhatsApp enviado
- respondeu / não respondeu
- pediu retorno
- sem interesse
- comentário manual

## Regras importantes
- Não tentar virar HubSpot agora
- Não criar CRM genérico gigante
- Foco total em prospecção + follow-up + organização comercial
- UI muito intuitiva, visual em cards, leitura rápida

## Integração com agenda
Permitir agendar data/hora para retorno e exibir isso na agenda do dia.

## Observação sobre Meta / WhatsApp
O CRM deve funcionar mesmo sem integração Meta ativa.
Meta fica como canal oficial opcional.
O CRM precisa permitir:
- registrar ligação manual
- registrar WhatsApp manual
- acompanhar retorno

## Resultado esperado
Amanhã o HBX já deve permitir:
1. receber 20 leads do webscraping
2. listar esses leads em cards organizados
3. registrar contato por ligação/WhatsApp
4. salvar resposta e observações
5. agendar retorno
6. mostrar agenda do dia com clareza

## Prompt-base para Codex / Copilot
Implementar no HBX um novo fluxo **Atendimento CRM** orientado a prospecção comercial, usando leads herdados do webscraping. Criar interface extremamente intuitiva baseada em cards, com ações rápidas de contato, registro de resultado, observações e agendamento de retorno. O foco é operação diária de prospecção, não um CRM genérico completo. Priorizar leitura rápida, estados claros, agenda do dia e timeline simples por lead.
