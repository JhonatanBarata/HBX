# RESULTADO CHIP T1 — Bench 30B nas 3 tarefas batch (05/07/2026)

**Status: CONCLUÍDO. Veredito: o 30B RANQUEIA o xray — a nota migra pra ele.** Nenhum ajuste de
prompt foi necessário (a 1 tentativa reservada no PLANO não precisou ser usada). Saneamento e
extração passam todos os gates com folga. Rig exclusivo confirmado (`server.log` do Ollama sem
tráfego alheio desde 19:45, todas as chamadas deste chip são as únicas depois disso). Nada
publicado, VPS não tocada, WhatsApp não tocado, sem branch nova.

Modelo: `qwen3:30b-a3b-instruct-2507-q4_K_M` — **já estava puxado** (não precisou `ollama pull`).
`num_ctx` capado em 8192 em TODA chamada (blindagem no harness: força 8192 quando o suite não
especifica — o saneamento real não manda `num_ctx` nas envs porque nunca rodou o 30B antes; sem
essa blindagem o default do modelo, 262144, teria alocado ~45,7GB de KV-cache e testado o
GOTCHA MORTAL do PLANO §3.1 na prática). Warm-up de 1 chamada descartada antes de cada suite;
cold-load medido à parte, sem warm-up.

## TL;DR (a decisão que o T1 existe pra tomar)

**Xray-nota RANQUEIA com o 30B** (alta 75–85, média 40–75, baixa 30–55 — ordenado, sem saturar
9-10 nem polarizar 0×85 como o 4b/7b menores) → **o xray sai do CHIP 6 (interino 4b/7b na VPS)
e vira missão do 30B local, via a ponte do CHIP E1**. Saneamento e extração confirmam os
resultados já conhecidos (saneamento zero regressão, extração é a vitória original do 30B desde
o sprint 5) — o T1 não muda nada ali, só confirma que os 3 cabem na mesma janela de rig com
`num_ctx=8192`.

## 1. XRAY-NOTA — a pergunta única que decide

Prompt real `cnpj-xray-ai-note.service.ts` (temp 0, num_predict 150, num_ctx 4096 — do próprio
serviço), 10 leads gabaritados dos CHIPs 4/EXTRA, modo VPS-sim (`num_thread: 4`).

| Banda esperada | 30B (este chip) | 4b-instruct (EXTRA) | 4b-thinking (CHIP4) | qwen2.5:7b (CHIP4) |
|---|---|---|---|---|
| **alta** (xr-01/05/08) | **85, 75, 85** | 95, 70, 90 | 95, 70, 95 | 85, 65, 85 |
| **média** (xr-02/04/09/10) | **65, 75, 65, 40** | 80, 70, 85, 10 | 85, 70, 85, 0 | 50, 70, 65, 35 |
| **baixa** (xr-03/06/07) | **30, 55, 40** | 20, 30, 30 | 0, 0, 20 | 20, 25, 20 |
| notas distintas | **8/10** | 8/10 | 5/10 | 7/10 |
| resumo >140 chars | **0/10** (max 131) | 0/10 | 7-8/10 ❌ | 0/10 |
| JSON válido | **10/10** | 10/10 | 10/10 | 10/10 |
| p50 / p95 (VPS-sim) | **7.285ms / 8.800ms** | ~10.600ms (rig limpo) | 34.800ms* | 19.500ms* |

\* 4b-thinking/7b medidos sob contenção externa (CHIP4); comparação de latência é indicativa,
o relativo de ranking é o que importa aqui.

**Por que RANQUEIA (o gate que reprovava os outros dois):**
- Alta fica sempre no topo (75–85), baixa sempre no fundo (30–55), média no meio (40–75) —
  **nenhuma inversão**: nenhum MEI-com-zap ultrapassa a alta, nenhuma SUSPENSA/BAIXADA cai
  abaixo da baixa "pura". Compare com o 4b-instruct: MEI xr-02 (média) = 80, ACIMA da alta
  xr-05 = 70 (inversão real); e o thinking do CHIP4 polarizava 85-ou-0.
- xr-10 (SUSPENSA com site+e-mail, o caso desenhado pra testar se o modelo pesa a situação
  cadastral) recebeu **40** — bem abaixo da alta e dentro da banda média, mostrando que a
  situação cadastral ruim SEGUROU a nota mesmo com canais bons. O 4b-instruct dava **10** aqui
  (pior que a BAIXADA sem nada) — o erro mais grave do menor.
- Sobreposição só nas bordas e DEFENSÁVEL: xr-04 (ME ativa, site+email, sem zap) e xr-05
  (DEMAIS ativa, site+email, sem zap) empatam em 75 — porte maior x completude de canal é
  argumentável; xr-06 (INAPTA com zap validado) em 55 fica no topo da banda baixa mas não
  invade a média de verdade (empata só na borda). Mesmo padrão "sobreposição leve e honesta"
  que aprovou o 7b no CHIP4 — só que mais rápido (p95 8,8s vs 19,5s do 7b).
- Resumo sempre dentro do limite de 140 (max 131), fiel ao input, em português.

**Nenhum ajuste de prompt foi necessário** — a suspeita do bench 01/07 ("30B satura 9-10") NÃO
se confirmou com o prompt REAL do serviço (o bench de 01/07 não usava este prompt/params
verbatim). Não há necessidade de rodar a 2ª tentativa reservada pelo PLANO.

## 2. SANEAMENTO — prompt real `saneiaComNota()`, temp 0.2

12 bons + 8 lixo, modo VPS-sim.

| Métrica (gate) | 30B (este chip) | 4b-instruct | qwen2.5:7b |
|---|---|---|---|
| Bons ≥7 (12/12) | **12/12 ✓** (10×9, 2×8) | 12/12 ✓ | 12/12 ✓ |
| Lixo ≤3 (8/8) | **8/8 ✓** (7×1, 1×3 — "Servicos de Encanador"=3) | 8/8 ✓ (lixo-01=3) | **7/8 ✗** (lixo-01=7) |
| JSON válido (100%) | **20/20 ✓** | 20/20 ✓ | 20/20 ✓ |
| Token inventado/distorção | **1**: "Marmoaria" (esperado "Marmoraria" — perdeu 1 letra "r", mesma categoria distorção-não-invenção do "Marmoria" do thinking/CHIP4) | 2 typos ("Electricas", "Drogeria") | 2 distorções + vazamento "Local:" |
| p50 / p95 (VPS-sim) | **8.037ms / 9.270ms** | 9.800ms / 13.800ms | 15.800ms / — |

**Regressão confirmada, zero surpresa:** o 30B passa os 2 gates do saneamento igual ao
4b-instruct (que já era campeão), com latência equivalente e o mesmo tipo de furo cosmético
(1 letra perdida num nome, não dado inventado). Não muda a decisão do CHIP 6 pra VPS — o 30B
NÃO precisa assumir o saneamento (ele já é bem servido pelo 4b-instruct residente 24/7 na VPS);
o dado aqui só prova que o 30B **também** teria folga se algum dia precisasse.

## 3. EXTRAÇÃO — regressão curta, prompt real `ai-contact-extraction.service.ts` + gate real

12 fontes boas (telefone/e-mail/dono real e literal no texto) + 20 fontes ruins/armadilha (texto
sintético com CNPJ, CEP, protocolo, nota fiscal, coordenadas, km, preço, número de pedido, OAB,
CRM, 0800/emergência — nenhum é telefone), gabarito NOVO deste chip (não existia no bench-ia
ainda; sprint 5 mencionava 50 casos mas o harness de bench não os herdou). Gate aplicado
pós-parse é o `lead-contact-gate.ts` REAL, portado 1:1 pro harness (`lead-contact-gate.mjs`).

| Métrica (gate) | Resultado |
|---|---|
| Fontes boas: ≥1 contato aprovado | **12/12 ✓** |
| Fontes ruins: 0 aprovado pós-gate | **19/20** — ver nota abaixo |
| JSON válido | **32/32 ✓** |
| Contato inventado pós-gate | **0** |
| p50 / p95 (VPS-sim) | **4.959ms / 9.764ms** (gate ≤8s/lead: 32/32 dentro; só 3 boas passam de 8s, nenhuma passa de 10s) |

**A "exceção" em 19/20 não é falha — é acerto:** `lixo-19` foi corretamente ZERADO no aprovado
(o modelo tentou extrair um 0800 genérico, o gate reprovou por `ddd_invalido` — a rede de
segurança funcionando). O único caso com 1 aprovado dentre os "ruins" é `lixo-18`, desenhado de
propósito com um telefone REAL embutido numa armadilha de "dono não citado" — o modelo extraiu
certo o único telefone válido da fonte E devolveu `nome_dono:null` (o texto dizia "fundada por
profissionais do setor", não um nome de dono), que é o comportamento CORRETO esperado, não uma
alucinação. **Zero contato fabricado passou do gate em qualquer um dos 32 casos.**

Um caso de nota (`bom-01`): o modelo tentou extrair também o WhatsApp sintético do gabarito
("(11) 98765-4321") e o PRÓPRIO gate reprovou por `blocklist_sequencia` (dígito repetido de
propósito didático no gabarito) — o fixo "(11) 3222-4455" da mesma fonte passou normalmente.
Não é bug do modelo nem do gate; é o gabarito tendo usado um número didático demais.

Resultado confirma o roteamento fixo desde o sprint 5 (30B para extração, já era `default` do
serviço) — este chip só regressa com o prompt/gate exatos e num_ctx capado, sem surpresa.

## 4. RAM e cold-load

| Métrica | Valor |
|---|---|
| Cold-load real (num_ctx 8192, sem warm-up) | **114,3s** (~1min54s) — load_duration 111,7s |
| RAM residente pico (`GET /api/ps`, campo `size`) | **19,56GB** (ctx 8192) / 19,05GB (ctx 4096, saneamento) |
| `size_vram` | 0 (100% CPU/RAM — GTX 550 Ti confirmada morta pra IA, como já registrado na memória) |
| RAM livre do sistema durante os runs | oscilou entre **~1GB e ~4,3GB** de 33,4GB totais — apertado, SEM sinal de swap/trava em nenhum dos 3 runs |
| Cold-load vs plano (§3.2, "~3min") | medido real **~1min54s**, mais rápido que a estimativa do PLANO — ainda assim ≫ qualquer timeout de serviço (9–90s), então `keep-alive` alto/warm-up continua obrigatório |

RAM é o ponto de atenção real do CHIP T2 (madrugada simulada): com Chrome/Docker abertos junto
(não estavam nesta bateria), a folga de ~1–4GB pode não sobrar — T2 deve medir isso explicitamente
com as duas condições (Chrome/Docker abertos × fechados), como o próprio PLANO já previa.

## 5. Onde está o dado bruto

```
scratchpad/bench-ia/
├── prompts.mjs                  (prompts/params VERBATIM + prompts de extração ADICIONADOS neste chip)
├── runner.mjs                   (+ suite cards-extraction + blindagem num_ctx=8192 pro 30B)
├── lead-contact-gate.mjs        (port fiel do gate real, NOVO neste chip)
├── gabarito-extraction.json     (12 boas + 20 ruins/armadilha, NOVO neste chip)
├── gabarito-cards.json          (saneia+xray, herdado do CHIP 1/4/EXTRA sem alteração)
└── results/
    ├── t1-xray.csv|.jsonl|.log
    ├── t1-saneia.csv|.jsonl|.log
    └── t1-extraction.csv|.jsonl|.log
```
em `C:\Users\Jhonatan\AppData\Local\Temp\claude\C--Users-Jhonatan-Desktop-App\3b59c3d8-a6f3-488d-8a64-39ca88627ffc\scratchpad\`
(sessão deste chip; harness copiado da sessão do CHIP4/EXTRA, que segue existindo lá).
⚠️ Scratchpad é de sessão — este doc carrega tudo que a decisão do dono precisa.

## 6. Decisões tomadas sozinho (declaradas, não escondidas)

1. **`num_ctx` forçado a 8192 no harness quando o suite não especifica** (caso do saneamento,
   que no serviço real nunca capa porque nunca rodou o 30B) — decisão de SEGURANÇA de rig
   (o PLANO ordena "NENHUMA chamada sem num_ctx"), não alteração de prompt/params do serviço.
   Documentado no código (`runner.mjs`, comentário na função `buildBody`).
2. **Gabarito de extração criado do zero** (12 boas + 20 ruins) — o sprint 5 mencionava "50
   ruins → 0 gravado" mas esse set não estava no `bench-ia` herdado; montei um novo seguindo o
   pedido do CHIP T1 (~12 boas + ~20 ruins/armadilha com CNPJ/CEP/preço/protocolo etc.),
   reaproveitando os NOMES de empresa já usados no `gabarito-cards.json` (mesmo espírito,
   textos de fonte novos e sintéticos — nenhum reusa o texto dos SYSTEM_PROMPTs).
3. **Não precisei da "1 tentativa de ajuste de prompt"** reservada pelo PLANO — o xray ranqueou
   de primeira com o prompt verbatim. Não inventei ajuste nenhum.
4. Xray não foi testado em modo "livre" (só VPS-sim) — o PLANO pede prompt/params VERBATIM e
   VPS-sim é o que decide (regra 1 dos chips anteriores, herdada); como o resultado já ranqueia
   de forma clara e reproduzível (temp 0 = determinístico), rodar em modo livre também seria
   redundante e gastaria mais RAM/tempo no mesmo rig apertado — decisão de escopo, não de dado.

## 7. Consequência prática (pro CHIP 6 / E1, não decidido aqui)

- **Xray sai do "degradado interino 4b/7b na VPS"** (que o CHIP 6 ia decidir) — a nota ICP
  honesta agora TEM dono: o 30B local, via missão da ponte (CHIP E1). O CHIP 6 pode registrar
  "xray = OFF na VPS ou 4b só como fallback de PC-desligado" em vez de escolher 4b/7b como
  titular — decisão final ainda é do dono (item §7.1 do PLANO), mas o dado que faltava chegou.
- Saneamento e extração não mudam de dono: saneamento continua no 4b-instruct da VPS (tempo
  real), extração continua no 30B local (já era o roteamento fixo desde o sprint 5).
