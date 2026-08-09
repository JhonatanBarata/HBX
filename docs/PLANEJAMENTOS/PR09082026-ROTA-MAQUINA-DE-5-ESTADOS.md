# PR09082026 — A ROTA É UMA TELA SÓ, COM 5 ESTADOS

> Encomenda do dono (09/08): *"essa tela é: 1 Montar Rota vazio = mapa com minha seta na minha
> localização. 2 Rota pronta = mapa com todos os pontos mostrando (2d) opção Iniciar, cancelar,
> Finalizar — CORRIGE O ROTA DO DIA MAPA 2D. 3 Navegando = 3d, bonitinho. 4 cancelou navegando,
> volta pro Rota Pronta. 5 Finalizar = abre a Caderneta·Fechamento. Tem alguma coisa fora disso?"*

**Resposta curta: não tem nada fora disso — e o esqueleto dos 5 estados JÁ EXISTE no código.**
O que faltava era o miolo de dois deles e dois verbos mentindo. Este plano é a correção, não uma
reconstrução.

> **ESTADO: os defeitos A, B e C do §2 estão CORRIGIDOS no commit `8f3f772f`.**
> Portões de bancada: casca 66/66 idênticas, 33 telas, sem erro de console.
> Falta a prova de TELA no aparelho (§5) — é o que fecha a entrega.

---

## §1 — A MÁQUINA, MEDIDA NO CÓDIGO DE HOJE

Uma tela (`T.rota`, "Rota do dia (mapa 2D)") + um rodapé que troca com o estado
(`ROTA_ESTADOS`/`transmux`). Quem decide o estado é o servidor, traduzido em `estadoDaRota(r)`
(`ponte.js:423`) a partir de `routeStatus` — **nunca** o app por conta própria.

| # | Estado do dono | Chave | O que o rodapé mostra | Situação |
|---|---|---|---|---|
| 1 | Montar rota vazio | `montar` | **Montar rota** | ✅ existe — mapa 2D + marcador do motorista (`moverEuNoPlano`) |
| 2 | Rota pronta | `pronta` | **Iniciar** · Cancelar · Montagem | ⚠️ existe SEM O TRAÇADO (defeito A) |
| 3 | Navegando | `rodando` → `T.mapa` | **Navegar** · Cancelar · Finalizar | ✅ existe (V4: pitch 51, ponteiro 86%) |
| 4 | Sair do navegando | volta pra `T.rota` | — | ⚠️ existe, mas o botão se chama "Encerrar" (defeito B) |
| 5 | Finalizar | `fechar-dia` → `T.caderneta` | — | ✅ existe (`fecharDia`, `POST /logistica/caderneta/finalizar`) |

Estados que a tela desenha mas o **servidor nunca produz**: `pausada` e `semsinal`
(`estadoDaRota` só devolve `montar|pronta|rodando`, e o boot escreve `carregando|vazia`).
São resíduo do painel de demonstração — ver §4.

---

## §2 — OS DEFEITOS (cada um com a causa medida)

### A) 🔴 A rota pronta mostra PONTOS SEM CAMINHO — o defeito que o dono viu
O palco 2D (`geral`) desenha os pinos a partir de `PARADAS`, mas o traçado sai de
`navRota.geometria` — e `navRota` só nasce em `pedirRota()` (`ponte.js:2892`), chamado **apenas**
dentro da tela de dirigir (`aoMover`, guardado por `telaAtual()==='mapa'`, e no `ir('mapa')`).

Consequência: **o motorista monta a rota, abre o mapa e vê pinos soltos.** O caminho só aparece
depois que ele entra na navegação pelo menos uma vez — exatamente ao contrário do que a tela
serve pra fazer, que é DECIDIR antes de sair.

**Cura:** a tela da rota 2D pede o traçado uma vez ao abrir, reusando `pedirRota()` com os freios
que já existem (`navGastar`/`NAV_TETO_DIA`, `navPedindo`, intervalo e backoff). Uma vez por
entrada — nada de timer, nada de repetir por fix. Rota é API paga; parado na garagem a tela não
pode queimar pedido. Falhou, fica com os pinos: enfeite não derruba a tela.

### B) 🟡 "Encerrar" não encerra nada
O botão de sair da navegação (`.sair`, `data-ir="rota"`) volta pra tela Rota com a **rota viva** —
mas se chama "Encerrar". Verbo destrutivo em botão que não destrói, na tela onde o outro
"Cancelar" destrói de verdade. Vira **"Sair"**.

Lei que sai daqui: **sair da navegação e cancelar a rota são dois verbos, nunca o mesmo botão.**

### D) 🔴 O MAPA 2D NUNCA EXISTIU NA TELA — estava soterrado pela maquete
Achado só DEPOIS de publicar a cura A, dirigindo o app no g15 (APK 204): a tela ficou 2 minutos
com o mesmo desenho imóvel — ruas em grade perfeita e 6 pinos de **posição fixa**
(`MAPA_PARADAS`), que não são as paradas de ninguém.

A regra que apaga o desenho de espera é `.mapa-palco.pronto>svg` — **filho direto**. Mas
`mapaDesenho()` devolve `<div class="mapwrap"><svg>`: o seletor mira um neto e casa com nada. E
`.mapwrap` tem `z-index:10` enquanto `.mapa-vivo` não tem nenhum — o maplibre subia, ficava
`opacity:1` como manda a regra de baixo, e continuava **embaixo**. Nunca faltou mapa; o mapa
estava escondido.

**Cura:** a regra passa a mirar o invólucro (`.mapa-palco.pronto>.mapwrap`), com
`pointer-events:none` junto — caixa invisível de tela inteira come o dedo, que é o mesmo defeito
do facho da seta no 3D. Só o palco 2D: o `gps` tem a coreografia da cena de entrada e não se toca.

**LEI: seletor de filho direto morre calado quando alguém embrulha o alvo.**

### C) 🟡 A tela "Chegou" é um beco sem saída
`T.mapachegou` não tem `data-ir` nenhum, não tem `nav()`, e o botão verde grande
("Registrar entrega") **não tem `data-acao`** — é botão morto desde que nasceu. Quem chega numa
parada fica preso na tela.

**Cura:** o botão ganha `data-acao="abrir-parada"` com o id da entrega (novo campo `chegouId`,
publicado pela ponte no seam `gps`), e a tela ganha a mesma porta "Sair" do ramo dirigindo.
Sem id, o botão não é desenhado — Lei do IF: melhor vaga vazia que botão que mente.

---

## §3 — O QUE **NÃO** MUDA (e por quê)

- **`pronta` não ganha "Finalizar".** O dono listou os três juntos; finalizar uma rota que nunca
  começou não existe — e Finalizar abre a CADERNETA, que é dinheiro fechando. O terceiro slot do
  `pronta` continua sendo **Montagem** (a porta de volta pra revisar/salvar/trocar o dia; sem ela
  a montagem fica inalcançável). Finalizar aparece no estado `rodando`, que é quando ele existe.
- **A câmera 3D não se toca.** `NAV_PITCH=51`, `NAV_ANCORA=0.86`, descida de 2,4 s — calibrado
  contra o V4 e aprovado em 09/08. Mexer aqui é reabrir trabalho fechado.
- **`pronta` = Iniciar no meio, Cancelar como satélite de PERIGO.** Já está assim; o destrutivo
  não é o botão verde.

---

## §4 — PENDÊNCIAS COM MORADIA (nada de "fica pra depois" solto)

| # | Item | Decisão / dono |
|---|---|---|
| P1 | O marcador do motorista no 2D é um **círculo azul**, não a seta do 3D | Dono pediu "minha seta". Cabe unificar com o puck do V4 — **decisão dele**, é gosto em coisa que ele vê |
| P2 | `pausada` deixa a `T.rota` **sem rodapé** (falta a chave em `ROTA_ESTADOS`) | Estado que o servidor nunca produz. Proposta: tirar do painel de demonstração em vez de inventar rodapé |
| P3 | `T.mapalista` ("Mapa + fila") não recebe **nenhum dado** da ponte — KPIs fixos | Tela órfã. Ou ganha dado, ou sai do índice. Proposta: sai (a lista já é `rotalista`) |
| P4 | Os 4 botões do `.map-ctrl` da `mapalista` são inertes | Morre junto com P3 |
| P5 | A borda do mapa offline aparece no 2D de dia longo (~14% cinza num dia de 64 km) | Travar o zoom-out no recorte que o APK carrega (default) × baixar mais tile (engorda o APK) |

---

## §5 — BATERIA (a prova é a TELA, não o teste verde)

### Bancada
`node scripts/casca-injetar.js && node scripts/casca-conferir.js && node scripts/casca-antes-e-depois.js`
— o antes-e-depois só pode acusar as telas mexidas de propósito (`rota`, `mapa`, `mapachegou`).

### No aparelho (g15) — os 5 estados do dono, um print cada
| # | Passo | PASSA se |
|---|---|---|
| E1 | Dia sem rota montada | mapa 2D com a posição do motorista; rodapé = só "Montar rota" |
| E2 | Montar a rota | mapa 2D com **pinos E o traçado ligando eles**, sem entrar na navegação; rodapé = Iniciar · Cancelar · Montagem |
| E3 | Iniciar → Navegar | 2D da rota inteira → descida → 3D course-up |
| E4 | Tocar "Sair" no 3D | volta pra Rota Pronta com a rota **viva** (rodapé Navegar · Cancelar · Finalizar); nada foi cancelado |
| E5 | Tocar "Finalizar" | portão "Fechar o dia?" → Caderneta · Fechamento |
| E6 | Chegar numa parada (tela Chegou) | botão verde abre a folha da parada; existe porta de saída |

⚠️ **C0 antes de medir qualquer coisa:** `adb shell dumpsys package br.com.hbxsystem.logistica`
→ `versionCode`/`lastUpdateTime` contra a hora do último `chore: publish`. Instalado < publicado
⇒ parar e reinstalar (esta armadilha já mordeu 3 vezes).

---

*Plano da sessão 09/08/2026. Substitui o §3 do `PR08082026-ROTA-DOIS-MODOS.md` (que propunha
"lista com mini-mapa"); o §2 daquele plano — os dois modos operandi — continua valendo inteiro,
e esta máquina de 5 estados é a mesma nos 4 modos.*
