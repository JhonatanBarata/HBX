# 02 — Lista densa + página do lead (`/leads/[id]`)

## Objetivo
(a) Lista de leads em **linhas densas** (default desktop; cards viram visão alternativa)
com ≥9 leads visíveis em 1080p. (b) "Ver mais" abre **página cheia do lead** em 3 colunas
com tabs **Anotações | WhatsApp** (E-mail entra no plano 06) — o aside atual vira preview
rápido, a página vira o lugar de trabalhar o lead.

## Por quê ($)
É o coração do comparativo com o Biz (prints do dono 06/07): lá o lead tem página rica com
timeline, dados da empresa, contatos e ações em 1 clique. Hoje o HBX espreme "1000
informações" num aside. Página de lead = mais tempo dentro do produto = retenção.

## Estado atual (verificado)
- Lista/vitrine: [leads/page.client.tsx](../../frontend/src/app/(app)/leads/page.client.tsx)
  — `SHELF_LIMIT = 24` (l.186), cards em grade, detalhe no aside via `DetalhesNegocio`
  (import l.18; render ~l.2023-2028 com `selLead`). Comentário l.1154 indica GET de
  detalhe `:id` já existente e normalizado.
- Detalhe: [detalhes-negocio.tsx](../../frontend/src/components/hbx/detalhes-negocio.tsx)
  (`NegocioDetail`) — reusar como coluna esquerda da página.
- WhatsApp: [atendimento/page.client.tsx](../../frontend/src/app/(app)/atendimento/page.client.tsx)
  tem paridade WhatsApp Web publicada (avatar estável, quoted real, Ctrl+V/drag). Envio
  real passa por `messaging.service::sendOne` no backend. Modal de conexão pronto:
  `components/hbx/whatsapp-connect-modal.tsx` + fluxo canônico `lib/whatsapp-connection-flow.ts`.
- Tabs com "um ativo por vez" = **Glass Pill obrigatório** (regra do dono 05/07;
  `useGlassPill` + `.glass-pill-*` no kit).

### VERIFICADO 06/07 (antes de lançar — evita legado/plágio)
- **Não existe `/leads/[id]`** (só `page.tsx` + `page.client.tsx` + `redirect.client.tsx`) →
  construir a rota é NET-NEW, não duplica nada.
- **Os prints foto2/3/4 do dono são o CONCORRENTE (CNPJ Biz), inspiração — NÃO tela HBX.**
  Confirmado: a UI de conexão de e-mail IMAP/SMTP (foto4) NÃO existe no HBX (zero match pra
  `IMAP`/`Servidor de entrada`/`senha de app`/`Conecte uma conta`). Logo a página de 3 guias
  é nossa a construir (cara do HBX), não copiar. E-mail = plano 06 (novo de verdade).
- **Reusar (não recriar):** `DetalhesNegocio` (aside, `components/hbx/detalhes-negocio.tsx`);
  painel de conversa do **Atendimento** (`atendimento/page.client.tsx`) pra a tab WhatsApp;
  helpers de abrir WhatsApp de **Vendas** (`abrirWhatsAppInterno/Externo` em
  `vendas/page.client.tsx`, que já fazem `POST /inbox/conversations/start` → `/atendimento`).
  O board de Vendas é KANBAN de deals — NÃO é a "Edição" de 3 guias; não confundir.
- **Escopo por posse (amarra no fix pull-gated do 04):** a página rica `/leads/[id]` é pra
  lead POSSUÍDO (puxado → contato revelado). Card da vitrine ainda NÃO puxado → "ver mais"
  mostra o aside mascarado + CTA "Puxar · N créditos", nunca a página cheia com contato.

## Desenho

### Lista densa
- Toggle Linhas|Cards no cabeçalho da lista (glass pill, estado por usuário em
  localStorage). Default desktop = linhas; mobile mantém cards.
- Linha (`--row-height` do plano 01): nome/razão + badge origem | cidade/UF | contato
  (mascarado se vitrine — o que a API mandar) | termômetro | responsável | ações (abrir,
  puxar, WhatsApp). Classes centrais em `kit.css` (tabela densa reutilizável — outras
  telas vão querer).
- Sem legado: a grade de cards NÃO duplica markup de dados — linha e card renderizam do
  mesmo modelo/normalização já existente na tela.

### Página `/leads/[id]`
- Rota nova `app/(app)/leads/[id]/page.tsx` + client. Aside continua; botão "Ver mais"
  navega. **Não criar segunda fonte de dados**: mesma chamada de detalhe `:id` da tela.
- Grid 3 colunas (casca em `screens.css`, tokens do plano 01):
  - **Esquerda**: `DetalhesNegocio` (título, valor, origem, responsável, termômetro) +
    edição inline que já existir (`editar-nucleo-modais.tsx` cobre Contatos/Empresas).
  - **Centro**: tabs glass-pill **Anotações | WhatsApp** + timeline/histórico embaixo.
  - **Direita**: Dados da Empresa (RFB: CNPJ, CNAE, porte, cidade — com copiar em 1
    clique), Contatos do núcleo, Próximas atividades (se houver contrato no backend —
    **dado sem contrato mostra "—", nunca fake**, regra FRONTEND.md).
- **Tab WhatsApp**: extrair o painel de conversa do atendimento pra
  `components/hbx/` (se ainda acoplado à página) e embutir filtrado pelo telefone do
  lead. Sem chip conectado → CTA amarelo "Conectar WhatsApp" abrindo
  `whatsapp-connect-modal` ALI (config-in-place: beco sem saída vira CTA, nunca mandar
  pra engrenagem). Envio usa as rotas existentes — **zero mudança no motor Webwhats**.
- **Tab Anotações**: verificar se lead já tem modelo de nota no backend. Se não:
  `LeadNote` (id, leadId, companyId, authorId, body texto simples/markdown-lite, pinned,
  createdAt) + CRUD no módulo do CRM + entrada na timeline. Sem editor rico v1 — bold/
  itálico/lista no máximo, contador de caracteres.
- Atalhos 1-clique na coluna direita: telefone → abrir tab WhatsApp / copiar; e-mail →
  copiar / `mailto:` (até o plano 06 trocar por compose nativo).

## Passos
1. Ler a tela atual inteira + `DetalhesNegocio` + contrato do GET `:id` (o que já vem).
2. Kit: classes de tabela/linha densa (`kit.css`) + toggle Linhas|Cards.
3. Rota `[id]` com grid 3 colunas; mover `DetalhesNegocio` pra coluna esquerda.
4. Extrair painel de conversa do atendimento → componente central; embutir na tab.
5. Anotações (backend se faltar + front).
6. "Ver mais" no aside e na linha → rota. Histórico na página.

## Riscos / guardrails
- **Não encostar em conexão/reconexão de chip** — embutir conversa é só UI sobre rotas
  existentes. Teste de envio: número descartável, JAMAIS chip do dono (regra dura).
- Aside + página usando o mesmo fetch: cuidado com estado duplicado (puxar na página
  precisa refletir na lista ao voltar — invalidar/refetch ao navegar).
- `[id]` respeita RBAC/território existente do backend (não criar endpoint novo sem guard).
- Vendedor nunca vê valor/plano (LEI DO VENDEDOR) — coluna esquerda esconde "Valor" para
  `userKind=seller` se hoje o aside já esconde (seguir o comportamento existente).

## Checks / DoD
- lint (check-pele) + build verdes; zero-scroll na lista (a página do lead pode rolar o
  MIOLO das colunas, casca fixa).
- Chrome 1080p: ≥9 linhas visíveis; toggle persiste; 4 peles ok.
- Fluxo completo: lista → linha → página → tab WhatsApp com conversa real (número
  descartável) → anotação salva → aparece no histórico → voltar pra lista sem estado podre.
