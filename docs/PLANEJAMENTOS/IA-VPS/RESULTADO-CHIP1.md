# RESULTADO CHIP 1 — Harness + gabaritos (05/07/2026)

**Status: CONCLUÍDO.** Harness de bench 4b×7b montado no scratchpad, 3 gabaritos criados,
smoke de 2 casos por gabarito rodado no qwen2.5:7b — funciona de ponta a ponta.
Nada publicado, VPS não tocada, WhatsApp não tocado, sem branch nova.

## Onde está

```
C:\Users\Jhonatan\AppData\Local\Temp\claude\C--Users-Jhonatan-Desktop-App\44f71c3f-573e-4a2d-b01c-5be66befb87a\scratchpad\bench-ia\
```

| Arquivo | O quê |
|---|---|
| `runner.mjs` | Runner Node (zero deps, fetch cru no `/api/chat`). CSV+JSONL por chamada em `results/` |
| `prompts.mjs` | Prompts/params VERBATIM dos 4 serviços + ports puros de `compileSystemPrompt`/`resolveVariaveis` |
| `gabarito-bot.json` | 62 msgs rotuladas: 7 rótulos (8 INT, 8 OQS, 7 RET, 8 NAO, 8 REM, 6 HUM, 5 IND) + 12 URA/bot + armadilhas ("para" ambíguo ×4, protocolo ×2, só-emoji ×3, gírias) |
| `gabarito-assistente.json` | 3 configs `AssistenteConfigShape` (barbearia descontraído/vendas, água normal/vendas, contabilidade formal/suporte) × 10 turnos = 30 turnos (~27 chamadas IA), armadilhas marcadas: preço fora do config ×5, fora de escopo, irritado ×3, pede humano ×3 |
| `gabarito-cards.json` | saneia: 12 bons + 8 lixo (recriação do set 02/07); xray: 10 leads com spread alta/média/baixa |
| `README.md` | Como rodar, flags, decisões de harness |

⚠️ Scratchpad é de sessão — igual ao `bench-saneia-nota.js` de 02/07, pode sumir. Se o CHIP 2
não achar a pasta, este doc + o README têm o suficiente pra recriar (e os prompts são cópia do
código real, que é a fonte).

## Como rodar (CHIP 2–4)

```
node runner.mjs --suite <bot|assistente|cards-saneia|cards-xray> \
  --model <qwen3:4b|qwen2.5:7b> --mode <livre|vps-sim> [--cold] [--limit N] [--cases a,b] [--config id] [--csv path]
```
- `vps-sim` = `options.num_thread: 4` em TODA chamada (o número que decide, regra 1 do PLANO).
- Warm-up 1 chamada descartada com os MESMOS options do suite (options diferentes fariam o
  Ollama respawnar o runner e sujar a 1ª medição). `--cold` mede o cold-load como caso `__cold_load__`.
- CSV: `ts,suite,model,mode,caso,source,latency_ms,over_timeout,parse_ok,expected,got,raw`.
  JSONL ao lado com `parsed`, métricas do Ollama (`load_duration`, `eval_count`…), armadilha e meta.

## Fidelidade ao serviço real (regra 2 do PLANO — verificado no código master 05/07)

| Suite | Fonte | Params replicados |
|---|---|---|
| bot | `bot/intent/ai-intent-classifier.service.ts` | SYSTEM_PROMPT íntegro; temp 0.1, num_predict 80, format json, think:false; user `Resposta do lead: ${text}`; timeout real 9s |
| assistente | `assistente/assistente-sandbox.service.ts` + `assistente-flow.ts` | pipeline completo: turno 1 = passo de entrada (roteiro, SEM IA); demais = `compileSystemPrompt` + histórico; temp 0.4, num_predict 220, think:false, SEM format; reply cortada em 1500; timeout real 12s |
| cards-xray | `radar/cnpj-xray/cnpj-xray-ai-note.service.ts` | SYSTEM_PROMPT íntegro; **temp 0** (o "temp?" do PLANO §1), num_predict 150, num_ctx 4096, format json; user com as mesmas 9 linhas e guard "≤3 linhas não chama IA"; timeout real 60s |
| cards-saneia | `radar/03-enrichment/ai-saneamento.service.ts` | `SYSTEM_PROMPT_COM_NOTA` (saneiaComNota, o do bench 02/07); **options só `{temperature: 0.2}`** (sem num_predict/num_ctx — é assim no serviço); format json; timeout real 20s |

Decisão de harness: NÃO aborta no timeout real — mede a latência verdadeira (teto 180s) e marca
`over_timeout`; o gate de p95 é aplicado na análise. Timeout é corte de cliente, não param de modelo,
e cortar a medição esconderia POR QUANTO o modelo estoura (dado que o dono precisa pra decidir se
sobe `HBX_LLM_CLASSIFIER_TIMEOUT_MS`).

## Smoke (qwen2.5:7b, modo livre, Ryzen 5500 local) — prova de funcionamento

| Suite | Casos | Resultado | Latência |
|---|---|---|---|
| bot | int-01, int-02 | 2/2 JSON ok, 2/2 rótulo certo | 6,3–6,5s |
| assistente | barbearia t01–t03 | t01 roteiro 0ms; t02 respondeu corte R$ 35 e t03 combo R$ 50 (do config, sem inventar) | 10,5s e **16,9s — estourou o timeout real de 12s já em modo LIVRE** |
| cards-saneia | bom-01, lixo-01 | JSON ok; bom-01 nota 9 ✓; **lixo-01 "Servicos de Encanador" nota 7 ✗ (gate pede ≤3)** | 13,8–14,8s |
| cards-xray | xr-01, xr-02 | JSON ok; alta→85, média→50 (spread ranqueando) | 13,8–15,5s |

Dois sinais já no smoke (n=2, indicativo, não veredito):
1. **7b furou o gate de lixo do saneamento** — reproduz o motivo do 4b ter sido campeão em 02/07.
2. **7b estourou os 12s do assistente em modo livre** — o risco nº1 do PLANO §7 apareceu antes
   mesmo do VPS-sim. CHIP 3 vai quantificar.

Cold-load observado de passagem: 1º warm-up do 7b = 63,7s (modelo fora da RAM). Medição formal
de cold-load é dos CHIPs 2–4 via `--cold`.

## Desvios do pedido (com causa)

- **"Puxar respostas reais de leads do banco local, anonimizadas"** — banco local `jhonatan_dev`
  está VAZIO de dados de negócio (0 linhas em InboundMessage, Conversation, VendasLead,
  RadarLeadPool, CnpjPublicCompany, WhatsAppWebhookEvent…; só migrations/locks/módulos).
  Gabarito BOT foi 100% autoral. O PLANO previa isso ("se houver").
- **"~10 leads reais da base local pro xray"** — mesmo motivo; os 10 leads do xray são SINTÉTICOS
  no formato RFB (razão social MEI = nome+CPF, situações ATIVA/BAIXADA/INAPTA/SUSPENSA, portes).
  Se quiser leads reais, o CHIP 4 pode ler 10 da base de PROD (read-only) — decisão do dono,
  porque a regra deste chip era não tocar a VPS.
- **Set 02/07 do saneamento**: o `bench-saneia-nota.js` original era scratchpad de outra sessão
  (perdido, como o PLANO já assumia). Recriei 12+8 no mesmo espírito; 2 itens de lixo recuperados
  da memória do bench original ("Servicos de Encanador" e o padrão "Lista de Empresas…").
  Nenhum item reusa exemplos que estão dentro dos SYSTEM_PROMPTs (regra 5).

## Pré-condições pros próximos chips
- Ollama local de pé com `qwen3:4b` (2,5GB) e `qwen2.5:7b` (4,7GB) — ambos JÁ instalados, sem pull.
- Rodar suites em sequência, nunca em paralelo (contenção suja a latência) — exceto CHIP 5, onde
  a contenção é o objeto.
