# PR25072026-ROTA-CONFERIDA — a rota que prova antes de rodar

> Status: **EXECUTADA 25/07 — 8 sprints commitadas LOCAL, aguarda publish do dono.**
> Commits: `e9d32675` S0 · `0ebb81a9` S1 · `b6943de7` S2 · `759551bb` S3 ·
> `23944b1a` S4 · `30c9845b` S5 · `b30cffd2` S6 · `0ceb5efb` S7 (+ `b8c9ee55` docs).
> Gate final: 430 testes na bateria logística, 419 verdes; as 11 falhas são
> pré-existentes (billing/tracking) ou do WIP paralelo do dono (agenda) — NENHUMA
> em arquivo tocado pela frente (provado por git log no range fdf2347b..HEAD).
> ⚠️ Flag `rotaConferidaAtiva`: coluna NÃO criada (drift pré-existente no schema,
> `VendasCardComplaint` sem migration). S4/S5/S6 100% no código, inertes até a
> coluna existir. Decisão do dono no publish.
> Origem: pedido do dono (25/07) + análise externa (GPT) auditada contra o código.
> Nada aqui foi implementado; nenhuma migration, nenhum débito novo.

## Por quê

Hoje a rota "pronta" pode esconder três mentiras, todas confirmadas no código:

1. **Pino de loteria** — parada sem coordenada vai pro fim da fila CALADA
   (`semCoordenada` é calculado no backend e o APK nunca lê — zero ocorrências
   em `app.js`). Incidente empresa 41: divergências de 2.991 m / 1.512 m / 650 m,
   154 de 248 clientes dividindo o mesmo pino.
2. **Linha reta disfarçada** — `planRouteByRoads` chama o OSRM público direto e,
   em qualquer falha, cai silenciosamente pro Haversine
   (`logistica-rota.service.ts:974`). A tela mostra "rota pronta" igual nos dois
   casos — km e ETA podem estar ignorando rio, mão única e viaduto.
3. **Ordem trocada no Iniciar** — `iniciarRota` re-planeja com o GPS atual como
   origem (`logistica-rota.service.ts:193`). A sequência que o usuário acabou de
   revisar pode mudar no exato momento em que ele aperta "Começar".

## Leis do projeto (não negociáveis)

1. **Pino errado é pior que pino vazio** (lei de 25/07, já em vigor no geocode).
2. **Zero lentidão artificial** — mostrar trabalho REAL (a matriz OSRM e a
   conferência levam segundos de verdade; é isso que aparece).
3. **Conferir é grátis; debitar só no Iniciar, anunciado.** A conferência JAMAIS
   chama `prepareRoute` — vira teste automatizado.
4. **Degradação nunca é silenciosa** — o motor usado (`osrm`/`haversine`) viaja
   no resultado e aparece na tela.
5. **Gate não depende de rede externa** — todas as regras de reprovação rodam
   local, R$0. CEP/ViaCEP NÃO entram no gate (só como ajuda no formulário de
   correção). Cidade×UF valida com o que já está no cadastro.
6. **A rota iniciada é a rota aprovada** — byte a byte, via `ordemManual`.

## Veredito da análise externa (resumo do que foi auditado)

| Afirmação do GPT | Veredito | Prova |
|---|---|---|
| Coordenada híbrida no front (lat de uma fonte, lng de outra) | ✅ REAL, 1 ocorrência | `frontend/src/app/(app)/logistica/route-builder.tsx:139` |
| Fallback Haversine invisível | ✅ REAL | `logistica-rota.service.ts:974` (catch → planRoute) |
| Planejador ignora o proxy OSRM que já existe | ✅ REAL | `logistica-osrm.service.ts` (cache+rate-limit) vs fetch direto na linha 940 |
| Iniciar pode reordenar silenciosamente | ✅ REAL (exceto com `ordemManual`) | `logistica-rota.service.ts:193-199` |
| Perna-a-perna exige guardar geometria nova | ⚠️ MEIO CERTO | durações/distâncias por perna JÁ estão na matriz (linhas 964-967); só não são devolvidas |
| Precisa de `LogisticaRoutePlan` + 3 tabelas + versão | ❌ REJEITADO | congelamento já existe via `ordemManual` (linhas 85-92); operação ≤50 paradas não paga esse custo |
| CEP de outra cidade como bloqueador | ❌ REJEITADO | CEP genérico no interior + rede externa em gate das 6h30 |
| "OSRM encaixou na malha" como prova verde | ❌ REJEITADO | snap do OSRM cola QUALQUER coordenada na rua mais próxima; não prova nada |
| Financeiro | ❌ AUSENTE na análise | acoplamento `planejar`→`prepareRoute` é o risco nº 1 de regressão de cobrança |

## Sprints

### S0 — Coordenada híbrida no route-builder (fix imediato, independente do resto)
- `frontend/src/app/(app)/logistica/route-builder.tsx:139` — trocar os `??` por
  eixo pela regra fonte-inteira (espelho de `resolverCoordenadaMultilocal`:
  local só vale com lat E lng válidos; senão perfil inteiro; nunca misturar).
- Varredura no front inteiro pelo mesmo padrão (grep já mostrou 1 caso, confirmar).
- **Aceite:** impossível montar coordenada com eixos de fontes diferentes.

### S1 — Motor com crachá (fim do fallback mudo)
- `planRouteByRoads` passa a chamar o proxy (`LogisticaOsrmService.table`) em vez
  do público direto — ganha cache 10 min, rate-limit 30/min por empresa e
  self-host futuro de graça. Fallback público direto permanece como 2º degrau
  (proxy nunca vira ponto único de falha — comentário do próprio serviço).
- Resultado do planejar ganha: `engine: 'osrm' | 'haversine'` +
  `degradedReason?: 'timeout' | 'rate_limit' | 'upstream'`.
- APK: selo discreto "Calculada pelas ruas" (verde) OU faixa amarela "Distâncias
  aproximadas em linha reta — rede de rotas indisponível" com 1 toque de ciência.
- **Arquivos:** `logistica-rota.service.ts`, `logistica.controller.ts` (DTO),
  `EntregaShell/.../app.js`.
- **Aceite:** teste unitário — OSRM caindo → resultado com `engine:'haversine'`;
  nunca mais "pronta" sem dizer como.

### S2 — Perna a perna (a ideia visual do dono, custo mínimo)
- Devolver por parada: `legDistanceM`, `legDurationS` (os números já são somados
  hoje nas linhas 964-967; é expor, não calcular).
- APK: lista desfilando `Cliente X → [500 m · 3 min] → Cliente Y`, com ETA por
  parada. Pendência aparece NO LUGAR onde cairia, em vermelho — o salto absurdo
  (ex.: 12 km entre vizinhos) se denuncia sozinho em 1 segundo.
- **Aceite:** soma das pernas ≈ distanciaTotalKm (tolerância de arredondamento).

### S3 — Validador geográfico central (o cérebro da conferência)
- Novo util puro + endpoint `POST /logistica/rota/conferir` — **dry-run: não
  grava rotaOrdem, não chama prepareRoute, não debita.** (⚠️ backend sem prefixo
  `/api` — pegadinha conhecida.)
- Semáforo por parada, tudo local e R$0:
  - 🟢 **Porta provada:** `geoFonte` ∈ {`gps_entrega`, `gps_cadastro`}.
  - 🟡 **Provável:** só `geocode` (validado pelo freio de 25/07); cliente nunca
    entregue; OU rota inteira degradada pra haversine (S1).
  - 🔴 **Não confio:**
    - sem coordenada (`semCoordenada` — hoje calculado e jogado fora);
    - **pino compartilhado** — mesma coordenada (célula ~4 casas) em N≥2 clientes
      (assinatura do centroide de via: era 154/248 na empresa 41);
    - **fora do casulo** — distância à mediana das paradas do dia > teto
      (configurável por empresa: urbano ≠ rural, default 15 km);
    - **diverge do GPS de ouro** — >300 m da última entrega concluída daquele
      cliente/local;
    - **perna outlier** (pós-ordenação) — perna > 3× a mediana do dia OU
      zigue-zague (A→B→volta ao lado de A).
- Limiares em `LogisticaConfig` (novos campos opcionais com default — sem
  migration destrutiva).
- **Aceite:** unit tests com os casos reais da empresa 41; teste-invariante
  "conferir não cria claim nem movimento de crédito".

### S4 — Tela de pausa + resolver sem perder o cálculo (APK)
- Fim do cálculo NÃO pula pra "pronta": para em
  `15 prontas · 2 corrigir · 1 aviso · 47 km · fim ~15:40`.
- Tocar na pendência → mini-ficha POR CIMA (rota preservada):
  - arrastar o pino no mapa · usar meu GPS daqui · usar GPS da última entrega ·
    corrigir endereço · tirar desta rota · deixar como pendência.
- Corrigiu → revalida SÓ aquela parada e replaneja; se a ordem mudar, avisa:
  "Fulano passou da parada 3 para a 8" (sistema não é caixa-preta).
- **DECIDIDO (dono, 25/07): vermelho NUNCA bloqueia a saída.** Cada 🔴 levado
  mesmo assim exige **1 toque consciente por pendência** (nunca "ignorar tudo")
  — parada segue no fim, sem ETA, vermelha no mapa/lista.
- ⚠️ Seguir a CONSTITUIÇÃO do APK (10 Leis + catálogo) ANTES de desenhar a tela.
- Flag `rotaConferidaAtiva` em LogisticaConfig, default OFF (mesmo padrão da
  `agendaV2Ativa`) — rollout empresa a empresa.
- **Aceite:** E2E no padrão PR21072026-APK-PADRAO; correção de pino durante a
  conferência não dispara débito nem WhatsApp.

### S5 — Aprovar congela (reusa `ordemManual`, zero tabela nova)
- "Aprovar rota" = salvar a sequência aprovada (client-side + `rotaOrdem` que o
  planejar já grava). "Iniciar" passa a enviar essa sequência como `ordemManual`
  → o backend respeita ao pé da letra (mecanismo EXISTENTE, linhas 85-92).
- Drift de origem: se o GPS do Iniciar estiver a > 1 km da origem do
  planejamento → pergunta "Manter sequência aprovada ou recalcular?" (nunca
  troca calado).
- A arquitetura plan/version/snapshot do GPT fica **adiada de propósito**: se um
  dia houver multi-motorista com despachante, aí ela paga o próprio custo.
- **Aceite:** iniciar após aprovar reproduz a MESMA ordem (teste integração).

### S6 — Financeiro transparente (a resposta à pergunta do dono: SIM, mostrar)
- Preview determinístico na aprovação: **1 crédito por bloco de 5 entregas
  únicas, só blocos ainda não debitados** (claims idempotentes por
  empresa+motorista+data+bloco já garantem — `logistica-route-billing.service.ts:70`).
- Cálculo em modo leitura (contar claims DEBITED existentes vs blocos do plano) —
  **nenhuma chamada nova a `prepareRoute`**.
- Tela de aprovação (admin/USERMASTER): `Iniciar vai debitar 4 créditos · saldo 37`.
- **Saldo insuficiente acende na CONFERÊNCIA** (véspera/noite anterior), não às
  6h30 com o caminhão carregado.
- **DECIDIDO (dono, 25/07): entregador não-admin só vê aviso quando o saldo NÃO
  cobre a rota** — sem número no dia a dia, nunca conversão em R$ (coerente com
  a LEI DO VENDEDOR). Admin/USERMASTER vê custo e saldo sempre.
- **Aceite:** preview == débito real efetivado no Iniciar (teste integração);
  replanejo pós-correção não altera claims já DEBITED.

### S7 — Saúde da base no PC (véspera) — **INCLUÍDO na primeira leva (decisão do dono, 25/07)**
- O APK é o ÚLTIMO filtro; o lugar certo de arrumar endereço é a véspera, no PC.
- Painel web: `248 clientes · 154 sem pino confiável · 12 sem telefone`, com o
  mesmo semáforo do S3 e o aviso honesto: "N destes se resolvem sozinhos na
  primeira entrega" (o `realimentarCoordenadaPorta` já grava a porta real).
- **Métrica anti-enfeite:** % de paradas verdes por empresa, semana a semana.
  Se não sobe, o gate está educando ninguém — muda ou morre.

## Riscos e invariantes

- **Cobrança é o risco nº 1**: qualquer caminho novo que encoste em
  `prepareRoute` reabre o fantasma "debitou 2x". Invariantes com teste: conferir
  não debita; corrigir pino não debita; replanejar com os mesmos deliveryIds não
  cria claim novo.
- Rate-limit do proxy (30/min/empresa): planejar consome 1 chamada de `table`;
  revalidações pontuais usam cache 10 min. ≤50 paradas cabe folgado no teto de
  80 pontos.
- `route-builder` (S0) é web: rodar `check-pele` e não inventar cor fora de token.
- APK: WebView release não aceita inspeção — instalar e ABRIR no moto g15 antes
  de qualquer publish que toque o APK (lição de 22/07).
- Publish com worktree ativo trava — usar `npm run new` se for o caso.

## Ordem de execução e dependências

```
S0 (independente, pode ir já)
S1 → S2 → S3 → S4 → S5 → S6   (cadeia principal)
S7 (paralelo a S4–S6: web, reusa o validador do S3)
```

S1+S2 são pequenas e entregam valor sozinhas (verdade do motor + perna a perna).
S7 só depende do S3 (mesmo validador/semáforo) — pode rodar em paralelo com um
worker próprio enquanto S4–S6 avançam no APK.

## Decisões (dono, 25/07 — FECHADAS)

1. **Dureza do vermelho: NUNCA bloqueia.** Rota sempre pode sair; cada vermelha
   exige 1 toque consciente e vai pro fim, sem ETA, marcada. Os 824 sem pino do
   backfill não impedem ninguém de trabalhar.
2. **Créditos pro entregador não-admin: só quando falta saldo.** Admin vê tudo
   ("debita 4 · saldo 37"); entregador puro só vê aviso se o saldo não cobrir.
3. **Escopo da primeira leva: S0–S7 completo** (S7 incluído desde já).
