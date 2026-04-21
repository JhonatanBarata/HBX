# TODO Implementado

Auditoria: 2026-04-21.

Este arquivo foi arquivado porque os itens abaixo foram concluidos no codigo. `docs/todo` deve manter apenas pendencias acionaveis ainda abertas.

## Itens concluidos

- Remocao do papel `GERENTE` dos fluxos ativos de backend/frontend.
- Signup publico simplificado para nome da empresa/operacao, e-mail e senha.
- Usuario inicial de trial criado como `ADMIN`.
- `trialModuleSelection` publico/backend restrito a `vendas`.
- Webscraping negado por padrao para `USER` sem permissao explicita.
- Billing por assento extra ativo adicionado ao calculo financeiro e aos resumos de UI.
- Dialogos nativos `alert`/`confirm`/`prompt` removidos dos arquivos mapeados no TODO.

## Pontos de verificacao no codigo

- Auth/signup: `backend/src/auth/auth.service.ts`.
- DTO de signup: `backend/src/auth/dto/auth.dto.ts`.
- Roles de usuarios: `backend/src/users/users.controller.ts` e `backend/src/users/users.service.ts`.
- Permissoes por modulo: `backend/src/modules/modules.service.ts`.
- Financeiro/assentos: `backend/src/financeiro/financeiro.service.ts` e `frontend/src/app/dashboard/financeiro/page.client.tsx`.
- UI sem dialogo nativo: `frontend/src/components/HbxConfirmDialog.tsx`.
