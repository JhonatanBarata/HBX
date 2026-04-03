# PRIORIDADE — 2026-04-04 — Auditoria junto com evolução administrativa

## Regra

A auditoria precisa caminhar junto com a evolução do MASTER e dos poderes administrativos do sistema.

## Contexto

O MASTER já permite e deve permitir ações fortes de operação, como:

- liberar acesso
- bloquear acesso
- marcar pago
- estender trial
- encerrar trial
- criar bypass operacional
- liberar premium manualmente

Isso é correto para a operação real.

## Problema

Quanto mais poder administrativo existir, mais necessário fica deixar rastro claro.

Sem auditoria, o sistema corre risco de virar bagunça operacional.

## Direção desejada

Toda ação administrativa relevante precisa registrar:

- quem fez
- quando fez
- em qual empresa fez
- qual ação executou
- estado anterior
- estado novo
- motivo ou observação, quando fizer sentido

## Exemplos de ações que devem ter auditoria

- marcar pago
- lançar pagamento manual
- liberar premium sem financeiro
- bloquear empresa
- reativar empresa
- estender trial
- encerrar trial
- trocar status operacional
- alterar módulos liberados
- trocar motor/token/meta/whatsapp quando for ação crítica

## Objetivo

Garantir que a evolução do sistema não destrua a rastreabilidade.

## Resultado esperado

- mais poder administrativo
- mais clareza
- mais segurança operacional
- mais rastreabilidade
- menos bagunça
- auditoria andando junto com a evolução
