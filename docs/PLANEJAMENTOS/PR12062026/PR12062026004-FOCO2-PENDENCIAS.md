# PR12062026004 — FOCO 2 executado (pendências por tela do PLAN12062026002)

> 12/06/2026, na sequência do /master (PR12062026003). Ordem do dono:
> "siga com todos os .md que falta" — escopo confirmado com ele: itens do
> FOCO 2 com contrato pronto no backend; decisões pendentes e checkout
> ficam de fora. Frontend apenas (backend intocado neste lote, exceto
> E6/E7 já registrados na fila PLAN12062026001).

## O que LIGOU (contrato existente → tela)

### Dashboard
- "Ver relatório" → `/relatorios`; "Ver tudo" e "Ver todas no Vendas" →
  `/vendas` (Link real no lugar de span visual).

### Leads
- **Iniciar conversa** → `POST /inbox/conversations/start {phone, name?}`
  e abre o Atendimento direto na conversa criada (handoff via
  sessionStorage `hbx:abrir-conversa`). Lead sem telefone = botão off.

### Atendimento
- **Tempo real**: `GET /inbox/events` (SSE) via fetch streaming —
  EventSource não envia Authorization. Evento `inbox` → recarrega lista +
  thread (debounce 600ms); reconexão com backoff; **polling 8s virou
  fallback** só enquanto o stream está desconectado.
- **Nova conversa manual**: botão "+ Nova" → modal phone/name →
  `POST /inbox/conversations/start` → abre a conversa criada.
- Validado: endpoint SSE 200 text/event-stream (`: inbox-stream-ready`).

### Vendas (quick actions no painel do card)
- **Registrar tentativa** → `POST /vendas/lead/:id/attempt` (validado de
  ponta a ponta: contador 2→3 no dev).
- **Mover etapa** → `PATCH /vendas/lead/:id {status}` (novo/contato/
  retorno/qualificado — LEAD_STATUSES do DTO; encerrado só pelo Fechar).
- **Agendar retorno** → `PATCH /vendas/lead/:id {returnAt}` (date → ISO 9h).

### Bot
- **Editor dos botões** welcomeButtons/mainMenuButtons na aba
  Configurações: título + ação (select do `actionCatalog` do GET; o
  backend valida actionId existente e buttonId único — geramos buttonId
  estável `btn_<ts>_<rand>` no cliente). Salva junto no PATCH
  /inbox/bot-config (só envia grupos editados).
- Botão Publicar segue visual (sem contrato). Canvas: decisão de produto
  pendente do dono (cenas × drag-drop).
- Nota de validação: a conta de teste (HBX Lead Plus) não tem entitlement
  bot_ia → GET devolve 402 e a tela degrada honesta; catálogo cheio
  precisa de empresa com bot_ia.

### Configurações
- **Convidar membro** → `POST /users/company/create {email, name?, role}`
  (convite com senha por link, 7 dias) com **aviso de custo de assento
  ANTES** via `GET /users/company/seat-billing` (PR-002 C.3 — validado:
  "HBX Lead Plus: 1 de 2 assentos do plano em uso").
- **Gerenciar membro**: papel → `PATCH /users/:id/role`; ativar/desativar
  → `PATCH /users/:id/active` (mensagens do backend exibidas; auto-gestão
  bloqueada na UI — o backend também barra).

### Friendly (/workspace) — 5 vistas ligadas nos contratos do corporate
- **Radar** → `GET /webscraping/radar/leads` (total, counts de status,
  últimos 5 da base); "Abrir o Radar" navega ao corporate.
- **Vendas** → `GET /vendas/board` (summary + retornos de hoje).
- **Bot** → `GET /inbox/bot-config` (resumo das mensagens + setup).
- **Relatórios** → `GET /vendas/report?period=7d` (métricas + top
  segmento/canal).
- **Config** → `GET /profile/current-user` + salvar nome via
  `PATCH /profile/display-name`.
- Validado com dados reais (base 287, board, report, perfil).

## O que FICOU (sem contrato, decisão do dono, ou fora do escopo)
- Compras/planos: aguardando "go checkout" (trilha documentada no
  FRONTEND-TEMAS-RESET.md).
- Bot: canvas drag-drop × config de cenas (decisão de produto); abas
  Integrações/Publicação/Análises sem contrato; Publicar visual.
- Atendimento: anexos/emoji/mensagem rápida/etapa do thread visuais;
  KPIs tempo médio/conversões sem contrato (gap backend).
- Vendas: "Todas as equipes" (gap backend); painel Próximas tarefas e
  funil lateral visuais do template.
- Dashboard: série mensal de receita (gap backend).
- Configurações: foto de perfil visual; notificações sem contrato;
  PATCH empresa e telefone do perfil = gaps de backend.
- Relatórios: "Ver detalhes" visual; CSV server-side gap (client-side ok).
- Friendly: Esteira/Recovery/Cadastros seguem visuais (backends
  hbx-recovery/cadastros existem — PR próprio).
- E5 fase 2 (sino direcionado targetUserId + refund por billingCycle) =
  mudanças de backend → fila.
- Trabalhe Conosco: upload de currículo e atalho do Aprovar (decisão).

## RODADA DE PARIDADE friendly × corporativo (12/06/2026, fim do dia)

Queixa do dono: "diferença entre corporativo e friendly, especialmente
nomes" + "coisas que clica e aceita, coisas que clica e não tem acesso"
(não era cache do navegador). Causas reais e correções:

1. **Sidebar encolhida para o MASTER** (a diferença de acesso): o backend
   bypassa entitlements para isSystemMaster, mas /commercial-plans/me falha
   sem empresa → useEntitlements vazio → o front ESCONDIA módulos do dono
   nos dois temas. Fix: `isModuleVisible`/`railVisible` ganham bypass de
   master. Validado: corporativo mostra os 8 módulos e o friendly mostra
   tudo (incl. Recovery) logado como master.
2. **Vistas mock que "aceitavam" clique** (pareciam liberadas): o Inbox
   friendly FINGIA enviar mensagem (thread fake local), "Esteira de leads"/
   Recovery/Cadastros abriam um dashboard fake ("Marina Alves", 1.284
   leads, R$ 86.4k), o chip "WhatsApp conectado" era fixo e o user-card
   mostrava "Marina Alves / Auto Center Sul". Fixes:
   - Inbox friendly LIGADO no inbox real (conversas/thread/enviar/lida) —
     erro do backend aparece como veio (validado: "Atendimento indisponível
     sem WhatsApp/celular vinculado" em empresa sem WhatsApp).
   - Dashboard friendly real (board + radar + inbox; saudação com nome
     real; fila com cards reais; Recovery lateral honesto).
   - Vista Leads real (base do Radar com counts) + "Distribuir no
     corporativo"; Recovery/Cadastros = painéis honestos "em breve".
   - Chip WhatsApp com status real; user-card com perfil real; botões
     "+ Novo lead" (→ /vendas com handoff) e "Importar lista" (→ /webscraping).
3. **Nomes copiados do corporativo** (ordem do dono): rail friendly virou
   Dashboard, Leads, Radar, Vendas, Atendimento, Bot, Relatórios,
   Configurações (Recovery/Cadastros mantêm nome próprio por serem
   exclusivos do friendly). Títulos das vistas idem.

Também nesta rodada: **territórios da distribuição** ganharam edição
visual (modal cidades/UF por vendedor → PUT territories com o array
completo para não apagar os demais).

NOTA DO AMBIENTE: o banco de dev foi LIMPO externamente durante o dia
(restou só a empresa HBX real) — a conta de teste antiga
(trial-claude…@hbx.test) morreu. Criada nova pela provisioning do /master:
empresa "Validacao Paridade Teste" (#28, HBX Full, cortesia manual), admin
paridade-teste-12062026@hbx.test / SenhaForte#2026.

## Checks e validação (12/06/2026)
- `npm run lint` ✓ e `npm run build` ✓ após cada lote.
- Preview com a conta de teste ADMIN (Dup Teste): links do dashboard ✓,
  modal nova conversa ✓, SSE 200 ✓, tentativa 2→3 ✓, editor de botões
  renderizando ✓, convite com seat-billing real ✓, vistas friendly com
  dado real ✓. Zero erros de console. Sessão de teste deslogada ao final.
