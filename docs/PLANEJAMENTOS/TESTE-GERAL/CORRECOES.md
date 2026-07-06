# TESTE-GERAL — CORREÇÕES (log vivo)

Todo ⚠️/❌ do [PLANO.md](PLANO.md) vira uma linha aqui NA HORA do achado.
Formato: `C{n} | {user}/{modulo} | o que está errado | P0/P1/P2 | plano de correção`.
P0 = quebra uso, P1 = errado mas contorna, P2 = feio/incompleto.

## Já conhecidos antes da campanha

**C1 [RESOLVIDO 06/07 — MODELO GRÁTIS LIVE EM PROD]** — a virada foi além do plano original: dono trocou
a vitrine de pacotes pelo modelo grátis estilo CNPJ.biz (cadastro → email+telefone confirmados → 50
créditos, conta `courtesy`). Publicado `bff2791c`, chavinha `HBX_CREDITS_ENABLED=true`+`SHADOW` injetada
no `.env` da VPS, backend recriado, smoke ok (`/credits/public-catalog` → enabled:true, welcomeCredits:50,
site 200). Legado de planos segue no código como fallback da chavinha — remoção = decisão aberta (S7/R3-R5).

**C1-original | público+admin/planos | Sistema ainda vende e opera "X leads por mês"; motor de CRÉDITOS
está publicado mas 100% atrás de flag OFF | P1 | O código está pronto (carteira S1–S6, recarga MP,
gate R1, kill-switch R2). A virada é operacional, na ordem: (1) decisão do dono de ligar,
(2) S7 migração dos saldos (plano em `docs/PLANEJAMENTOS/CREDITOS/PLANO.md`), (3) ligar
`HBX_CREDITS_ENABLED` → rodar `HBX_CREDITS_SHADOW` uns dias medindo → `HBX_CREDITS_ENFORCE`
por empresa, (4) trocar a copy da vitrine (`frontend/src/lib/plans.tsx:116` e
`frontend/src/components/hbx/plan-card.tsx:56`) de "leads por mês" pra créditos.**

**C2 | master/* | Painel master "não está perfeito" (suspeita do dono) | P2→triagem | A seção 3
do PLANO.md varre janela por janela; cada janela feia/mentindo vira um C aqui com o print.**

## Suspeitas a confirmar na campanha (da memória de trabalho)

- ~~Tours do Radar desancorados após o redesign de "Buscar empresas" (vendedor/Tutorial).~~ **[corrigido 06/07]**
  Auditoria completa dos 2 tours que tocam o Radar (`frontend/src/lib/tutorial-coach-steps.ts`):
  (1) **`leadsModuleSteps()`** (tour profundo "Como usar" — disparado de dentro de `/vendas` modo Buscar):
  5 de 6 âncoras já viviam vivas no `page.client.tsx` novo (`leads-kpis`, `leads-filtros`, `leads-buscar`,
  `leads-abas`, `leads-puxar`); só `leads-cota` estava morta (nunca existiu no redesign) — adicionado
  `data-tut="leads-cota"` na div `.lead-list__meter` (`frontend/src/app/(app)/leads/page.client.tsx:1651`,
  o medidor "Em mãos"/"Cards puxados"). (2) **Tour completo (1º acesso, `buildCoachSteps`)**: achado maior —
  o passo `go-leads` mirava `[data-tut="nav-leads"]`, que não existe desde 27/06 (Leads saiu do `NAV_LINKS`
  do `shell.tsx`, virou o modo "Buscar empresas" dentro de Vendas); esperava ~4s e pulava sozinho (não travava,
  mas gastava tempo morto no 1º passo clicável do onboarding). Reescrito pra passo central (`gate: "next"`,
  sem `target`) explicando que Leads mora dentro de Vendas; `leads-screen` (rota `/leads`) segue funcionando
  igual (redireciona pra `/vendas?modo=buscar` via `leads/redirect.client.tsx`), só a copy do body foi
  atualizada pro fluxo prateleira/puxar. Corrigido também um comentário desatualizado (classe CSS
  `.vnd-slidetrack.is-buscar` citada não existe mais — o "Como usar" detecta `.vnd-layer--buscar.is-on`,
  conferido em `shell.tsx:1326`). Tour de Vendas/Atendimento: todas as âncoras (`vendas-*`, `atend-*`) vivas,
  nada mexido. `tsc --noEmit` e `check-pele.mjs` verdes.
- ~~Painel "Equipe" mostra status de chip lendo o BANCO, não o motor ao vivo (admin/Gerencial).~~ **[corrigido 06/07]**
  Investigação: a aba "Equipe" do `/gerencial` (`frontend/src/app/(app)/gerencial/page.client.tsx:788-814`,
  endpoint `GET /users/company` → `UsersService.listByCompany`, `backend/src/users/users.service.ts:968-1006`)
  **não expõe status de chip nenhum** — só "Ativo/Inativo" (`isActive`). A suspeita real é a guia **"Equipe"
  do popup "Modelo de atendimento"** em `/atendimento` (`frontend/src/components/hbx/modelo-atendimento-panel.tsx`,
  endpoint `GET /inbox/whatsapp/admin-panel` → `InboxService.getWhatsappAdminPanel`, `backend/src/inbox/inbox.service.ts:1030`
  em diante): já usava a projeção canônica (`WhatsAppConnectionProjectionService`, WEBWHATS-ARQ3 S3) mas
  **nunca consultava o motor ao vivo** — dependia 100% de outra rota (`WhatsAppModalService.reconcileSessionAgainstProvider`,
  cooldown 20s) ter reconciliado a sessão dentro da janela de frescor (180s); se o webhook `connection.update`
  atrasasse/falhasse e ninguém tivesse aberto a tela de conexão nesse meio-tempo, o painel podia mostrar
  "conectado" com o chip já caído no motor — mesma classe de bug do C3. FIX aplicado: extraído o parse/agregação
  do motor do C3 para `backend/src/messaging/whatsapp-connection-state.ts` (`parseMotorInstanceKey`,
  `buildMotorStateByCompany`, `buildMotorStateByCompanyUser` — nova granularidade POR USUÁRIO via sufixo
  `-user-N`, que é como a Equipe precisa); `ModulesService` (C3) agora importa dali em vez de duplicar.
  `InboxService.getWhatsappAdminPanel` ganhou `getMotorInstancesCached()` (mesmo padrão/TTL 60s do C3,
  `backend/src/inbox/inbox.service.ts:~180-195`) + `decorateDerivedWithMotor()` que decora tanto o
  `companyWhatsapp` (sessão principal) quanto CADA membro do `team` (granularidade user): motor `open`
  força `live:true` mesmo com projeção stale; motor `close/closed` derruba um `live:true` mesmo com carimbo
  fresco (mata o fantasma); motor indisponível/sem instância pra aquela chave = no-op (fallback pra projeção).
  SÓ LEITURA (`listMotorInstances` → `/instance/fetchInstances`), nenhuma chamada connect/reconnect/logout.
  Testes: 4 novos em `backend/src/inbox/inbox.service.test.ts` (motor close derruba fantasma, motor open
  confirma vivo com projeção stale, motor indisponível é no-op, instância de outro usuário não decora quem
  não tem chip no motor) + os 4 testes ARQ3-S3 pré-existentes ajustados (helper de teste agora mocka
  `webwhatsBridge.listMotorInstances` default `null`). `test:inbox-smoke` 60/61 verde (1 falha pré-existente
  e não-relacionada: "Fase B (c)" testa `resolveInboxWhatsappSessionScope`/canal Meta, fora desta área).
  Typecheck `cd backend && npx tsc --noEmit` verde.
- ~375 catch de front sem `reportError` — erro engolido vira "tela que não faz nada" na campanha.

## Achados da campanha

C3 | master/Empresas | [corrigido] `waSituacao()` em `frontend/src/app/(app)/master/janela-empresas.tsx:183-191` monta a coluna "WhatsApp" da lista a partir de `emp.whatsappSituation`/`emp.whatsappStatus`, que vêm de `GET /modules/master/companies` (campos do BANCO — `company.whatsappStatus`, `whatsappModalStatus` etc., ver `backend/src/modules/master-whatsapp-situation.ts:172-267`) e não do motor ao vivo (`/instance/connectionState`\|`/instance/fetchInstances`). É a MESMA classe de mentira já mapeada para o painel "Equipe" do admin — aqui é o painel do dono, com o mesmo risco: chip pode estar caído no motor e a lista mostrar "conectado". | P1 | FIX aplicado em `backend/src/modules/modules.service.ts`: `listMasterOverview()` agora chama `getMotorInstancesCached()` (cache 60s, mesmo TTL do cockpit) → `WebwhatsBridgeService.listMotorInstances()` (SÓ leitura, `/instance/fetchInstances`), monta `buildMotorStateByCompany()` (parse do nome da instância `company-{id}[-user-N]`) e `decorateWhatsAppSituationWithMotor()` decora a `whatsappSituation` vinda do banco: motor `open` força `connected`; motor `close/closed` rebaixa um banco "connected" pra `attention` ("Chip caído no motor"); motor indisponível/empresa sem instância → no-op (fallback pro banco). `WebwhatsBridgeService` provido direto em `backend/src/modules/modules.module.ts` (mesmo padrão do `MasterCockpitModule`, só depende de Prisma, sem importar `MessagingModule`/sem ciclo). Nenhuma ação LIVE — zero chamada de connect/reconnect/logout.

C4 | master/Cockpit | [corrigido] `buildSaleFeed()`/`buildCommissionFeed()` em `backend/src/master-cockpit/master-cockpit.service.ts:406-410,463-467` buscam só os últimos **60** registros (`take: 60`, ordenados por `saleConfirmedAt desc`/`updatedAt desc`); os KPIs "Vendas hoje" e **"Vendas no mês"** (`janela-cockpit.tsx:333-341`, campos `salesMonthCount`/`salesMonthValue`) são calculados filtrando esse MESMO array truncado (`master-cockpit.service.ts:247-248,271-274`), não uma query própria do mês inteiro. Com > 60 vendas confirmadas recentes (cross-company, é plausível conforme a base cresce), o card "Vendas no mês" fica silenciosamente sub-contado — sem qualquer aviso de truncamento na tela. | P1 | FIX aplicado em `backend/src/master-cockpit/master-cockpit.service.ts`: novo método `buildSaleAndCommissionTotals()` roda 4 queries Prisma `aggregate` (`count`/`_sum`) independentes do array de 60 — `vendasLead` filtrado por `saleStatus != none` + janela hoje/mês (replicando a regra `saleConfirmedAt ?? updatedAt` via `OR`), e `vendasCommissionReceivable` p/ `commissionPayable`/`commissionPaidMonth` (replicando `paidAt ?? updatedAt`). `buildOverview()` chama esse método em paralelo no `Promise.all` e usa o resultado pros KPIs `salesTodayCount/Value`, `salesMonthCount/Value`, `commissionPayable`, `commissionPaidMonth`; se a query falhar, cai no fallback antigo (filtro do array truncado, defensivo). `take: 60` mantido intacto só para `feed.sales`/`feed.commissions` (lista visual). Suite `npm run test:master-cockpit` (6/6) e typecheck verdes.

C5 | master/Empresas | [corrigido] Onboarding de nova empresa: quando `provForm.adminEmail` fica vazio no passo 4 (`janela-empresas.tsx:1688-1699`), o backend cria a empresa "sem usuário" — a UI avisa isso no texto de ajuda, mas depois do `provisionar()` (linha 344-383) o card de resultado (`provResult`, linha 902-917) só mostra "Sem usuário admin inicial" sem nenhum link/ação para criar o admin depois a partir dali; o master precisa lembrar de ir em Usuários manualmente sem que a tela aponte o caminho. | P2 | FIX aplicado em `frontend/src/app/(app)/master/janela-empresas.tsx`: confirmado que NÃO existe form de "criar usuário avulso" reusável na janela (só edição de usuário existente via `salvarUsuario`/`userEdit`, linhas 802-820 e 1854+) — então o caminho é o link direto. Card de resultado (linha ~902) ganhou botão "Criar usuário admin agora" (só aparece quando `!temporaryPassword && companyId != null`) que chama `setDetailTab("Usuários")` (aba já default do detalhe) e faz `scrollIntoView` no container `#detalhe-empresa` (`id` novo no wrapper do detalhe, linha ~998) — `carregarDetail(res.companyId)` já era chamado após provisionar, então o detalhe já está montado.

C6 | master/Créditos | [corrigido] `janela-creditos.tsx:243-247` mostra "Nenhum pacote encontrado — confira se o recurso de créditos está habilitado" tanto para "lista vazia real" quanto (via `carregarPacks` catch, linha 87) para erro de rede/permissão — os dois casos caem no mesmo `setPacks([])` sem diferenciar. Se o endpoint `GET /credits/master/packs` responder 500 por outro motivo (não relacionado à flag `HBX_CREDITS_ENABLED`), a tela orienta o dono a checar a flag errada. | P2 | FIX aplicado em `frontend/src/app/(app)/master/janela-creditos.tsx`: novo state `packsLoadError`; o catch de `carregarPacks()` lê `(err as ApiError)?.status` — se 403/404 (feature-flag), mantém `null` e cai na dica genérica da flag; qualquer outro status guarda `err.message` cru do backend. Renderização (linha ~258) usa `{packsLoadError || "Nenhum pacote encontrado — confira..."}`.

C7 | master/Integrações | [corrigido] Ao trocar de empresa no seletor (`janela-integracoes.tsx:75-80`, `trocarEmpresa`), `acaoMsg` (resultado de Testar/Sync) é limpo, mas `msg` (erro do modal de criar/editar conexão) não é resetado — se o master abrir o modal, errar, fechar sem sucesso, trocar de empresa e abrir "+ Nova conexão" de novo, o modal reabre com `FORM_VAZIO` (linha 143) então isso é mitigado; risco baixo mas o padrão dos outros `set*Msg` nas outras janelas (ex. `janela-empresas.carregarDetail`, linha 274-298) sempre zera TODOS os *Msg ao trocar contexto — aqui ficou inconsistente. | P2 | FIX aplicado em `frontend/src/app/(app)/master/janela-integracoes.tsx:75-81`: `trocarEmpresa()` agora chama `setMsg(null)` também, por paridade com o padrão das outras janelas.

C8 | master/E-mails | [corrigido] `enviarApresentacao()` (`janela-emails.tsx:266-295`) salva o destinatário via `POST /master/email/settings` com `.catch(() => {})` (linha 288) — se essa gravação falhar, a UI não avisa e o campo "Recipiente" reseta (`setEnvioForm({...})`, linha 289) como se tudo tivesse sido persistido; é um catch que engole erro silenciosamente (não chega a travar a tela, mas o dado "memorizado" pode não ter sido salvo e ninguém fica sabendo). | P2 | FIX aplicado em `frontend/src/app/(app)/master/janela-emails.tsx:266-296`: o catch do `PUT /master/email/settings` agora faz `console.warn` do erro real e sobrescreve `envioMsg` com "✓ Apresentação enviada para X, mas não consegui memorizar o destinatário para a próxima vez." (envio em si já tinha sido concluído com sucesso antes desse catch).

C9 | master/Contabil | [corrigido] `criarLancamentoManual`, `estornarLancamento`, `registrarRetiradaLucro`, `fecharLivroCaixaAno` em `frontend/src/app/(app)/master/janela-contabil.tsx` (linhas 322-390) e vários handlers do wizard em `contabil-fechar-mes.tsx` usam `.catch((err: unknown) => setXMsg(...))` — funcionalmente corretos (mensagem aparece pro usuário), mas nenhum desses catches loga/relata pra telemetria (`reportError`), então uma falha recorrente (ex. endpoint fiscal fora do ar) só aparece se o dono estiver olhando a tela no momento exato. Mesmo padrão se repete nas outras ~10 janelas (quase todo `apiFetch(...).catch(err => setMsg(...))` do painel master não usa `reportError`). | P2 | FIX aplicado (só as janelas financeiras, sem tocar no mutirão geral dos ~375 catches): `janela-contabil.tsx` — `reportError(err)` acrescentado nos 4 catches citados (linhas ~338,350,375,388), mantendo o `setXMsg` original intacto. `contabil-fechar-mes.tsx` — `reportError` acrescentado nas 7 mutações reais do wizard (`salvarAjuste`, `gravarEAvancar` do pró-labore, `transmitir` Serpro, `fechar` do mês, `marcar` obrigação, `enviarComprovante`, `remover` comprovante); catches que são só leitura/simulação (`carregar` pre-close, `calcularImpacto`, `armar` Serpro, `carregarComprovantes`, status Serpro) foram deixados como estavam — não são mutação. `janela-creditos.tsx` — `reportError` nos 3 catches de mutação (`salvarPack`, `salvarExpiry`, `conceder`). `janela-pagamentos.tsx` — **pulado**: arquivo é 100% leitura (`GET /master/payment-notifications/history`), não existe nenhuma mutação (POST/PUT/PATCH/DELETE) na janela hoje — nada para instrumentar.

C10 | master/Tickets | [corrigido] Janela é só espelho de leitura (`GET /modules/master/tickets`) e o rodapé já avisa isso ("Leitura espelhada... escrita continua M2M") — não há dead button real, mas também não existe NENHUMA ação (nem "abrir no GitHub" a partir do PR number exibido em `sel.githubPrNumber`, linha 166). Achado leve: dado exibido (`#123`) não é clicável apesar de existir `githubBranch`/`githubPrNumber` suficientes para montar o link. | P2 | FIX aplicado em `frontend/src/app/(app)/master/janela-tickets.tsx:166`: `git remote -v` confirmou o repo (`github.com/JhonatanBarata/HBX`); item "PR" do array de detalhes agora renderiza `<a className="tag teal" href="https://github.com/JhonatanBarata/HBX/pull/{n}" target="_blank">#{n} ↗</a>` em vez de string estática, sem novo `style` inline (reusa classe `tag teal` do design system).
