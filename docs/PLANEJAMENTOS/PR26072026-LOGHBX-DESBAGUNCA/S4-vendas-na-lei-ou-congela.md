# S4 — APK Vendas: entra na lei OU congela (decisão do dono ANTES de codar)

## Estado real do HBX Vendas (Salehbx.apk)
`vendas/assets/app/app.js` tem 364 linhas e é um protótipo pré-Leis:

| Furo | Prova | Gravidade |
|---|---|---|
| `confirm()` nativo no logout | linha 290 | Lei 3 (a logística tem ZERO) |
| **"Puxar" lead cobra crédito SEM guard de duplo-toque** — cada toque = 1 POST `send-to-vendas` + loop de 20 polls; impaciência do vendedor = cobrança dupla | 237-250, 285 | 💰 dinheiro |
| Sem contrato de teclado/Enter (Lei 4/5): CTA some atrás do teclado nos forms | arquivo todo | UX |
| Erro cru (`errorText`), sem `humanApiError` (Lei 6) | 77 | UX |
| Listener morto: `input` de `#lead-search` que não existe em tela nenhuma | 292-300 | morto |
| `screenMotionTimer` declarado e nunca armado | 35, 87 | morto |
| Sem auto-update: versionCode fixo 9 (defaultConfig), sem version-vendas.json, sem `checkAppUpdate` — quem instalar NUNCA atualiza | build.gradle.kts:104; nginx conf | distribuição |
| Vitrine de recarga duplicada da logística (recargaPacksView ~idêntica) | 158-177 | duplicação |

## Caminho A — INVESTIR (se vendas mobile é prioridade comercial)
1. Guard de reentrância no `radar-pull` (padrão da casa: flag no state + `disabled` + reset no
   `finally` — copiar de `deliveryConfirming`, logistica/app.js:131-136). É o item nº1 MESMO se o
   resto esperar: hoje é o único lugar do sistema onde duplo-toque vira cobrança.
2. `confirm()` → `state.confirmation` (o app de vendas nem tem o componente — copiar
   `confirmationOverlay` + estado da logística).
3. Teclado: portar `syncKeyboardViewport`/`enhanceKeyboardFields` (hoje vivem no app.js da
   logística — candidatas a irem pro `native.js` compartilhado, que é o lugar certo).
4. `humanApiError` compartilhado (mesma nota: mover pro native.js).
5. Matar os 2 mortos (listener lead-search, screenMotionTimer).
6. Auto-update: replicar o trio da logística — floor no flavor vendas + version-vendas.json no
   deploy-vps.js + `checkAppUpdate` no app (o Kotlin `startAppUpdate` já é compartilhado).
7. Recarga: extrair a vitrine pra um `recarga-shared.js` usado pelos dois flavors.

## Caminho B — CONGELAR (se o foco do semestre é logística)
1. Tirar `:app:assembleVendasRelease` do publish (deploy-vps.js:316) — corta o tempo de build e o
   risco de o fingerprint global (S6 conserta, mas até lá…) bumpar a logística.
2. Guard do `radar-pull` MESMO ASSIM se o APK continuar baixável em /download/android; ou derrubar
   o location do nginx e pronto.
3. Deixar registrado aqui que o flavor existe, compila, e o que falta pra voltar (a lista do
   Caminho A vira o backlog).

## Recomendação
**Caminho B + item de guard.** O dinheiro do negócio hoje passa pelo entregador (logística); o app
de vendas mobile duplica o que o frontend web já faz melhor, e mantê-lo "meio vivo" é o pior dos
mundos: paga build em todo publish, aceita usuário e nunca atualiza. Congela limpo, volta quando
tiver demanda de vendedor de rua de verdade.

## Verificação (gate)
- Caminho A: roteiro de fumaça no aparelho (boot, funil, puxar lead com 2 toques rápidos = 1
  cobrança só, logout com confirmação da casa, form com teclado aberto mostrando CTA).
- Caminho B: publish roda sem o build de vendas; /download/android decidido (404 ou mantido).
