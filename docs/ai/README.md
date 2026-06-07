# HBX AI Navigation

Esta pasta e a camada de contexto para agentes entenderem o HBX antes de editar codigo.

Leia nesta ordem:

1. `AI_CONTEXT.md` - produto, stack, fluxo principal e riscos.
2. `PRODUCT_INVARIANTS.md` - regras que nao podem ser quebradas.
3. `REPO_MAP.md` - mapa pasta por pasta do repositorio.
4. `AI_ENTRYPOINTS.md` - por onde comecar em cada tipo de tarefa.
5. `AI_COMMANDS.md` - comandos de exploracao e validacao.
6. `AGENT_INSTRUCTIONS.md` - copia documental das instrucoes ativas de agentes.
7. `SKILL_REFERENCE.md` - referencia documental da skill HBX usada por Codex.

Regra de uso: antes de uma mudanca, leia o bloco desta pasta que corresponde ao modulo alterado e depois abra os arquivos reais citados. Esta pasta nao substitui o codigo; ela reduz a chance de o agente abrir arquivos aleatorios e perder regras de negocio.
