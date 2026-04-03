# PRIORIDADE — 2026-04-04 — Remover dashboard inicial e abrir no primeiro módulo válido

## Problema

A tela inicial atual está sendo tratada como dashboard, mas não funciona como dashboard real.

Além disso, a entrada do sistema não está mais respeitando corretamente o primeiro módulo disponível do cliente.

## Regra desejada

Remover o dashboard inicial como ponto de entrada padrão.

Em vez disso, ao entrar no sistema, o usuário deve ser levado direto para o primeiro módulo realmente disponível para a empresa.

## Comportamento esperado

### Se existir módulo disponível

- abrir diretamente no primeiro módulo válido
- respeitar os módulos realmente liberados para a empresa
- evitar tela intermediária inútil

### Se não existir módulo disponível

abrir uma tela clara informando o motivo, por exemplo:

- financeiro pendente
- trial encerrado
- módulo inativo
- motor ausente
- acesso não liberado

## Caso citado

Diego e Abner deveriam ter apenas o Website cadastrado.

Logo, ao entrar, o sistema deveria abrir diretamente no Website.

Depois da última refatoração, essa abertura automática deixou de funcionar.

Hoje, nenhum outro módulo deles está ativo, então a entrada atual está errada.

## Revisar amanhã

- restaurar abertura automática do primeiro módulo válido
- validar casos como Diego e Abner
- impedir entrada em tela genérica sem sentido
- mostrar motivo claro quando não houver módulo operacional disponível

## Observação estrutural

Parte da confusão vem do fato de itens que não são módulos estarem sendo tratados como módulos.

Exemplos:

- cadastros
- financeiro
- gerencial

Esses itens precisam ser revistos como guias estruturais do sistema, e não como módulos comerciais/operacionais comuns.

## Resultado esperado

- sem dashboard inicial falso
- entrada direta no módulo realmente disponível
- fallback claro quando não houver módulo disponível
- menos confusão entre módulo e guia estrutural
- onboarding mais coerente com a realidade da empresa
