# HANDOFF — coworker (02–03/08/2026)

Estado real no fim da sessão. Quem pegar isto continua sem re-descobrir nada.

---

## 0. Como o dono quer que eu trabalhe (contrato desta frente)

- **Eu aciono o que o HBX já tem e ensino o HBX a fazer o que eu faria** — não faço
  o trabalho por fora nem mando mensagem por conta própria.
- **Sempre perguntar antes de enviar qualquer mensagem a lead.** ⚠️ Essa aprovação
  acontece **NO CHAT, comigo** — o dono decidiu **NÃO construir fila de aprovação no
  sistema** ("queira ou não queira, será mais um bloqueio"). Vale enquanto ele não
  confiar no trabalho; revisitar depois. **Não implantar.**
- Serão **5 chats ativos** em paralelo (5 "coworkers").
- Sem pressa: "estamos terminando as coisas ainda".

---

## 1. EM PRODUÇÃO (publicado e provado no aparelho)

### AGENDADOR DE MISSÃO — o app virou agendador
Commits `ccf1c9ca`, `52055712`, `9a9b60d7`, `08dba874`. APK **135** no servidor.

O admin marca a rota com HORA; o celular do motorista vira despertador.

- `LogisticaRotaIndicada` ganhou `agendadaPara` e `alarmeArmadoEm`
  (migration `20260802120000_rota_indicada_agendada`).
- `GET /logistica/rota-indicadas/pendentes?agendadas=1` — **só o app que sabe armar
  despertador pede as agendadas**. Sem o parâmetro, APK antigo não vê missão marcada
  (senão abriria o popup adiantado e o agendamento viraria mentira).
- `POST /logistica/rota-indicadas/:id/alarme-armado` — carimbo de "este aparelho vai
  acordar". Sem ele o web prometeria alarme que talvez nunca toque.
- Hora podre morre na porta: passado, `"99:99"` e ano errado → 400 com texto de gente.
- **APK:** `MissaoAlarme.kt` (AlarmManager exato, cutucada a cada 2 min até responder,
  teto de 15 rodadas, rearma no boot **e no MY_PACKAGE_REPLACED**) +
  `MissaoAlarmeActivity.kt` (tela cheia sobre o cadeado, som de ALARME com volume
  crescente, vibração, voz, Voltar desligado; Aceitar / Adiar 5 min / Não vou conseguir).
- **Folha "Rotas recebidas"** no sino: seções **Agendadas** (com botão **Adiantar**) e
  **Recebidas** (toca e aceita).
- **Satélites da tela Rota:** sino "Rotas recebidas" (pulsando) à esquerda, "+" virou
  satélite padrão **"Rota rápida"** à direita. O FAB flutuante morreu.
  Regra de disputa do slot esquerdo: **"limpar o dia" cede pro sino; Cancelar de rota
  montada/rodando nunca cede.**
- **Desktop `/logistica`:** painel **"Missões enviadas"** (rota, pessoa, hora, estado).
  Único estado em vermelho: *"o celular ainda não recebeu"*.
- **Aceitar/Negar tem UMA porta só** (`rotaIndicadaResponder`), usada pelo popup, pelo
  alarme e pelo Adiantar.
- 18/18 testes verdes em `logistica-rota-indicada.service.test.ts`.

**Provas colhidas no moto g15 (não é auditoria de código):**
- Alarme disparou com o aparelho em **Doze e tela apagada**:
  `Waking up from Dozing … details=com.android.systemui:full_screen_intent`.
- Tela cheia abriu: `START MissaoAlarmeActivity … (BAL_ALLOW_NON_APP_VISIBLE_WINDOW) result=0`.
  (A via direta `startActivity` é bloqueada no Android 14+ — quem abre é o full-screen intent.)
- Aceite chegou ao servidor em **10 s**.
- Alarme no relógio do sistema: `RTC_WAKEUP … window=0 exactAllowReason=policy_permission`.
- Sobreviveu a **3 atualizações de APK** sem abrir o app.

### Cartão de detalhe da entrega (desktop) — `08dba874`
Causa raiz: `.hbx-drawer-bottom`, `.hbx-drawer-bottom__handle` e `.hbx-veil.to-bottom`
**não existiam em folha nenhuma** — só o `motion-system.css` as citava pra animar.
Não havia cartão: era texto solto sobre o véu borrado, em 2 telas.
Também caíram: `title=` nativo (o balão preto que tapava o texto), linha de produto
atropelada, e 3 tokens inexistentes (`--border`, `--surface-soft`, `--hbx-ok`).
Contraste do pior par: **9,29:1 claro / 9,84:1 escuro**.

---

## 2. COMMITADO E **NÃO PUBLICADO** (o próximo publish leva)

| commit | o quê |
|---|---|
| `baf494c1` | Aurora: ponta ciano `#0891B2 → #077B97`. Botão principal **3,50:1 → 4,65:1** no claro; escuro intacto em 4,67:1. Conserta 6 lugares de uma vez (mesmo par `primary→secondary`). |
| `574fa3e2` | Aceitar o alarme **abre a rota sem desbloquear**: `requestDismissKeyguard` + `showWhenLocked` na MainActivity. Piso do versionCode → **137**. |

⚠️ **O celular está com APK 137 (build local) e o servidor com 135.** O piso já está em
137, então o próximo publish carimba 138+ e o aparelho volta a receber update normal.

⚠️ `frontend/src/lib/aparencia.ts` está modificado na árvore e **não é meu** — outra
frente. Não varrer para commit. Publicar sempre com `HBX_PUBLISH_COMMITTED_ONLY=1`.

---

## 3. 🔴 O BUG GRAVE — diagnosticado, **não consertado**

**Cena:** o dono aceitou a missão às 20:53, a rota montou e parou na **Conferência**.
Às 21:00 as 3 entregas foram canceladas e **ninguém foi avisado**. Ele: *"só sumiu
tarefa e aí?? completo??"*.

**Cadeia, com prova:**
1. Log do backend: `montagem descartada 2026-08-02 company=5: descartadas=3
   motivo="Rota desfeita antes da confirmação."`
2. As 3 `Entrega` viraram `cancelada` no mesmo milissegundo.
3. `LogisticaRotaAviso` **vazia** para a empresa 5.
4. A `LogisticaRotaIndicada` continua **`aplicada`** — o desktop ainda acha que a rota
   está com o motorista.

**A causa (não é cron, não é fuso — os dois foram descartados com medição):**

`POST /logistica/rota/descartar-montagem` só marca a indicação como `desfeita`
(o que acende o banner no desktop) dentro de `if (entregadorId && this.rotaIndicada)`.
`entregadorId` vem de `whereForActor(req.user)`, que **para ADMIN devolve `{}` de
propósito** — o teste do próprio projeto crava: *"admin preserva visão da empresa
inteira"* (`logistica-operacao.service.ts:102`).

A segunda rede (`recadoDeSaida` → aviso `abandonada`/`parcial`) exige rota com
`startedAt`. Rota não confirmada nunca foi iniciada → retorna null.

> **Quem dirige sendo admin não gera aviso nenhum ao desistir da rota.**
> O guarda confunde *"admin enxerga a empresa toda"* com *"não dá pra saber quem foi"* —
> mas quem descartou É o autenticado. E essa é a configuração de **toda distribuidora
> pequena onde o dono dirige**.

**Direção do conserto (não implantada):** quando o ator é admin, usar o próprio
`req.user.id` como identidade do motorista para a **própria** rota dele. Manter o
fail-closed só para o caso real de admin descartando rota **de outra pessoa**.
Vacina obrigatória: teste que reproduz *admin === motorista* e exige o aviso.

---

## 4. Vendas — o que existe e o que falta pro plano dos 5 coworkers

- ✅ **Chip próprio por pessoa: já é o desenho.** Instâncias são `company-N-user-M`.
  Hoje só `company-5-user-6` (**…884**) está `open`. **O chip novo não foi pareado.**
  Eu não pareio chip.
- 🟡 **Passagem pro gerente: metade existe.** Após resposta positiva o robô cala e o
  card vai pra "Te chamou". **Falta a copy roteirizada** que o dono cravou:
  *"fico muito feliz que tenha interesse, vc não vai se arrepender! daqui pra frente meu
  gerente vai entrar em contato, o telefone dele é 19 997024884, nome dele é Jhonatan"*
  + (alguns segundos depois) *"se tiver alguma dúvida, qualquer coisa só chamar!"*
- ⛔ **Modo "Rascunho" no sistema: NÃO construir.** Decisão do dono nesta sessão.
  A aprovação é no chat, comigo.

### Mensagem do 1º contato — onde mora e como está
`/automacao` → **Prospecção** → **Disparo frio** → lista "Primeiro contato (frio)"
(+ botão "Gerar variações (IA)"). Campo real: `firstContactVariants` no
`filtersJson` da campanha. **`preMessageVariants`** é o "oi" curto que vai ANTES
(hoje: `{{cumprimentacao}}, tudo bem?`) — por isso o texto principal **não deve
cumprimentar de novo**.

Hoje há **6 variantes, todas de pitch** ("Posso te mostrar rapidinho?").
Eu propus 10 no tom suave que o dono pediu (seleção + teste grátis + pergunta leve).
**NÃO foram salvas** — ele não aprovou o texto, e copy de venda é a voz dele.

⚠️ **O sistema recusa textos com >85% de semelhança entre si.** Não é frescura: foi
copy quase idêntica 3× em 3 min que fez a Meta remover o dispositivo em 30/07.

---

## 5. Decisões do dono nesta sessão

| decisão | valor |
|---|---|
| Disparo de hoje (03/08) | **Nada hoje.** Amanhã 08:00, com tudo pronto. |
| Volume/chips | **5 chips × 5 mensagens iniciais cada** (revisão do "10 num chip só"). |
| Fila de aprovação | **No chat, não no sistema.** Não implantar. |
| Tema Aurora | Escurecer a ponta ciano (feito, `baf494c1`). |
| Tela sobre o cadeado | **Sim** — celular é de trabalho. Feito. |
| Mensagens suaves | **Ainda não aprovadas.** Não salvar sem o "ok". |

---

## 6. Ordem de trabalho acordada

1. **Aviso de rota desfeita quando admin === motorista** (§3). É o grave.
2. **Roteiro de passagem pro gerente** na resposta positiva (§4).
3. **5 coworkers com chip próprio**, 5 mensagens iniciais cada.
4. Publicar `baf494c1` + `574fa3e2`.

---

## 7. Armadilhas MEDIDAS nesta sessão (não repetir)

- **Piso do versionCode.** O arquivo `EntregaShell/app/build.gradle.kts` documenta 11
  recaídas. Instalei builds locais no g15 e o publish carimbou por cima 3× — cada
  colisão trava o ciclo "editar → instalar" com `INSTALL_FAILED_VERSION_DOWNGRADE`.
  **O piso tem que ficar ACIMA do maior número que já saiu.**
- **Atualizar o APK apaga os alarmes agendados.** O Android cancela na troca do pacote.
  Só `BOOT_COMPLETED` não basta — `MY_PACKAGE_REPLACED` também. Um publish às 15h
  matava a missão das 16:00 **em silêncio**.
- **Android 14+ bloqueia abrir tela em segundo plano** (`Background activity launch
  blocked`). Quem abre alarme é o **full-screen intent**, não `startActivity`.
- **Tela do alarme por cima do cadeado ≠ app por cima do cadeado.** Faltava
  `requestDismissKeyguard` — e o `finish()` matava o pedido antes da resposta.
- **Cliente sem produto não gera entrega.** `gerar` responde *"X está sem itens na
  Agenda"* e o app engole num toast. Foi isso que fez "aceitar não montar a rota".
- **A API pública é `https://api.hbxsystem.com.br`** — sem `/api`, e não é o domínio www.
- **Classe de CSS que não existe não avisa:** build verde, console limpo, e quem
  descobre é o dono na tela.
- **Sessão paralela publicou no meio do trabalho** e carimbou APK por cima. Sempre
  `HBX_PUBLISH_COMMITTED_ONLY=1` e stage por arquivo (nunca `git add -A`).
- **Emulador Android morre nesta máquina** (falha de vídeo do Windows) — não perder
  tempo, testar no g15.
- **Conferir a DATA, não só a hora.** Esta sessão atravessou a meia-noite e eu tratei
  o alarme de ontem como se fosse de hoje.

---

## 8. Resíduo de teste (limpar quando não precisar mais)

Empresa 5: clientes **"Teste Caminhada 1/2/3"** (Av. Onze 92 · Av. Dois SM 212 ·
Av. Cinco DV 153, Rio Claro) com o produto "Galão de 10 litros" vinculado, e as
rotas salvas **"Teste Caminhada 02/08"**, **"Ensaio do alarme"** e
**"Ensaio 2 — cena inteira"**. As entregas do dia 02/08 estão `cancelada`.

## 9. Ambiente

- Celular: moto g15 `ZF5255SMWF`, Android 15, conta `jhonatan@hbxsystem.com.br`
  (**empresa 5**, user 6). ⚠️ Antes ele estava na conta Google
  `jbinformatica1100@gmail.com` (**empresa 48**) — foi desvinculado e re-pareado por
  código de 6 dígitos (`POST /mobile/devices/pairing-code`).
- Espelho da tela pro dono ver: `scrcpy` (instalado via WinGet).
- Toque em WebView: `adb shell input touchscreen swipe X Y X Y 120` (tap simples não
  aciona). Screenshot é 1080×2400; o que eu leio vem 900×2000 → **coordenada × 1,2**.
