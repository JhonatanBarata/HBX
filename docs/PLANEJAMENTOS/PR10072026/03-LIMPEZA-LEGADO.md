# W3 — LIMPEZA HARD DO FRONT + DEMOLIÇÃO DO FLUXO DE PLANO (fase 2 — roda DEPOIS de W1/W2)

Decisões do dono (10/07, chat): limpeza hard de legados; modelo crédito vira VIA ÚNICA no front
(demolir de vez o fluxo de plano/trial: register com seleção de plano, "Começar teste grátis",
bloqueio "Ative seu plano HBX"). Cadastro público continua LEVE (e-mail+telefone→50 créditos, fluxo C1)
— demolição não pode adicionar atrito.

## Regras duras
- Trabalhar DIRETO na branch atual. NÃO criar branch/worktree. NÃO commitar. NÃO publicar.
- 5 Leis do DS; check-pele verde. UI copy mínima.
- Este worker roda na árvore JÁ EDITADA por W1 (porta única/login) e W2 (OOBE/casca) — reler o estado
  atual dos arquivos antes de cada edição; não desfazer trabalho deles.
- Remoção de CSS: cirúrgica por seletor (grep de uso em TSX antes), nunca por range cego.
- Ao final: `cd frontend && npm run typecheck` + check-pele verdes; `cd backend && npm run typecheck`
  se tocar backend.

## Catálogo já levantado (evidência confirmada por grep em 10/07)
### Deletar (0 referências)
- `components/hbx/plan-card.tsx`, `plan-detail-card.tsx`, `legal-modal.tsx`, `implantacao-contato.tsx`
  (0 importadores cada; NÃO remover CSS `.legal__*` — páginas /termos e /politicas usam; classes `bv-*`
  são compartilhadas com bloqueio-gate).
- `frontend/src/lib/vendas-agenda.ts` (helpers do mobile VELHO, 0 imports).
- `frontend/src/app/dev/checkout/` (harness do checkout de plano aposentado).
- Assets órfãos em `frontend/public/`: `ANTIGA ÑUSAR.png`, pasta `bot avisos/` (a viva é `bot-avisos/`),
  `SAP.png`, `TOTVS.png`, `nibo.png`, `samkhya.png`, `senior.png`, `blind.png`, `meta.png` (usado é
  `meta.webp`). Conferir por grep antes de cada rm.
- CSS morto: bloco `.site-*` da landing antiga em screens.css (~356 ocorrências a partir de ~:769) —
  PRESERVAR `.site-brand`, `.site-brand__arrow`, `.site-enter`, `.site-ic` (usados por hbx-scene.tsx —
  conferir se W1 ainda deixou o hbx-scene vivo pro register) e tudo de `.world`/`.scene` que /register e
  /reset-password ainda usarem; `.site-plan2*`/`.site-plan-intruder*`/`.bv-plan-details` morrem junto
  com os componentes. `.site-credits*` em creditos.css: ANTES de remover, conferir `git log --oneline -5 --
  frontend/src/app/hbx-theme/creditos.css` e grep de uso — a vitrine créditos v2 (commit `38c109f1`) pode
  ter reusado; se em uso, MANTER e anotar no relatório.
- Comentário fantasma screens.css:2944 (aponta pra marketing.css que não existe).

### Demolição do plano (aprovada pelo dono)
- `app/register/page.client.tsx`: remover ramo inteiro `!creditsEnabled` (seleção de plano, "Começar
  teste grátis", `selectedPlanKey`/`trialModuleSelection`). Caminho crédito vira único. Registro fica:
  empresa, nome, e-mail, senha, telefone (obrigatório), CPF opcional, termos — nada a mais.
- `components/hbx/checkout-panel.tsx`: remover ramo trial ("Começar trial sem cobrança", "Não cobramos
  nada por N dias"); PRESERVAR recarga MP (credits-wallet-section usa).
- `components/hbx/bloqueio-gate.tsx`: remover UI de assinatura legada ("Ative seu plano HBX", "Plano HBX
  {title} · R$…"); PRESERVAR o fluxo de bloqueio/recarga por crédito. Se o gate legado for o único
  conteúdo, encolher o componente pro caso crédito.
- `frontend/src/lib/plans.tsx`: após os itens acima, encolher/remover `FALLBACK_PLANS` e
  `fetchPublicPlans` se ninguém mais importar.
- `app/planos/page.tsx` (redirect → /register): MANTER (links externos antigos).
- Card sidebar "Seu plano"/"Gerenciar plano"/"Teste · N dia(s)" em `shell.tsx` ~918-953: remover ramo
  não-crédito (S6: default é credit; enterprise mostra card neutro ou nada — o mais simples).
- **BUG confirmado**: `abrirPlanoECobranca` (`shell.tsx:744`) grava `hbx:config-sec="Plano e cobrança"`,
  seção que não existe mais → trocar pra `"Créditos"` (e renomear a função).
- Copy: `relatorios/page.client.tsx:178` ("requer plano com inteligência (Lead Plus)") e
  `vendas/page.client.tsx:825` ("requer plano com Bot IA") → vocabulário do modelo atual (módulo/crédito);
  `novo-acesso-modal.tsx:648` "Gerente (não vê cobrança/plano)" → "(não vê cobrança)";
  `tutorial-coach-steps.ts:101` "…equipe, plano, módulos…" → sem "plano".
- `/termos` e `/politicas` (app/termos/page.tsx:40-46, app/politicas/page.tsx:40): trocar seção de
  "Planos, pagamento e renovação" por texto do modelo crédito (curto, factual: créditos pré-pagos,
  recarga, validade). Marcar no relatório como PENDENTE DE REVISÃO JURÍDICA do dono.
- Backend: se a demolição do front deixar endpoint/DTO de plano público sem consumidor
  (`fetchPublicPlans` → endpoint), só ANOTAR no relatório (aposentadoria backend é outra frente, S7 já fez
  a maior parte).

### Sidebar — chaves NAV (casa com o OOBE por categoria do W2)
- `shell.tsx` `NAV_MODULE_KEY` (~:671): trocar `null`→chave própria em empresas→`empresas`,
  contatos→`contatos`, produtos→`produtos`, logistica→`logistica`, clientes→`logistica` (ou chave própria
  se existir no structural-defaults.json — conferir). `dash` e `config` FICAM null (sempre visíveis).
  Os comentários do código já preveem essa troca. Conferir que empresa SEM CompanyModule algum continua
  vendo tudo (default do plano/caixa) — fail-closed só quando a exceção existe.

### Adendos pós-fase-1 (W1/W2 já rodaram — estado atual da árvore)
- W1 já: matou `/login` (redirect → `/?entrar`), criou `components/hbx/login-client.tsx` (card único),
  deletou `app/login/page.client.tsx` + `public/portal/**` (23MB) + bloco ENTRADA V1.0 do screens.css
  (−471 linhas); logout unificado em `lib/logout.ts`. `robo-*.png` e a cena `HbxScene` FICARAM porque
  /register, /reset-password e /confirm ainda usam.
- **Tarefa extra sua: migrar /register, /reset-password e /confirm pra o visual de card limpo na casca**
  (mesma família do login-client), matando `hbx-scene.tsx`, `robo-*.png` e o CSS `.world/.scene/.site-brand/
  .site-enter/.site-ic` que ficarem órfãos. Grep-guard antes de cada delete. Registro público continua
  leve e chamativo (é a porta de cliente novo).
- W2 já: OOBE na casca (oobe.css morta), painel CATEGORIAS novo (`POST /profile/module-categories`,
  mapa em `backend/src/modules/module-categories.ts`), typewriter do tour morto. NÃO mexa nesses arquivos
  exceto o item NAV abaixo.
- **Catraca do check-pele está estourada NO HEAD (515/495, pré-existente).** Depois da sua limpeza,
  rode `node frontend/scripts/check-pele.mjs`; se a contagem ficar ≤ teto, ótimo; se continuar acima,
  RE-ANCORE a catraca no valor real pós-limpeza (editar o teto no script) e ANOTE no relatório o número
  antes/depois — não esconder.
- Pendência a REGISTRAR no relatório (não implementar): `syncPlanModulesTx` (troca de plano/checkout
  enterprise) reseta CompanyModule e apaga os post-its de categoria do OOBE — fase 2 precisa reaplicar
  categorias pós-sync.

## Prova
Typechecks + check-pele verdes. Relatório: lista do que foi deletado (arquivos, seletores, KB de assets),
o que foi PRESERVADO de propósito e por quê, e pendências anotadas (jurídico, endpoint órfão).
NÃO deletar este .md.
