# LOGÍSTICA-MOBILE — o app de entrega de respeito (PWA)

> Ordem do dono 04/07: "um aplicativo web, mas de respeito mesmo... app bonito, interativo, simples e
> SEM explicações; rolar pra direita/esquerda pra próxima entrega; previsão de término; pronto para
> espalhar como app." Arquiteto: Opus. Workers implementam LOCAL, **1 sprint por vez** (sequenciais,
> sem `git stash`, `git add` por caminho), **NÃO publicam**. Pressupõe NUCLEO-CRM aterrissado
> (`../NUCLEO-CRM/PLANO-ROBUSTEZ.md` R1; R2 idealmente antes do M6).

---

## 1. O filme (visão — o que o entregador vive)
Abre o app instalado na tela inicial → **"Hoje"**: entregas do dia (geradas pela recorrência +
agendadas), confirma a lista → **"Iniciar rota"** → o app ORDENA a melhor rota e mostra a parada
atual em card cheio (swipe ←/→ navega; barra 3/12; **previsão de término ao vivo**) → **Navegar**
abre o Waze → chegando (~60m, geofence) o app **vibra e abre a folha de chegada**: stepper
"quantos {produto}?" pré-preenchido com o padrão DAQUELE cliente → **Entregue** (1 toque) → o zap sai
com a regra que o ADMIN cadastrou ("{saudação} tudo bem? foram entregues X {produto}") → a cobrança
segue a regra financeira (pago na hora | pendura | fecha no mês) → vencida e não paga → **recovery**
(se o tenant ativou). Swipe → próxima parada.

## 2. Princípios de UX (LEI deste plano — feedback direto do dono)
1. **ZERO texto explicativo na tela.** Ícone + número + 1 verbo. Nada de parágrafo, nada de dica.
2. **1 polegar:** ações principais na metade de baixo; alvos ≥48px.
3. **Swipe é a navegação primária** (parada anterior/próxima) com dots de posição.
4. **Feedback físico:** `navigator.vibrate` na chegada e na confirmação.
5. **Sempre visível:** progresso (X/N) + previsão de término. O entregador vive por isso.
<<<<<<< Updated upstream
6. Bonito = tokens do hbx-theme (5 Leis). Classes novas `.rota-*` centrais; zero hex/inline.
7. Mockup de referência: conversa de 04/07 (3 telas: Hoje / Rota c/ swipe+ETA / Chegada c/ stepper).

=======
6. Bonito = Design System **Entrega** (seção 2b). Zero hex/inline em TSX; `check-pele` verde.
7. Mockup de referência: conversa de 04/07 (3 telas: Hoje / Rota c/ swipe+ETA / Chegada c/ stepper).

## 2b. Design System Entrega — a saída das peles velhas (decisão do dono 04/07)
As peles do dashboard (`aurora/ember/rose/cyber`) são desktop-first e ficam ruins no mobile
(`mobile.css` é remendo). O app NÃO usa nenhuma delas. As 5 Leis continuam valendo — elas exigem
CENTRALIZAÇÃO, não a cara antiga:
- **Arquivo central novo `hbx-theme/entrega.css`** com escopo `[data-skin="entrega"]` no wrapper do
  shell — as peles velhas NÃO vazam pra dentro (imune até ao PeleSwitch). Hex vive SÓ aqui (onde a
  Lei permite); TSX limpo; `check-pele` verde.
- **Tokens mobile-first:** tipo base 17px; títulos 24/28; números grandes 34px (stepper/progresso);
  espaçamento em grade de 8; radius 16–20; alvos ≥52px; cards full-bleed (sem tabela, sem densidade
  de dashboard); transições 180–240ms com spring no swipe; safe-area.
- **Modo:** claro de ALTO CONTRASTE por default (entregador no sol) + escuro automático à noite.
- **Componentes nomeados:** `ent-stop-card`, `ent-stepper`, `ent-chips`, `ent-progress`, `ent-sheet`.
- Critério de aceite visual: o mockup de 04/07 (não "parecido com o dashboard").

>>>>>>> Stashed changes
## 3. Decisões de arquitetura (trade-off na cara)
| Decisão | Escolha | Por quê / custo |
|---|---|---|
| App | **PWA instalável** (manifest+SW), não nativo | R$0, 1 codebase, atualiza no deploy. TWA/Play Store = opcional na M9 (US$25 único, decisão do dono) |
| Melhor rota | **Heurística local** nearest-neighbor + 2-opt sobre Haversine | R$0; ótimo o bastante p/ ≤50 paradas de 1 entregador. Sem trânsito — o trecho-a-trecho é do Waze |
| "Cheguei" | Geofence em **foreground** (`watchPosition` + Haversine < raio) + Wake Lock na rota | Honesto: PWA NÃO acorda fechado. Com o app aberto durante a rota (caso real), funciona |
| Rastreio contínuo no servidor | **NÃO** (default) | Bateria + LGPD. Só a posição da CONFIRMAÇÃO é gravada. Rastreio ao vivo = decisão explícita futura |
| Offline | Fila local (IndexedDB) + sync idempotente | Zona sem sinal não pode travar entrega |
| Agenda (módulo `/agenda`) | **NÃO acopla na V1** | A "agenda" da logística é a RECORRÊNCIA (M2) gerando as entregas do dia. `/agenda` é domínio de atendimento; espelho = flag futura |
| Financeiro | **Opt-in por tenant** (`LogisticaConfig.moduloFinanceiroAtivo`) | Item 1 do dono ("se cliente quiser ativar") |
| Recovery | **Opt-in por tenant**; entra no funil hbx-recovery EXISTENTE | Item 2 do dono; respeita disjuntores/teto de zap que já rodam |

## 4. Respostas às perguntas do dono
1. **Financeiro** → opt-in (M6): recebimento na entrega + fechar-mês + extrato por cliente.
2. **Recovery** → opt-in (M7): charge vencida → `DebtCase` → cadência do hbx-recovery já em prod.
3. **Agenda — vai envolver?** → Só como RECORRÊNCIA interna (M2). Não acopla o módulo `/agenda` na V1.
4. **Logística** → é a espinha do plano (M1–M4).
5. **Visual** → seção 2 + mockup; M4 é o sprint dele.

## 5. Modelo de dados novo (tudo ADITIVO; migrations à mão padrão N1 se shadow DB falhar)
- **`ClienteProduto`** (a amarração produto×cliente — pedido explícito): `companyId`,
  `customerProfileId`, `productId`, `qtdPadrao Int`, `precoAcordado Float?` (vence o catálogo),
  `frequenciaDias Int?` (7=semanal) OU `diasSemana String?` ("1,3,5"), `proximaData DateTime?`,
  `ativo Bool @default(true)`. `@@unique([companyId, customerProfileId, productId])`.
- **`EntregaItem`**: `entregaId`, `productId`, `qtdPrevista`, `qtdEntregue?`, `valorUnit`.
  (Entrega vira multi-produto; `Entrega.quantidade/valor` viram derivados/legado.)
- **`LogisticaConfig`** (1/empresa): `avisoWhatsEnabled`, `templateAviso` (variáveis `{saudacao}
  {cliente} {itens} {qtd} {produto}`), `raioChegadaM @default(60)`, `velocidadeMediaKmH @default(25)`,
  `tempoParadaMin @default(5)`, `cobrancaNaEntrega Bool`, `moduloFinanceiroAtivo`,
  `moduloRecoveryAtivo`, `gerarDiaAutomatico @default(false)`.
- **`Entrega`** ganha: `rotaOrdem Int?`, `etaAt DateTime?`, `whatsappStatus String?`,
  `cobrancaOutcome String?`, `recebidoNaHora Bool?`, `receiptMethod String?` (pix|dinheiro|fiado),
  `idempotencyKey String? @unique` (base do offline M8).

---

## 6. Sprints

<<<<<<< Updated upstream
### M1 — PWA shell (o "vira app")
Manifest (nome "HBX Entregas", ícones maskable, `display: standalone`, theme), service worker de
shell, botão "Instalar" (`beforeinstallprompt`) + QR de instalação no painel do admin, viewport/
safe-area, Screen Wake Lock ativo durante a rota. Sem flag (só casca).
**Check:** Lighthouse "instalável" ✅; zero regressão nas rotas atuais.
=======
### M1 — Shell independente + Design System Entrega (o "vira app")
- **Rota FORA do `(app)`**: `frontend/src/app/entrega/` com `layout` próprio — SEM AppShell/Sidebar/
  MobileTabBar/chrome do dashboard. Wrapper com `data-skin="entrega"`.
- **`hbx-theme/entrega.css`** (seção 2b): tokens + componentes base do app. Nenhuma pele velha entra.
- **Manifest PRÓPRIO** (`/entrega/manifest.webmanifest`): nome "HBX Entregas", `start_url: /entrega`,
  ícones maskable, `display: standalone` — instalar abre DIRETO no app (o manifest global "HBX System"
  do dashboard fica intocado; o SW `hbx-sw.js` que já existe é reusado).
- Botão "Instalar" (`beforeinstallprompt`) + QR de instalação no painel do admin; viewport/safe-area;
  Screen Wake Lock durante a rota. Auth: reusa a sessão/JWT existente (login enxuto se deslogado).
- Nota de perf: o `globals.css` do root ainda carrega o CSS do dashboard nesta rota (cascata do layout
  raiz) — aceitável na V1; se o Lighthouse do M9 reclamar, mover os imports pro layout do `(app)`.
**Check:** Lighthouse "instalável" ✅ em `/entrega`; zero regressão nas rotas atuais; `check-pele` verde.
>>>>>>> Stashed changes

### M2 — Amarração produto×cliente + recorrência (schema/backend)
`ClienteProduto` + `EntregaItem` + `LogisticaConfig` + colunas novas da `Entrega` (seção 5).
CRUD `ClienteProduto` na ficha do cliente (aba "Produtos do cliente": produto, qtd padrão, preço
acordado, frequência). "Gerar entregas do dia": botão do admin (+ cron atrás de `gerarDiaAutomatico`
OFF) varre `ClienteProduto` vencidos → cria `Entrega`+`EntregaItem` (**idempotente por
[cliente, dia]**, atualiza `proximaData`).
**Check:** geração idempotente (2 cliques = 1 entrega); frequência 7d gera na data certa. Dep: R1.

### M3 — Motor de rota + ETA (backend)
`POST /logistica/rota/planejar {date}`: NN + 2-opt sobre Haversine nas paradas com lat/lng (sem
coord → fim da fila com aviso), grava `rotaOrdem`; calcula `etaAt` por parada
(`velocidadeMediaKmH` + `tempoParadaMin`) e a previsão de término. `POST /logistica/rota/iniciar`.
Re-ETA a cada confirmar/cancelar/pular.
**Check:** fixture de 12 coords — rota 2-opt ≤ rota ingênua; ETA monotônico. Dep: M2.

### M4 — O app do entregador (front — O sprint do visual)
- **"Hoje":** lista do dia (nome, itens previstos), swipe p/ adiar/remover, CTA "Iniciar rota".
- **"Rota":** card cheio da parada atual; **swipe ←/→**; dots + X/N + término previsto ao vivo;
  Navegar (deep-link Waze/Maps); geofence foreground → vibra + abre folha de chegada.
- **Folha de chegada:** stepper por item (pré-preenchido `qtdPadrao`), **"Entregue" em 1 toque**;
  "Não entregue" → chips de motivo (ausente | recusou | reagendar). Se `moduloFinanceiroAtivo`:
  chips de recebimento (pix | dinheiro | pendura) — 1 toque.
<<<<<<< Updated upstream
- ZERO texto explicativo (seção 2). Classes `.rota-*` centrais; transições curtas; vibrate.
=======
- ZERO texto explicativo (seção 2). Componentes do Design System Entrega (`ent-*`, seção 2b);
  transições com spring; vibrate. Telas vivem em `/entrega` (shell do M1), não no `(app)`.
>>>>>>> Stashed changes
**Check:** Playwright mobile viewport com GPS mockado — fluxo Hoje→Rota→Chegada→Entregue completo.
Dep: M2 (M3 pra ordem/ETA; se M3 atrasar, stub com ordem manual — não bloquear).

### M5 — Regras do admin
`/logistica/config`: editor do aviso WhatsApp com variáveis + **preview ao vivo**, toggle global e
por cliente (avisar/não), raio de chegada, velocidade média, cobrança na entrega, gerar dia
automático. O confirmar passa a renderizar o template (substitui a msg fixa do N6).
**Check:** template com todas as variáveis renderiza; cliente com aviso OFF não dispara. Dep: M2.

### M6 — Financeiro do tenant (opt-in) — FRENTE FINANCEIRA (Opus direto + revisão de diff)
Pressupõe ROBUSTEZ R2 (charge linkada a cliente/dueDate); **se R2 não rodou, M6 o absorve**.
- Recebimento na entrega: pago → charge paga na hora (`receiptMethod`); pendura → `pending` com
  `dueDate` pela regra do cliente.
- Fechar-mês: entregas `aguardando_fechamento` agrupadas por cliente no `diaFechamento` → 1 charge.
- Extrato por cliente (na ficha) + resumo do dia do admin (entregue / recebido / a receber).
**Check:** idempotência do fechamento; 2 entregas + 1 pagamento parcial; NADA dispara MP
(`MANUAL`/`pending`). Dep: M4, M5.

### M7 — Recovery (opt-in)
`moduloRecoveryAtivo` + charge vencida (`dueDate < hoje`, `pending`) → cria/atualiza `DebtCase` e
entra no funil **hbx-recovery EXISTENTE** do tenant (cadência de zap com disjuntor/teto que já rodam
em prod). Badge "em cobrança" na ficha do cliente. **Nunca** caminho de envio novo.
**Check:** vencida → DebtCase 1× (idempotente); tenant sem recovery → nada acontece. Dep: M6.

### M8 — Offline-first
Fila IndexedDB de confirmações (payload + `idempotencyKey`), sync ao reconectar com backoff e **teto
de tentativas** (NUNCA loop infinito), indicador de pendências no header, SW cacheia o GET da rota do
dia (stale-while-revalidate). Server: `/confirmar` idempotente por `idempotencyKey` (unique).
**Check:** modo avião → 3 confirmações → religa → 3 sincronizadas SEM duplicar (zap/charge 1×). Dep: M4.

### M9 — Distribuição + QA de campo
Ícones/splash finais, QR de instalação no painel, onboarding de 3 telas VISUAIS (sem parágrafos),
Lighthouse PWA/Perf ≥90, QA real: uma rota de verdade com **chip DESCARTÁVEL** (ver o zap sair 1× sem
loop antes de chip real). TWA/Play Store = decisão do dono (default: fica pra depois; link/QR já
espalha). Dep: todos.

---

## 7. Riscos / guardrails duros (não violar)
- **WhatsApp:** TODO envio pelo caminho blindado (`queueOutboundForCompany`). O retry offline (M8)
  tem teto e idempotência — **jamais loop** (loop = chip banido; foi a causa real do 18/06).
- **Dinheiro:** charge atômica e idempotente; nada dispara MP; M6/M7 = Opus direto + revisão de diff.
- **GPS/LGPD:** posição contínua NÃO sobe pro servidor; grava-se apenas o ponto da confirmação.
- **Repo:** workers sequenciais, `git add` por caminho, sem stash, não tocar arquivos paralelos do dono.
- **Flags:** efeitos novos default OFF; módulos = kill-switch; tenant que não ativou não muda em NADA.

## 8. Ordem de execução
`M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9`. ROBUSTEZ R1 é pré-requisito de qualquer coisa em prod;
R2 idealmente antes do M6 (senão M6 absorve). Cada worker grava `M{n}-RESULTADO.md` nesta pasta e
confere `origin/master` antes de começar.

## 9. Checks por sprint
`backend npm run build` + `prisma validate` + `frontend tsc --noEmit` + check-pele (0 violação
própria) + testes do sprint verdes; **NÃO publicar**.
