# 04 — AGENT-APP (Sonnet) — App HBX Logística (UI + fluxo)

Escopo: SÓ `EntregaShell/app/src/logistica/assets/app/app.js` e `.../app.css`. UM agente só (arquivo
único; não paralelize). NÃO toque `backend/` nem `src/main/java/`. NÃO commite. FOCO DO DONO:
**FACILIDADE E APARÊNCIA pra pessoa MUITO idosa usar** — simples, grande, resumido, bonito.

Contexto real colhido no moto g15 (prints 20/07) e contratos em [00-ORQUESTRACAO.md]. Respeite os
nomes de ponte (`H.appInfo()`, `HBXAndroid.*`, callbacks `HBXUpdate.*`) e endpoints exatos de lá.

---

## F5 — MATAR os bottom-sheets, usar MODAL CENTRAL com setas grandes (PRIORIDADE)
Hoje o wizard da leitura usa `sheet-wrap`/`sheet rp2-sheet` (sobe de baixo). O dono quer o estilo
do CENTRO — o mesmo de `dayHomeModal`/`dayOrderChooseModal` (`modal-wrap day-home-wrap` + `modal
day-home`). Converter TODOS os passos do wizard de leitura pra esse padrão central:
`leituraTipoStep, leituraExistenteStep, leituraNovoStep, leituraTelefoneStep, leituraProdutoStep,
leituraObsStep, leituraSalvarDiaStep/Manual/Nome` → cartão central.
- Um COMPONENTE base reutilizável (ex.: `centerModal({icon,title,resumo,body,onBack,onNext,nextLabel,nextDisabled})`)
  com header (ícone + título curto + linha de RESUMO do que já foi escolhido, ex.: "123teste ·
  Galão 20L ×1"), corpo, e rodapé com **duas setas circulares grandes** (‹ voltar / › próximo),
  ~60px, com rótulo curto embaixo. Setas "bem feitas" = círculo cheio, sombra suave, área de toque
  generosa, estado disabled visível. Nada de scroll interno quando der pra evitar.
- Transições sempre (memória mobile-casca): fade/scale suave ao trocar de passo, respeitando
  `prefers-reduced-motion`.
- Reusar classes/tokens já existentes no `app.css` (`.day-home`, `.rp2-mode-*`, etc.); criar poucas
  classes novas, sem hex solto. Remover o CSS morto de `sheet`/`rp2-sheet` da leitura SE não for
  usado por mais nada (checar antes — a review/entrega de rota usa `sheet-wrap` também; NÃO quebrar
  essas telas — só migrar as do WIZARD DE LEITURA).

## F6 — Loading overlay escurecido, bem feito e LEVE
Sintoma real: carregar muitos clientes deixou a tela BRANCA vários segundos → parece bug.
- Helper global `showLoading(msg?)` / `hideLoading()` que renderiza um overlay `position:fixed`
  cobrindo a tela: fundo escurecido (rgba + `backdrop-filter: blur(2px)` leve), spinner CSS puro
  (sem GIF, sem lib — `@keyframes` num `<div>`, GPU-friendly `transform`), e um texto curto
  ("Carregando clientes…"). Contador de refs (várias chamadas simultâneas não piscam).
- Ligar em: (a) `H.api` de listas pesadas (loadClients, refresh de rota, resumo), (b) qualquer
  troca de tela que busca dados. Debounce ~150ms pra não piscar em request rápido.
- Deve ser LEVE: um único nó reaproveitado, sem re-render do app inteiro; `will-change:transform`
  só no spinner; remover do DOM ao esconder.

## F1/F2 (app) — rota salva
- Finalizar leitura: sem passo de dia (F5 já converteu; garantir que NÃO envia `diaSemana`).
  `prepareLeituraNome`: default "Rota dd/mm" (dedupe numérico existente).
- `dayOrderSavedModal` (~1714): tirar rótulo de dia e o sort "hoje primeiro"; linha = nome + "N
  parada(s)". Migrar pro estilo central. Adicionar **lixeira (admin)** por linha reusando a ação
  `delete-route-modelo` + confirmação (hoje só em Ajustes). Cuidado: hoje a linha é `<button>`
  inteiro — separar em container + botão-aplicar + botão-lixeira (button aninhado é inválido).
- `apply-route-modelo` (~2448): REESCREVER. Em vez de carregar a prévia do dia e reordenar, chamar
  `POST /logistica/rota-modelos/:id/gerar` → `{deliveryIds, avisos}`. Depois
  `setRouteSelection(deliveryIds)` + `setRouteOrdemManual(deliveryIds)` e `rota/planejar` (ou
  `iniciar`) com `deliveryIds+ordemManual` (mesmo padrão do override manual do `beginManagedRoute`).
  `avisos` → toast. Envolver com `showLoading`.

## F3.1 — Preço estilo banco (todo campo de R$ do app)
- `leituraProdutoStep` (~1224) e onde mais houver input de preço/valor: trocar `<input type=number>`
  por campo de MOEDA: guarda centavos, exibe `R$ 20,00` alinhado à direita. Digitação estilo banco:
  ao focar seleciona tudo (primeiro dígito substitui); cada dígito empurra dos centavos
  (`2`→0,02; `2000`→20,00); backspace remove do fim. Sem caret manipulável → impossível cair "no
  meio do 20" (bug provado). `inputmode=numeric`, fonte grande. Um helper `moneyInput` reutilizável.
- `leituraDefaultValor` passa a semear em centavos; ao salvar, converter centavos→reais no payload
  (`valorUnit`) mantendo o contrato do backend.

## F3.2 (app) — sequência do cliente na LEITURA + GPS→endereço
Modo LEITURA (MANUAL fica como está). Nova ordem: cliente → **ENDEREÇO** → **NÚMERO** → telefone →
produto → observações.
- Ao capturar GPS, chamar `GET /logistica/geo/reverse?lat&lng` (1x, com `showLoading`).
- **Existente COM endereço**: comparar GPS×cadastro (distância se tem pino; senão rua normalizada).
  Bate → cartão "Endereço confere ✓" (só ›). Não bate → mostrar "Cadastrado: X · Você está em: Y
  (~Z m). Atualizar substitui o endereço anterior." com [Atualizar endereço]/[Manter]. Atualizar →
  PATCH conta/local + grava pino da captura → pede NÚMERO (tela própria, campo grande).
- **Existente SEM endereço**: mostra endereço do reverse + [Usar este endereço] → grava → número.
- **Cliente novo**: reverse PREENCHE rua/bairro/cidade/uf/cep no draft; usuário confere + número.
- Persistir com os endpoints de conta/local que o app já usa (procure como `leituraNovoStep` salva
  hoje); pino da captura vira lat/lng do cadastro.

## F3.3 — Preço × financeiro OFF
- Em `leituraProdutoStep`, quando `configFlag("moduloFinanceiroAtivo")` é false: campo R$ aparece
  IGUAL mas travado (cadeado/opaco, readonly). Tocar → popup central: "Preço faz parte do módulo
  Financeiro, que está desligado. Deseja configurar o Financeiro?" [Sim]/[Agora não].
  [Sim] → abrir Ajustes › Financeiro ativando o que precisa (ver como Ajustes ativa o módulo hoje;
  se houver ação de toggle, dispará-la) e voltar ao passo. [Agora não] → segue sem preço.
- Sem financeiro: salvar parada com valor 0; nunca enviar `atualizarPrecoAcordado`.

## F3.4 — Chips vivos GPS + Rede no header
- Dois chips no topo do shell (perto do HBX/refresh). **Rede**: verde ok / vermelho offline
  (fonte: `navigator.onLine` + status da última `H.api`; se a fila offline M8 estiver enfileirando,
  vermelho "salvando offline"). **GPS**: verde (fix ≤60s, precisão ≤50m) / amarelo buscando /
  vermelho sem permissão. Toque → popup de 1 frase + botão (Tentar de novo / permitir via
  `H.requestLocationPermission`). Banner de leitura ativa mostra "GPS ok · ±XX m" ao vivo.
- Ícones do set já usado (`icon("gps"...)`); nada de emoji solto se houver ícone equivalente.

## F3.5 — Lapidação
- Pós-permissão de GPS, RETOMAR o wizard sozinho (bug provado: hoje volta pro banner). Ver
  `locationPermissionChanged`/`state.leituraAwaitingGps`.
- Mapa da tela Rota centraliza no usuário quando há permissão (1 flyTo por sessão).
- Lista "Cliente existente": "Mais perto primeiro" só quando houver distância; senão subtítulo
  "Ordem alfabética".
- Passo produto da CRIAÇÃO de rota: título "O que ele recebe?" (não "O que foi entregue?").
- Botões da confirmação de cancelar: "Voltar" / "Sim, cancelar leitura".

## F4 (app) — chip "Atualizar" + tela de update
- Ao abrir e no refresh: `fetch(WEB_BASE_URL + "/downloads/version-logistica.json")` (pegar
  WEB_BASE_URL de `H.appInfo().webBaseUrl`), comparar `versionCode` com `H.appInfo().versionCode`.
  Maior no server → chip laranja "Atualizar" no header. `obrigatoria:true` → tela bloqueante
  "Atualize para continuar".
- Tela de update (modal central): mostra versionName nova + botão "Atualizar agora". Fluxo:
  1. Se `!HBXAndroid.updateInstallAllowed()` → passo explicativo "O Android vai abrir uma tela —
     ligue 'Permitir desta fonte' e volte" + botão que chama `HBXAndroid.openInstallPermission()`.
  2. Registrar `window.HBXUpdate = { onProgress(p){...}, onError(m){...} }` ANTES de chamar.
  3. `HBXAndroid.downloadAndInstall(url, sha256, versionName)` → barra de progresso via onProgress;
     onError → toast + volta. Sucesso: o sistema instala (1º update mostra diálogo; depois é
     silencioso — não é problema do app).
- Degradar gracioso se a ponte não tiver os métodos (app rodando em versão nativa antiga): esconder
  o chip de update. Cheque `typeof HBXAndroid.downloadAndInstall === "function"`.

## Entregar
Resumo por frente + lista do que precisa de verificação no device (o Opus testa via ADB). Aponte
qualquer contrato de backend/nativo que você teve que assumir.
