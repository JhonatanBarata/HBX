# HBX Rules

Esta pasta centraliza regras permanentes do sistema HBX.

Objetivo:
- criar padrao tecnico e visual entre modulos;
- reduzir retrabalho entre Codex, ChatGPT, Copilot e futuras inteligencias;
- evitar comportamento inconsistente conforme o sistema cresce;
- transformar decisoes de UX/UI e engenharia em regras fixas, e nao em improviso por tarefa.

## Como usar

Toda implementacao nova, refatoracao, correcao visual ou ajuste de fluxo deve consultar estas regras antes de alterar frontend, backend ou comportamento do sistema.

## Ordem de prioridade

1. Regras globais do sistema;
2. Regras de UI/UX compartilhadas;
3. Regras especificas por modulo;
4. Ajustes locais de tela.

## Principio central

No HBX, comportamento compartilhado nao deve ser decidido tela por tela.
Tudo que se repete entre modulos deve virar padrao documentado nesta pasta.

## Regras iniciais

- [RULE_UI_UX_GLOBAL.md](./RULE_UI_UX_GLOBAL.md)
- [RULE_LOGIN.md](./RULE_LOGIN.md)
