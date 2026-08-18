# PR18082026 — A PORTA TRANCADA: o 403 de módulo que expulsa cliente calado

> **Origem:** 18/08/2026. `andreasilvia816@gmail.com` (user 56, company 46, **ADMIN**) baixou o APK
> HBX Logística, pareou com sucesso e levou **39 respostas `403 MODULE_ACCESS_DENIED`** em 65 segundos.
> Desistiu. Foi a **segunda** vez — em 18/07 já tinha morrido em 41 s.
>
> **Este plano não conserta a company 46.** Conserta a mecânica que produz esse resultado em qualquer
> cliente, em qualquer módulo, hoje e no futuro. Ordem do dono: *"resolva coisas permanentemente,
> não faça soluções dentro do cliente."*

---

## 1. A DOENÇA EM UMA FRASE

**Uma coluna responde duas perguntas.** `CompanyModule.enabled` carrega ao mesmo tempo
*"a HBX entregou este módulo a esta empresa?"* (**direito** — pode negar API) e
*"a empresa quer isto na tela?"* (**gosto** — só pinta pixel). O guard lê o **AND cego** das duas
(`module-access-policy.ts:33`), então um checkbox de onboarding tranca **502 handlers** de API.

A intenção correta **já está escrita no schema** desde 10/07 (`schema.prisma:5407-5409`:
*"`masterEnabled` = TETO (só o /master escreve); `enabled` = camada da EMPRESA"*). O que não mudou
junto foi o guard. E `docs/Rules/PAGAMENTOS.md:14` ainda ensina o **contrário** do schema — a
contradição está documentada em dois lugares que se negam.

### A cena exata da company 46
`logistica` nasce `defaultEnabled: true` (`bootstrap/structural-defaults.json`). Sem linha em
`CompanyModule`, ela teria acesso normal. Foi o OOBE que **materializou a linha bloqueante**:
`planCategoryModuleWrites` com `target=false` grava `{enabled:false}` (`module-categories.ts:128-131`),
gravado **2 minutos depois de ela parear o primeiro aparelho**. E existe teste blindando isso —
`module-categories.test.ts:91-96`, *"OOBE: categoria não escolhida com módulo ON por default é
desligada (contrato do primeiro acesso)"*. **Não é regressão. É contrato escrito, testado e errado.**

O texto que ela leu (`oobe-gate.tsx:312,325`): **"O que sua empresa vai usar?"** / *"Escolha pelo
menos uma. Dá pra mudar depois."* — grep por `contrat|compr|plano|pagar|liber` no arquivo: **zero**.
Ela respondeu honestamente a uma pergunta de preferência e recebeu um bloqueio comercial.

---

## 2. O TAMANHO REAL (produção, medido — não estimado)

| Métrica | Número |
|---|---|
| Empresas ativas com ≥1 módulo trancado pelo próprio post-it | **7 de 11 (63,6%)** |
| Linhas `enabled=false` + `masterEnabled=true` | **16** |
| Linhas desligadas **pela HBX** (`masterEnabled=false`) | **0** — 100% vieram do tenant |
| Pares (empresa × módulo) devolvendo 403 hoje | **36** — 12 pelo post-it, 24 por `defaultEnabled=false` |
| Handlers atrás de `@ModuleAccess` | **~502** em 11 chaves (logística sozinha: 142) |
| `MODULE_ACCESS_DENIED` em `frontend/src` | **0 ocorrências** |
| `MODULE_ACCESS_DENIED` em `EntregaShell/` | **0 ocorrências** |
| 403 em `/logistica/*` vindos do **navegador desktop** (04/08 e 08/08) | **79** |

**Empresa por empresa:** 5 HBX→website · 40 Vander→bot,website · **46 Andrea→logistica** ·
49 will gamer→conversas · **50 Brenda Mendes→SEIS módulos** (atendimento, bot, conversas, logistica,
vendas, webscraping) · 51 jbinformatica→conversas · 52 Jhonatan→atendimento,bot,conversas,webscraping.

**Assinatura mecânica da desistência:** dos 16 aparelhos da base, os 4 de vida mais curta são
27 s, **41 s (Andrea)**, **44 s (Andrea)**, 55 s. Os outros 12 vivem de 8.312 s a 2.739.799 s.
**Morrer em menos de 60 segundos é a impressão digital deste bug.**

⚠️ O log do backend retém ~7 h e a linha de erro **não carrega companyId/userId**
(`all-exceptions.filter.ts:73`, e é `logger.debug` — em produção some). Tudo acima é **piso, nunca teto**.

---

## 3. O BURACO GÊMEO — E ELE É MAIOR: **PAGAR MATA A LOGÍSTICA**

`logistica` **não pertence a nenhum plano comercial** (`commercial-plan-catalog.ts:232-237` só tem
vendas/webscraping/atendimento/cadastro). E **7 caminhos** fazem
`updateMany({where:{companyId}, data:{enabled:false}})` sobre **TODAS** as linhas antes de religar só
as chaves do plano:

`financeiro.service.ts:611` (**quando a empresa PAGA**) e `:1657` (graça vencida) ·
`auth.service.ts:712,861,876` (signup/checkout) · `commercial-plans.service.ts:617` (troca de plano) ·
`companies.service.ts:1611,1713` (limpeza/arquivar).

**Efeito:** qualquer tenant com linha de logística que **pague, troque de plano, vença a graça ou
seja reativado** fica com `enabled=false` e **nada volta a ligar**. Mesmo vale para `conversas`,
`comex`, `empresas`, `contatos`, `produtos`.

> É a mesma doença do incidente — entitlement comercial escrito na coluna de preferência — só que
> disparada por **dinheiro** em vez de OOBE. E atinge exatamente quem paga.

---

## 4. A CURA — TRÊS LEIS

### LEI 1 — Preferência **nunca** tranca API
Coluna aditiva `tenantHidden Boolean @default(false)`. Três camadas com donos disjuntos:

| Camada | Dono | Escreve | Pode negar API? |
|---|---|---|---|
| `masterEnabled` | HBX (teto) | `/master` — **2 escritores disciplinados** | **SIM** |
| `enabled` | Comercial (plano/cobrança) | cobrança, provisionamento | **SIM** |
| `tenantHidden` | O tenant (gosto) | OOBE, Configurações | **NUNCA** — só esconde da barra |

`planCategoryModuleWrites` passa a emitir `{tenantHidden:true}` no lugar de `{enabled:false}`. O teste
que blinda o contrato errado é **reescrito para exigir o oposto**. Os 7 `updateMany` de cobrança ganham
escopo `PLAN_MANAGED_MODULE_KEYS` — módulo fora do universo de plano deixa de ser zerado por boleto.

### LEI 2 — Nenhuma negação é anônima
Hoje **6 causas distintas** colapsam num único literal sem campo de ação
(`modules.service.ts:2225,2256,2276,2297,2303,2311`), e a informação é destruída **no leitor**
(`getCompanyModuleOverride:2103-2109` devolve o AND já colapsado) antes de qualquer decisão.

`canUserAccessModule` vira casca fina sobre `evaluateModuleAccess() → ModuleAccessVerdict`
`{allowed, scope, code, userMessage, remedy:{by, where, action}}` — **reusando o vocabulário
`presentModuleBlockForRole`/`blockedCode` que já existe e está desligado**
(`module-access-policy.ts:125-150`). A assinatura pública é preservada: **nenhum chamador quebra.**

O log sobe de `debug` para `warn` e ganha `companyId/userId/moduleKey/cause` — sem isso, nenhum
incidente desse tipo é mensurável depois do fato.

> Hoje o front traduz esse 403 para **"Você não tem permissão para isso. Fale com o administrador."**
> (`frontend/src/lib/errors.ts:76`). A Andrea **É** a administradora. A mensagem mandou ela falar com
> ela mesma, e a cura estava a 3 cliques em `/configuracoes` → Módulos.

### LEI 3 — Portão que torna o erro mudo **impossível**
No padrão que a casa já usa (`check-tenant-raw.mjs`, `check-pele.mjs` + baseline, `prova-*.js` +
`_regenerar` exit 9), plugado em `scripts/ops/gate.js` **E** em `scripts/ops/deploy-vps.js` — porque já
está registrado que o publish não roda o lint do frontend:

- **A.** `check-erro-sem-traducao.mjs` — código de erro emitido sem tradução nos **dois** clientes reprova.
- **B.** `check-boot-mudo.mjs` — regra **dura** (nasce e permanece em ZERO): rota de BOOT
  (`BOOT.json`, ~13 rotas) não pode viver dentro de `catch` que descarta. Catraca global sobre os
  **267** engolidores de `ponte-src` + ~209 do web (só desce).
- **C.** `test:modulo-403` — prova que `tenantHidden=true` **nunca** produz 403, que todo 403 sai com
  `cause`+`action`+`fixUrl`, e que nenhum caminho de cobrança zera chave fora do plano.
- **D.** `prova-403-tem-endereco.js` — mede o **pixel**: injeta 403 em todas as rotas de boot e exige
  portão nomeado com botão de remédio; proíbe "Sua sessão expirou" e botão sem `data-acao`.

---

## 5. OS FUROS QUE OS CÉTICOS ACHARAM (não implementar sem tratar)

1. **Backfill cego CONCEDE módulo nunca vendido.** `CATEGORY_MANAGED_MODULE_KEYS` inclui `bot` e
   `website`, que têm `defaultEnabled=false` — 5 das 16 linhas são exatamente essas. Setar
   `enabled=true` nelas é **concessão nova, não restauração**. → Backfillar `enabled=true` **só**
   onde `defaultEnabled=true` **e** fora de `PLAN_MANAGED` — na prática, **só `logistica`**.
2. **Para chave de plano, backfill blinda contra o plano.** Linha ausente *segue* o plano; linha
   `enabled=true` **ignora o plano para sempre** (`modules.service.ts:2292-2297`). → Para chave de
   plano, **DELETAR a linha**, nunca `SET enabled=true`.
3. **Downgrade vaza módulo pago.** Escopar os `updateMany` à lista do plano *corrente* remove a única
   revogação existente: MELHOR→LITE deixaria `atendimento` ligado para sempre. → Escopar à **união**
   (`PLAN_MANAGED_MODULE_KEYS`), com teste `MELHOR→LITE derruba atendimento e cadastro`.
4. **Cobrança não deixa trilha.** Os caminhos de dinheiro gravam a *mesma forma* (`enabled=false`,
   `masterEnabled` intocado) e **não chamam `registerSupportAction`** — é impossível distinguir "OOBE"
   de "cobrança revogou" pela regra. Hoje as 16 são todas OOBE (conferido), mas 2 (company 40, 10/07)
   não têm auditoria nenhuma. → Backfill por **lista branca nominal**, não por regra.
5. **🔴 O tenant se auto-concede entitlement hoje.** `POST /profile/module-categories` grava
   `enabled:true` sem plano, sem pagamento e sem master (`module-categories.ts:105-115`). **Já foi
   exercido em produção:** company 49, 08/08 04:12, ADMIN do tenant ligou `website` — que não está em
   nenhum plano e tem `defaultEnabled=false`. → Rota de tenant só pode escrever `tenantHidden`; regra
   de **coluna** no portão.
6. **O portão do app morre na abertura.** O portão é montado na última `.tela` viva e **troca de tela
   o mata de propósito** (`logistica-2.0.html:8781`); os 403 chegam em ~0,3 s e a abertura sai aos
   3,4 s levando a parede junto. → Slot persistente + re-armar após `ir('rota')`; **nunca** guard de
   1 disparo por sessão.
7. **Os botões de remédio são mortos dentro do APK.** `normalizeAndAuthorizePath` reprova
   `/modules/*` **antes da rede** (`NativeApiClient.kt:216`) — a falha volta status 0, body `{}`, sem
   `code`. → Allowlist Kotlin + rebuild **no mesmo lote**, ou o portão só oferece "Falar com a HBX".
8. **A cura viaja dentro do APK — o aparelho quebrado é o que não a recebe.** O parque instalado só é
   salvo pela parte do **servidor**. → `userMessage` no `POST /mobile/devices/session`
   (`PairingActivity.kt:277-289` **já** pinta frase do servidor, zero Kotlin novo) + tornar
   `version-logistica.json` passo **bloqueante** do publish.
9. **Despachar por `code` não cobre a classe dominante.** Existem **278** `new ForbiddenException('texto')`
   **sem** `code` — incluindo dentro da própria logística. Sem `code`, `structuredBusinessBody` nem
   entra. → Gatear por **status + `userMessage`**; o `code` só escolhe o remédio.
10. **🔴 A fila offline descarta trabalho de entrega.** `isPermanent()` põe 403 no balde permanente
    (`OperationalSync.kt:153`) → `markCommandRejected`, e a frase oferece **"Descartar e seguir"**.
    Módulo desligado = **perda de entrega já confirmada**. → 403 com code de acesso é **bloqueio
    reversível**: congelar a fila, nunca descartar.
11. **Toggle mentiroso do outro lado.** `options` só conhece *ligado* e *locked*; falta `notEntitled`.
    Sem os 3 estados, a LEI 1 só muda o lugar da mentira.
12. **Sobram canos fora da política no web.** ~10 `fetch(getApiBase()...)` crus, incl. `/inbox/events`
    e `/vendas/report/export.pdf`; e **não existe `frontend/src/middleware.ts`** — digitar `/logistica`
    monta a tela inteira. Foi assim que nasceram os 79 403 de navegador.

---

## 6. ORDEM DE EXECUÇÃO

| # | Lote | Salva quem | Depende de |
|---|---|---|---|
| **L0** | Escopar os 7 `updateMany` de cobrança + teste de downgrade | **quem paga** (buraco maior) | — |
| **L1** | Migration `tenantHidden` + backfill nominal (só `logistica`) | as 7 empresas | GO sobre `conversas` |
| **L2** | `evaluateModuleAccess` + payload com causa/remédio + log `warn` com companyId | todos, **inclusive APK velho** | L1 |
| **L3** | `userMessage` no `/mobile/devices/session` | **parque já instalado** | L2 |
| **L4** | Web: `errors.ts` + 3 estados no toggle + `ModuloGate` de rota | os 79 403 de desktop | L2 |
| **L5** | APK: portão persistente + allowlist Kotlin + fila que não descarta + rebuild | novos aparelhos | L2, L3 |
| **L6** | Portões A/B/C/D no `gate.js` e no `deploy-vps.js` | **o futuro** | L1–L5 |
| **L7** | `docs/Rules/PAGAMENTOS.md:14` reescrito + matar flag fantasma do `.env.example:315` | o próximo agente | — |

**Régua de pronto (medida onde o incidente foi provado):**
(i) `SELECT count(*) FROM "CompanyModule" WHERE enabled=false AND "masterEnabled"=true` cai de **16 → 0**;
(ii) os 36 pares em 403 caem para 24, e os 24 restantes respondem com `cause` + `fixUrl`;
(iii) rotas de boot com catch engolidor: **12 → 0**;
(iv) grep de `MODULE_ACCESS_DENIED` em `frontend/src` e `EntregaShell/`: **0 → ≥1 em cada**;
(v) alerta "primeiro minuto morto" (≥5 negativas do mesmo par em 120 s, ou aparelho com vida < 90 s)
passa a existir — hoje **ninguém** olha para isso.

---

## 7. DECISÕES QUE SÃO DO DONO (travam o L1)

1. **`logistica` entra em plano comercial?** Hoje não está em nenhum. Enquanto não estiver, `enabled`
   para ela não tem dono — e a pergunta "quem paga pela logística" fica sem resposta no código.
2. **`conversas`:** `seedConversasOptOutTx` grava `enabled=false` em **todo** tenant novo para expressar
   decisão da **plataforma**, não do tenant. Backfill cego a religa em todo mundo.
3. **Pareamento móvel recusa ou informa?** Recusar em `openDeviceSession` derruba aparelho já pareado
   que hoje funciona. Ação LIVE — não move sem GO explícito.

---

*Mapeado por 13 agentes: 6 leitores de código, 1 medição em produção, 3 desenhos independentes,
2 juízes (convergiram), 2 céticos (ambos refutaram a v1 — os 12 furos acima vieram deles).*
