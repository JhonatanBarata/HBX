# PR07082026 — APP ÚNICO: o que falta pra bomba ficar funcional

> **ESTE DOCUMENTO É AUTOSSUFICIENTE.** A sessão que o abrir não precisa de nenhum chat anterior.
> Ele tem: o estado REAL medido em produção, o que já subiu, o que NÃO subiu, os pedidos ainda
> abertos do dono e a ordem de execução com 3 rodadas de teste no meio.
>
> **Leia junto (obrigatório):** `docs/Rules/FRONTEND.md` · `hbxapk.md` e
> `onde-mora-o-codigo-do-logistica2.md` na memória · `PR07082026-FECHAR-LOGISTICA2.md` (§2 bancada,
> §3 as 11 leis) · `PR07082026-PROSPECTOR-CNPJ.md`.

---

## 0. A LEI QUE O DONO CRAVOU HOJE (07/08) — vale acima de tudo aqui

> *"é completamente inadmissível criar coisas e deixar desativado, vc NUNCA MAIS faz isso.
> EU ia excluir o chat e aí como ficamos?"*

Eu construí o Prospector inteiro e publiquei com **três chaves desligadas** (migration só local,
env OFF, toggle OFF). O dono abriu o app, não viu nada, e concluiu que eu não tinha feito.
**Entrega desligada é indistinguível de entrega que não aconteceu.**
Detalhe em `entregar-ligado-sem-chavinha.md` (memória), seção REINCIDÊNCIA.

**Regras que saem disso, e que governam este plano:**
1. Migration é PARTE do publish. Conferir DEPOIS, no banco: `information_schema.columns`.
2. Se tem chave, a entrega inclui LIGAR em produção e MOSTRAR funcionando.
3. **Fase intermediária não se publica.** Desenho+motor sem a operação não sobe como se fosse a feature.
4. **Onde o dono pediu é onde tem que estar.** Ele disse "ativável nos **Ajustes**" (do app); eu pus
   no desktop por conta própria. Mudar o lugar é decisão dele.

---

## 1. ESTADO REAL — medido em produção em 07/08, não presumido

### 1.1 O que ESTÁ NO AR (publicado hoje, commit `8a491ffe` + publish full)
| Item | Estado | Prova |
|---|---|---|
| **APP ÚNICO** — flavor `logistica2` dissolvido, virou O app | ✅ no ar | `versionName=alpha1`, `versionCode` piso **171** (publicado anterior era 163) |
| Endereço do app | ✅ produção | BuildConfig do release: `https://api.hbxsystem.com.br` |
| `HBX_V2` | ✅ true | lido do BuildConfig gerado |
| `google-services` religado | ✅ | `google_app_id` gerado — sem isso o push morria calado |
| 17 sons **MARCADO** | ✅ no APK | gerador versionado em `scripts/sons-hbx-gerar.js` |
| Barra de 6 módulos + arrastar entre módulos | ✅ | o gesto estava MORTO, nasceu hoje |
| Admin desliga módulo pelo desktop (`appModulosDesativados`) | ✅ | "rota" impossível de desligar, provado no build rodando |
| 6 chaves de dinheiro no app (inclui **Marcar** = "pagou não") | ✅ | toggle → valor no banco, provado por toque |
| Limpeza de 44 explicações + telas Gestos/Padrões removidas | ✅ | portão da casca 62/62 |
| Financeiro parou de mostrar dinheiro falso | ✅ | seam `DADOS.financeiro`, some sem fonte |
| Cromo do GPS (manobra, bússola, velocímetro, rodapé) ligado ao dado | ✅ | |
| Tela de navegação com as EMPRESAS (prédio 3D, varredura, nome digitando) | ✅ desenho | |
| Cena "cobra crescendo" ao iniciar rota | ✅ | 1,36 s, 10,3 fps medidos |
| **Prospector — backend** (9 colunas, `ProspectoRota`, corredor, gates no iniciar-rota) | ✅ **LIGADO** | `HBX_PROSPECTOR_ENABLED=true` vivo no container; company 41 `prospectorAtivo=true`, raio 150 m, 4×/dia |

### 1.2 ⚠️ ARMADILHAS DE INFRA CRIADAS HOJE (a próxima sessão TEM que saber)
- 🔴 **O container do backend mudou de nome: era `hbx-backend`, agora é `backend`.** Aconteceu quando
  eu rodei `docker compose up -d --no-deps backend` — o container antigo sumiu e a produção ficou
  FORA DO AR até eu recriar com `cd /root/HBX && docker compose up -d backend`.
  **Qualquer script/comando que ainda diga `hbx-backend` vai falhar.** Varrer e corrigir.
- 🔴 **Restart de produção NUNCA por `docker compose up --no-deps`.** Use `docker restart backend`
  ou `cd /root/HBX && docker compose up -d backend`, e SEMPRE confira depois:
  `docker ps --filter name=backend` + `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/health`.
- ⚠️ O banco de produção é **`hbx_prod`**. Consulta com aspas mal escapadas devolve 0 e parece
  "coluna não existe" — eu dei um alarme falso de quebra por causa disso. Confira o nome do banco
  antes de concluir qualquer coisa.

### 1.3 O que NÃO está pronto (e o dono precisa saber)
| Item | Estado |
|---|---|
| **Prospector F2** — clicar na empresa → 1 crédito → lead no /vendas | ⬜ NÃO EXISTE |
| **Prospector F3** — disparo pelo trilho do frio | ⬜ NÃO EXISTE |
| **Acender sozinho 3-5×/dia + falar na vaga de silêncio do GPS** | ⬜ NÃO EXISTE (o desenho existe, a operação não) |
| Toggle do Prospector nos **Ajustes do APP** | ⬜ está só no desktop — **lugar errado** |
| "Iniciar rota" falha CALADO quando a rota já está ativa | 🔴 defeito conhecido |
| OFFHBX (item 10) | ⬜ só brainstorm |

---

## 2. OS PEDIDOS NOVOS DO DONO (07/08, fim do dia)

### 2.1 🔴 O BOTÃO VOLTAR DO ANDROID — o pedido nº1
**O que o dono relatou:** *"eu estou no financeiro, em um pop up, clico em fechar android e vai lá
no rota"* — comportamento errado.

**O comportamento correto, nas palavras dele:**
> "primeiro fecha por partes; não tem mais nada pra fechar? aí volta pro Rota; voltar de novo emite
> o aviso 'pressionar voltar novamente'; aí fecha o app."

Ou seja, uma PILHA, nesta ordem exata:
1. Fecha a camada de cima (pop-up, folha, modal, overlay) — **uma por vez**.
2. Sem camada: volta pra tela anterior dentro do módulo (Financeiro → Ajustes).
3. Sem tela: volta pro **Rota** (a casa).
4. Já no Rota: mostra o aviso "pressione voltar novamente para sair".
5. Segundo toque em ≤2 s: fecha o app.

**A referência oficial bate com o que ele pediu** (não é gosto, é convenção do Android): o Back
navega para trás cronologicamente e **descarta primeiro os elementos temporários — diálogos,
bottom sheets e overlays**. A implementação correta é uma PILHA de callbacks
(`OnBackPressedDispatcher`), cada um responsável por uma camada, e o de baixo só roda quando os de
cima estão desabilitados — que é exatamente a descrição do dono.
Fontes: [Principles of navigation](https://developer.android.com/guide/navigation/principles) ·
[Provide custom back navigation](https://developer.android.com/guide/navigation/custom-back) ·
[Predictive back design](https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back)

⚠️ **Cuidado:** o app é WebView. A pilha real vive no JS (mock/ponte), então o `OnBackPressedCallback`
do Kotlin tem que **perguntar ao JS** se há camada aberta antes de decidir. Hoje ele decide sozinho —
é por isso que o pop-up do Financeiro cai direto no Rota.

⚠️ Se for mexer no manifest, `android:enableOnBackInvokedCallback="true"` liga o predictive back
nos componentes Material a partir da API 33 — mas só ligue depois que a pilha estiver certa.

### 2.2 🔴 COMPARAR O APP ANTIGO COM O NOVO — e reconectar o que sumiu
**Motivo do dono:** *"não estou conseguindo montar rota, e é o mais importante"*.
⚠️ **Parte disso foi culpa minha, não do app:** o backend estava FORA DO AR (§1.2) na hora em que ele
testou. **Mas a tarefa continua valendo** — precisa de prova de que montar rota funciona.

O app antigo (`app.js`, 13.688 linhas, hoje apagado do flavor) tinha funções que o novo pode não ter.
**Tarefa:** pegar o `app.js` do commit anterior à fusão (`git show 8a491ffe^:EntregaShell/app/src/logistica/assets/app/app.js`),
listar TODA função/tela/porta que ele tinha, cruzar com o que o novo (`mock.js` + `ponte.js`) tem, e
montar uma tabela de 3 colunas: **existia / existe / o dono aprovou remover?**
Tudo que o dono NÃO aprovou remover **volta**. O corte aprovado está em
`INVENTARIO-APP-ANTIGO-VS-NOVO.md` e no §4.5 do `PR07082026-FECHAR-LOGISTICA2.md`.

### 2.3 🔴 NOVO HTML PREVIEW DO GPS — "respeite as ruas"
**Correção do dono ao mock anterior:**
> "respeite as ruas, vc não está voando; e a empresa tem q **acender ANTES de chegar**, depois que
> passou já era."

O que muda em relação ao `HBX_GPS_mock_preview.html` original:
1. **As empresas ficam NA RUA**, não flutuando sobre o mapa. Posição colada na via, com a fachada
   virada pra ela.
2. **Acende ANTES**: a empresa acende quando está À FRENTE do veículo, dentro do alcance, no rumo
   da viagem. Quem já ficou pra trás **apaga e não volta** — o motorista não pode ser avisado de
   algo que ele já passou.
3. Isso exige **rumo (heading)**, não só distância: o produto escalar entre o vetor
   veículo→empresa e o vetor de deslocamento tem que ser positivo (empresa à frente).
   Sugestão de régua: acende entre ~120 m e ~40 m à frente; passou de 0, apaga pra sempre no dia.
4. Manter do mock aprovado: prédio 3D nos 3 estados, varredura azul, janelas acendendo, nome
   digitando com sublinhado enchendo mais devagar, radar pulsando, chip "Empresas por perto".
5. **Modo claro** também (o mock original é só escuro).
6. Entregar como HTML standalone em `docs/mockups/logistica2.0/` para o dono aprovar ANTES de virar código.

### 2.4 APP MAIS FÁCIL DE USAR — o que a referência diz
Pesquisa feita em 07/08. O que vale pra este app (motorista, uma mão, na rua, dirigindo):
- **Back descarta o temporário primeiro** (é o §2.1, e é convenção, não preferência).
- **Destino inicial único**: o app sempre volta pra uma casa só — aqui, o **Rota**.
- **Nunca prender o usuário**: toda tela precisa de saída óbvia. (O "Encerrar" da navegação já
  respeita isso de propósito.)
- Aplicado ao HBX: alvo de toque grande, ação principal sempre no polegar, e **nada de texto
  explicativo** (o dono já mandou remover 44).
Fontes: [Principles of navigation](https://developer.android.com/guide/navigation/principles) ·
[A Primer on Android Navigation](https://medium.com/google-design/a-primer-on-android-navigation-75e57d9d63fe)

### 2.5 OFFHBX (item 10) — decisão comercial ainda ABERTA
Ideia do dono: exportar clientes+caderneta+histórico num app standalone offline, R$ 500 cobrados antes.
**Análise entregue (o dono ainda não decidiu):** do jeito descrito é **acelerador de churn** — vende a
porta de saída barata (R$500 ≈ 3 meses de mensalidade) e mata o cliente pra sempre; cobrar pra devolver
o dado do próprio cliente é frágil; e sobra rabo de suporte eterno.
**Alternativa proposta:** (a) **exportar CSV/PDF grátis** (tira o risco e vira argumento de venda);
(b) **conta congelada R$29–49/mês** no lugar do R$500 — 10 clientes congelados = R$4.680/ano
recorrente contra R$5.000 uma vez; (c) o standalone vira **isca de entrada** ("HBX Caderneta",
concorrendo com o caderno de papel), não kit de despedida.
⬜ **Aguarda decisão do dono.**

---

## 3. ORDEM DE EXECUÇÃO — com as 3 rodadas de teste que o dono exigiu

> Motivo das rodadas, palavras dele: *"acabei de abrir e já não consigo clicar na metade das coisas
> que existem, mal feito D NOVO"*. **Teste não é no fim — é no meio.**

### ETAPA A — o que quebra o uso hoje
1. **A pilha do Voltar** (§2.1). É o pedido nº1.
2. **Conserto do "Iniciar rota" calado**: rota já ativa → leva pra rota em andamento ou diz o motivo.
   Nunca fechar o diálogo em silêncio.
3. **Varredura app antigo × novo** (§2.2) e **reconectar tudo que o dono não aprovou remover**.

### 🔴 TESTE 1 — "clicar em TUDO" (obrigatório antes de seguir)
Por TOQUE no g15 (`adb shell input tap`), nunca por script. Um worker POR MÓDULO:
Rota · Caderneta · Clientes · Produtos · Chat · Ajustes.
Cada worker: **toca em cada botão, chip, linha, gesto de arrastar, segurar-pra-excluir e cada pop-up**,
e reporta o que NÃO responde. Print de cada tela. A régua: *"tem que funcionar tudo — chegou no
cliente, pagou não, etc."*
⚠️ **Só existe UM celular**: os workers de toque rodam em SÉRIE, nunca em paralelo (dois workers no
mesmo aparelho já se atropelaram hoje).

### ETAPA B — o Prospector vira operação (hoje é só desenho)
4. **F2**: clicar na empresa → **1 crédito** → lead na mesa do /vendas (desktop).
   🔴 **O TRILHO DO DINHEIRO JÁ EXISTE, NÃO INVENTE OUTRO** — receita passo a passo no §F2 do
   `PR07082026-PROSPECTOR-CNPJ.md` (chave idempotente `prospector:<companyId>:<cnpj>`, reserva ANTES
   de gravar, estorno atômico no catch, ação `lead_delivery` custo 1).
   🔴 **ARMADILHA MEDIDA:** o "Dispensar" tem que gravar **`cooldownAte`**, não só `estado` — o
   embarque reescreve o estado a cada rota e a dispensa evapora.
5. **Acender 3-5×/dia + falar na vaga de silêncio do GPS** (a "vaga" = `tts.isSpeaking` false +
   `vozPendente` vazio + nenhum alarme + próxima fala do GPS a >30 s).
6. **Toggle do Prospector nos AJUSTES DO APP** (onde o dono pediu), além do desktop.
7. Aplicar a régua nova do §2.3 (acende à frente, apaga depois de passar) no app.

### 🔴 TESTE 2 — "o Prospector funciona de verdade"
Rota real, empresa acendendo à frente, clique cobrando 1 crédito, lead aparecendo no /vendas
desktop, dispensa que NÃO volta no dia seguinte. Prova em print e no banco.

### ETAPA C — polimento
8. Novo HTML preview do GPS (§2.3) → **aprovação do dono** → só então virar código.
9. Facilidade de uso (§2.4).
10. OFFHBX — só depois da decisão do dono (§2.5).

### 🔴 TESTE 3 — varredura final, os 6 módulos de novo
Igual ao TESTE 1, **depois** de tudo. Mais: o Voltar em cada camada (pop-up → tela → Rota → aviso →
sai) e o aviso de atualização chegando sozinho no celular (`adb install` NÃO é entrega).

---

## 4. LEIS QUE MORDEM NESTE TERRENO (não re-quebrar)
1. 🔴 **A fonte da casca é `docs/mockups/logistica2.0/logistica-2.0.html`.** `mock.js`/`mock.css` são
   GERADOS por `node scripts/casca-injetar.js`. Editar o gerado à mão SOME.
2. 🔴 Portões, sempre: `casca-injetar` → `casca-conferir` (**62/62, 31 telas**) → `casca-antes-e-depois`.
3. 🔴 **Falha de rede não apaga a tela.** Chamada que falhou não escreve no seam.
4. 🔴 **Slot sem fonte SOME INTEIRO** — com rótulo, unidade e separador.
5. 🔴 **O dia é o de São Paulo**, nunca o UTC do container.
6. 🔴 Cor nasce TOKEN. Contraste se MEDE, nos 2 modos.
7. 🔴 **Código financeiro: eu edito, com verificação adversarial.** Hoje isso evitou um "conserto"
   que teria contado dinheiro em dobro (o `cobrancaStatus='pendente'` era artefato da bancada; em
   produção o estado é `lancada` + `FinanceiroCharge pending`, e o "Em aberto" está CERTO).
8. 🔴 Fila offline do APK é **LISTA BRANCA** — campo novo que não entrar nela some calado.
9. 🔴 Teste no celular é **por TOQUE**. `adb reverse tcp:3000/3001` cai no reconectar — refaça antes
   de desconfiar do código.
10. 🔴 Backend local **não recompila sozinho**: `docker restart backend` e espere `/health` 200.

## 5. BANCADA
Local: company **39** (Atlas), `docker exec app-db-1 psql -U admin -d jhonatan_dev`, 500 créditos repostos.
Produção: company **41** (André Barata, user 51), banco `hbx_prod`, acesso por `node scripts/vps-run.js`.
Celular: moto g15 serial `ZF5255SMWF` (é do DONO, não do André — o e13 é o do André).

## 6. ⬜ DECISÕES DO DONO AINDA ABERTAS
1. OFFHBX: R$500 como descrito, ou a alternativa da conta congelada (§2.5)?
2. Preço/limite da automação do Prospector no /master.
3. ~~Aprovar o novo HTML preview do GPS (§2.3) antes de virar código~~ → virou o §7.6: o chat
   "mock rota" está fechando o `gps-ruas-prospector-v4.html` com o dono AGORA; o resultado final
   dele é a referência aprovada.
4. Nome comercial da feature (o toggle está "Prospector CNPJ"; sugestão de marketing: "Radar de Rota").

---

## 7. 🔴 A NOITE DE 07/08 — GO dado no chat, execução AUTÔNOMA (dono ausente)

> Brainstorm fechado com o dono em 07/08 à noite. As decisões abaixo são DELE, no chat — não re-perguntar.
> **Regra de autonomia (ordem literal do dono):** qualquer impedimento → decide com a melhor
> recomendação e segue; se for muito impeditivo → pula pro próximo item. No fim, resumo SUPER
> simples em 2 listas: `IMPOSSÍVEL SOZINHO: …` e `TOMEI DECISÃO: …` (no chat E no fim deste
> arquivo). Depois do resumo: **desligar o computador** (`shutdown /s /t 120`). É a última ação.

### 7.0 Decisões fechadas pelo dono (07/08, chat)
| Decisão | Resposta dele |
|---|---|
| Barra de baixo | **3 módulos fixos: Chat (esq) · Rota (centro) · Ajustes (dir)**. Clientes, Produtos e Caderneta SAEM da barra. |
| Caderneta completa | Abre pelo **caixa do topo da Rota** (1 toque) **e** por entrada em **Ajustes** (grupo Caderneta). Caderneta é dinheiro, não cadastro. |
| Clientes + Produtos | **Ajustes › grupo "Cadastro"** (a tela de Ajustes já é em grupos; nasce mais um). |
| Gráficos do GPS | O chat "mock rota" fecha o `gps-ruas-prospector-v4.html` em breve. **NÃO começar por isso**; é a ÚLTIMA etapa, usando o RESULTADO FINAL do chat, injetado 100% igual. |
| Publish | **AUTORIZADO** com portões verdes (casca 62/62 · typecheck Webwhats · fiscal/clip · toque no g15 ok). Portão vermelho = NÃO publica e o resumo explica. |
| Desligar o PC | Sim, no fim, depois do resumo. |

### 7.1 Piscar da tela — causa MEDIDA, freio no seam
`carregarBarra` roda a cada 60 s + a cada foco (`ponte.js:625`) e escreve no seam MESMO SEM
MUDANÇA; `usarDados` repinta a tela inteira a cada escrita (`logistica-2.0.html:2565`, `pintar`
troca o DOM todo). Resultado: repinte por minuto na cara do motorista = "a tela fica piscando".
**Conserto (um só, central):** `usarDados` compara o valor novo com o que já está em `DADOS[secao]`
(raso; arrays/objetos por JSON) e **não repinta se nada mudou**. Protege todas as telas de uma vez.
Prova: app aberto 3+ min parado na Rota sem UM repinte (medir por marcador no DOM, e no g15).

### 7.2 Chips de dia em Clientes — só dia que TEM gente
Os 7 chips são cravados na fonte (`logistica-2.0.html:3248`). O dono: *"não tem terça nem domingo
nas rotas, e ainda está aparecendo"*. A lista já traz `diasEntrega` por cliente (ponte).
**Conserto:** a ponte publica no seam o conjunto de dias com ≥1 cliente; o mock só desenha esses
chips. Dia selecionado que ficou sem gente → seleção volta pra "todos". Marcou o 1º cliente na
terça → chip Ter nasce sozinho.

### 7.3 Montar rota de OUTRO dia (adiantar sábado / refazer ontem) — trilho JÁ EXISTE
O celular só monta HOJE (`ponte.js:666`). O desktop já faz o certo:
`POST /logistica/admin-route/prepare` com `{ operationalDate: hoje, sourceDates: [data do outro dia] }`
(`route-builder.tsx:700`, `admin-logistica-api.ts:112`) — **o dia operacional continua HOJE**
(caderneta, cobrança e carimbo coerentes); só os clientes vêm do outro dia. **Zero backend novo.**
**Conserto no app:** no fluxo "Montar rota", uma linha de chips de dia (Hoje selecionado; Ontem;
dias da semana que têm cliente). Dia ≠ hoje → chama `admin-route/prepare`; hoje → fluxo atual.
Só pra admin (mesma régua do desktop; `DADOS.ajustes.admin` já existe). Quem debita continua
sendo SÓ o Iniciar.

### 7.4 Reorganização — barra 3 fixos + Ajustes›Cadastro
1. `NAV_ITENS` → `[chat, rota, ajustes]` (nesta ordem visual: Chat esq, Rota centro, Ajustes dir).
2. `moduloDesligado`: **rota e ajustes NUNCA desligam** (ajustes é a porta de tudo agora); o CSV
   `appModulosDesativados` continua valendo pra chat e pros atalhos/entradas de Clientes/Produtos/
   Caderneta (o `podarDesligados` por `data-ir` já cobre — conferir).
3. Ajustes ganha grupo **"Cadastro"**: linha Clientes (`ir-clientes`) + linha Produtos
   (`ir-produtos`). Grupo "Caderneta" ganha linha "Abrir caderneta" além da chave do modo.
4. Caixa do topo da Rota → toque abre a caderneta completa (se ainda não abrir).
5. Telas Clientes/Produtos/Caderneta continuam EXISTINDO (T.clientes etc.); mudam de porta de
   entrada: header com voltar pra quem chamou; barra acende `ajustes` (Clientes/Produtos) e
   `rota` quando a caderneta vier do caixa. O fluxo "na parada o cliente pediu outro produto"
   NÃO passa pela tela Produtos da barra — conferir que continua vivo.
6. Arrastar entre módulos (`arrastarModulo`) passa a circular pelos 3.
7. Portões da casca: 31 telas continuam 31 (nenhuma tela nasce/morre — muda navegação).

### 7.5 Itens do plano-base que entram na mesma noite (ordem do §3 continua valendo)
- **Voltar do Android em pilha** (§2.1 — pedido nº1): camada → tela → Rota → aviso → sai.
  O Kotlin pergunta ao JS se há camada aberta antes de decidir.
- **"Iniciar rota" calado** (§1.3): rota já ativa → leva pra ela ou diz o motivo.
- **Varredura app antigo × novo** (§2.2): inventário por agente de busca; reconectar o que o dono
  não aprovou remover.
- **Prospector F2/F3** (§3 etapa B): código FINANCEIRO — eu mesmo edito + verificação adversarial.
  Se a noite não der, fica aqui com moradia (não é "fica pra depois" solto).

### 7.6 ÚLTIMA ETAPA — gráficos do GPS 100% iguais ao mock rota
Quando chegar aqui, conferir se o chat "mock rota" terminou (sessão parada + `git status` do
`docs/mockups/logistica2.0/gps-ruas-prospector-v4.html` estável). Terminou → injetar o visual na
tela de navegação do app **100% igual ao mock**: empresas coladas na rua (sem voar), acende ANTES
de chegar e apaga depois que passou, ponteiro colado no bottom, descida 2D→3D sem piscar, zoom do
mock. Leis da casca valem: cor vira token, contraste medido nos 2 modos, slot sem fonte some.
Ainda rodando → seguir com o resto, re-conferir no fim; se não fechar, entra no resumo como
`IMPOSSÍVEL SOZINHO: mock rota não terminou — injeção fica pra próxima sessão com este §7.6`.

### 7.7 Ordem de execução da noite (mais leve primeiro, teste no meio)
1. §7.1 piscar → 2. §7.2 chips → 3. §7.4 reorganização → 4. §7.3 dia da rota →
5. "Iniciar" calado → 6. Voltar em pilha → **TESTE por toque no g15 (série, um celular só)** →
7. Varredura antigo×novo → 8. Prospector F2 (se couber) → 9. §7.6 mock rota →
**portões + publish + conferir no VPS/APK (`version-logistica.json`) + resumo + desligar**.
Commit local PEQUENO a cada item fechado (1 mão escrevendo; publish é mão única no fim).

### 7.8 RESUMO FINAL (preencher ao encerrar)
```
IMPOSSÍVEL SOZINHO: (preencher)
TOMEI DECISÃO: (preencher)
```
