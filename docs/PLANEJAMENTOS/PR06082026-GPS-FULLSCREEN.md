# PR06082026 — GPS FULL SCREEN + CADERNETA COMO PLANEJAMENTO

> **Executor:** Opus ultracode. **Antes de tocar em QUALQUER coisa:** ler
> `memory/hbxapk.md` (guia único do APK — regra de teste §1, 10 Leis de UI §2,
> armadilhas de render §4) e `Webwhats` NÃO faz parte desta frente.
> **Brainstorm de origem:** 06/08 — dono validou a linhagem "navegação de verdade
> em full screen" e cravou a tese nova: **a caderneta É o planejamento da rota;
> o GPS é uma pele de execução opcional em cima da MESMA lista.** Se o André não
> quiser GPS, o planejamento fica o mesmo.

---

## 0. Tese (não desviar dela)

1. **Planejar** = caderneta / agenda do dia (dia é do CLIENTE — `LogisticaPlanoEntrega`).
2. **Conferir** = portão único que valida pino e DEBITA ("Confirmar rota" — lei já cravada:
   montar e conferir são a MESMA coisa, reordenar é DENTRO dela).
3. **Executar** = duas peles sobre a mesma lista: **lista simples** (venda direto na
   caderneta, sem GPS) OU **navegação full screen** (esta frente).

A ponte caderneta→GPS **já existe** e NÃO deve ser reconstruída: Finalizar caderneta salva
"Caderneta de \<dia\>" nas Rotas salvas; convite GPS 1×/dia abre Rotas salvas com a caderneta
do dia pinada; `caderneta/resumo` devolve `base{total,provados,pronto}` (medidor "Mapa: X de N").

**Esta frente NÃO reconstrói navegação.** Traço + seta + manobra + ETA + voz + retraço com
disjuntor + avanço automático (`nextStopOverlay`) estão EM PROD e custaram madrugadas.
O trabalho é: casca full screen (Etapa A), lacunas de estado (B), matar o `prompt()` (C),
semear a rota com a ordem da caderneta (D — **gated**).

---

## 1. O que JÁ existe (âncoras verificadas 06/08 — usar, não recriar)

| Peça | Onde | Nota |
|---|---|---|
| Toggle do modo navegação | `app.js:8731` `syncNavWatch()` → `:8741` `classList.toggle("nav-cheia", navegando)` | ponto ÚNICO de liga/desliga; estender AQUI |
| Tela acesa | `app.js:8738` `H.manterTelaAcesa()` → `NativeAppBridge.kt:816` | padrão de método de ponte pra copiar |
| CSS do nav-cheia atual | `app.css:855-865` (`.route-map-shell { height: calc(100dvh - 268px) }` na 858) | é "mapa ampliado", não full screen — substituir |
| Controles da rota | `app.css:874` `.route-controls { min-height: 124px }` | some durante navegação (A3) |
| Casca (topbar+bottom-nav) | `native.js:552` `frame()` — sempre renderiza `.topbar`/`.content`/`.bottom-nav` | NÃO mexer no frame; esconder por CSS sob a classe raiz |
| Insets | `MainActivity.kt:246-250` — `setOnApplyWindowInsetsListener(appHost)` aplica systemBars como padding | é ISSO que o modo navegação zera/restaura |
| Imersivo pronto pra copiar | `ChegadaActivity.kt:105-114` — `setDecorFitsSystemWindows(false)` + `hide(systemBars)` + `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` | padrão da casa, já testado em prod |
| Voltar do Android | `MainActivity.kt:255-265` → `window.HBXApp.handleBack()` | Lei 10: o modo novo ENTRA no handleBack |
| SDK | `build.gradle.kts:159-164` — compileSdk 35, targetSdk 35, minSdk 26 | Android 15 força edge-to-edge; esta frente paga a dívida no nosso ritmo |
| Mapa | host `#route-live-map` dentro de `.route-map-shell` dentro de `.route-hero` | TRANSPLANTADO (`el.__hbxMap`) — nunca recriar; garagem `mapaEstacionado` |
| Avanço automático | `nextStopOverlay` (anel por `state.nextCountdown`, stroke-dashoffset inline) | já é o "próxima parada automática" do mercado |
| Chegada | 3 níveis por config: `deliveryOfflineSheet` / `deliverySimpleSheet` / `deliverySheet` | o "CHEGUEI → folha da parada" já existe |

---

## 2. ETAPA A — navegação full screen (núcleo, sem decisão pendente)

### A1 — JS: um estado raiz, um dono
- `syncNavWatch()` (`app.js:8731`) ganha UMA chamada nova: `H.modoNavegacao(navegando)`
  (wrapper no `native.js` com feature-detect — `window.HBXAndroid?.modoNavegacao` pode não
  existir em APK velho; sem o método, o CSS sozinho já entrega 90%).
- A classe `nav-cheia` continua sendo o estado raiz. NÃO criar segunda classe/flag.

### A2 — Kotlin: `modoNavegacao(ligado: Boolean)` no `NativeAppBridge`
Copiar o padrão de `manterTelaAcesa` (`:816` — main thread, activity viva) + o imersivo da
`ChegadaActivity.kt:105-114`:
- **ligado=true:** `setDecorFitsSystemWindows(window,false)`; esconder
  `WindowInsetsCompat.Type.systemBars()` com `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE`;
  zerar o padding do `appHost` (o listener de `MainActivity.kt:246` precisa de um flag
  `modoNavegacaoAtivo` pra aplicar `setPadding(0,0,0,0)` em vez dos bars).
- **ligado=false:** restaurar decorFits, `show(systemBars)`,
  `ViewCompat.requestApplyInsets(appHost)` — a tela anterior volta EXATA.
- Cutout: `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES` só em modo navegação.
  No `index.html`, `viewport-fit=cover` + HUD superior com margem `env(safe-area-inset-top)`
  (verificar no aparelho — g15 não tem notch, então provar também por screenshot com barra
  transiente).
- Rotação/resume: reaplicar o estado no `onResume` se `modoNavegacaoAtivo`.

### A3 — CSS: mapa toca os 4 lados; HUD flutua POR CIMA
Sob `html.nav-cheia` (substituindo o bloco `app.css:855-865`):
- Esconder: `.topbar`, `.bottom-nav`, `.route-filter`, `.creditos-dia`, `.route-hero > .progress`,
  `.section-title`, `.list`, `.fab`, `.route-controls`.
- `.content { padding: 0 }` e `.route-map-shell { height: 100dvh; max-height: none; border: 0; border-radius: 0 }`.
- **🔴 PROIBIDO `position: fixed`** no shell do mapa: as transições de tela usam `transform`
  (`screen-enter-*`) e fixed sob ancestral transformado quebra (armadilha documentada §4 do
  hbxapk). Com a casca escondida, o fluxo normal já ocupa 100dvh — não precisa de fixed.
- HUD como overlays `position: absolute` DENTRO do `.route-map-shell` (irmãos do mapa,
  nunca filhos do host transplantado):
  - **Topo:** manobra grande ("Em 250 m · vire à direita" + nome da via) — já existe no
    painel atual; vira banner overlay.
  - **Base:** cartão da próxima parada — "Parada 3 de 12 · Nome · ~HH:MM" + botão **CHEGUEI**
    largo. Lei 8: dado em LINHA, zero parágrafo. Copy literal só a que já existe; palavra
    "pino" PROIBIDA.
  - **Laterais:** recenter + áudio (já existem — reposicionar, não recriar).
- **Painel recolhe em movimento:** velocidade ≥ 2,5 m/s (reusar o limiar do `bearings` do
  retraço) → cartão da base colapsa pra 1 linha; toque expande. Transição por classe
  (Lei 9), `prefers-reduced-motion` respeitado.
- Depois de mudar o tamanho do container: `map.resize()` no mapa EXISTENTE (transplante,
  nunca remount). Câmera continua com dono só (`parts.enquadradoEm`) — full screen NÃO é
  motivo pra re-enquadrar.
- **Invariante "rota cortada":** página sem rolagem = rolagem ZERO. Entrar/sair do modo
  passa por `navigateTo`/reset de scroll; provar com 2 screenshots + arrastar.

### A4 — Voltar (Lei 10)
`handleBack` com `nav-cheia` ativo → **sai do modo cheio de volta pra tela Rota normal, SEM
encerrar a rota** (rota debitada não morre por um toque — lei existente). Encerrar continua
sendo ação explícita no fluxo atual. NUNCA sair do app direto do modo navegação.

### A5 — Critério de aprovação (do brainstorm, dono validou)
Mapa toca os 4 lados · zero topbar/menu durante navegação · página não rola · manobra legível
numa olhada · 1 toque até CHEGUEI · concluiu → próxima parada aparece sozinha (já existe) ·
sair da navegação restaura a tela anterior exata.

---

## 3. ETAPA B — lacunas de estado (preencher, não reconstruir)

- **CHEGOU:** o toque em CHEGUEI abre a folha de chegada que a config já escolhe
  (offline/simples/completa). Não criar folha nova.
- **Carimbos de auditoria:** gravar hora de CHEGADA (toque no Cheguei) e hora de SAÍDA
  (desfecho da folha) na Entrega, se ainda não existir campo — conferir o schema antes;
  se precisar de migration, ela entra no publish (regra: nunca migration às cegas com
  Docker parado).
- **Motivos de não-entrega:** conferir a lista atual do `deliverySheet` contra o padrão de
  mercado (ausente / fechado / endereço errado / recusou / sem pagamento / divergente /
  veículo / outro). Faltando algum, ADICIONAR ao existente — não trocar o componente.
- **NÃO fazer nesta etapa:** POD configurável por empresa (assinatura/PIN/barcode como
  matriz de config) — é frente própria, sem GO.

## 4. ETAPA C — matar o `prompt()` (bug latente que bloqueia POD)

`app.js` usa `prompt()` nativo pro código de 6 dígitos do comprovante e o Kotlin NÃO
implementa `onJsPrompt` → entrega com `codigoObrigatorio` **nunca confirma no aparelho**
(pendência §8 do hbxapk). Conserto pelo lado JS: trocar o `prompt()` por `centerModal`
com campo numérico (Lei 3 — moldura única; Lei 5 — Enter confirma). Front-only → pode
provar por `adb install -r` antes do publish (regra §1.2).

## 5. ETAPA D — caderneta semeia a rota (⛔ GATED — só com GO explícito do dono)

- "Usar hoje" / convite GPS na Caderneta de \<dia\> → a rota nasce com a MESMA lista na
  **ordem da caderneta** (ordem habitual do caderno = sequência de rua do entregador).
  Otimização entra só como SUGESTÃO; usuário decide (lei existente).
- Portão de pino continua **fail-closed**: vermelho trava montar rota. A régua do convite
  já é o `pronto/total` do resumo — NÃO afrouxar o freio pra forçar upgrade.
- Venda é um verbo só: caderneta e parada gravam a MESMA `Entrega` via `create+confirm`
  (já é assim — qualquer divergência nova é bug de produto).
- Nada de tela nova: é costura entre peças existentes (Rotas salvas + seleção do dia +
  `setRouteSelection`).

---

## 6. Leis e armadilhas que valem NESTA frente (cobradas em incidente real)

- **Ajustar ≠ reconstruir.** Traço/voz/retraço/câmera/overlay: intocados.
- Mapa transplantado (`__hbxMap`) — recriar = piscada + tiles de novo. `isStyleLoaded()`
  NUNCA como portão de fluxo.
- Endpoint novo no app.js → allowlist `NativeApiClient.kt` + rebuild, os TRÊS ou nada.
  (Etapas A-C não criam endpoint; D provavelmente também não — conferir.)
- Efeito (som/vibração/toast) em função reusada dispara 2× — call sites sempre.
- Teclado nunca cobre campo (Lei 4) — o modal da Etapa C entra no `syncKeyboardViewport`.
- Tokens de `app.css` pra TODA cor/borda/raio (check-pele R6/R7 cobre `EntregaShell/**`).
- Offline honesto: sem rede desenha rua/nome/bolinha e mantém o traço, mas NÃO recalcula
  (OSRM no VPS). Não prometer mais que isso em copy nenhuma.
- **Tree sujo de outras frentes** (PMTiles `a889d19f` + arquivos de deploy do dono):
  stage cirúrgico por arquivo/hunk, NUNCA `git add -A`, nunca stash/reset. Publicar com
  `HBX_PUBLISH_COMMITTED_ONLY=1 npm run new` se o tree ainda estiver sujo.

## 7. Gates e teste (regra §1 do hbxapk — sem exceção)

1. Build local: `gradlew.bat -p EntregaShell :app:assembleLogisticaRelease` verde +
   conferir o conteúdo novo DENTRO do .apk (`unzip -p ... assets/app/app.js | grep`).
2. `check-pele` sem violação nova nos arquivos tocados; typecheck do publish é o gate técnico.
3. **Etapa C (front-only): injetar no g15 via `adb install -r`, ver na tela, dono confirma → publica.**
4. **Etapas A/B (Kotlin+JS): publicar PRIMEIRO (`npm run publish` — commitar ANTES; nunca
   confiar no exit code, ler o fim do log), depois provar no celular.** A PRIMEIRA prova é o
   aviso de update aparecendo SOZINHO no g15 (adb install não é entrega).
5. Prova da Etapa A no aparelho: iniciar rota → screenshot mostrando mapa nos 4 lados, sem
   topbar/menu · arrastar não desfaz layout (freio do rota cortada) · Voltar sai do modo
   cheio sem matar a rota · sair restaura a tela anterior · `manterTelaAcesa` segue ligando
   só durante navegação. Deixar a tela ABERTA pro dono só olhar (regra §1.4).
6. Não mexer na fila do dono no horário da rota real (~4-5h da manhã).

## 8. Decisões ABERTAS do dono (não decidir sozinho)

1. **Barras do sistema durante navegação:** imersivo total com swipe transiente
   (recomendo — padrão Waze, já é o comportamento da ChegadaActivity) × só transparentes
   atrás do mapa.
2. **Painel da base recolhendo sozinho em movimento:** automático por velocidade
   (recomendo) × sempre expandido.
3. **Etapa D:** GO explícito pra costurar caderneta→ordem da rota.
4. **Voltar durante navegação:** sair do modo cheio mantendo a rota (recomendado e assumido
   em A4) × pedir confirmação. Se o dono quiser confirmação, é `state.confirmation` (Lei 3).
