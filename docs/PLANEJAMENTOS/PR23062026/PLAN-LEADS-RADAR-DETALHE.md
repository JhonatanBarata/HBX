# PLAN — Leads: o Radar mora no "Detalhes do negócio" (vendedor)

> Assunto: redesenhar `/leads` (`frontend/src/app/(app)/leads/page.client.tsx`). O painel
> "Detalhes do negócio" passa a ter 2 rostos: **parado** = RADAR animado + console de busca;
> **card clicado** = detalhe do lead. A lista engorda (saem os 4 KPIs e o rail de busca).
> Decidido com o dono em 2026-06-23. Frente FRONTEND (Opus orquestra; workers Sonnet editam).
>
> ⚠️ **Supersede a trava "DESKTOP 100% INTOCADO"** do mobile-deck (PLAN-MOBILE-LEADS-DECK, v2 20/06):
> o dono pediu o redesenho do desktop em 23/06. O card-overlay mobile (swipe tinder) que já existe
> FICA; o radar vira o hero do topo no mobile. Os dois planos tocam o MESMO arquivo → conciliar.

## Decisões fechadas (dono 23/06)
1. **Fora os 4 KPIs do topo.** Sobra só **"Total no Brasil"** como linha fininha no cabeçalho.
2. **Some o rail de busca da esquerda.** Cidade/segmento/alcance/quantos + Play **migram pro RADAR**
   (painel direito). A lista não tem busca própria — "usa as do radar".
3. **Painel direito = 2 estados:**
   - **idle (nenhum card):** RADAR console — disco animado + filtros compactos + Play/Parar + estado + Auto.
   - **card clicado:** radar **encolhe pra MINI no topo** (sempre visível) + `DetalhesNegocio` embaixo + "voltar".
4. **Barra de 6 ícones de canal** na lista (WhatsApp, e-mail, telefone, Instagram, Facebook, site), com
   **2 MODOS**: **Forçar na busca** (vira restrição do motor) e **Filtrar resultado** (client-side, não gasta motor).
   Construir os DOIS; qual é o default fica pra decidir depois (dono quer ver os dois no ar).
5. **Cor = estado** (`funcionando | pausado | parado`, o backend JÁ manda). STOP pra ajustar; **retoma sozinho**
   (sem religar — é o que a tela atual perdeu).
6. **Cores do tema (anestésico das 5 Leis):** sweep/blips/anéis/glow do radar saem de **token derivado do
   accent** (`color-mix` de `--hbx-brand-strong`/equivalente) → cada pele recolore o radar. Hardcoded de
   verdade só o fundo escuro do disco (cena-instrumento, exceção documentada).
7. **Renomear o item de menu "Radar" → "Leads"** (`shell.tsx:207`). O site já fala `/leads`; não insistir em "Radar".
8. **Cor do item de menu "Leads" acompanha o estado do radar, PERSISTENTE.** Reusar o efeito do Bot
   (`bot-action.tsx` → `wa-action-btn--active` = `var(--hbx-brand-strong)`), mas: (a) os 3 estados
   (`funcionando`=accent, `pausado`=âmbar/warning, `parado`=neutro), e (b) **persistente** — o shell faz um poll
   leve de `/webscraping/radar/search-runs/latest` (estado operacional) e tinge o item em qualquer tela.
9. **Automático = repõe a lista do Vendas sozinho** quando ela começa a esvaziar (já existe: standing-order +
   auto-distribution por-vendedor). MANTER e não quebrar; ajustar só a cópia se ajudar.

## Reaproveitar (fonte = backup `vps-frontend-20260613-160332`)
- Efeito `radarMotion*`: `…/radar-digital/page.module.css:7203-7445` (sweep 3.4s, blips+ripple, anéis 18s/26s,
  glow, `prefers-reduced-motion`). → vira **classe central** em `screens.css`, tokenizada.
- Máquina de estado + STOP + auto-resume: `…/radar-digital/page.client.tsx:204, 4453-4466, ~5324`.
- Filtro de canal **já existiu**: `tests/frontend-radar-channel-filter.test.mjs` → recuperar a lógica.
- Detalhe do lead: `DetalhesNegocio` (já é o componente único do aside hoje — não recriar).

## Backend — já existe, só consumir (o `/leads` hoje IGNORA)
- Estado operacional `funcionando|pausado|parado` + reason + message: `radar-run-presenter.service.ts:76`.
- Lifecycle: POST `/webscraping/radar/search-runs`; GET `/search-runs/latest`, `/:id`; POST `/:id/cancel` (=STOP);
  `/radar/standing-order` (=Auto).
- **Confirmar:** parâmetro de canal no search-run pro modo "Forçar" (senão B4 entrega só "Filtrar").

## Blocos pros workers (ao "aplique com o orquestrador")
- **B0 (fix pequeno — pode ir JÁ, independe do resto):** o botão "Buscar" trava porque o front e o backend
  discordam do "terminou". Alinhar `TERMINAL_RUN` (`page.client.tsx:109`): +`partial_error`, −`error` fantasma;
  `sleeping/pausado` **não** desabilita Buscar; expor **STOP** (chama `/cancel`). Destrava a vendedora hoje.
- **B1 (estrutura /leads):** remover 4 KPIs (sobra Total fininho); remover rail de busca; alargar/altear a lista;
  mover a busca pro painel direito. Sem legado: rail e KPIs saem no mesmo passo.
- **B2 (radar componente):** portar `radarMotion*` → classe central + tokens de radar no `skeleton.css`; ligar
  na cor/animação por estado do backend; Play/Parar/Auto.
- **B3 (painel 2-estados):** idle=radar / card=mini-radar-no-topo + `DetalhesNegocio`; botão voltar.
- **B4 (6 ícones):** barra de canais + 2 modos (forçar/filtrar). Reusar lógica do teste de canal.
- **B5 (mobile):** radar = hero do topo; card-overlay (swipe) existente segue como o detalhe; conciliar com
  PLAN-MOBILE-LEADS-DECK (mesmo arquivo).
- **B6 (menu, shell.tsx + kit.css):** rename "Radar"→"Leads"; item de menu com cor persistente seguindo o
  estado do radar (poll leve do `/search-runs/latest`). Reusar `wa-action-btn--active`. NÃO mexer em
  `screens.css`/`skeleton.css` (são do worker da tela) — usar tokens existentes + `kit.css`.

> Orquestração: B1–B4 + B6 tocam arquivos que se cruzam pouco, mas page.client.tsx é compartilhado por
> B1–B5 → **um worker coeso** dono de `page.client.tsx`+`screens.css`+`skeleton.css` faz B0–B5; o menu (B6)
> entra no MESMO worker pra não correr atrás de token que ainda não existe. Sem workers paralelos no mesmo arquivo.

## Travas / 5 Leis
- Toda cor do radar = token central → mesmo "ferindo" o hex, a Lei 3 ("tema só troca tokens") continua de pé.
  `check-pele` tem que passar; fundo escuro do disco = exceção documentada no `screens.css`.
- Zero-scroll desktop: a lista rola por dentro (já rolava); não é regressão nova.
- Dado sem contrato = "—" (mantido).

## Riscos / reverter
- Conflito com "desktop intocado" do mobile-deck → este plano supersede (dono 23/06); reconciliar `page.client.tsx`.
- "Forçar na busca" pode exigir canal no search-run backend → confirmar antes; se faltar, abre frente backend.
- Reverter: cada bloco = commit isolado; `git revert <bloco>`.

## Checks
- `cd frontend && npm run lint` (check-pele) → `npm run build`. Runtime no preview: desktop + 390px.

## Pós-teste do dono (23/06) — defeitos da 1ª busca de cliente novo (plano lead)
> 5 defeitos achados ao testar como cliente novo. Mesma tela (`page.client.tsx` + `screens.css`),
> + 1 ajuste backend (mensagem do cliente). Frente FRONTEND/MOTOR (Opus orquestra; worker Sonnet edita).

**Causas-raiz (confirmadas no código):**
1. **400 ao Buscar.** `executarBusca` (~457) manda `{city,state,segment}` SEM `quantity`; o DTO
   `WebscrapingSearchDto` exige `quantity` (controller `webscraping.controller.ts:62-66`, pipe global
   `whitelist+forbidNonWhitelisted`) → 400. O `quantos` (state, default 5) existe e nunca entra no body.
2. **Segmento não digita / "trava ao mexer no alcance".** É `<select>` (851-857 + mobile 1154-1160) cujas
   opções saem SÓ de `availableFilters.segments` (banco já populado). Cliente novo = banco vazio = zero
   opção = não escolhe nem digita. E ao recarregar a lista (debounce de city/uf, 340-345) o label escolhido
   some das opções → select controlado cai pro placeholder = "reset/trava".
3. **"Achou 3 de 20 e não exibiu nada".** Todo run AUTO-importa os found pra **carteira/Vendas**
   (`processSearchRun:994` → `autoImportSearchRunToVendas`); os 3 foram pra carteira, não pra "Disponíveis".
   No fim do poll (366-372) o front força aba `shelf` (vazia) e recarrega só shelf+bank — **não** chama
   `loadUsage()` nem a carteira → contador velho + aba errada = "sumiu". Os leads estão na carteira.
4. **Termos técnicos na tela.** `radar-core-search-loop.mixin.ts:1025` monta `batchDebugMeta`
   (`attempts=…; queryTaskCount=…; currentQuery=…; approved=…`) e cola no `errorMessage` do cliente
   (1082 e 1110). É telemetria — já vai pro log via `logHbxBatch`; não pode vazar pra `operationalMessage`.

**Blocos pro worker:**
- **P1 (fix 400):** `executarBusca` passa `quantity: quantos` no body (desktop + rail mobile).
- **P2 (segmento digitável):** trocar o `<select>` de Segmento por `<input list>` + `<datalist>` alimentado
  por `segOptions` (mantém sugestão do banco) — valor segue free-text em `segment` (o backend já recebe label
  livre). Nunca mais reseta. Os 2 lugares (console 851 + rail mobile 1154).
- **P3 (setas de obrigatório):** seta `›` na cor do radar (`var(--hbx-brand-strong)`, mesma do
  `radar-state-label--funcionando`) em Estado→Cidade→Segmento enquanto vazios; **some ao preencher**.
  Classe central em `screens.css` (::after no `.radar-controls .f` ou span dedicado; animação sutil
  apontando, respeita `prefers-reduced-motion`). Zero hex inline (5 Leis).
- **P4 (popup de erro):** ao clicar Buscar faltando Cidade/Segmento, abrir modal bem-feito reusando
  `.hbx-veil` + `.hbx-modal` (já existem) listando o que falta — substitui o `searchMsg` cru pra esse caso.
- **P5 (mostrar o que achou):** no fim do run, além de shelf+bank, chamar `loadUsage()` + recarregar a
  carteira; se `run.importedCount > 0` (ou `meta.importedCount`), abrir aba **"Minha carteira"** e avisar
  "✓ N leads na sua carteira" em vez de cair na shelf vazia.
- **P6 (backend, sem jargão):** em `radar-core-search-loop.mixin.ts`, parar de concatenar `batchDebugMeta`
  no `errorMessage` (1082 vira `finalMessage`; 1110 vira `message`). `batchDebugMeta` fica só no `logHbxBatch`.
  Sem termo técnico em nenhuma mensagem que chega na tela.

**1 decisão de produto (dono):** lead que o vendedor acha na busca deve (A) cair direto na **carteira**
[como hoje — P5 só revela onde está] ou (B) aparecer **mascarado em "Disponíveis"** pra ele escolher quem
puxar [exige backend não auto-importar no Buscar manual]. Default deste plano = **A** (menor, e é onde os
leads já estão). Se for **B**, abre sub-bloco backend.

**Reverter:** cada P = commit isolado; `git revert`. Tudo localhost.
