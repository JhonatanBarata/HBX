# ROTEIRO HBXLOG — conformidade do Loghbx.apk (27/07/2026)

Regras de execução (ordem do dono):
- **EU implanto. SEM workers.** Tudo que FURAR este roteiro → apresentar ao dono e perguntar como seguir.
- Toda correção segue a regra de teste do `hbxlog.md`: só-front → injeta no celular → dono confirma
  ("entre no celular — nesta tela ficou certo?") → publica; envolve backend → publica primeiro, testa no celular.
- Passo a passo com o dono, um item por vez. Sem print (o celular ele vê).

Escopo varrido: `EntregaShell/app/src/logistica/assets/**` (app.js 8.225 l, index.html, mobile-contract.js,
offline-controls.js, opening.html, checkout/*) + `main/assets/app/` (native.js, app.css) + 57 .kt.

## Bloco A — Leis de UI (as 10 do hbxlog.md)
- **A1 Tokens:** zero hex/inline novo fora de token; dois verdes com papel fixo (`--brand` identidade,
  `--cta` só ação principal); vermelho só quando bloqueia. Conferir: grep hex + `style="` (isenção: valor dinâmico).
- **A2 Molduras:** só 3 (centerModal / .sheet / .app-confirm). Popup fora disso = violação.
  Conferir divergência conhecida: `deliveryOfflineSheet` virou alias do simple (constituição diz folha própria zero-dinheiro).
- **A3 Excluir = segurar pressionado:** nenhum botão/lixeira de excluir. Grep "Excluir"/ícone trash em template.
- **A4 Teclado/Enter:** todo form novo em escopo com enter-avança; CTA nunca coberto.
- **A5 Erro humano:** todo catch de ação → `toast(humanApiError(e), true)`; zero `alert(`/`confirm(`/`prompt(` nativo; zero id/code cru na tela.
- **A6 Estados padrão:** loading()/showLoading/empty()/.hbx-aviso; nada de texto solto.
- **A7 Copy:** "pino" PROIBIDO em texto visível; sem `~`; sem jargão de motor; texto cravado do dono intacto.
- **A8 Transições:** nada abre/fecha seco.
- **A9 Voltar do Android:** todo `state.modal`/overlay coberto pelo `handleBack`; `app-update` obrigatória não fecha.
- **A10 Efeitos:** `H.sound`/`H.vibrate`/toast fora de função reusada (ou opt-in default mudo);
  toda ação com await de GPS/rede tem guard de reentrância (state síncrono + finally).

## Bloco B — Contratos e arquitetura
- **B1 Allowlist:** todo endpoint que o app.js chama existe em `NativeApiClient.kt` (`isMobileEndpointAllowed`) — diff dos dois lados.
- **B2 Estado declarado:** campo de `state` usado mas não declarado no state inicial (conhecidos: updateInfo, modalClient, modalProduct).
- **B3 Código morto:** branches unreachable do `modal()`; ramo `data-day` do dispatcher; `leitura-ativa` órfão; salesModule/navegação vendas no native.js pós-split.
- **B4 Placebo:** switch "Módulos" nos Ajustes grava cache que ninguém lê (moduleActive fixo true) — ou liga de verdade ou sai.
- **B5 Ponte de transição dias:** catch 404/405 → PATCH antigo de `diasSemana` — APAGAR depois do publish do `2054fa81`.
- **B6 Reconciliador:** todo `return false` zera carimbo; guarda de foco só em controle com cursor; mapa transplantado.

## Bloco C — Domínio (só conferir que o APK obedece; regra vive no backend)
- **C1** Dia é do CLIENTE: APK grava dias SÓ via `PATCH /logistica/clientes/:id/dias`; nenhum caminho manda `diasSemana` de produto.
- **C2** Contador = roster (`totalClientesDia ?? totalPlanos`), nunca fase de ciclo.
- **C3** Tela nunca inventa pino: sem coordenada = pendência GPS honesta.
- **C4** Dinheiro: preview de créditos = catálogo; motorista não-admin sem números; Confirmar rota é quem debita.

## Registro da varredura — 1ª passada 27/07 (grep + leitura; tela ainda não)

### 🔴 FUROU
1. **A5/A2 — `prompt()` nativo** `logistica/assets/app/app.js:6179` ("Digite o código de 6 dígitos do
   comprovante"). Agravante: NENHUM Kotlin implementa `onJsPrompt` → o prompt devolve null no WebView →
   `if (!code) return;` → **entrega com `codigoObrigatorio` NUNCA confirma no aparelho** (bug funcional
   latente, dispara em qualquer empresa que ligar código de comprovante). Cura óbvia: virar passo do
   `.app-confirm`/centerModal com campo (Leis 3/4/5).
2. **A5 — `confirm()` nativo** `vendas/assets/app/app.js:290` (desvincular aparelho). Flavor vendas =
   protótipo; casa com a decisão aberta congelar×investir.

### ⚠️ SUSPEITO / decisão do dono
3. **A2 — `deliveryOfflineSheet` é alias do `deliverySimpleSheet`** (app.js:4262). Comentário diz que a
   folha esconde dinheiro no modo OFF — pode estar certo NA TELA, mas é exatamente a decisão aberta nº3
   (folha com produtos × zero-produto). Precisa veredito na tela + decisão.
4. **A3 (semântico) — botão "Cancelar leitura" usa ícone `trash`** (app.js:3921). Não é exclusão de item
   (Lei 1 não fura tecnicamente), mas lixeira em botão contradiz o padrão visual. Barato de trocar.
5. **B6/A1 — checkout.js:321/328 hex cravado** — é config dos secure fields do SDK Mercado Pago (iframe,
   var() não atravessa). Justificado, mas duplica tokens na mão; se a pele mudar, descola.

### 🧹 Higiene (sem sintoma na tela)
6. **B2 — `state.updateInfo`/`state.modalClient`/`state.modalProduct` usados sem declaração** no state
   inicial (nascem por atribuição).
7. **B3 — ramo `data-day` duplicado**: listener direto (app.js:5172) + dispatcher (app.js:6608) pro mesmo
   `toggleManagedRouteDay`.

### ⏳ POR DESIGN até o publish do `2054fa81` (depois APAGAR)
8. **B5 — 2 pontes de transição 404/405**: dias do cliente (app.js:7800-7804) e descartar-montagem
   (app.js:6239-6247).

### ✅ CONFORME (provado nesta passada)
- **B1 allowlist**: TODOS os endpoints chamados no app.js da logística têm linha em
  `NativeApiClient.kt::isMobileEndpointAllowed` (conferido 1 a 1, inclusive geo/cep, descartar-montagem,
  clientes/:id/dias, historico GET/DELETE, nucleo contas/locais/telefones PATCH).
- **A9 handleBack**: casos especiais (dddPrompt, confirmation, pausa, historico, manage-day/montagemRapida,
  leitura-parada/finalizar, update obrigatória, conferência ficha→lista) + fallback genérico app.js:8179.
- **A7 "pino"**: só em comentário de código; strings visíveis usam frases humanas (app.js:5390-5394).
- **A3 exclusão**: tudo hold + `state.confirmation`; satélite-lixeira "Limpar o dia" é pedido explícito do dono.
- **A1**: zero hex fora de token em app.js/app.css (opening.html = paleta própria declarada, isolada);
  3 `style="` no app.js, todos dinâmicos (dashoffset/width%) — dentro da isenção.
- **A10 sons**: 14 call sites de `H.sound` com gate/guard; `route_start` só com `inicioReal`.
- **B4**: seção "Módulos" placebo dos Ajustes JÁ REMOVIDA (27/07, ordem do dono, app.js:4070).
- Sintaxe: `node --check app.js` OK.

### Ainda NÃO varrido (2ª passada, na tela)
A4 teclado/Enter form a form · A6 estados padrão tela a tela · A8 transições · B6 reconciliador em
movimento (precisa aparelho) · C1-C4 (backend + tela) · checkout/vendas flavor por inteiro.
