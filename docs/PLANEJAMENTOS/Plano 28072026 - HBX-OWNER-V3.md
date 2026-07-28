# HBX OWNER V3 — 3 interruptores, zero mistério (28/07/2026)

Mock aprovável em `docs/mockups/hbx-owner-v3.html`. Rotas NOVAS (`/owner/v3/*`), front NOVO
(`web/v3/`) — nada remendado em cima do velho; demolição só na última etapa.

## 1. Diagnóstico — por que o painel de hoje custa dinheiro

**Números de hoje:** 6.268 linhas (server 3.783 + app.js 2.184 + index 301) para **3 decisões
reais**; 18 botões; **10 setInterval** competindo; 2 colunas espelhadas VPS×Local; ~9 cards.

**3 incidentes recentes, todos filhos da mesma causa (complexidade + silêncio):**
| Incidente | Custo | Causa-raiz |
|---|---|---|
| Card morto devolvendo 409 (Enriquecedor) | 12 dias de botão-mentira | migração matou o motor e esqueceu o card |
| Disjuntor `RadarFactoryCursor.enabled=false` | **26 dias de fábrica morta** | F0 apagou o interruptor no mesmo dia em que desligou a chave; `finishRun` não grava motivo → tela muda |
| Painel não abre no boot | dono acha que "não liga" | `install-startup.ps1:26` passa `-NoBrowser` FIXO |

**Bug do desligamento do 30B (confirmado no código):** `unloadModel` ([ponte-worker.js:219](../../hbx-owner/local-agent/lib/ponte-worker.js))
manda `keep_alive:0`, marca `state.warm=false` **sem conferir** `/api/ps`, e o retorno
`Boolean(r.ok || r.statusCode)` trata **qualquer status HTTP (até 500) como sucesso**. Modelo de
~19GB fica residente com o painel dizendo "desligado" → máquina de 32GB entra em swap.

## 2. As 5 leis do V3 (o que impede a volta da bagunça)

1. **UMA página, TRÊS interruptores.** Scraping · IA 30B · Enriquecimento local. Todo o resto é gaveta.
2. **Nada para calado.** Todo estado "parado" exibe o PORQUÊ na mesma linha (lição dos 26 dias).
   No backend: `finishRun(reason)` passa a gravar o motivo em `lastError`.
3. **Verdade verificada.** Interruptor só muda de cor depois de RELER o estado real (padrão
   toggleIntent, promovido a lei). Desligar 30B = conferir `/api/ps` até a RAM liberar.
4. **UM endpoint de verdade.** `GET /owner/v3/overview` agrega tudo; 1 poll de 5s + SSE. Mata os 10 timers.
5. **VPS×Local é etiqueta, não layout.** Cada card diz onde roda ("no VPS" / "neste PC"). Fim das 2 colunas.

## 3. Os 3 interruptores — semântica exata

### ⚡ SCRAPING (etiqueta: roda no VPS *e* neste PC)
- **Energia geral por ambiente** — o interruptor que o F0 demoliu volta como rota nova:
  `POST /modules/owner/fabrica/energia {on}` no NestJS (arma/desarma `RadarFactoryCursor.enabled`,
  key `main`). O card mostra **2 linhas: VPS e Localhost**, cada uma com seu disjuntor —
  pedido explícito do dono (28/07). Proxy no agent decide o alvo: VPS = backend de produção;
  Localhost = backend :3000 local.
- **Corrida**: input budget + "Rodar N leads" (contrato atual `fabrica/start`, mantido).
- Linha de motores: "20/20 ligados" (leitura, sem botão — governor cuida).
- Referência de sanidade: corrida 28/07 = 1.000 leads/72s, 1.364 contatos, R$0.

### 🧠 IA 30B (etiqueta: roda neste PC)
- Liga: `30b/power on` atual (local-deep + ponte + warm sob demanda).
- **Desliga com prova (novo contrato)**: `keep_alive:0` → poll `/api/ps` até 60s → ainda residente?
  mata o processo runner do Ollama → re-poll → só então `warm=false`. Falhou? Vira item na Faixa de
  Problemas ("30B ainda na RAM — 19GB presos") com botão "Forçar". NUNCA mais "desligado" de fé.
- Mostra RAM do modelo ao vivo (via `/api/ps` size).

### 🔄 ENRIQUECIMENTO LOCAL (etiqueta: este PC → VPS)
- O `local_deep_enrich_v1` (fila S4 + Lab + escrita no VPS).
- **Cascata inteligente**: ligar isto liga a IA 30B junto (dependência real); desligar a IA derruba
  isto. O card mostra a dependência escrito, não deixa estado impossível.
- Métricas que importam: fila (queuedDue), idade do mais antigo, ritmo/h. Fila parada > 6h = problema na faixa.

**LIGAR TUDO / DESLIGAR TUDO** no topo: liga/desliga os 3 na ordem certa (energia → IA → enriquecimento).

## 4. Faixa de Problemas (o anti-26-dias)

Strip fixa no topo. Só aparece quando existe problema; cada item = frase humana + **botão de 1 clique**:
- disjuntor desligado (VPS ou local) → "Religar"
- fila parada > 6h → "Destravar" (desentupidor atual)
- 30B residente após desligar → "Forçar descarga"
- Ollama off / túnel caído / backend sem resposta → ação ou instrução curta
Fonte: campo `problems[]` do `/owner/v3/overview` (agent calcula, front só pinta).

## 5. Boot com Windows (start junto com o 30B)

Hoje: tarefa agendada sobe o agent oculto ✅, Ollama sobe se estiver off ✅, ponte nasce armada ✅ —
**mas o painel nunca abre** (`-NoBrowser` fixo no instalador).

V3:
1. `install-startup.ps1` ganha `-AbrirPainel` (default **ON**): supervisor espera o
   health-check `/health` passar → `Start-Process http://127.0.0.1:3107` (nunca abre aba pra
   servidor morto).
2. Atalho `HBX Owner.url` criado na Área de Trabalho na instalação (acesso manual óbvio).
3. Sequência de boot vira estado visível no painel: "boot: Windows ✓ · agent ✓ · Ollama ✓ · painel ✓".

## 6. Rotas novas (nada reaproveitado)

| Rota | Faz |
|---|---|
| `GET /owner/v3/overview` | agregado único: jobs, ambientes, problems[], feed |
| `POST /owner/v3/switch/scraping` `{env:'vps'\|'local', on}` | disjuntor por ambiente |
| `POST /owner/v3/switch/ia` `{on}` | 30B com desligamento verificado |
| `POST /owner/v3/switch/enriquecimento` `{on}` | worker local-deep com cascata |
| `POST /owner/v3/fabrica/run` `{env, budget}` | corrida com budget |
| `GET /owner/v3/events` | SSE do overview |
| NestJS: `POST /modules/owner/fabrica/energia` `{on}` + `GET .../energia` | o interruptor demolido, de volta |

## 7. Etapas e aceite

| # | Entrega | Prova de aceite |
|---|---|---|
| E1 | NestJS: rota energia + `finishRun` grava motivo + teste | corrida travada mostra `parar_tudo_global` no status; toggle energia funciona nos 2 ambientes |
| E2 | Agent: overview + 3 switches + unload verificado | desligar 30B com modelo quente → `/api/ps` vazio em ≤60s ou problema na faixa; RAM confere no Gerenciador |
| E3 | Front novo `web/v3/` (3 cards + faixa + gaveta + feed) | página única, 1 poll, funciona com SSE morto (fallback) |
| E4 | Boot: `-AbrirPainel` + atalho + espera health | reiniciar Windows → painel aberto sozinho na tela |
| E5 | Demolição: index/app velhos, 10 timers, rotas órfãs | `git rm` dos velhos; smoke completo no novo; **cutover direto** (git é o rollback) |

**Meta de tamanho:** front novo ≤ 600 linhas (vs 2.485) · 1 timer (vs 10) · 3 interruptores (vs 18 botões).

**Gaveta "Ferramentas" (recolhida, nada morre de função):** Cockpit de leads (filtros/CSV/transfer),
Integrações (chaves), Limpeza de lixo, Exportar tudo, tabela drill-down dos motores.

**Fora de escopo (não encosta):** chips/WhatsApp (nem passam por aqui), governor/elástica do VPS,
regras de cobrança. Fábrica continua R$0 por trava de código (Lei nº1) — nenhuma fonte paga no caminho.
