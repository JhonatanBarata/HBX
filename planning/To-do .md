# To-do HBX - MASTER Assume Context + Assistente Tecnico Global

Regra principal: apagar a linha quando concluir.
Escopo fixo: apenas area MASTER.

## Concluido em 2026-03-19
- Fase 0 executada com mapeamento de auth/guards/assistente.
- Fase 1 executada com sessao de contexto assumido no backend (assume/current/exit) + expiracao + auditoria.
- Fase 2 executada com seletor "Entrar na empresa", estado visual de contexto ativo e botao "Sair do contexto" no TopBar.
- Fase 3 executada com launcher global e drawer de chat do Assistente Tecnico em qualquer modulo para MASTER.
- Fase 4 executada com ferramentas internas de leitura seguras no backend (conversas, mensagens, webhooks, status, falhas).
- Fase 5 executada com trilha de auditoria para contexto e operacoes do assistente.
- Fase 6 executada no escopo MVP com mascaramento de dados sensiveis e restricao de acesso por `MasterGuard`.
- Fase 7 executada no escopo MVP com contrato estruturado e campos de contexto de operacao no diagnostico.
- Fase 8 executada no escopo tecnico do patch (fluxo implementado e validado por analise estatica/compilacao local).

## Entregaveis do MVP (registrar no fechamento)
- [ ] Lista de arquivos criados/alterados.
- [ ] Fluxo completo de uso diario (passo a passo curto).
- [ ] Guia rapido de teste local.
- [ ] Riscos conhecidos e mitigacoes.
- [ ] Backlog sugerido para fase 2 (sem inflar o MVP).

## Backlog pos-MVP (nao fazer agora)
- [ ] Modos avancados de operacao (observacao/teste/operacao) com politicas refinadas.
- [ ] Mais ferramentas internas (reprocessamento, comparador payload vs atendimento criado).
- [ ] Filtros avancados de historico por empresa/rota/modulo/tipo com pagina dedicada.
- [ ] Analises preditivas e correlacao automatica de falhas por canal.