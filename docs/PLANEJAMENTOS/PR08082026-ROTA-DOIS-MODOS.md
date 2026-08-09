# PR08082026 — ROTA: DOIS MODOS OPERANDI + SIMPLIFICAÇÃO + BATERIA DE TESTES

> Encomenda do dono (08/08, noite): *"montar rota tá estranho e com erros… não mostra o mapa 2d
> antes do 3d… vc passa por 3 telas pra montar e não funciona… se movimenta o mapa, a seta fica
> travada… quero plano completo dos 2 modos operandi, com bateria de testes e simplificação
> perfeita."*
>
> Evidência: teste AO VIVO no g15 (APK 192 publicado, company 41, 08/08 21:27–21:32).
> Montei, iniciei, naveguei, arrastei o mapa e cancelei — estado devolvido como estava.

---

## §1 — O QUE O TESTE AO VIVO ACHOU (cada item com a causa no código)

| # | Defeito visto na tela | Causa medida |
|---|---|---|
| 1 | **Montar = 3 idas de tela e 6 toques**: Rota→[Montar rota]→Montagem→[Montar rota]→espera→[Iniciar rota]→portão→[Iniciar]→**volta pra Rota**→[Navegar]→GPS | `montarRota` não navega (decisão registrada em `ponte.js:1200`) e `iniciarRota` termina em `ir('rota')` (`ponte.js:1259`) — ninguém leva pro volante |
| 2 | **Dois botões com o MESMO nome fazendo coisas diferentes**: "Montar rota" da tela Rota só ABRE a montagem (`abrirMontagem`, `ponte.js:1111`); o da Montagem é quem monta | nome igual, verbo diferente — o dono clica o 1º achando que montou |
| 3 | **Nenhum mapa no processo inteiro.** A montagem é lista cega; depois de montar não há traçado; **"Ver mapa" abre a MESMA tela de navegação 3D** (print 19) | `data-ir="mapa"` na tela Rota (`logistica-2.0.html:2859`) aponta pro palco `gps`; a tela `mapalista` (mapa+fila) e o palco `geral` (rota inteira, com moldura e marcador — `ponte.js:1596-1598`) existem e **não têm porta** |
| 4 | **Não existe 2D antes do 3D.** A "vista de cima" é zoom fixo de quarteirão (`NAV_ZOOM-1.8`, `ponte.js:2558`, comentário: *"não a moldura da rota"*) e fica ESCONDIDA atrás da cena da cobra até a descida começar | o motorista nunca vê o traçado completo do dia — nem na montagem, nem na entrada da navegação |
| 5 | **Arrastar o mapa NÃO FUNCIONA — flagrado no meio de um arrasto de 2 s: zero pixel** (prints 13–17). A seta fica pregada e "Recentralizar" não tem o que recentralizar | **a câmera não tem estado "solta"**: `cameraDaNavegacao` roda a cada fix e SEMPRE `easeTo` de volta (`ponte.js:2648-2664`), sem escutar `dragstart`; o puck é DESENHO fixo a 68% da tela (`logistica-2.0.html:1155`), não marcador do mapa; `gps-centrar` = só `pararDescida()+cameraDaNavegacao()` (`ponte.js:4923`) |
| 6 | **Tela Rota mente antes de montar**: "Sua rota de hoje", 52 cartões numerados 1–52, hora "00:00" em todos — com "monte a rota pra saber" logo acima (print 02) | dia-preview pintado com cara de rota pronta; número e hora são enfeite sem fonte |
| 7 | **Portão de iniciar diz "Debita 0 · você tem 49728"** | o app agora lê os nomes certos (`creditosAIniciar`, `ponte.js:1218`) — o **servidor** respondeu 0; precificação da rota não configurada/zerada pra empresa |
| 8 | **"Cancelar rota" é o botão VERDE, na mesma vaga onde 3 min antes o verde era "Iniciar"** (print 20) | `cancelarRota` marca o destrutivo como `principal` (`ponte.js:1271`) — verbo destrutivo vestido de CTA feliz |
| 9 | **Sujeira de cadastro exposta na decisão**: "Almeirinda (?)" 2×, "Ana" 2×, nomes com "(?)" | montagem não agrupa nem avisa duplicata; dado cru na tela de decidir |
| 10 | **Efeito de entrada da navegação**: ~5–8 s de mundo DESENHADO (rua falsa, seta falsa) antes do mapa real assentar (prints 10→12) | cena da cobra + espera do maplibre; em rede lenta a mentira dura mais — e cobre justamente a fase 2D |

**Resumo em uma frase:** o app cobra 6 toques em 3 telas pra fazer UMA coisa (sair entregando),
não mostra o traçado em momento nenhum, e a única tela de mapa que existe briga com o dedo.

---

## §2 — OS 2 MODOS OPERANDI (arquitetura fechada no brainstorm de 08/08)

Duas decisões independentes, nunca "tipos de rota":

| Decisão | Opções |
|---|---|
| **De onde vêm as entregas?** | CARTEIRA (clientes fixos por dia — água) · PEDIDOS (PO pronto) |
| **Quem monta?** | MOTORISTA (celular) · CENTRAL (desktop) |

### Acesso do motorista muda com o modo — essa é a régua

| Motorista pode | CARTEIRA (água) | PEDIDOS (PO) |
|---|---|---|
| Tela inicial | Hoje + Clientes | Minha rota |
| Ver/editar clientes | carteira inteira | só os da rota recebida |
| Cadastrar cliente na porta | **sim** (o "+" de hoje) | não |
| Montar/reordenar | sim | só ordenar os POs dele |
| Adicionar entrega extra | sim | não |
| Financeiro | valor do cliente, fiado, caderneta | só "pago / receber X" |
| Encerramento | dinheiro + carga + vazios | pedidos entregues/devolvidos |

Config: `modoOperacao` (CARTEIRA|PEDIDOS) + `quemPlaneja` (MOTORISTA|CENTRAL) na
`LogisticaConfig`. **Onboarding = 2 perguntas**, feitas 1 vez; nunca perguntar de novo no dia a dia.

Combinações: Água Solo (CARTEIRA+MOTORISTA — **prioridade nº 1**), Água Equipe
(CARTEIRA+CENTRAL), PO Solo (PEDIDOS+MOTORISTA), PO Central (PEDIDOS+CENTRAL).
"Urgente" NÃO é modo: é o botão "Adicionar entrega" dentro de qualquer modo.
Depois de iniciada, **a rua é uma só nos 4**: navegar → entregar → receber → encerrar.

---

## §3 — SIMPLIFICAÇÃO PERFEITA (Água Solo primeiro)

### A régua: de 6 toques/3 telas para 2 toques/1 tela

**HOJE:** Rota(lista falsa) → Montar rota → Montagem(lista cega) → Montar rota → Iniciar rota →
portão → Rota de novo → Navegar → GPS.

**ALVO — a Rota de hoje NASCE PRONTA:**

1. Abriu o app (dia com clientes na agenda) → o servidor já montou (mesmo `planejar` de hoje,
   disparado sozinho na 1ª abertura do dia — a agenda já sabe quem é de sábado).
2. Tela Rota mostra: **MINI-MAPA 2D no topo com o traçado do dia** (palco `geral`, que já
   existe) + lista na ordem real com ETA real + custo no pé.
3. **UM botão: "Começar entregas · debita N"** = iniciar + navegar num toque só (o portão de
   crédito é o próprio botão; erro de saldo vira portão).
4. "Revisar" vira ação secundária e abre a atual Montagem — que passa a ser tela de EDIÇÃO
   (tirar de hoje, adicionar extra, arrastar ordem, trocar dia), nunca etapa obrigatória.

Regras que saem do teste:
- **Número e hora só existem depois que a rota existe.** Antes disso a lista é "clientes de
  hoje", sem 1-2-3 e sem 00:00 (mata o defeito 6).
- **Nome de botão = o que ele faz.** "Montar rota" que só abre tela morre; "Revisar" abre,
  "Montar" monta, "Começar entregas" começa (mata o defeito 2).
- **Destrutivo nunca é o CTA verde.** "Cancelar rota" fica vermelho/fantasma, verde é sempre o
  caminho de trabalhar (mata o defeito 8).
- **Duplicata avisa na montagem**: 2 clientes com o mesmo nome+porta ganham selo "conferir" —
  aproveita a régua `mesmaPorta` do servidor (mata o defeito 9).
- **Debita 0 é proibido de passar calado**: se o custo vem 0, ou é cortesia (mostra
  "Cortesia hoje") ou é erro de precificação (alarme no /master). Decisão do dono no §6.

### O mapa do jeito que o mercado faz (Waze/Google/Uber)

**Câmera com TRÊS estados** (`seguindo` | `solta` | `descida`):
- `dragstart` do maplibre ⇒ `solta` — a câmera PARA de escrever (o `easeTo` por fix não roda).
- Em `solta`: o puck desenhado (fixo na tela) SOME e um marcador no chão do mapa assume a
  posição real — a seta nunca mais fica "travada" no meio da tela com o mundo andando embaixo.
- "Recentralizar" (que hoje não tem função) volta pra `seguindo` — agora ele TEM o que fazer.
- 12 s sem toque ⇒ volta sozinho pra `seguindo` (padrão de mercado).

**2D antes do 3D, de verdade:**
- Entrou na navegação ⇒ **VISÃO GERAL: `fitBounds` da rota inteira, 2D, 2.5 s** — o motorista
  VÊ o dia (traçado + pinos + partida). A cena da cobra encurta pra ~1 s e NÃO cobre essa fase.
- Depois a descida de 2,4 s que já existe (`ponte.js:2586`) leva pro 3D course-up. Sem corte.

**Mapa em todo lugar que decide:**
- "Ver mapa" da Rota abre `mapalista` (mapa 2D + fila) — a tela já existe sem porta.
- Montagem ganha o mini-mapa do traçado assim que monta (palco `geral` transplantado — a
  GARAGEM já suporta 2 mapas por nome).

---

## §4 — MODO PEDIDOS (PO) — o segundo modo, mesma rua

- Entrada: tela "Pedidos de hoje" (POs atribuídos) no lugar da agenda. Selecionar → montar →
  mesma rota, mesma navegação, mesma folha de entrega (com itens do PO e devolução).
- Acesso do motorista: SEM Clientes, SEM "+", SEM caderneta — ver tabela do §2.
- Central (desktop /logistica) monta e ATRIBUI; o app recebe "Sua rota chegou · aceitar e
  começar" (o trilho de recado/portão já existe).
- Nada de motor novo: `planejar`/`iniciar`/`navegar` são os mesmos; muda a ORIGEM das paradas
  (PO em vez de agenda) e o PERFIL de acesso.

---

## §5 — FASES (cada uma com gate; nenhuma depende da seguinte)

| Fase | Entrega | Gate de saída |
|---|---|---|
| **F0 — Mapa honesto** | câmera 3 estados + puck→marcador em `solta` + Recentralizar real | roteiro C3 abaixo passa no g15 |
| **F1 — 2D→3D** | visão geral fitBounds 2.5 s + cobra ≤1 s + descida existente | C4 passa; print da fase 2D com traçado inteiro |
| **F2 — Rota nasce pronta** | auto-planejar na 1ª abertura do dia + tela Rota com mini-mapa + "Começar entregas" (iniciar+navegar) + Montagem vira "Revisar" | C1/C2 passam: 2 toques do boot ao volante |
| **F3 — Honestidade** | sem 1-2-3/00:00 antes de montar · destrutivo fora do verde · selo duplicata · Debita 0 tratado | C5 passa |
| **F4 — Modos operandi** | `modoOperacao`+`quemPlaneja` na config + onboarding 2 perguntas + perfil de acesso do motorista | C6 passa nos 2 modos |
| **F5 — PO** | tela Pedidos + atribuição da central + aceite no app | roteiro próprio quando F4 estiver no ar |

F0/F1 são só app (mock+ponte). F2 toca backend (auto-planejar idempotente — o `planejar` de
hoje já é; falta disparo). F4/F5 tocam config+desktop. **Ordem é essa: primeiro curar o que o
motorista vê hoje, depois abrir o segundo modo.**

---

## §6 — DECISÕES DO DONO (pendentes, nada travado)

1. **Custo de iniciar**: quanto debita por rota/parada? (hoje o servidor responde 0 — é
   cortesia da empresa 41 ou precificação nunca ligada?)
2. **Conferência de carga**: vira etapa opcional do "Começar entregas" (chip "conferir carga
   antes") ou some do fluxo água-solo?
3. **Auto-montar**: monta na 1ª abertura do dia (proposta) ou num horário fixo (ex.: 6h)?
4. **PO (F5)**: entra já no onboarding como opção visível ou fica escondido até a 1ª
   distribuidora-PO assinar?

---

## §7 — BATERIA DE TESTES

### A) Portões de bancada (roda a cada leva — já existem)
`node scripts/casca-injetar.js && node scripts/casca-conferir.js && node scripts/casca-antes-e-depois.js`
— 32 telas/64 comparações 100% idênticas; antes-e-depois só acusa a tela mexida de propósito.

### B) Backend (roda no gate)
- Suites `logistica` existentes (rota-modelo/tracking: 5 falhas PRÉ-EXISTENTES conhecidas, não
  contam como regressão).
- **Novos**: auto-planejar idempotente (2 aberturas no mesmo dia = 1 rota); custo-preview nunca
  responde 0 sem `cortesia:true`; perfil PEDIDOS não enxerga `/nucleo/contas` de fora da rota.

### C) Roteiro no aparelho (g15, company 41 — como o teste de hoje, com `adb screencap` por passo)
| # | Passo | PASSA se |
|---|---|---|
| C1 | Abrir o app num dia com clientes | Rota de hoje JÁ montada: mini-mapa 2D + ETAs reais; ZERO cartão com 00:00 |
| C2 | Tocar "Começar entregas" | do toque ao mapa navegando: 1 portão no máximo (crédito), SEM voltar pra Rota |
| C3 | Na navegação, arrastar o mapa | o mundo ANDA sob o dedo; seta vira marcador no chão; "Recentralizar" volta a seguir; 12 s sem toque volta sozinho |
| C4 | Entrar na navegação | ver NA TELA: rota inteira 2D (traçado+pinos) ~2.5 s → descida contínua → 3D course-up; cobra ≤1 s |
| C5 | Cancelar a rota | portão com destrutivo FORA do verde; ao confirmar, tela volta pra "clientes de hoje" sem números falsos |
| C6 | Trocar `modoOperacao` pra PEDIDOS (config) | app reabre com "Minha rota"; busca de Clientes e "+" SOMEM; caderneta some |
| C7 | Montagem com 2 clientes mesma porta | selo "conferir" nos 2 |
| C8 | Modo avião no meio do C2 | botão vira "sem sinal", nada de tela morta; volta a rede, retoma |

### D) Regressão do que JÁ quebrou (não repetir história)
- Rota some à meia-noite (pendência conhecida) — C1 rodado após 00:00 ainda mostra a rota ACTIVE.
- Repinte não derruba o mapa (garagem) — 60 s navegando = 1 mapa (contar pelo devtools em debug).
- Voz: 2 falas por manobra; "Silenciar voz" grava e apaga.
- Arrastar parada na lista grava no servidor (reboot mantém a ordem).

---

*Análise e plano: sessão 08/08/2026 noite. Prints do teste no scratchpad da sessão
(01-abertura … 21-final). Nada foi alterado em código nesta sessão; rota de teste cancelada e
estado do app devolvido.*
