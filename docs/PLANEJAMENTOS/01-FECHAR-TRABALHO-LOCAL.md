# 01 — FECHAR O TRABALHO LOCAL INTERROMPIDO

## Objetivo

Consolidar o que já está na árvore sem adicionar funcionalidade nova. Esta rodada contém indicação por créditos, portal público de pedidos, ativação guiada, perfis Vendedor/Entregador/Ambos, atribuição de entregas, comprovantes e mudanças no app Android.

## Ponto de partida confirmado

- Backend compila.
- 87 testes direcionados passam.
- Frontend compila para produção.
- `check-pele` reprova por 3 estilos inline acima do teto.
- Android debug compila.
- Há migrations e arquivos novos ainda não rastreados.

## Microetapas

- [ ] 1. Gerar inventário do diff por frente e marcar arquivos compartilhados.
  - Não editar.
  - Separar: S5 indicação, S6 pedido público, ativação/OOBE, operação de entregador, comprovantes, Android.
  - Identificar qualquer arquivo alterado que não pertença a essas frentes.

- [ ] 2. Revisar somente autorização e isolamento do backend.
  - Conferir `operational-capabilities`, runtime de policy, rotas de logística e filtros por `companyId`/`entregadorId`.
  - Validar fail-closed quando a policy não puder ser lida.
  - Não refatorar serviços fora do fluxo novo.

- [ ] 3. Revisar somente persistência e migrations.
  - Validar schema versus migrations de indicação, pedido público e operação/comprovantes.
  - Conferir índices, FKs, idempotência e compatibilidade com dados existentes.
  - Rodar `prisma validate`; não aplicar migration em produção.

- [ ] 4. Corrigir o gate visual atual.
  - Remover no mínimo 3 estilos inline da área tocada.
  - Centralizar em `frontend/src/app/hbx-theme/`.
  - Rodar `npm run lint` até ficar verde.

- [ ] 5. Revisar o frontend operacional.
  - Vendedor não vê Entregas sem concessão.
  - Entregador não vê Vendas/Atendimento sem concessão.
  - Ambos escolhe workspace sem ganhar permissão nova.
  - Admin e USERMASTER preservam acesso esperado.

- [ ] 6. Revisar o Android sem ampliar escopo.
  - Compartilhamento de comprovante, FileProvider, permissões, offline e service worker.
  - Confirmar que nenhum segredo ou APK de backup será commitado por acidente.

- [ ] 7. Rodar o gate local final.
  - Backend: build, lint de tenant e testes das frentes.
  - Frontend: lint e build.
  - Android: debug e release, se a assinatura local estiver disponível.
  - `git diff --check`.

- [ ] 8. Consolidar em commits locais pequenos.
  - Usar pathspec explícito.
  - Não publicar.
  - Não incluir APKs de backup ou alterações externas à frente.

## Pronto quando

Árvore compreensível, lint/build/testes verdes, migrations pareadas com o código, nenhum arquivo acidental e commits locais por assunto.

