# ÁRVORE MESTRA do Motor de Leads — desenho final + plano de conclusão

> Desenho: [arvore-mestra.svg](./arvore-mestra.svg) (abre no navegador).
> Injetado 02/07/2026. Substitui os desenhos parciais anteriores. **Este é o alvo — o que não
> está aqui, morre no cutover.**

## As 3 leis do desenho (a dor que ele mata: "nunca sabia qual motor rodava")
1. **Ordem FIXA e numerada.** Pesquisa do cliente roda SEMPRE 1→8, sem fallback surpresa.
   Cada card grava `sourceChain` (ex.: `rfb+web`, `web`, `rfb`) e o painel MOSTRA. Fim do mistério.
2. **Pesquisa do cliente é 100% grátis. SEMPRE.** API paga não existe na lane de pesquisa.
   Dinheiro só na fábrica, no estágio M4, último recurso, atrás do Governor (fail-closed).
3. **Sem caminho legado convivendo.** As rotas antigas (radar_database-first, google_emergency,
   vertical-sources, local-directories no fluxo do cliente) saem da rota — flag `HBX_LEGACY_SOURCES`
   default OFF até a remoção física (regra do escoteiro).

## O desenho em palavras
- **Camada de dados (roxo):** Base RFB 28M local (descoberta = SELECT; refresh mensal; VPS nunca
  recebe o dump) + `LeadContact` (contato 1ª classe, já com 10.487 no VPS) + `RadarCoverage`
  (cidade×nicho fresco/esgotado, reabre 90d).
- **Lane PESQUISA (cliente aperta buscar — síncrona, R$0):**
  1. Semente (nicho+cidade, vizinha opt-in) → 2. SELECT na RFB (formais) → 3. Motor web grátis
  (ddg/bing/crawl, IP residencial — novos/informais + site/insta dos formais) → 4. Portas por
  motor (web: blacklist/marca/lista · receita: ativa/cnae/dv/celular-c/9, rejeitados LOGADOS) →
  5. Fusão canônica (CNPJ chave; 2 fontes = 1 card) → 6. Crawl do site → 7. IA 7b saneia+ICP
  (campeã do bench 02/07: 19/20, ICP com spread) → 8. Zap-gate → **card entregue**.
- **Lane FÁBRICA DE ENRIQUECIMENTO (assíncrona, fila de missões S4):** a fábrica NÃO descobre
  mais nada — ela pega da base o lead SEM contato quente e completa: M1 crawl profundo → M2
  caça-contato no web (nome+cidade→fone/insta) → M3 sociais → **M4 pagos (único ponto pago do
  sistema, só se M1-M3 falharam E há saldo)** → M5 extração 30b local com gate anti-alucinação →
  M6 zap-gate → estoque pronto. Lease+heartbeat; PARAR pausa a fila inteira.
- **Cofre (vermelho):** Brave (900/mês — julho JÁ estourado, volta 01/08) · Serper (off por
  default) · Places (200/dia, emergência). Todos atrás do Governor: sem saldo = não chama.

## Status por caixa (02/07, pós-publish)
| Caixa | Status | O que falta |
|---|---|---|
| Base RFB 28M | 🟡 import COPY pronto (S2) | **P0: rodar a carga (7,3GB) — gate do dono** |
| LeadContact | 🟢 no ar (10.487 no VPS) | — |
| RadarCoverage | 🟢 migrado (S4) | ativa junto com a fila |
| 1-Semente / 3-Motor web / 4-Portas / 5-Fusão / 6-Crawl | 🟢 no ar (publicados 02/07) | vizinha opt-in (P1) · log dos rejeitados da porta receita (P1) |
| 2-SELECT RFB primeiro | 🟡 fonte existe, ordem não | **P1: cutover da ordem fixa** |
| 7-IA 7b no pipe | 🔴 bench pronto, serviço órfão | **P2: soldar como etapa** |
| 8-Zap-gate como porta do card | 🟡 gate existe p/ contato | P2: virar porta obrigatória da entrega |
| Fila de missões | 🟡 pronta, flag OFF | **P3: validar local → ligar** |
| Fábrica de enriquecimento (M1-M6) | 🔴 conceito aprovado pelo dono | **P3: missão `enrich_lead`** |
| M4 pagos último recurso | 🟡 governor no ar | P3: plugar como estágio |
| Governor + gauge :3107 | 🟢 no ar (fail-closed provado) | A/B de throughput ao vivo |
| 30b extração + gate | 🟢 código no ar, flag OFF | P3: virar estágio M5 |
| Crawl lvl 2 (Playwright) | 🔴 adiado por decisão | P5 (só se M1 falhar em site JS) |
| sourceChain visível no card | 🔴 não existe | **P1 (é a cura da dor nº1)** |

## Plano de conclusão (ordem de execução; 1 worker por P, .md na pasta do dia)
- **P0 — Carga RFB (gate do dono: "roda hoje?").** Script COPY+staging do S2 pronto; ~7,3GB,
  rodar de madrugada; aceite: SELECT cidade+cnae <500ms e re-rodar não duplica.
- **P1 — Pesquisa determinística (cutover).** Ordem fixa 1→8 na rota do cliente; RFB SELECT
  primeiro; legado atrás de `HBX_LEGACY_SOURCES=false`; `sourceChain` gravado no card e exibido
  (:3107 e card do vendedor); vizinha opt-in; log dos rejeitados da porta. Aceite: qualquer
  busca mostra no log EXATAMENTE 2 motores na ordem, e o card diz de onde veio.
- **P2 — Cérebro no pipe.** 7b como etapa 7 (assíncrona curta pós-entrega: card nasce e ganha
  nome-limpo+nota em segundos; prompt ICP do bench); zap-gate vira porta 8 obrigatória.
  Aceite: card entregue = nome limpo + nota + zap validado; lixo semântico (tipo "Tasting
  Table") morre aqui com nota ≤3.
- **P3 — Fábrica de enriquecimento.** Validar fila local (roteiro no doc do S4) → ligar
  `HBX_MISSION_QUEUE_ENABLED` → missão `enrich_lead` com estágios M1-M6 (M4 = pagos via
  governor; M5 = 30b com `HBX_AI_EXTRACTION_ENABLED`). Alimentador lê base+coverage.
  Aceite: PC ligado drena; PARAR congela fila E contadores; estoque cresce com gasto R$ 0.
- **P4 — Cofre em regime.** Brave volta 01/08 (ou dono sobe cap); decidir Serper; A/B de
  throughput do teto 8. Aceite: mês fecha com gasto conhecido e M4 count ínfimo.
- **P5 — Playwright L2** (só depois de P3 rodar 1 semana e provar que M1 estático falha em X%).
- **P6 — Desmonte contínuo** (escoteiro): remover fisicamente as rotas mortas do P1 ao tocar;
  meta 12→<6 mixins.

## Decisões abertas do dono
1. PARAR corta também ddg/bing (grátis)? — dono sinalizou que SIM (semântica: parar = nenhuma
   fonte consultada). Aplicar 1 linha no próximo lote (P1).
2. Quando roda a carga RFB (P0)?
3. Serper: liga em M4 ou fica off?
