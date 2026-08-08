# PR07082026 — ROTEIRO FUNCIONAL: o que um app de entrega ENTREGA

> Ordem do dono (07/08, noite): *"eu quero um roteiro, real, do que um app desses entrega.
> e vc cumprir todos os checks. e cabou! criou rota, salvou, ficou salvo, entregou,
> aparência ok, é isso. nada magestoso, mas funcional."*
> E: *"é pedir muito eu clicar em montar rota, e aparecer uma tela para montar a porra
> da rota? fechar e eu achar a tela de fechamento."*
>
> Este arquivo é o contrato. Cada linha do roteiro tem um CHECK com a prova exigida.
> Nada aqui é feature nova — é ligar o que existe e tirar o que mente.

## 1. O ROTEIRO (o contrato funcional, na ordem do dia do motorista)

| # | O que acontece | Check (a prova) |
|---|---|---|
| R1 | Abrir o app → Rota carrega o dia REAL, sem dado de exemplo, sem badge falso | print g15: tela Rota sem "João da Silva", sino sem "2" de mentira |
| R2 | Tocar **"Montar rota"** → ABRE A TELA DE MONTAGEM: chips de dia (Hoje + dias), lista dos clientes DO DIA ESCOLHIDO, somas | print g15: montagem aberta com prévia de Hoje; trocar pra Sáb TROCA a lista |
| R3 | Tocar **"Montar rota"** na montagem → prepare/planejar → rota pronta, ordem otimizada | print g15: lista com ordem/hora; estado vira "pronta" |
| R4 | Tocar **"Salvar rota"** → grava em Rotas salvas e FICA salvo (persiste, reabre) | print g15: Rotas salvas com a rota nova; reabrir o app e ela continua lá |
| R5 | Tocar **"Iniciar"** → custo real no portão → debita → rodando | print g15: portão "Debita N · você tem M" |
| R6 | Tocar a parada → folha → **entregue/pagou/marcou/não entregue** → status e caixa mudam | print g15: parada "Entregue", caixa do dia somando |
| R7 | Tocar **"Finalizar"** (ou o caixa da Rota) → fechar o dia → caderneta registra | print g15: portão "Fechar o dia?" → caderneta do dia |
| R8 | Aparência ok: 2 modos, contraste, ZERO botão morto, ZERO badge de enfeite | portões da casca verdes + varredura de toque |

## 2. O QUE ESTAVA QUEBRANDO O ROTEIRO (medido nesta sessão, 07/08 noite)

1. **Chips de dia não trocavam a lista** (`montar-dia` só mudava a seleção; a lista
   continuava a de hoje) — o dono: *"alterno entre dias e só aparece o mesmo cliente"*.
2. **"Rota rápida"** — satélite SEM ação (a tela T.rapida é desenho puro). Botão morto.
3. **"Rotas recebidas" com badge 2** — contagem CRAVADA no desenho, sem ação. A rota
   indicada morreu no corte de 06/08. Botão morto com número falso.
4. **Sino do cabeçalho com "2"** — o `sino:2` do desenho não era zerado no boot e o
   botão não abria NADA. Badge falso em TODA tela.
5. **"Avisar chegada"** na raiz dos Ajustes — o dono mandou pro Avançado.
6. **"Modo caderneta"** — chave de um modo REMOVIDO; tocar piscava a tela e não fazia nada.
7. **"Salvar rota"** — gancho sem ação (e o `data-acao` estava no `<b>`, nem no botão).
8. **"Otimizar ordem"** — botão sem ação nenhuma (o planejar JÁ otimiza).
9. **"Finalizar"** (rota em curso) — botão sem ação; o fechamento existia mas não era achável.
10. **"Montar rota" montava direto** — sem tela pra VER o que ia entrar antes.
11. **"Iniciar rota" aparecia ANTES de existir rota** (dono, ao vivo: *"cliquei em iniciar
    rota → erro, monte a rota antes"*). O botão errado no estado errado — sem sequência.

## 2b. A SEQUÊNCIA (a "vida" que faltava — um estado, um botão, nunca dois)

```
MONTAR (nada montado)  →  tela de montagem: chips + prévia + [Salvar] [MONTAR ROTA]
PRONTA (montada)       →  a mesma tela: lista real + [Salvar] [INICIAR ROTA]
RODANDO                →  Rota: paradas → folha da porta → [Pausar] [Cancelar] [Finalizar]
FECHADA                →  portão "Fechar o dia?" → caderneta do dia
```
O botão de cada estado só existe NELE. "Iniciar" antes de montar não existe mais —
o erro "monte a rota antes" fica impossível de ver, não só de tocar.

## 3. O DESENHO NOVO DO FLUXO (nada magestoso)

- **Rota (estado montar):** botão do meio "Montar rota" **ABRE a tela de montagem**
  (nenhuma ida ao servidor no toque). Chips saem da tela Rota — o dia se escolhe DENTRO
  da montagem, um lugar só.
- **Tela de MONTAGEM:** chips de dia (Hoje aceso) · lista = prévia do dia escolhido
  (`GET /logistica/dia-preview`) · somas da prévia · botões:
  **Salvar rota** (azul, LIGADO → `POST /logistica/rota-modelos`, nome "Rota de <dia> · dd/mm",
  paradas na ordem da tela) · **Montar rota** (verde → prepare/planejar do dia escolhido;
  vira **Iniciar rota** depois de montada).
- **Fechar:** o botão **"Finalizar"** da rota em curso ganha o gancho `fechar-dia`
  (portão "Fechar o dia?" → `caderneta/finalizar` → caderneta). O caixa do topo já
  abria a caderneta; agora o fechamento tem DUAS portas acháveis.
- **Botão morto NÃO FICA:** satélites "Rota rápida"/"Rotas recebidas"/"Adicionar" e o
  "Otimizar ordem" saem (slot inteiro). Sino do cabeçalho vira porta do Chat com
  contagem REAL (zera no boot, `podarDesligados` respeitado).

## 4. PENDÊNCIA COM MORADIA (não entra nesta leva)

- **Rota rápida DE VERDADE** (buscar endereço/CEP/link → conta → entrega → encaixe):
  é a frente do `montagemRapidaModal` do app antigo (geo/busca + geo/cep + geo/link +
  geo/reverse + dedupe + `paraMinhaRota` + encaixe). Quando nascer LIGADA, o satélite
  volta COM ação. Referência: `INVENTARIO-APP-ANTIGO-VS-NOVO.md` §N.
- **Reordenar paradas no dedo** (a alça `.grip` é visual) — junto com a frente acima.
- Prospector F2/F3 — continua no §7.5 do `PR07082026-APP-UNICO-CONTINUACAO.md`.

## 5. O PASSO A PASSO (modo de trabalho: o dono manda "passo N", eu entrego o passo,
##    instalo no g15, deixo a tela aberta, ele confere SIM/NÃO antes do próximo)

> STATUS em 07/08 23h: 🔧 = já corrigido no código LOCAL desta sessão (falta injetar
> a casca + buildar) · ⬜ = falta construir · ✅ = já funciona no app publicado.

| Passo | Você faz | Tem que acontecer | Status |
|---|---|---|---|
| **P0** | — | Injetar a casca + portões (62/62) + build + instalar no g15 | ✅ feito (6 builds, casca 62/62) |
| **P1** | Abre o app | Rota do dia REAL; sino sem "2" falso; sino/balão ABREM o chat | ✅ provado no g15 |
| **P2** | Toca "Montar rota" | ABRE a tela de montagem (chips de dia + lista do dia + somas), sem montar nada ainda | ✅ provado |
| **P3** | Toca "Sáb" | A lista TROCA pros clientes de sábado (prévia `dia-preview`) | ✅ provado (Adriana, Alessandro, Alexandra… no lugar do cliente de hoje) |
| **P4** | Toca "Montar rota" (na montagem) | Ordem otimizada entra; botão vira "Iniciar rota" | ✅ provado — exigiu consertar a máquina de estado (ver §6) |
| **P5** | Toca "Salvar rota" | Grava em Rotas salvas, PERSISTE, reabre | ✅ provado ("Rota de Sexta · 07/08 · 2 paradas", sobreviveu a reinstalar) |
| **P6** | Toca "Iniciar" | Portão com custo REAL → debita → rodando | ✅ provado — exigiu consertar o `?date=` do custo (ver §6) |
| **P7** | Toca a parada → folha | Pagou/marcou/não entregue; caixa do dia soma | 🟡 folha abre com dado real; **não confirmei** (company 41 é do André, cliente real) |
| **P8** | Toca "Finalizar" | Portão "Fechar o dia?" → caderneta registra o dia | 🟡 botão ligado e no dock; confirmar grava caderneta real — falta o seu GO |
| **P9** | Olha tudo, 2 modos | Contraste ok, ZERO botão morto no caminho | ✅ no caminho R1→R8; sobra a lista abaixo |

**Consertos 🔧 já no código local (sessão 07/08 noite), aguardando P0:**
sino zerado no boot + sino/balão viram porta do chat · chips de dia trocam a lista
(prévia real) · satélites mortos FORA (Rota rápida, Rotas recebidas c/ badge falso,
Adicionar) · "Avisar chegada" → Avançado (grupo Avisos) · chave "Modo caderneta" FORA.

**Botões mortos que SOBRAM depois do P9 (fora do caminho principal, ficam declarados):**
filtro "Fila/Entregue" (número real, toque sem ação) · alça de arrastar (visual) ·
botões "ouvir" da tela Sons. (Saíram nesta leva: Rota rápida, Rotas recebidas,
Adicionar, Otimizar ordem, Pausar/Continuar, busca e "Usar hoje" das Rotas salvas.)

---

## 6. 🔴 OS DOIS DEFEITOS DE FUNDO — por que "não tinha sequência"

Achados testando por toque, medidos no banco de produção. Nenhum dos dois era visível
lendo o código: os dois estavam na fronteira entre o app e o servidor.

**(a) A rota montada não existia pro app.** O app decidia "está montada?" olhando o
`routeId` — que é a rota do RASTREAMENTO e só nasce quando se INICIA. Resultado: montar
não mudava nada na tela (botão seguia "Montar rota" pra sempre), e a montagem mostrava um
"Iniciar rota" fixo, disponível antes da hora. Agora quem prova a montagem é a ORDEM
gravada em cada parada (`rotaOrdem`), que é o que o `rota/planejar` grava.
Mesmo problema no outro extremo: rota **ACTIVE** (rodando) era lida como "pronta" porque o
app comparava com `'em_rota'`, palavra que o servidor não usa. O vocabulário real é
`PLANNED | INITIALIZING | ACTIVE | COMPLETED | REFUNDING | FAILED | ENCERRADA`.

**(b) "Monte a rota antes de iniciar" com a rota montada.** O app pedia o custo
(`/logistica/rota/custo-preview`) **sem a data**. O servidor roda em UTC: das 21h à
meia-noite de Brasília o dia dele já é o de amanhã, então ele procurava entregas no dia
errado e respondia "Nenhuma entrega aberta neste dia. Monte a rota antes de iniciar."
Medido no banco: 96 entregas abertas com `scheduledAt = 2026-08-07 03:00Z`, e o log do
backend com o `400` na hora exata. Era ESTE o erro que você levou na cara. A data agora
viaja nas duas chamadas do custo.

## 7. ESTADO DEIXADO NA BASE (company 41, do André)
Pra provar o roteiro eu **montei e iniciei** a rota real do dia 07/08 (96 paradas,
débito 0 — o portão mostrou "Debita 0 · você tem 9968"). A rota está **ACTIVE**.
**Nenhuma entrega foi confirmada** e nenhuma caderneta foi fechada. Se quiser voltar ao
estado anterior é 1 toque no "Cancelar" do dock (encerra a rota, não cancela entrega).
