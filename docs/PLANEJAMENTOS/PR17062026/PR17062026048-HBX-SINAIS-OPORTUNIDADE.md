# PR17062026048 — HBX SINAIS: de LISTA para OPORTUNIDADE (motivo + hora + cara)

> **Ordem do dono (17/06):** o brainstorm de "inteligência de nicho" pivotou. A 1ª ideia
> (reordenar a fila do motor pelo nicho digitado) era **encanamento, não produto** — o dono
> recusou: *"achei fraca, as empresas de alto padrão não param aí."* Norte novo = **signal-based
> selling** (como Clay / 6sense / Apollo fazem em 2026): parar de vender LISTA (commodity) e
> entregar **OPORTUNIDADE COM MOTIVO E HORA**. Decisões cravadas: **escada inteira em fases**
> (sinal → gêmeos → caçador) e **grátis primeiro, dono no loop** pra abertura por IA.
>
> Cruza com (NÃO duplicar): **046** (Radar tela nova lago→prateleira→carteira é onde os cards
> moram), **045** (bot Chave-Mestra / prospecção WhatsApp+e-mail é onde o Caçador dispara),
> **037** (Sellers Brains / push é onde o "achei N que são sua cara" toca). Campos de demanda
> (`prospectingSegmentsJson`, `preferredSegmentsJson`, `segmentAffinityJson`) já existem.

---

## A FRASE (o que muda pro cliente)

O lead deixa de ser `nome + telefone`. Vira:

> **QUEM** (enriquecido) · **POR QUE AGORA** (sinal fresco) · **A CARA** (parece seu melhor
> cliente, 0–100) · **A ABERTURA JÁ ESCRITA**, pronta pra disparar no WhatsApp pelo bot.

É o `Radar → Vendas → WhatsApp → Retorno` inteiro, só que cada etapa puxada por **sinal**.

## DE ONDE VEM (NÃO reinventar — 80% já está no código)

| Peça | Já existe em | Vira |
|---|---|---|
| Motor de sinais | `radar/03-enrichment/radar-opportunity-signal.service.ts` (`opportunitySignals[]`, `opportunityReason`, `recommendedChannel`, `opportunityScore`, `pitchHint`) | **estende** com a dimensão HORA/intenção (hoje só tem "buraco digital") |
| Slot de motivo no card | contrato do card (MOTOR.md): `opportunityReason`/`recommendedChannel`/`qualityScore` já são opcionais | recebe os chips "Por que agora" |
| Semente da abertura | `pitchHint` no mesmo serviço | base do texto pronto (degrau final) |
| Fila do motor | `radar-core-campaign-planner.mixin.ts` (`rankAutonomousMassDataWorkCandidates`, janela noturna) | o Caçador (Fase 3) roda dentro dela |
| Push vivo | `pulse/hbx-pulse.service.ts` (ângulo-lead, warmup/gap/teto/dedup) | ganha ângulo "sinal/gêmeo" |
| Demanda declarada | `Company.prospectingSegmentsJson` + `User.preferred/segmentAffinityJson` | insumo do Fit (Fase 2) |
| Negócios fechados | `VendasLead` (won) | treino do ICP (Fase 2) |

## INVARIANTES (valem nas 3 fases)

- **Lagoa COMPARTILHADA.** Sinal/Fit **anotam e reordenam**, nunca cercam lead por empresa.
  Anti-espertão (mascarado + cotas) intacto; "não repetir" segue por empresa (`RadarLeadCompanyState`).
- **Waterfall GRÁTIS primeiro:** motor (já roda) → dado aberto BR (cache) → derivações. **Nenhuma
  chamada paga na varredura.** IA paga só no degrau final (abertura) e, por ora, **manual via fila
  do Master** (Camada 2). Costura `opener-source` (`MANUAL | AI`) = 1 ponto de swap futuro.
- **Histórico negativo nunca apaga** (MOTOR.md). Sinal reprioriza, não descarta.
- **Campos ADITIVOS / card opcional** (card antigo sem sinais continua renderizando).
- **Estado VISÍVEL** ([[ferramenta-sem-estado-visivel]]): chip de sinal na cara, Caçador mostra
  "rodei ontem, achei N", fila do Master mostra contador.
- **Visual só em token** (5 Leis); reusar sprite `docs/ICONES/CARDS/`.

---

## FASE 1 — POR QUE AGORA (sinais grátis) · **o salto que o cliente sente** · faz 1º

### 048-1A — Sinais de HORA no serviço que já existe
- **Arquivo:** `backend/src/webscraping/radar/03-enrichment/radar-opportunity-signal.service.ts`.
- **Objetivo:** adicionar sinais de **intenção/tempo** ao lado dos de "buraco digital" que já tem:
  `recem_aberto`, `sem_site`, `instagram_parado`, `avaliacoes_em_queda`, `poucas_avaliacoes_novo`,
  `contratando`, `cnpj_baixado` (negativo, derruba score). Cada um com label em `reason()` e peso em `score()`.
- **Contrato:** mesma assinatura; só cresce o `Set` de signals + o dicionário de labels. Sem provider novo aqui.
- **Check:** `cd backend && npm run build`; estender `radar-opportunity-signal.test.ts`.

### 048-1B — Coletor waterfall grátis (de onde vem o sinal de HORA)
- **Arquivos:** novo `radar/03-enrichment/radar-public-data.service.ts` + util `lead-signals.util.ts`
  (fonte única parse/normalize, espelha `users/segment-affinity.util.ts`).
- **Ordem do waterfall (para na 1ª que respondeu, tudo cacheado):** (1) o que o motor já raspou
  (rating/reviews/website) → (2) **dado aberto da Receita** (data de abertura, CNAE, situação
  cadastral) → (3) derivações locais (`sem_site`, `instagram_parado` por última data).
- **Cache:** tabela `CnpjPublicCache` (aditiva) p/ não repetir lookup e não estourar rate-limit.
- **Contrato:** plugga no pipeline de enriquecimento (`radar-core-quality-enrichment.mixin.ts`),
  grava em `RadarLeadPool.signalsJson` (aditivo). **NUNCA chama nada pago.**
- **Check:** `npm run prisma:validate` → `npm run build`. **Ver DECISÃO ABERTA #1 (CNAE) antes.**

### 048-1C — "Por que agora" no CARD (front)
- **Arquivos:** card do Radar na tela nova (`frontend/src/app/(app)/webscraping/page.client.tsx` +
  bloco `.radar2-*` em `hbx-theme/screens.css`); presenter já devolve `opportunityReason`
  (`radar/06-presentation/radar-lead-presenter.service.ts`).
- **Objetivo:** chips de sinal ("🆕 Abriu há 47 dias", "🌐 Sem site", "⭐ nota caindo") + a frase
  `opportunityReason` em destaque. Aditivo: sem sinal → card limpo, sem buraco.
- **Check:** `cd frontend && npm run lint` → `npm run build` (check-pele 0 violações).

### 048-1D — Push "achei N que são sua cara + deram sinal"
- **Arquivo:** `backend/src/pulse/hbx-pulse.service.ts` — novo candidato de ângulo.
- **Objetivo:** quando o motor enche o nicho da empresa com leads que **têm sinal**, dispara
  *"Enchemos {nicho} em {cidade}: +N novos, todos com motivo."* `nudgeKey: signal-batch:{seg}:{cidade}:{dia}`.
- **Contrato:** reusa warmup/gap/teto/dedup/quiet-hours já existentes. Nada novo de infra.
- **Check:** `npm run build` + teste do pulse.

---

## FASE 2 — GÊMEOS DO CLIENTE IDEAL (ICP) · **o fosso** · depois da Fase 1

### 048-2A — Impressão digital do cliente ideal (read-only sobre Vendas)
- **Arquivos:** novo `backend/src/webscraping/icp/icp-fingerprint.service.ts` + `icp-fingerprint.util.ts`.
- **Objetivo:** ler `VendasLead` **fechados (won)** por empresa → fingerprint: segmento/CNAE dominante,
  cidade/região, faixa de sinais na hora do fechamento. Só leitura; não muda Vendas.
- **Check:** `npm run build` + teste de fingerprint com massa sintética.

### 048-2B — Fit-score (a cara, 0–100)
- **Objetivo:** cada lead da lagoa ganha **Fit** vs fingerprint da empresa. **Computar on-read primeiro**
  (sem persistir); persistir só se virar gargalo. Combinar com `opportunityScore` (Intent) = matriz Fit×Intent.
- **Arquivos:** `radar/06-presentation/radar-core-presentation.mixin.ts` (já lê `prospectingSegments` em :2632 — ponto de injeção).
- **Check:** `npm run build`.

### 048-2C — Trilho "Gêmeos" no Radar + copy
- **Objetivo:** trilho de topo *"Seus melhores clientes são X — achei N gêmeos, 14 deram sinal."*
- **Arquivos:** front da tela nova (`.radar2-*`).
- **Check:** `lint` → `build`.

### 048-2D — Re-treino (o loop se afia sozinho)
- **Objetivo:** ao fechar venda, gravar (aditivo) os sinais do lead no fechamento → realimenta o fingerprint.
- **Arquivos:** `backend/src/vendas/` (hook no fechamento) — aditivo, sem mexer em cobrança/comissão.
- **Check:** `npm run build`.

---

## FASE 3 — O CAÇADOR (agente noturno) · **o topo** · depois das Fases 1–2 e do 045 de pé

### 048-3A — Job noturno Fit×Intent
- **Objetivo:** por empresa, junta Fit (2B) × Intent (1A) e seleciona **só o quadrante de cima**.
  Roda dentro da janela noturna que **já existe** no `radar-core-campaign-planner.mixin.ts`.
- **Check:** `npm run build`.

### 048-3B — Entrega + push "caçei 6 hoje"
- **Objetivo:** o quadrante de cima cai na prateleira do vendedor com o porquê pronto; push avisa.
- **Arquivos:** pulse + presenter. **Estado visível:** "Caçador rodou {hora}, achou N".

### 048-3C — Abertura pronta + plug no bot (045) + fila do Master
- **Objetivo:** abertura escrita a partir do `pitchHint` + sinais. **Camada 2 manual:** quando o
  vendedor pede a abertura, cai numa **fila do Master** (você responde → grava no card). Costura
  `opener-source` (`MANUAL | AI`) deixa o swap pra IA depois sem reescrever. Dispara pela
  prospecção WhatsApp/e-mail do **045** — **vendedor mantém o gatilho** (taste, não robô atirando).
- **Check:** depende do 045; só fechar quando o motor de disparo estiver vivo.

---

## DECISÕES ABERTAS (preciso do dono antes de aplicar a Fase 1)

1. **CNAE/CNPJ via backend?** MOTOR.md proíbe o **motor Python** emitir `cnpj`/`CNAE`. O coletor
   da 1B faz lookup público da Receita **no backend** (camada diferente) e guarda como sinal.
   É outra camada, mas **reintroduz CNAE** — quero teu **OK explícito** (regra de segurança).
2. **Fonte do dado aberto:** BrasilAPI/ReceitaWS (grátis, mas com rate-limit) **vs** importar o
   **dump mensal de Dados Abertos da Receita** numa tabela local (verdadeiramente grátis, sem
   rate-limit, escala melhor). Recomendo o **dump local** como alvo — é o jeito "alto padrão grátis".
3. **Treino do ICP (Fase 2):** só `won`, ou também `puxado-mas-não-fechou` como sinal fraco?

## CHECKS GERAIS (menor conjunto por bloco)
- Front: `cd frontend && npm run lint` → `npm run build`.
- Back: `cd backend && npm run prisma:validate` → `npm run build`.
- E2E só se validar puxar→sinal→abertura ponta-a-ponta com ambiente pronto.

## NÃO fazer (segurança / PAGAMENTOS.md / MOTOR.md)
Não tocar preço/plano/paywall/checkout. Não relaxar cota/anti-espertão. Não apagar histórico
negativo. Nada pago na varredura. CNAE só com OK do dono (decisão #1). Visual só em token.
