# MATRIZ LOGÍSTICA + FINANCEIRO DA ENTREGA — Auditoria só-leitura (Missão D, 11/07/2026)

Auditor: subagente RELEASE-20X. Zero edição de código. Toda afirmação tem prova `arquivo:linha` no estado
lido em 11/07 (~madrugada). **O working tree é um ALVO EM MOVIMENTO**: durante a própria auditoria,
`backend/src/logistica/` ganhou diffs novos (frente AVISO-CHEGANDO) e `backend/prisma/` tem a migration
MULTILOCAL untracked. Nada disso foi tocado — só reportado.

---

## 0) Estado commitado × tree × prod (o que é W4, o que é frente paralela)

**Publicado em prod (até `3ddb9765`):** todo o núcleo da logística — N6/M2–M9, R2–R4, F1/F2, B1–B3,
ROTA-AUTOPILOT, W1 (kill-switch `@ModuleAccess('logistica')`), W2 (financeiro fase 1: histórico/quitar/saldos),
W5 (card extras no núcleo), W6 (card de clientes com pendências/merge/débito, `c8ba0f0f`), takeover Uber
(`92d8a719`), fila offline M8, `so-logistica.ts`/`entrega-mods.ts` (de-HBX base).

**LOCAL commitado, NÃO publicado:** `9fc053da` (S8 chavinha empresarial — fora deste escopo),
`e1da20f7` (voz na folha de chegada — `frontend/src/app/entrega/voz.ts` + `ArrivalSheet.tsx:337`),
`f344a294` (mic no WebView — `EntregaShell/.../MainActivity.kt:80-92,168-172`).

**W4 NO WORKING TREE (não commitado) — frontend `/entrega`:**
| Arquivo | O quê |
|---|---|
| `frontend/src/app/entrega/financeiro/` (untracked, 411+14 linhas) | Tela Financeiro: lista "quem me deve" → detalhe (saldo + extrato de entregas com ✓/✗ do WhatsApp + cobranças com "Marcar pago" armado em 2 toques, otimista+rollback). Deep-link `?cliente=ID`. |
| `EntregaTabBar.tsx` (+53) | 5º item dinâmico: só-logística → some "HBX", entra "Financeiro" (gate `getConfigCached().moduloFinanceiroAtivo`, fail-closed); com outros módulos → "HBX" aponta `/dashboard` (matou o `/vendas` hardcoded que dava 403 pro entregador). |
| `EntregaScaffold.tsx` (+20) | de-HBX: header vira NOME DA EMPRESA quando só-logística; `document.title="Entregas"`. |
| `ajustes/page.client.tsx` (+104) | (a) seção "Módulos" admin (categorias do tenant, otimista+rollback, respeita `locked` do teto master); (b) **toggle `moduloFinanceiroAtivo`** (hunk `@@ -405 +480,24`), admin; (c) link "Abrir o HBX completo" quando só-logística. |
| `gestao-api.ts` (+48) | `getConfigCached()` (TTL 60s), `getSaldosFinanceiro()`, `quitarCharge()` client. |
| `clientes-api.ts` (+16) | `listEntregasCliente` ganha cursor + campos R4 (`whatsappStatus/Motivo`, `receiptMethod`, `cobrancaStatus`). |
| `clientes/page.client.tsx` (+13) | Botão "Financeiro" na ficha → `/entrega/financeiro?cliente=ID`. |
| `page.client.tsx` (+2) | Texto "Volte pro app" (de-HBX). |

**Frentes paralelas em voo NO MESMO tree (não são W4, não auditar como prontas):**
- **AVISO-CHEGANDO (11/07)** — `backend/src/logistica/dto/logistica.dto.ts` (+20: `avisoChegandoEnabled/Template/DistanciaM`),
  `logistica-config.service.ts` (+53: `resolverAvisoChegando` fail-closed), `logistica.service.ts` (+24, em edição AO VIVO durante a auditoria).
- **MULTILOCAL W-A** — `backend/prisma/schema.prisma` +71 (model `LocalEntrega` linha 1145, `localId` em Entrega:1058 e ClienteProduto:1120) + migration untracked `backend/prisma/migrations/20260710150000_local_entrega_multi/migration.sql`. **Migration NÃO aplicada em prod.**

⚠️ **Gate de publish:** os scripts `chore: publish` do dono commitam o tree inteiro. Publicar AGORA leva
W4 + AVISO-CHEGANDO no meio da edição + schema MULTILOCAL cujo `migration.sql` precisa rodar no banco
ANTES do backend novo subir. Não publicar até as frentes em voo fecharem.

---

## 1) Mapa de endpoints (controller `backend/src/logistica/logistica.controller.ts`)

Guard da classe: `JwtAuthGuard + ModuleAccessGuard + @ModuleAccess('logistica')` (linhas 56-58) — empresa
com módulo OFF → 403 em TUDO. `companyId` SEMPRE do JWT (`ensureCompanyIdFromUser`, linha 68). Rotas ADMIN
(`@Admin`): `reenviar-aviso`:124, `fechar-mes`:157, `charges/:id/quitar`:207, `clientes/:id/financeiro`:252,
`config PATCH`:385, `cliente/:id/aviso PATCH`:406, `recovery/varrer`:427. Cadastro/merge/exclusão de cliente
vivem no núcleo (`backend/src/nucleo/nucleo.controller.ts`, só `JwtAuthGuard`; merge:191 e DELETE conta:211 são `@Admin`).

---

## 2) MATRIZ DE CASOS

Colunas: **Prep** | **Ação** | **API esperada** | **Banco esperado** | **Tela esperada** | **Teste auto** | **Manual aparelho?**

### J1 — Cadastro de cliente

**C1. Cadastro completo.**
Prep: login entregador/admin, aba Clientes. Ação: "Novo cliente" com nome+whats+endereço+número+CEP→geocode
ou "Usar este local". API: `POST /nucleo/contas` (`nucleo.controller.ts:139`) → `{contaId, contatoId}`; grátis, idempotente
por doc/cnpj/telefone. Banco: `CustomerProfile` (isCliente, lat/lng, `geoFonte='geocode'|'gps_cadastro'`) + `Contato` principal.
Tela: card na lista sem chips de pendência. Teste: parcial — `nucleo-import.test.ts`/`nucleo-ingestao.test.ts` cobrem o caminho
createConta; pendências cobertas em `nucleo-clientes-card.test.ts:110`. Manual: **sim** (geocode+GPS reais).

**C2. Cadastro incompleto → chips de pendência.**
Prep: cliente sem endereço/número/GPS/dia/whats. Ação: abrir aba Clientes. API: `GET /nucleo/clientes` com extras W5
(`nucleo-cadastro.service.ts:654-769`): `pendencias[]` ordem fixa endereco→numero→gps→dia→whatsapp (linhas 739-744; "dia"
= nenhum vínculo ativo com diasSemana/frequência, linha 743). Banco: n/a (read). Tela: até 2 chips vermelhos + "+N"
(`clientes/page.client.tsx:315-330`). Teste: `nucleo-clientes-card.test.ts:110,120,138`. Manual: não.

**C3. Chip de pendência CLICÁVEL.**
Ação: tocar no chip. API: nenhuma (navegação). Tela: abre a ficha com foco no campo da pendência
(`onAbrirFocus(c.id, p)`, `clientes/page.client.tsx:322`). Teste: **NENHUM** (interação de UI). Manual: **sim**.

**C4. GPS do cadastro é intocável.**
Prep: cliente com `geoFonte='gps_cadastro'`. Ação: confirmar entrega com GPS preciso (accuracy≤60m). API:
`POST /logistica/entregas/:id/confirmar`. Banco: lat/lng do cliente NÃO mudam (`logistica.service.ts:621` — "decisão
humana intocável"); cliente `geocode` vira `gps_entrega` (B1, linhas 609-629). Tela: nada visível. Teste:
`logistica.service.test.ts:453,472,490`. Manual: não.

**C5. Editar WhatsApp do contato principal.**
Ação: ficha → salvar whats. API: `PATCH /nucleo/contatos/:id` (`clientes-api.ts:203`). Banco: `Contato.whatsapp`.
Teste: **NENHUM** direto (updateContato sem teste dedicado). Manual: não.

**C6. Dia de entrega (recorrência).**
Ação: ficha → produto do cliente com `diasSemana="1,3,5"` ou `frequenciaDias`. API: `POST /logistica/cliente-produtos`
(`logistica.controller.ts:284`; valida cliente E produto do tenant, `logistica-recorrencia.service.ts:124-133`). Banco:
`ClienteProduto` com `proximaData` (explícita > hoje se recorrente > null, linha 141-142). Tela: chip "Seg, Qua, Sex" e
pendência "dia" some do card. Teste: recorrência pura + gerarDia (`logistica-recorrencia.service.test.ts:105-512`);
card: `nucleo-clientes-card.test.ts:120,138`. Manual: não.

### J2 — Duplicidade + merge

**C7. Detecção de duplicata.**
Prep: 2 clientes ativos com nome normalizado idêntico OU endereco+numero idênticos (ambos não-vazios). Ação: abrir lista.
API: `GET /nucleo/clientes` → `duplicataDe={id,nome}` nos DOIS lados, universo COMPANY-WIDE (`nucleo-cadastro.service.ts:685-690,746-757`);
sem fuzzy (`normalizeDupKey`:1538, `enderecoDupKey`:1553). Tela: chip "Duplicidade" → pop-up comparação lado a lado
(`clientes/page.client.tsx:363-378`). Teste: `nucleo-clientes-card.test.ts:16,22,29,151,161`. Manual: não.

**C8. Merge — o que é preservado HOJE (prova no service).**
Ação: pop-up → merge (admin). API: `POST /nucleo/contas/:id/merge` (`nucleo.controller.ts:191`, `@Admin`). Banco
(`mergeContas`, `nucleo-cadastro.service.ts:1291-1385`, transação única):
- MIGRAM para o vencedor (updateMany company-scoped, linhas 1331-1338): **Entrega, Contato, ClienteProduto,
  FinanceiroCharge (dívidas/cobranças), VendasLead, DebtCase** (W5 — sem o re-aponte o FK Cascade apagava dívida).
- Vencedor = quem tem MAIS dado (empate → mais antigo → menor id; `pickRicherAccount`:1500). `buildWinnerFill`:1512
  só preenche BURACOS do vencedor; papéis acumulam (só ligam).
- Uniques por-tenant: se o fill carrega phone/cnpj da perdedora, solta na perdedora ANTES (linhas 1348-1353).
- Perdedora: snapshot em `DeletionRecord` (linha 1357) e `delete` físico (1371).
- **LIMITAÇÃO CONHECIDA (não bug): quando OS DOIS têm telefone, o da perdedora só sobrevive no snapshot** — é
  exatamente o fix nº2 do plano MULTILOCAL (`docs/PLANEJAMENTOS/MULTILOCAL-10072026/CONTRATOS.md:96-100`).
Resposta: `{winnerId, loserId, moved:{entregas,contatos,clienteProdutos,financeiroCharges,vendasLeads,debtCases}}`.
Teste: `nucleo-r3.test.ts:77-154` (refs migram, no-op consigo mesma, cross-tenant→null). **Furo de teste:** os acréscimos
W5 (debtCases + clearLoser de phone/cnpj) não têm caso dedicado. Manual: **sim** (1 merge real com dívida + telefone nos dois lados).

**C9. Merge cross-tenant.** API → 404 (`nucleo.controller.ts:201`; service devolve null se qualquer lado for de outra
empresa, linha 1316). Teste: `nucleo-r3.test.ts:149` + `nucleo-r5.crosstenant.test.ts:50`. Manual: não.

**C10. Merge consigo mesma.** No-op seguro `{noop:true}` (linhas 1302-1309). Teste: `nucleo-r3.test.ts:139`. Manual: não.

### J3 — Montagem de rota, navegação e chegada

**C11. Gerar dia (recorrência → entregas).**
Prep: vínculos ativos vencidos. Ação: "Começar Rota"/pop-up gera dias marcados (`GestaoDia.tsx:209`). API:
`POST /logistica/gerar-dia`. Banco (`logistica-recorrencia.service.ts:305-394`): 1 `Entrega` por [cliente,dia]
(idempotência: QUALQUER entrega do cliente no dia pula, linha 319-329) com N `EntregaItem` (TASK 5 agrega vínculos,
até o MESMO produto 2×); `quantidade/valor` escalares = soma (linha 336-337); `contatoId` resolvido
(`logistica-contato.util.ts:30-47`); `proximaData` avança SEMPRE (mesmo pulada, linha 377-386). Cron opcional
`gerarDiaAutomatico` (default OFF, sweep 24h, linhas 50-92). Resposta: `{criadas,puladas,avancados,candidatos}`.
Teste: `logistica-recorrencia.service.test.ts:160-512` (idempotência, contato, freq/diasSemana, agregação, 2× mesmo produto).
Manual: não.

**C12. Preview do dia (read-only).** `GET /logistica/dia-preview` — não escreve nada (`getDiaPreview`:408-429).
Teste: `...recorrencia.service.test.ts:512`. Manual: não.

**C13. Planejar rota.** API: `POST /logistica/rota/planejar` com origem GPS. Banco: `rotaOrdem` 0..N + `etaAt`
por parada (`logistica-rota.service.ts:46-94`; NN+2-opt Haversine local, sem API paga; sem-coordenada vai pro fim
com `semCoordenada=true`). Resposta: rota ordenada + `terminoPrevisto` + `distanciaTotalKm`. Teste: SÓ a matemática
pura (`logistica-rota.service.test.ts:41-124` — 2opt≤NN, ETA monotônico, sem-coord no fim). **A persistência
(gravação de rotaOrdem/etaAt) não tem teste.** Manual: não (coberto por C14).

**C14. Iniciar rota.** Ação: "Iniciar rota" (`page.client.tsx:393-422` — wakeLock + fullscreen + `getPosicaoUma`).
API: `POST /logistica/rota/iniciar` → re-planeja da origem atual e marca a 1ª parada `em_rota`+`startedAt` SÓ se
'agendada' (`logistica-rota.service.ts:101-121`). Tela: view Rota (carrossel swipe, dots, mapa MapLibre B2) +
countdown F1 "Abrindo navegador 5..1". Teste: **NENHUM** (iniciarRota com banco). Manual: **sim**.

**C15. Deep-link de navegação.** Ação: countdown zera ou "Navegar". Comportamento: casca nativa → `HBXShell.abrirMaps`
via Intent (sem pop-up; `page.client.tsx:344`, `shell-bridge.ts:73-82`, `MainActivity.kt:95-116` — host fora de
hbxsystem.com.br SEMPRE sai por Intent: google.com/maps, `geo:`, wa.me, tel:); navegador comum → `window.open` sem
`noopener` (retorno confiável; bloqueado → modo `manual` com botão grande, linhas 349-367). **URL gerada é Google Maps
`dir/?api=1`** (`entrega-api.ts:174-179`) — o "Waze" citado nos planos entra porque o Android abre o app padrão do
usuário para o Intent de mapas; não há URL waze:// hoje. Teste: **NENHUM**. Manual: **sim** (com e sem Maps instalado).

**C16. GPS foreground nativo (EntregaShell RotaService + bridge).**
Prep: casca instalada, rota em tela. Comportamento: web alimenta `HBXShell.setRota({raioM,paradas})` a cada mudança
(`page.client.tsx:282-300`; cleanup chama `clearRota`); `RotaService` (foreground type location, `RotaService.kt:278-284`)
ouve GPS_PROVIDER+NETWORK 3s/5m (linhas 157-184), Haversine ≤ raio → dispara 1× por parada (`RotaState.jaDisparado`:83-89);
`requestStop` tem debounce 4s pra rajada clearRota→setRota (linhas 58-67). Raio = `raioChegadaM` do LogisticaConfig
(default 60, clamp 10..5000 — `logistica-config.service.ts:68`). Teste: **NENHUM** (Kotlin sem teste instrumentado).
Manual: **sim** (obrigatório).

**C17. Chegada com app em primeiro plano.**
Comportamento: listener ativo → SEM takeover; TTS "Chegou: nome" + `RotaState.notificarChegada` → evento
`hbxshell:chegada` no WebView (`RotaService.kt:188-210`, `MainActivity.kt:147-151`) → web abre a folha (dedupe por
`sheetAberta`, salta o carrossel pra parada certa — `page.client.tsx:448-466`); geofence JS puro também dispara
(buzz+beep, `onChegada`:268-273). Teste: **NENHUM**. Manual: **sim**.

**C18. Chegada FORA do app — takeover estilo Uber (`92d8a719`).**
Prep: motorista no Maps/tela bloqueada. Comportamento: heads-up + full-screen-intent + `ChegadaActivity` se overlay
concedido (`RotaService.kt:194-208`): acorda a tela (`setShowWhenLocked/setTurnScreenOn`, `ChegadaActivity.kt:76-91`),
som+vibração em loop com auto-stop 45s (linha 45), toque → volta pro app na entrega. Permissões pedidas no onResume
1×/processo (overlay + full-screen-intent Android 14+, `MainActivity.kt:153-216`). Chegada em background é DRENADA no
resume (`RotaState.drenarPendencias`, `MainActivity.kt:130`). Teste: **NENHUM**. Manual: **sim** (obrigatório: tela
bloqueada E processo morto).

**C19. Ignorar o aviso de chegada.**
Comportamento: som/vibração param sozinhos em 45s (`ChegadaActivity.kt:45,60`) ou no onPause; a folha continua
disponível no app; nenhuma escrita no servidor acontece por chegada (só UI). Teste: **NENHUM**. Manual: **sim**.

### J4 — Entrega (confirmar, voz, offline)

**C20. Confirmar — flag de efeitos OFF (estado atual de prod).**
Prep: `HBX_LOGISTICA_ENABLED` ausente/false. Ação: "Entregue". API: `POST /logistica/entregas/:id/confirmar` →
`{status:'entregue', effectsEnabled:false, whatsappSent:false, cobrancaLancada:false}`. Banco: transação única
status+GPS+qtd itens (`logistica.service.ts:406-499`); ZERO WhatsApp, ZERO charge (gate linha 544). Tela: flash
"✓ aprovado" 1,6s + avança carrossel + countdown "próxima". Teste: `logistica.service.test.ts:238`. Manual: não.

**C21. Confirmar — efeitos ON (WhatsApp + cobrança).**
Prep: flag ON. Banco/efeitos: WhatsApp SÓ via `queueOutboundForCompany` (caminho blindado, 1 msg — linhas 878-888),
E.164 normalizado (BUG2 fix, linha 863), destinatário = contato da entrega > contato principal > phone da conta
(BUG1/1b, linhas 829-850); template M5 com vars de itens; desfecho PERSISTIDO `whatsappStatus/Motivo` + `cobrancaOutcome`
(R4, `persistirDesfecho`:579); falha → 1 MasterEvent dedupe (`emitirFalhaEfeito`:637). Cobrança conforme contrato
(ver J5). Track de crédito `logistica_delivery` independente da flag (linhas 527-533). Teste: `logistica.service.test.ts:271,
310,334,361,403,426,708,736,813`. Manual: **sim** (fumaça 1 msg em chip descartável — regra dura de chip).

**C22. Confirmar POR VOZ (`e1da20f7`, LOCAL não publicado).**
Prep: casca com `f344a294` (RECORD_AUDIO + grant de mic só pro host próprio — `MainActivity.kt:80-92`) OU Chrome.
Ação: falar "entregue"/"confirmar"/"confirma"; "não entregue" abre o sub-fluxo de motivo (testado ANTES do positivo —
`voz.ts:59-60,130-138`). Comportamento: Web Speech pt-BR contínuo, debounce 2s anti-eco, religa no onend, `not-allowed`
degrada pra ícone sumir (`voz.ts:142-163`); 3 gates de escuta (folha aberta ∧ fora do "Por quê?" ∧ toggle mic —
`ArrivalSheet.tsx:336`). O comando dispara o MESMO `confirmarEntregue` do botão (mantém aviso de GPS F4). Teste:
**NENHUM**. Manual: **sim** (obrigatório, no aparelho com a casca nova).

**C23. Stepper muda quantidade → valor recalculado.**
Banco: `valor` = Σ qtdEntregue×valorUnit quando payload trouxe itens e há preço (F1, linhas 466-498); charge nasce do
valor RECALCULADO. Tela: QR Pix acompanha ao vivo (`ArrivalSheet.tsx:253-258` — mesma conta do backend). Teste:
`logistica.service.test.ts:1106,1137`. Manual: não.

**C24. Produto NOVO na chegada (F2).**
Ação: "＋ Adicionar produto" → picker do catálogo. API: `novosItens:[{productId,qtd}]` SEM preço (DTO nem aceita —
regra de ouro). Banco: `EntregaItem` novo com preço de CATÁLOGO resolvido company-scoped DENTRO da tx (linhas 438-464);
produto de outro tenant é ignorado com warn. Entrega legada sem itens: SOMA ao valor escalar (não substitui, linha 479-492).
Teste: `logistica.service.test.ts:1168,1205,1246,1277`. Manual: não.

**C25. Não entregue (motivo).**
Ação: "Não entregue" → chip ausente|recusou|reagendar → Confirmar. API: `POST /logistica/entregas/:id/cancelar` →
status 'cancelada' + motivo em notes (`logistica.service.ts:724-744`); entrega JÁ entregue → 400. Tela: sai do carrossel.
Teste: **NENHUM** direto do cancelarEntrega (nem do "reagendar" — que HOJE só cancela; não re-agenda nada). Manual: **sim**.

**C26. OFFLINE — fila M8 + idempotência dura (prova).**
Prep: modo avião. Ação: confirmar. Comportamento cliente: `idempotencyKey` uuid enfileirada em IndexedDB
(`entrega-offline.ts:110-127`), backoff exponencial 5s→5min, TETO 5 tentativas → `needs_attention` (nunca martela —
linhas 25-27,168-204); badge ⇅ no header e na lista "Hoje"; drena ao reconectar e recarrega a rota. Comportamento
servidor: key já gravada → REPLAY sem re-executar NADA (`logistica.service.ts:349-361`); corrida do INSERT na unique
→ replay também (503-516). Banco: `Entrega.idempotencyKey` unique. Teste: `logistica.service.test.ts:1032,1077,1277`
(servidor); **fila do cliente (drain/backoff/teto): NENHUM**. Manual: **sim** (obrigatório: avião → confirmar → religar).

**C27. GPS longe do endereço → aviso bloqueante (F4).**
Prep: confirmar a >max(2×raio,120m) do pino com accuracy confiável. Tela: "Pelo GPS você não está no local combinado.
Confirma mesmo assim?" — Promise segura o envio até Sim/Não (`page.client.tsx:503-521,388-390`); overlay portalado pro
body (fix de stacking context, linhas 104-124). Teste: **NENHUM**. Manual: **sim**.

**C28. Realimentação da coordenada (B1).** Já provado em C4. Accuracy>60m ou ausente → não realimenta
(`logistica.service.ts:615`). Teste: `logistica.service.test.ts:453-510`. Manual: não.

### J5 — Cobrança e financeiro

**C29. Pago na hora (pix|dinheiro, cliente 'aberto'/'na_hora').**
Banco: `FinanceiroCharge` nasce QUITADO — `status='approved', lifecycle='paid', paidAt=now`, `paymentMethod='MANUAL'`,
`sourceModule='logistica_entrega'`, linkado `customerProfileId+entregaId` (`lancarCobranca`, `logistica.service.ts:1035-1087`);
`Entrega.recebidoNaHora=true` + `receiptMethod`. NADA toca MercadoPago. Idempotência em 3 camadas: cobrancaStatus
resolvido (1140), charge-por-entrega já existe (1179), unique parcial `FinanceiroCharge_entregaId_key` na corrida (1203-1241).
Tela: chips Recebimento só com módulo ON + cliente 'aberto' (`ArrivalSheet.tsx:63-65`); QR Pix EMV com valor ao vivo
(BR Code local `pix-brcode.ts`, chave do tenant — taxa zero). Teste: `logistica.service.test.ts:854,948,512`. Manual:
**sim** (QR lido por app de banco real).

**C30. Fiado ('pendura' ou chip Pendura).**
Banco: charge `pending/in_progress`, `dueDate` = próximo diaFechamento do cliente (senão hoje — `proximoDiaFechamento`:1811);
receiptMethod='fiado' NUNCA quita (linha 1038-1039). Tela: badge "Deve R$" na chegada; estourou `limiteFiado` → destaque
"cobrar" (`ArrivalSheet.tsx:241-243,352-358`). Teste: `logistica.service.test.ts:881`. Manual: não.

**C31. Mensal → fechar-mês.**
Banco: entrega vira `aguardando_fechamento` (0 charge); `POST /logistica/fechar-mes` (ADMIN) agrupa por cliente no
`diaFechamento`, cria 1 charge MONTHLY `logistica_fechamento` e marca entregas 'faturada' NA MESMA transação —
idempotente (`fecharMes`, `logistica.service.ts:1103-1178`). Teste: `logistica.service.test.ts:569,641`. Manual: não.
*Nota de UI: `fecharMes()` existe no client (`gestao-api.ts:77`) — conferir onde está exposto pro admin (GestaoDia
não mostra botão de fechar-mês; hoje o disparo prático é via API/console).* 

**C32. contabilizar=false.** Sem charge; entrega `nao_contabilizado` (linhas 994-1000). Teste: `logistica.service.test.ts:543`. Manual: não.

**C33. Saldo por cliente — fonte única.**
`saldoAbertoPorClientes` (`logistica.service.ts:1251-1293`): Σ charges 'pending' `logistica_entrega|logistica_fechamento`
+ Σ entregas 'entregue' aguardando fechamento. Reusada por rota (badge), extrato (ficha) e `GET /financeiro/saldos`
("quem me deve", ordenado por dívida — 1637-1707). Espelho consciente no núcleo (`debitoAbertoPorClientes`,
`nucleo-cadastro.service.ts:780-818` — se a canônica mudar, espelhar). Teste: `logistica.service.test.ts:1444,1466`;
espelho: `nucleo-clientes-card.test.ts:173`. Manual: não.

**C34. Baixa manual do fiado — idempotência PROVADA.**
API: `POST /logistica/charges/:id/quitar` (ADMIN). Banco (`quitarCharge`, `logistica.service.ts:1564-1620`):
claim ATÔMICO `updateMany WHERE status='pending'` → 2 cliques simultâneos = 1 baixa (1595-1612); já paga → 200 com
estado atual `alreadyPaid:true` SEM tocar paidAt (1578-1585); cancelled/failed → devolve sem mutar; outra empresa OU
sourceModule fora de `logistica*` → null→404 (assinatura HBX intocável, 1570-1574). Log estruturado com ator (1615-1617).
Tela (W4 tree): "Marcar pago" armado em 2 toques, otimista+rollback, re-lê extrato (`financeiro/page.client.tsx:263-304`).
Teste: `logistica.service.test.ts:1370,1390,1407,1429`. Manual: não (UI nova: 1 fumaça no aparelho junto do C38).

**C35. Histórico de entregas do cliente.**
API: `GET /logistica/clientes/:id/entregas?limit&cursor` (default 30, máx 100 clampado). Ordem: keyset banco
[scheduledAt,id] + apresentação por deliveredAt??scheduledAt??createdAt; item sintético pra entrega legada
(`historicoEntregasCliente`, `logistica.service.ts:1455-1543`). Cliente de outra empresa → 404 sem vazar. Teste:
`logistica.service.test.ts:1504,1570,1611`. Manual: não.

**C36. Resumo do dia / fechamento do dia.**
API: `GET /logistica/resumo-dia` → `{entregues, recebidoHoje(paidAt no dia), aReceber(pending dueDate no dia)}` só
charges `logistica_*` (`resumoDia`:1309-1344). Tela: 3 stats na faixa de gestão (GestaoDia) e no empty "Rota concluída"
(`FechamentoDia`, `page.client.tsx:1033-1062`). Teste: `logistica.service.test.ts:909`. Manual: não.

**C37. Financeiro DESLIGADO — fail-closed PROVADO em todos os pontos.**
- `GET /financeiro/saldos`: OFF → `{moduloFinanceiroAtivo:false, clientes:[]}` SEM nem consultar valores (`logistica.service.ts:1637-1651`). Teste: `...test.ts:1444`.
- `GET /rota`: OFF → `moduloFinanceiroAtivo:false`, `pix:null`, `saldoAberto` nem calculado (config ausente = default false do schema; linhas 147-182). Teste: **NENHUM direto do listRota**.
- Folha de chegada: OFF → zero chips, zero QR, zero badge de dívida (`ArrivalSheet.tsx:63-65,241,267`).
- Card de clientes: `debitoAtual` OMITIDO (`nucleo-cadastro.service.ts:764-765`). Teste: `nucleo-clientes-card.test.ts:173`.
- Tela Financeiro (W4): gate no próprio payload → "Financeiro desligado" (`financeiro/page.client.tsx:110,127-133`); aba some da tab bar (fail-closed sem config — `EntregaTabBar.tsx` W4).
- **EXCEÇÃO DE DESENHO (correta): dívida existente segue bloqueando exclusão mesmo com módulo OFF** (C41).
- **ATENÇÃO (fluxo do dinheiro): `resumo-dia` e `extrato` NÃO têm gate de módulo** — `resumoDia`/`extratoCliente` respondem valores com módulo OFF (`logistica.service.ts:1309,1186` — sem leitura de `moduloFinanceiroAtivo`). O front esconde (GestaoDia só é vista pelo dono; ficha só chama extrato com módulo ON — `clientes/page.client.tsx:635`), mas a API responde. Inconsistência de contrato com o fail-closed do saldos — decidir se é aceitável (mesmo tenant, dado dele) ou padronizar.
Manual: **sim** (ligar/desligar toggle W4 e conferir tab bar + chegada).

**C38. Aba Financeiro (W4, tree).** Ação: só-logística + módulo ON → 5ª aba "Financeiro"; lista → detalhe → "Marcar
pago"; deep-link da ficha. Teste: **NENHUM** (tela nova sem teste). Manual: **sim**.
*QA conhecida: o gate da aba usa `getConfigCached` TTL 60s (`gestao-api.ts` W4) e o toggle de Ajustes NÃO invalida o
cache → ligar o financeiro pode levar até 60s (ou navegação) pra aba aparecer. P2 de UX.*

**C39. Reenviar aviso — teto DURO de 1.**
API: `POST /logistica/entregas/:id/reenviar-aviso` (ADMIN). Claim atômico `avisoReenviado false→true` ANTES do disparo
(2 cliques simultâneos = 1 envio — `logistica.service.ts:687-694`); 2º clique → 400; só entrega 'entregue'. Teste:
`logistica.service.test.ts:764,797`. Manual: não.

**C40. Recovery (dívida vencida → funil hbx-recovery).**
API: `POST /logistica/recovery/varrer` (ADMIN) + cron 24h. OPT-IN duro `moduloRecoveryAtivo` (default OFF; early-return
antes de ler qualquer charge — `logistica-recovery.service.ts:130-138`). Idempotente: 1 `HbxRecoveryCustomer` por cliente
(179-186); sem telefone → pula; entrada ÚNICA pelo `createCustomer` do Recovery (cadência/freios do chip vivem lá).
Teste: `logistica-recovery.service.test.ts:79-136`. Manual: não (envio real é do funil, fora do escopo).

### J6 — Exclusão e isolamento

**C41. Excluir cliente COM débito → BLOQUEIA (provado).**
API: `DELETE /nucleo/contas/:id` (ADMIN) → **409 `{error:'CLIENTE_COM_DEBITO', saldo}`** — saldo calculado SEMPRE,
mesmo com módulo financeiro OFF (`nucleo-cadastro.service.ts:1405-1411`). Tela: erro tratado no card W6. Teste:
`nucleo-clientes-card.test.ts:196`. Manual: não.

**C42. Excluir cliente sem débito.** Soft-delete: snapshot `DeletionRecord` + `status='deleted'` + papéis off, transação,
idempotente (`softDeleteConta`:1392-1431). Teste: `nucleo-clientes-card.test.ts:218` + `nucleo-r3.test.ts:159-194`. Manual: não.

**C43. Excluir entrega.** `DELETE /logistica/entregas/:id` → snapshot + status 'cancelada' atômico, idempotente
(`softDeleteEntrega`, `logistica.service.ts:753-791`). Teste: **NENHUM** direto. Manual: não.

**C44. Cross-tenant — veredicto da varredura COMPLETA de `backend/src/logistica/`.**
Método: enumerei TODAS as chamadas prisma dos 5 services (~90). Padrão: toda leitura raiz é `where {companyId,...}`;
toda escrita por `id` puro deriva de um fetch company-scoped NA MESMA função imediatamente antes
(ex.: `logistica-rota.service.ts:63/114/153` ← `fetchParadasAbertas(companyId)`:178-194; `persistirDesfecho`:603 ←
`confirmarEntrega` findFirst scoped:353; recorrência update/delete ← findFirst scoped:171/216; config update ←
findFirst scoped:137). Claims sensíveis levam companyId NO PRÓPRIO WHERE (`reenviarAviso`:705, `quitarCharge`:1752).
Crons iteram por `companyId` de configs opt-in. `logistica-contato.util.ts:36-47` é company-scoped. Controller nunca
aceita companyId do cliente (`ensureCompanyIdFromUser`). **NENHUM furo cross-tenant encontrado no módulo.** Testes:
`logistica.service.test.ts:697,1012,1246,1407,1570`, `nucleo-r5.crosstenant.test.ts`. Manual: não.

---

## 3) Frente ABERTA (evolução, NÃO pendência de release): MULTILOCAL

`docs/PLANEJAMENTOS/MULTILOCAL-10072026/CONTRATOS.md` — N endereços (`LocalEntrega`) + N telefones (expor `Contato`)
por cliente, **cobrança continua única por CONTA** (princípio-mestre: `FinanceiroCharge.customerProfileId`, nada de
lógica de dinheiro muda). Estado REAL no tree em 11/07: W-A parcialmente materializado (schema.prisma com `LocalEntrega`
+ `localId` em Entrega/ClienteProduto; migration untracked NÃO aplicada). As 2 mudanças de risco mapeadas no plano:
gerar-dia por (cliente,LOCAL) e merge que preserva telefone do perdedor (fecha a limitação do C8). Endpoints de
locais/telefones ainda não existem no `nucleo.controller.ts` (conferido: só contas/contatos/merge/import). Tratar como
frente em execução do dono/orquestrador — não como furo desta release.

Também em voo (mesma família, fora do plano): **AVISO-CHEGANDO** (toggle independente + template + raio 100–2000m,
fail-closed por default false — diffs em `dto/logistica.dto.ts`, `logistica-config.service.ts`, `logistica.service.ts`).

Divergência registrada (decisão batida nº1, sem re-abrir): o app único `br.com.hbxsystem` ainda não nasceu — o
EntregaShell atual segue `applicationId "br.com.hbxsystem.entrega"` (`EntregaShell/app/build.gradle:7,11`). Evolução futura.

---

## 4) Casos SEM cobertura automatizada (candidatos a teste novo, em ordem de valor)

1. **Fila offline do cliente** (`entrega-offline.ts` drain/backoff/teto→needs_attention) — o freio anti-martelo não tem teste; é lógica pura, testável sem browser. (C26)
2. **`cancelarEntrega` + `softDeleteEntrega`** — regras "entregue não cancela"/idempotência sem teste. (C25/C43)
3. **`listRota` gates financeiros** — moduloFinanceiroAtivo OFF → pix null/saldo ausente; fallback de item legado. (C37)
4. **`iniciarRota`/`planejarRota` com banco** — 1ª parada vira em_rota só se 'agendada'; persistência de rotaOrdem/etaAt. (C13/C14)
5. **Merge W5** — debtCases migrando + colisão de unique phone/cnpj (clearLoser). (C8)
6. **`voz.ts`** — parsing "não entregue" antes de "entregue", debounce (função pura extraível). (C22)
7. **`createEntrega` manual** — resolução contato/preço/valor total vs unitário. (C1)
8. **Gate `resumo-dia`/`extrato` com módulo OFF** — se a decisão for padronizar fail-closed, nasce com teste. (C37)
9. **`updateContato`/pendência whatsapp ponta-a-ponta.** (C5)

Sem framework de teste no front hoje: 1, 6 podem virar `.test.ts` de lógica pura no padrão node:test do backend? Não —
vivem no frontend; extrair a lógica pura pra módulo testável ou aceitar cobertura manual.

## 5) CHECKLIST DE CAMPO pro dono (aparelho real, casca instalada, empresa 5 com financeiro ON)

Pré: publicar quando as frentes em voo fecharem; conferir `docker ps`+logs (build verde ≠ boot); migration MULTILOCAL
aplicada ANTES do backend novo; `HBX_LOGISTICA_ENABLED` conforme o combinado; chip de WhatsApp DESCARTÁVEL pro teste de aviso.

1. **Cadastro**: criar 2 clientes — 1 completo (CEP→geocode + "Usar este local") e 1 só com nome → conferir chips de
   pendência e o toque no chip abrindo a ficha no campo certo.
2. **Duplicata**: criar cliente com o MESMO nome de um existente → chip "Duplicidade" → merge (com dívida e telefone
   nos DOIS lados) → conferir: entregas/dívida/produtos no vencedor, telefone do perdedor SÓ no snapshot (limitação
   conhecida até o MULTILOCAL).
3. **Rota real com 5+ clientes**: gerar dia (2× — não pode duplicar), iniciar rota → countdown abre o Maps sozinho
   (Intent, sem pop-up), voltar pro app, swipe entre paradas, mapa com bolinha ao vivo.
4. **Chegada nos 3 modos**: (a) app aberto → folha abre sozinha com buzz+beep; (b) no Maps → heads-up + takeover
   com som/vibração, toque volta pra entrega; (c) TELA BLOQUEADA → takeover acorda a tela. Deixar tocar 45s sem
   reagir → som para sozinho.
5. **Processo morto**: iniciar rota, matar o app (recentes → swipe) → notificação "Rota em andamento" segue? chegar
   no raio → heads-up dispara? abrir o app → chegada drenada abre a folha.
6. **Entrega pago/fiado/recusado**: 1 pix (ler o QR com app de banco de verdade, valor acompanhando o stepper),
   1 dinheiro, 1 pendura (badge "Deve" cresce na próxima visita), 1 recusado (motivo) — conferir extrato do cliente
   e resumo do dia (recebido × a receber).
7. **Voz**: mic concedido → "entregue" confirma (com aviso de GPS se longe), "não entregue" abre motivo; toggle do
   mic silencia; negar permissão → ícone some e nada quebra.
8. **Sem internet**: modo avião → confirmar 2 entregas → badge ⇅2 → religar → sincroniza sozinho, WhatsApp/cobrança
   NÃO duplicam (conferir 1 charge por entrega no extrato).
9. **GPS longe**: confirmar de longe (ou coordenada errada de propósito) → aviso bloqueante Sim/Não; "Não" não envia.
10. **Financeiro W4**: ligar o toggle em Ajustes → aba "Financeiro" aparece (pode levar ~1min — cache; anotar se
    incomodar), lista "quem me deve" bate com os fiados do dia, "Marcar pago" (2 toques) baixa e some da lista;
    desligar o toggle → aba some, chegada sem chips/QR, card sem débitos.
11. **Exclusão**: tentar excluir cliente devendo → mensagem de débito bloqueia; quitar → excluir passa.
12. **Aviso WhatsApp** (efeitos ON, chip descartável): entregar → 1 mensagem chega com itens/qtd; reenviar aviso 1×
    ok, 2× barrado.

---

*Relatório gerado por auditoria só-leitura. Provas por arquivo:linha refletem o snapshot lido em 11/07; o working
tree segue em edição por outras frentes.*
