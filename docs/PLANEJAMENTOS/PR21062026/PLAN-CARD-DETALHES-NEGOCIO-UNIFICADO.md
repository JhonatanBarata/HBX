# PLAN — "Detalhes do negócio" como UM componente único (vendas · atendimento · radar/leads)

> Pedido do dono 21/06. **Requisito arquitetural durável:** o painel de detalhe é **1 componente
> só**, usado nas 3 telas. Daqui pra frente, **1 edição reflete nas 3**. Nunca mais duplicar esse
> card (regra "sem legado"). Este arquivo é a fonte de verdade que os workers executam.

## STATUS 21/06 — UNIFICAÇÃO APLICADA (orquestrador: 3 workers)
- **Componente único** `components/hbx/detalhes-negocio.tsx` ligado nas 3 telas com a API canônica
  `detail={NegocioDetail}` + slots `heroAction`/`actions`. Build verde (28 rotas), check-pele 422/422.
- **Vendas:** núcleo premium completo (score, temperatura, avaliação, observação, histórico real).
  Ações no slot; modais na página. **PENDENTE: card MOBILE (`.vnd-detail`) ainda tem JSX próprio** —
  migrar pro componente num próximo passo (não duplicar).
- **Atendimento:** migrado pro `detail=`. WhatsApp NÃO entra no hero (já se está dentro do thread).
  Obs segue por props dedicadas (`obsDraft/onObsChange/...`) — ok. "Abrir no Vendas" removido.
- **Leads/Radar:** migrado pro `detail=`; máscara preservada (phone/email/site/IG/FB só revelados);
  Score saiu da KV solta e vem da barra; extras do radar via `kvExtra`.

### Material pro EXPURGO (filtrar depois — o que cada tela REALMENTE tem hoje)
> Nada foi falsificado: campo sem dado some. O que está VAZIO por tela = candidato a "sai" OU a
> "ligar no backend". Decisão do dono campo a campo (e o que sair é deletado até do backend).
- **Atendimento** NÃO recebe do endpoint `status-card`: segment, city, state, website, leadTemperature,
  opportunityScore, rating, reviews, lastResult, owner, leadIntelligence, sale. → ou enriquecer o
  status-card, ou aceitar que atendimento não mostra esses.
- **Leads/Radar** o tipo `RadarLead` não tem: rating, reviews, timesSeen, returnAt, lastContactAt,
  attemptCount, nextAction, owner, shortNote, history. → idem.
- **Vendas** tem tudo (é a referência). Campos a questionar no expurgo: "Visto N×", "Avaliação",
  "Último resultado" — confirmar se ficam.

## Direção do dono (21/06) — INJETAR TUDO AGORA, FILTRAR DEPOIS
1. **Injetar tudo** no card: trazer pro componente único TODOS os campos reais que cada tela já
   tem (score, temperatura, avaliação, observação, próxima ação, último resultado, visto, histórico).
   Inclusivo de propósito — é melhor ver tudo ligado e decidir depois.
2. **Filtrar depois (passe SEPARADO, NÃO agora):** com tudo aparecendo, o dono decide campo a campo
   o que **fica de verdade** e o que **sai**. O que sair é **deletado de ponta a ponta — inclusive do
   backend** (coluna/select/serializer/seed), não só escondido no front. Esse expurgo é uma trilha
   própria; **não apagar nada de backend neste passo.**

## Estado atual (o que já existe — a REFERÊNCIA é a Vendas)
- **Vendas** (`frontend/src/app/(app)/vendas/page.client.tsx`, aside `.ctx`, ~995–1235): núcleo
  premium recém-construído (21/06) — É A REFERÊNCIA VISUAL. Já liga: hero (avatar+nome+segmento+
  cidade), **tags etapa+temperatura**, **barra de Score de oportunidade**, telefone/site (pílulas),
  6 selos `CanalIcon`, ficha KV (Valor âncora, Produto, Avaliação ★, Próxima ação, Próximo retorno,
  Último contato, Tentativas, Último resultado, Visto, Responsável, + bloco Venda/Comissão condicional),
  **bloco Observação** (`shortNote`), e **Histórico real** (timeline). Botões fake (Próximas tarefas,
  Funil) já REMOVIDOS — só dado real.
- **Atendimento** (`atendimento/page.client.tsx`): aside `.ctx` (~1883) com abas **"Contexto do lead"**
  (ctxTab 0) e **"Histórico"** (ctxTab 1, ~1978). Menu Ações tem **"Abrir no Vendas"** (~1710).
- **Leads/Radar** (`leads/page.client.tsx`): já mostra **Score** (KV `opportunityScore`, ~514) e tem
  aside `.ctx` "Detalhes do lead" (~1092) + um `.ctx-body` (~446). Contato mascarado até revelar.
- **CSS central já criado (reusar, NÃO recriar):** em `hbx-theme/kit.css` — `.ctx`, `.ctx-hero`,
  `.ident`, `.ctx-tags`, `.ctx-score`/`.ctx-score-track`/`.ctx-score-fill`/`.ctx-score-num`,
  `.ctx-channels`, `.ctx-phone`, `.kv`/`.kv .v.is-strong`/`.is-empty`/`.mono`, `.ctx-note`(+`-lbl`/`-txt`),
  `.ctx-sec`, `.ctx-timeline`(+`-item`/`-dot`/`-body`/`-title`/`-desc`/`-when`), `.ctx-msg`(ok/err),
  `.ctx-field-lbl`, `.ctx-obs`. Pele premium (vidro/glow) em `theme-aurora.css`. **check-pele tem que
  passar — zero hex/inline visual novo.**

## Componente alvo
`frontend/src/components/hbx/detalhes-negocio.tsx` — `<DetalhesNegocio>`.

### Modelo de dados normalizado (cada tela MAPEIA o seu objeto p/ este shape; nunca passar deal/convo/lead cru)
```ts
export type NegocioDetailHistory = {
  id: string; title?: string|null; description?: string|null;
  resultLabel?: string|null; returnAt?: string|null; createdAt?: string|null;
};
export type NegocioDetail = {
  id: string;
  name?: string|null; avatarUrl?: string|null; online?: boolean;
  phone?: string|null; email?: string|null; website?: string|null;          // contato
  city?: string|null; state?: string|null; segment?: string|null;
  statusLabel?: string|null; leadTemperature?: string|null;                 // frio|morno|quente
  opportunityScore?: number|null;                                           // 0–100
  rating?: number|null; reviews?: number|null; timesSeen?: number|null;
  valueLabel?: string|null; productName?: string|null;                      // valueLabel já formatado pela tela
  returnAt?: string|null; lastContactAt?: string|null;
  attemptCount?: number|null; lastResult?: string|null; nextAction?: string|null;
  owner?: { name?: string|null } | null;
  shortNote?: string|null;
  leadIntelligence?: { whatsappStatus?: string|null; emailStatus?: string|null; instagramUrl?: string|null; facebookUrl?: string|null } | null;
  sale?: { statusLabel?: string|null; status?: string|null; valueLabel?: string|null; commissionLabel?: string|null; commissionValueLabel?: string|null; setupLabel?: string|null } | null; // só Vendas
  history?: NegocioDetailHistory[] | null;
};

export type DetalhesNegocioProps = {
  detail: NegocioDetail | null;
  title?: string;                  // default "Detalhes do negócio"
  onClose?: () => void;            // mostra o ✕ se presente
  heroAction?: React.ReactNode;    // canto do hero (ex.: WhatsAppActionButton)
  actions?: React.ReactNode;       // bloco de ações ESPECÍFICO da tela (slot)
  emptyHint?: string;
};
```
**Campo ausente → a linha some** (condicional). Linhas-base (Valor, Produto, Próximo retorno, Último
contato, Tentativas, Responsável) seguem mostrando "—" desbotado (`.is-empty`); campos extras
(Avaliação, Próxima ação, Último resultado, Visto, Observação, Score, Temperatura) só aparecem quando há dado.

### Núcleo renderizado pelo componente (compartilhado — onde "1 edição reflete nas 3")
header(title+✕) → hero(avatar+ident+`.ctx-tags`) → barra Score → telefone/site + `.ctx-channels` →
ficha `.kv` → bloco Venda (se `sale`) → `.ctx-note` Observação → `{actions}` → `.sep` → `.ctx-sec` Histórico.

### Ações por tela = SLOT `actions` (divergem de verdade; não unificar à força)
- **Vendas:** Fechar venda · Resultado da ligação (Atendeu/Não/Caixa/Sem interesse) · Negativar · Mover
  etapa · Agendar retorno (+ modo bot) · Cadastrar cliente / card do cliente. Handlers e modais FICAM na
  página; só o JSX do bloco vai pro slot. WhatsAppActionButton → `heroAction`.
- **Atendimento:** Mover etapa da conversa (novo/humano/encerrar) · Criar tarefa/agendar retorno ·
  Enviar proposta · Bot ativo/inativo. Histórico do atendimento = `history` do componente (a aba some,
  vira a seção Histórico). WhatsAppActionButton (se já existir) → `heroAction`.
- **Leads/Radar:** Puxar / enviar pra vendas (como a tela já faz). Contato mascarado → só preenche
  phone/email/website quando revelado.

## Migração — ORDEM (workers)
1. **Worker A (sozinho, primeiro):** cria `detalhes-negocio.tsx` (núcleo + slots) extraindo o núcleo
   premium da Vendas. Migra **Vendas**: monta `NegocioDetail` a partir de `deal`, passa o bloco de ações
   atual via `actions` e o WhatsAppActionButton via `heroAction`; **apaga o JSX antigo do núcleo** (sem
   legado). Modais ficam na página. `cd frontend && npm run lint && npm run build` verde.
2. **Worker B (depois de A):** migra **Atendimento** — mapeia convo/card.lead/card.customer/card.history
   → `NegocioDetail`, troca "Contexto do lead" pelo `<DetalhesNegocio>`, a aba Histórico vira a seção
   Histórico do componente, **remove "Abrir no Vendas"** do menu Ações. Ações no slot. lint+build verde.
3. **Worker C (paralelo ao B):** migra **Leads/Radar** — mapeia o lead público → `NegocioDetail`
   (contato mascarado respeitado), `<DetalhesNegocio>` no lugar do aside atual; Score sai da KV solta e
   passa a vir do componente (barra). Ações no slot. lint+build verde.

## Regras / cuidados
- **5 Leis:** componente só usa classe central/token; **nada** de hex/inline visual (check-pele barra).
  Reusar as classes já criadas (lista acima); criar classe nova só se faltar — sempre em `hbx-theme/`.
- **Sem legado:** ao migrar cada tela, apagar o JSX antigo do card (não deixar dois vivos).
- **Preservar comportamento:** mover RENDER pro componente; handlers/estado/modais ficam na página e
  entram pelo slot. NÃO alterar lógica de fechar venda/comissão (dinheiro) — só mover o JSX.
- **Mobile:** o card mobile da Vendas (`.vnd-detail`) também deve passar a usar `<DetalhesNegocio>` (ou,
  se o worker A não alcançar, deixar anotado pra um passo seguinte — não duplicar visual).
- **NÃO filtrar/expurgar campos agora.** Injetar tudo; o expurgo (inclusive backend) é trilha à parte.

## Riscos
- Shapes diferentes → mapeamento incompleto esconde campo. Conferir paridade tela a tela.
- Histórico do atendimento não pode sumir na migração (vira a seção Histórico).
- Card sem telefone / contato mascarado (radar) → componente tem que aguentar campos vazios.
- Bloco de ações da Vendas é grande e amarrado a estado da página — mover via slot, sem tocar handlers.
