# ÁRVORE × PLANOS — camada comercial da Árvore Mestra (List / Lead / Pro)

> Injetado 02/07/2026. Complementa [ARVORE-MESTRA.md](./ARVORE-MESTRA.md) — a árvore é a
> engenharia; ESTE doc é onde o plano encosta nela. Enterprise/Implantação fica FORA por ordem
> do dono. **Só planejamento — nenhuma linha de código/catálogo alterada (gate PAGAMENTOS).**

## Veredito sobre a Árvore Mestra
A engenharia está certa — as 3 Leis (ordem fixa, pesquisa grátis, sem legado) são exatamente o
padrão dos players de lead-gen (Apollo, Lusha, Speedio, Econodata: busca na base é grátis/
ilimitada, o que cobra é o CONTATO ENTREGUE). **Mas não está perfeita: falta a camada comercial
inteira e há 2 contradições código×árvore.**

### Falhas encontradas (ordem de gravidade)
1. **A árvore não tem porta de plano.** Nenhuma caixa diz onde a quota é checada nem onde o
   crédito é debitado. Foi assim que nasceu a zona atual: 7 dimensões de quota no catálogo
   (`cards/mês`, `trava/dia`, `enriquecimento/dia`, `google/dia`, `cards/busca`, `buscas/ciclo`,
   `totalCards`), metade só existe pro List, unidades misturadas. Sem porta desenhada, a próxima
   feature bolta mais uma dimensão.
2. **`googleSearchesPerDay` viola a Lei 2 da própria árvore.** Pesquisa do cliente é 100% grátis
   — não existe "buscas Google pagas por dia por plano". A mensagem
   `GOOGLE_DAILY_LIMIT_REACHED_MESSAGE` ainda PROMETE "mais Google/dia no Pro" — promessa que a
   árvore proíbe. Morre no cutover P1.
3. **Zap-gate obrigatório (P2) sem válvula mata volume.** Nicho formal/industrial vive de fixo
   e e-mail; se a porta 8 exige zap validado pra TODO card, o List (que é lista) vira inviável e
   a RFB formal perde valor. Econodata/Speedio entregam fixo e e-mail numa boa. Correção
   proposta: porta 8 = **contato validado** (zap OU fixo confirmado OU e-mail verificado), zap
   preferencial e badge "WhatsApp verificado" — e medir pass-rate ANTES de endurecer.
4. **M4 pago sem dono.** Governor decide SE pode gastar, não POR QUEM. Sem prioridade por plano,
   lead de List queima saldo Brave (900/mês — julho já estourado) que devia servir Pro.
5. **Trial do Lead Plus (14d) com quota cheia = farm.** Mercado inteiro capa trial por créditos
   (Apollo free = ~poucas dezenas de créditos). Hoje o trial entrega ~1.000+ cards grátis e o
   cara some. Capar: **200 cards no trial, fábrica OFF**.
6. **Features do catálogo hardcodam números** ("880 cards", "3 pesquisas comerciais") — no dia
   que a quota mudar, a vitrine mente. Texto tem que nascer de `quotas`, nunca de string solta.
7. Menores: "Night Factory" e "fábrica de enriquecimento" são o MESMO conceito com 2 nomes no
   entitlement (unificar no cutover); falta pass-rate das portas no gauge :3107 (sem isso o A/B
   do P4 é chute).

## A regra de ouro (mata a zona)
**Moeda única: CARD ENTREGUE.** Débito acontece UMA vez, no fim da lane (após porta 8).
Rejeitado em porta não debita. Busca, filtro e SELECT na RFB nunca debitam — é o gancho
comercial (nossa base local de 28M torna o browse custo ~zero; é a vantagem que Speedio cobra
caro pra ter).

Cada plano tem **exatamente 3 números**. Todo o resto é fórmula global ou boolean de
capacidade. Proibido criar 4ª dimensão numérica por plano.

## Limites (criados do zero — âncora: R$/card abaixo do avulso de mercado, degrau que sempre melhora no upgrade)

| | **List R$ 49** | **Lead Plus R$ 99** | **Pro R$ 249** |
|---|---|---|---|
| ① Cards entregues/mês | **500** | **2.000** | **6.000** |
| ② Enriquecimentos fábrica/mês | **0** | **300** | **1.500** |
| ③ Assentos inclusos | 1 | 2 | 3 |
| R$/card (referência) | 0,098 | 0,050 | 0,042 |
| Trava diária (fórmula, não número) | 40 | 160 | 480 |
| Trial | — | 14d **capado em 200 cards, fábrica OFF** | — |

- **Degrau**: List→Lead = 4× cards por 2× preço; Lead→Pro = 3× cards por 2,5× preço. Upgrade
  SEMPRE barateia o card — nunca há incentivo de downgrade.
- **Trava diária = fórmula única global**: `ceil(8% × quota mensal)`. Anti-abuso + espalha
  throughput; some do catálogo como número por plano.
- **Créditos expiram no mês, sem rollover** (padrão Apollo/Lusha — simples de explicar e de
  auditar).
- Recarga avulsa (pacote extra de cards) fica como opção comercial futura — não entra agora.

## Capacidades por plano (booleans — pipeline é IGUAL pra todos, plano gateia exibição e fábrica)

| Capacidade | List | Lead | Pro |
|---|---|---|---|
| Lane pesquisa 1→8 completa | ✅ | ✅ | ✅ |
| IA 7b roda (nome-limpo = higiene da base comum) | ✅ roda | ✅ | ✅ |
| Score/motivo/template VISÍVEL | ❌ | ✅ | ✅ |
| Porta 8 | contato validado (zap OU fixo/e-mail) | zap preferencial | zap preferencial |
| Fábrica M1–M3 (grátis) | ❌ | ✅ | ✅ |
| Fábrica M5 (30b) + M6 | ❌ | ✅ | ✅ |
| **M4 pagos (governor)** | **nunca** | **nunca** | **✅ único que gasta** |
| Prioridade do alimentador da fábrica | não entra | 2ª | 1ª |

Por que o pipe roda igual pra todos: qualidade não é gateada (manter 3 pipelines = 3 zonas), e
o nome-limpo do 7b melhora a base `LeadContact` COMPARTILHADA — todo card processado enriquece o
estoque de todos. O que o plano compra é volume + inteligência exibida + fábrica. É como o
mercado inteiro faz: o Apollo Basic não tem dado pior, tem menos crédito.

## A árvore com as portas de plano

```
LANE PESQUISA (síncrona, R$0 — igual p/ todos os planos)
│
├─ 🚪 PORTA 0 — QUOTA (NOVA, única checagem de plano na entrada)
│    saldo mensal > 0 E trava diária ok · senão: upsell honesto
│
├─ 1 Semente → 2 RFB SELECT → 3 Web grátis → 4 Portas → 5 Fusão → 6 Crawl
│
├─ 7 IA 7b  ── roda p/ TODOS · score/motivo só APARECE p/ Lead+  🚪(display gate)
│
├─ 8 Porta contato  🚪
│    List: validado (zap OU fixo OU e-mail) · Lead/Pro: zap preferencial + badge
│
└─ 💳 CARD ENTREGUE = debita 1 crédito (ÚNICO ponto de débito do sistema)
     grava sourceChain + planTier no card

LANE FÁBRICA (assíncrona, fila S4)
│
├─ Alimentador: prioridade Pro → Lead · List NÃO entra  🚪
├─ M1 crawl → M2 caça-contato → M3 sociais      (Lead + Pro)
├─ M4 PAGOS: governor fail-closed E lead é de Pro  🚪💰 (único gasto do sistema)
├─ M5 30b + gate anti-alucinação → M6 zap-gate  (Lead + Pro)
└─ 💳 enriquecimento concluído = debita 1 do saldo ② da empresa dona do lead

COFRE: inalterado (Brave/Serper/Places atrás do Governor) + política de alocação por tier
```

## O que morre no catálogo atual (entra no cutover P1 da Árvore Mestra)
- `googleSearchesPerDay` + `GOOGLE_DAILY_LIMIT_REACHED_MESSAGE` (viola Lei 2).
- `cardsPerSearch`, `searchesPerCycle`, `totalCards`, `enrichmentsPerDay`,
  `dailyCardSafetyLimit` como colunas por plano → viram a fórmula/booleans acima.
- Números hardcodados em `features[]` → gerar de `quotas`.
- Nome "Night Factory" no entitlement → unificar com fábrica de enriquecimento.

## Escala (checagem de capacidade — pra não vender o que a máquina não entrega)
IA 7b ≈ 23s/lead ⇒ Pro cheio (6.000/mês ≈ 200/dia) ≈ 1h17/dia de CPU. Ryzen 5500 aguenta
~10–15 Pro saturados. 15 × R$249 = **R$ 3.7k MRR** — paga máquina dedicada de inferência antes
do gargalo chegar. O limite não é a base (28M local), é o throughput de IA — e ele se paga.

## Decisões que ficam com o dono
1. Validar os 3 números (500/2.000/6.000 · 0/300/1.500 · 1/2/3) — o resto deriva deles.
2. Porta 8 do List: aceita "contato validado sem zap" (recomendado) ou zap obrigatório?
3. Trial capado em 200 cards — ok?
