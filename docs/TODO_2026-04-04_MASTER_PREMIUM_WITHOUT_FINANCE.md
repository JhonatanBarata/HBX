# PRIORIDADE — 2026-04-04 — Liberar premium pelo MASTER sem gerar financeiro

## Regra desejada

Quando o trial acabar e a conta ficar com 0 dias restantes, o acesso deve ficar bloqueado.

Leitura esperada:

- 0 dias sem acesso

## Nova necessidade operacional

O MASTER precisa ter uma opção para liberar premium para conhecidos sem gerar financeiro.

## Observação importante

Isso cria um furo consciente de auditoria, porque o desenho ideal do sistema seria:

- todo cliente ativo deve estar como pagante
- ou em trial

Mesmo assim, a decisão é implantar essa possibilidade operacional no MASTER.

## Direção desejada

Criar uma ação clara no MASTER, separada do financeiro real, para algo como:

- liberar premium manualmente
- acesso operacional sem cobrança
- acesso administrativo excepcional

## Regras esperadas

- a conta fica ativa
- os módulos podem operar normalmente
- o financeiro não gera cobrança automaticamente por essa ação
- o estado precisa ficar muito claro no MASTER
- não pode ficar confundido com pago real
- não pode ficar confundido com trial

## Sugestão de leitura

Criar um estado visual/operacional próprio, por exemplo:

- premium manual
- liberado manualmente
- acesso administrativo

## Revisar amanhã

- como representar isso sem confundir auditoria
- como evitar mistura com pago real
- como deixar histórico claro no MASTER
- como exibir isso no Financeiro e no cadastro da empresa

## Resultado esperado

- 0 dias = sem acesso
- MASTER consegue liberar premium sem financeiro
- exceção operacional fica clara
- menos confusão entre trial, pago e liberação manual
