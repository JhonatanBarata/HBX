# VERIFICACAO-SPRINT1 — Veredito de upload do .aab (RELEASE-20X)

Data: 2026-07-11 · Auditoria SÓ-LEITURA sobre o working tree em HEAD `56d1da24`.
Base: 5 achados adversariais verificados + releitura do código-fonte real.
Prova de cada afirmação em `arquivo:linha` ao lado.

---

## 1. VEREDITO — PODE SUBIR O .aab?

**GO-COM-RESSALVAS.**
O bundle está mecanicamente pronto (assinado fora do git, `applicationId br.com.hbxsystem` imutável, targetSdk 35, WebView na raiz). NÃO há bloqueador que impeça o upload mecânico — mas o teste fechado JÁ passa por revisão e o app carrega o site AO VIVO, então **1 texto de anti-steering ("Recargas pelo site.") precisa ser corrigido e republicado no front ANTES de subir**, e há itens só-do-dono (backup da chave, formulários do Console, validação em aparelho) que, se pulados, reprovam a produção.

Confiança: alta nos fatos de código; média-alta em que o anti-steering seja gatilho de enforcement (regra de billing é das mais fiscalizadas), porém a correção é de 1 linha — barato demais pra arriscar.

---

## 2. BLOQUEADORES-UPLOAD (não subir o .aab enquanto existir)

Ordenados por precedência. O item 1 é o único que toca o "antes do revisor ver"; os demais são higiene do próprio bundle já resolvida — listo o que RESTA.

1. **Anti-steering vivo no front publicado — "Recargas pelo site."**
   `frontend/src/components/hbx/credits-wallet-section.tsx:240-241`. No branch `shellMode` (detector real da casca, `frontend/src/lib/hbx-shell.ts:22-32`) o hero da carteira renderiza `<span className="sc-note">Recargas pelo site.</span>` no lugar do CTA. Nomeia "o site" como canal de recarga de bem digital — exatamente o que a própria AUDITORIA-PLAY.md:202 (surface 5) proibiu. **Confirmado LIVE:** o commit modo-shell `97c37757` é ancestral do último publish `47ae2e7a` (`git merge-base --is-ancestor` = SIM), logo esse texto já está no ar em `www.hbxsystem.com.br` e o WebView (que aponta pra raiz, `MainActivity.kt:50`) o exibe pro revisor.
   Correção (1 linha): trocar por copy que NÃO nomeia canal de compra (ex.: "Acompanhe seu saldo por aqui.") ou remover o span — mesmo padrão neutro JÁ aplicado na surface irmã `bloqueio-gate.tsx:105-107` ("Fale com o suporte para regularizar o acesso."). **Depois: `npm run publish`** (o .aab lê prod ao vivo; sem republicar, a correção não chega no revisor). Este é o gate real: a mecânica do upload não depende do front, mas a revisão do teste fechado sim.

> Não há mais nenhum bloqueador MECÂNICO de upload: `.aab` assinado por chave fora do git (`app/build.gradle.kts:13-45`, `keystore.properties`/`upload.jks`/`app-release.aab` todos gitignored — confirmado), `applicationId = "br.com.hbxsystem"` (`:29`), `targetSdk = 35` (`:31`), WebView na raiz `https://www.hbxsystem.com.br/` (`MainActivity.kt:50`). O bundle sobe.

---

## 3. BLOQUEADORES-PRODUCAO (sobe pra teste fechado; NÃO promover pra produção sem isto)

1. **DEPENDÊNCIA DE ORDEM — front modo-shell tem que estar LIVE e limpo antes do revisor abrir.**
   O .aab é só casca; toda superfície de billing vem do site ao vivo. O modo-shell já esconde vitrine + CheckoutPanel (`credits-wallet-section.tsx:258` gated em `!shellMode`) — só falta fechar o texto do item 2.1. Regra: **qualquer alteração no front que toque billing precisa ser republicada ANTES de qualquer revisor (teste fechado OU produção) abrir o app.** É o mesmo motivo do item 1 acima, elevado a invariante permanente.

2. **Formulário FGS Location + vídeo (aparece só APÓS o 1º upload).**
   Código correto (`AndroidManifest.xml:11,63` + `startForeground` tipado `FOREGROUND_SERVICE_TYPE_LOCATION` em `RotaService.kt:297`), mas a Play exige no Console a declaração de foreground-service com vídeo demonstrativo (30–60s) + divulgação do uso de localização. **Pular = produção reprovada.** Texto e roteiro prontos em `PLAY-GUIA-DONO.md:150-168` (§4.1). Confiança: alta — é exigência procedural conhecida, não hipótese.

3. **Declaração Full-screen intent no Console.**
   `USE_FULL_SCREEN_INTENT` (`AndroidManifest.xml:12`, usada em `RotaService.kt:258`) não é auto-concedida a app não-chamada/alarme no Android 14+. Não trava upload nem publicação — mas exige a declaração manual (justificativa pronta em `PLAY-GUIA-DONO.md:170-179`, §4.2). Fallback completo já existe (heads-up + overlay), então mesmo se a Play negar a declaração o app funciona. Passo do dono, não de código.

4. **Data Safety coerente com as permissões do bundle.**
   Se `RECORD_AUDIO` continuar no manifest (ver 4.2 abaixo), o revisor vê mic no APK. O guia orienta NÃO declarar áudio (`PLAY-GUIA-DONO.md:137-138`) — divergência aceitável só porque o processamento é efêmero on-device, MAS a decisão limpa é remover a permissão antes do .aab final e não declarar nada. Preencher a tabela de `PLAY-GUIA-DONO.md:126-142`.

5. **Regra dos 12 testers × 14 dias (conta pessoal nova).** Procedural, `PLAY-GUIA-DONO.md:261-264`.

---

## 4. CHECKLIST ORDENADO PRÉ-UPLOAD (passos concretos do dono)

**A — Fechar o código/front (antes de gerar o .aab final)**
1. [ ] Corrigir `credits-wallet-section.tsx:241` ("Recargas pelo site." → copy neutra sem canal de compra, ou remover o span). **Bloqueador do item 2.1.**
2. [ ] **Decidir a voz em aparelho real:** instalar o APK, ir na confirmação por voz (`frontend/src/app/entrega/voz.ts:48-55` faz feature-detect de SpeechRecognition; no WebView do Android tende a `null` → no-op). Se não funcionar (esperado), **remover `RECORD_AUDIO` de `AndroidManifest.xml:9` E do lote de request em `MainActivity.kt:404-408`** e regenerar o .aab. Elimina prompt de mic no launch sem feature + limpa o Data Safety. (Já rastreado como item #10 em `AUDITORIA-PLAY.md:252`.) Se optar por manter, deixar assim é RISCO baixo — não é reprova automática.
3. [ ] Validar em aparelho real (não só typecheck): edge-to-edge/insets sem conteúdo sob as barras, upload de foto (comprovante), tela offline com retry, persistência de login após restart, e o fluxo rota→notificação persistente→takeover de chegada.

**B — Republicar o front (o WebView lê prod ao vivo)**
4. [ ] `npm run publish` com os fixes de A1 dentro. Sem isso, a correção do anti-steering NÃO chega no revisor.
5. [ ] Abrir `https://www.hbxsystem.com.br/politicas` e `/excluir-conta` em aba anônima — confirmar que carregam (`PLAY-GUIA-DONO.md:195`).

**C — Proteger a chave (só-do-dono, irreversível se perder)**
6. [ ] **Backup do upload keystore** `EntregaShell/keystore-release/upload.jks` + `EntregaShell/keystore.properties` (senhas) num cofre FORA da máquina (gerenciador de senhas). Confirmado gitignored — se a máquina morrer sem backup, perde a chave de assinatura. Play App Signing permite reset via suporte, mas evite o drama.

**D — Gerar e subir**
7. [ ] `gradlew bundleRelease` → conferir `EntregaShell/app/build/outputs/bundle/release/app-release.aab` (só sai assinado se `keystore.properties` existir — o gradle falha explicando caso contrário, `app/build.gradle.kts:56-63`).
8. [ ] Console → Teste fechado → subir o .aab, aceitar Play App Signing (`PLAY-GUIA-DONO.md:232-241`).

**E — Formulários pós-upload (destravam depois do 1º bundle)**
9. [ ] Declaração FGS Location + vídeo YouTube não-listado (`PLAY-GUIA-DONO.md:150-168`).
10. [ ] Declaração Full-screen intent (`PLAY-GUIA-DONO.md:170-179`).
11. [ ] Data Safety conforme tabela (SEM áudio se removeu o mic) + URL de exclusão (`PLAY-GUIA-DONO.md:116-142`).
12. [ ] Conta demo pro revisor com módulo logística ativo + rota de exemplo (`PLAY-GUIA-DONO.md:199-224`).

**F — Os 14 dias**
13. [ ] 12–15 testers (contas Google) aderindo contínuo por 14 dias; cobrar uso real (`PLAY-GUIA-DONO.md:243-264`).

---

## 5. REFUTADO / SUPERESTIMADO (não virar retrabalho)

- **"RECORD_AUDIO = REJEICAO-PROVAVEL"** — REBAIXADO pra RISCO de higiene. É permissão *dangerous* comum, NÃO restricted com formulário obrigatório; há código de feature plausível (`voz.ts`). A "divergência com Data Safety" é falsa: processamento efêmero on-device não é "coleta", e o guia já condiciona a remoção à validação em aparelho (`PLAY-GUIA-DONO.md:138,182`). O bug correlato (mic travando o overlay) JÁ está corrigido: o request usa `permissoesJaPedidas` e negar o mic não segura mais overlay/full-screen (`MainActivity.kt:404-417`). Ação = validação em aparelho já planejada (item #10 do checklist da Onda 0), não blocker novo.

- **"Permissões no boot quebram o vínculo FGS-location + exigem divulgação proeminente"** — REFUTADO. O foreground-service de localização só liga quando o motorista aciona `setRota()`/Iniciar rota (`HBXShellBridge.kt` → `RotaService.sync()`), NUNCA no boot; a política de FGS avalia QUANDO o serviço roda (ação do usuário + notificação persistente + formulário), não o timing do diálogo de permissão. "Divulgação proeminente" no sentido estrito é exigência de BACKGROUND location — e `ACCESS_BACKGROUND_LOCATION` NÃO existe no manifest (`AndroidManifest.xml:5-15`; app foreground-only). Pedir permissão fora de contexto é best-practice do Google, não reprova automática. Severidade real: POLIR (atrito de UX). A correção proposta (pedir em contexto) é boa, mas OPCIONAL.

- **"USE_FULL_SCREEN_INTENT pode reprovar o upload"** — REFUTADO como blocker. Desde o Android 14 ela só deixa de ser AUTO-concedida; não está na lista de permissões que travam publicação (SMS/Call Log, all-files, background location, Accessibility, QUERY_ALL_PACKAGES). O .aab sobe e publica; pior caso é a permissão não ser auto-concedida (fallback heads-up+overlay já cobre, `RotaService.kt:250-260`) e o app já pede a concessão graciosamente (`MainActivity.kt:441-457`). Resta só o passo manual de declaração no Console (item 3.3 acima), já no checklist do guia.

- **Não confundir "committed" com "reprovável agora":** o único item de código que efetivamente aparece pro revisor e viola política é o texto da carteira (2.1). Vitrine/CheckoutPanel/preço/link já estão corretamente escondidos no shell (`credits-wallet-section.tsx:255-258`).

---

### RESUMO (6-10 linhas)

VEREDITO: **GO-COM-RESSALVAS.** O .aab está mecanicamente pronto pra subir (assinado com chave fora do git, `applicationId br.com.hbxsystem` imutável correto, targetSdk 35, WebView na raiz) — não há bloqueador de upload mecânico. O único gate real de código antes do revisor abrir é 1 linha: `credits-wallet-section.tsx:241` ainda exibe "Recargas pelo site." dentro da casca (anti-steering), e isso está LIVE em prod (o commit modo-shell é ancestral do último publish) — corrigir pro padrão neutro já usado no bloqueio-gate e **republicar o front** antes de subir. Depois disso o bundle vai pra teste fechado. Para PRODUÇÃO, os gates são procedurais e só-do-dono: formulário FGS location + vídeo, declaração de full-screen intent, Data Safety coerente, conta demo e os 12 testers × 14 dias. Recomendo (não obrigo) validar a voz em aparelho e, sendo no-op no WebView, remover `RECORD_AUDIO` do manifest+runtime antes do .aab final — reduz o prompt de mic sem feature. Refutados como não-blocker: timing das permissões no boot (vínculo FGS preservado, app é foreground-only), full-screen intent (não trava publicação, só declaração) e a severidade de rejeição do mic (é higiene, não reprova provável). Antes de tudo: **backup do upload keystore fora da máquina** — perder a chave é o único erro verdadeiramente irreversível aqui.
