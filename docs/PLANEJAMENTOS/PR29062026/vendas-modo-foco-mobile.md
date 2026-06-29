# Modo Foco — /vendas mobile (tela dedicada)

Dono aprovou o desenho (2 mockups: card herói na home + tela de foco dedicada).
Esta leva entrega **só a tela de foco dedicada + entrada**. A re-pele da home
(hero card / agenda / troca de KPIs) fica pra DEPOIS — o dono tem WIP ativo de
29/06 na casca do topo (`vnd-modehost`/`vnd-layer`/`vnd-funhead`/`KpiRow`,
crossfade funil↔buscar) e NÃO pode ser atropelado.

## Regras duras (não furar)
- **Mobile-only.** Desktop (kanban/lista/tabela) INTOCADO.
- **Aditivo.** NÃO mexer na casca crossfade nem no `KpiRow` nem no `vnd-layer`/`vnd-funhead`.
- **CSS em arquivo NOVO** `frontend/src/app/hbx-theme/modo-foco.css` (importar onde os outros
  `hbx-theme/*.css` são importados — procurar o índice, provável `globals.css` ou `layout.tsx`).
  NÃO editar `mobile.css` (tem WIP do dono).
- **Sem backend novo, sem migration, sem rota nova.** Reusar endpoints/handlers existentes.
- **Tokens/peles:** zero hex/inline solto. Cores via `var(--…)` e classes. `npm run lint`
  (eslint + `check-pele.mjs`) e typecheck TÊM que passar. Verde obrigatório.
- **Git:** NÃO commitar, NÃO `git reset/checkout/stash`, NÃO reiniciar o dev server (`:3001` é do dono).
- Editar `vendas/page.client.tsx` de forma CIRÚRGICA (só adicionar estado + botão de entrada +
  render do componente no ramo `isMobile`). Se um `Edit` falhar por string mudada, parar e reportar
  (o dono edita em paralelo) — não forçar.

## Dados (já existem — não criar)
- `summary: { total, today, overdue, scheduled, closed }`.
- `VendasLead`: `name, phone, email, city, state, segment, score, statusLabel, block, status,
  nextAction, returnAt, shortNote, lastContactAt, closedAt`.
- `board.blocks[key]` + `BLOCK_ORDER`. `urgency()` (~linha 196) já existe — reusar/estender, não duplicar.
- Handlers já existentes no `page.client.tsx` p/ reusar (ler e passar como props):
  abrir conversa WhatsApp (sessionStorage `hbx:abrir-conversa` + `router.push("/atendimento")`),
  `tel:`, reagendar (PATCH `/vendas/lead/:id {returnAt}` + `shortNote`), encerrar (status/sem-interesse),
  Fechar venda (FecharVendaModal). REUSAR — não reimplementar a lógica.

## Arquivos
1. **NOVO** `frontend/src/lib/vendas-agenda.ts` — helpers puros (sem React):
   - `getLeadReturnDate(lead): Date | null`
   - `getStartOfToday()`, `getStartOfTomorrow()`
   - `isLeadOverdue/isLeadToday/isLeadUpcoming(lead, now=Date)`
   - `leadUrgencyLabel(lead): { tone: "danger"|"warning"|"neutral", label: string }`
     (ex.: "Atrasado há 6 dias", "Hoje 14:00", "em 3 dias")
   - `sortMobileAgendaLeads(leads)`: atrasado (mais antigo / maior score) → hoje (mais cedo) → próximos
   - `resolveRecommendedLead(leads)`: 1º de `sortMobileAgendaLeads` que é overdue|today (senão topo)
   - `buildFocusQueue(board)`: leads de **hoje + atrasados**, dedup por id, ordenados → a FILA do foco
   - Exportar o tipo do lead reusando o `VendasLead` do page (ou um tipo mínimo compartilhado em `lib/`).
2. **NOVO** `frontend/src/components/hbx/vendas-modo-foco.tsx` — a tela dedicada (overlay full-screen mobile).
   Props: `{ board, startLeadId?, onExit, onWhatsApp(lead), onCall(lead), onReschedule(lead),
   onNote(lead), onWinSale(lead), onClose(lead) }` (callbacks = funções já existentes do page).
   Estado interno: `queue = buildFocusQueue(board)`, `idx`. Swipe horizontal (touch) = próximo/anterior.
3. **NOVO** `frontend/src/app/hbx-theme/modo-foco.css` — classes `.vf-*`, importado no índice de tema.
4. **CIRÚRGICO** `frontend/src/app/(app)/vendas/page.client.tsx` (ramo `isMobile` só):
   - `const [modoFocoOpen, setModoFocoOpen] = useState(false)`
   - Botão de entrada "Modo foco" (ícone raio `ti-bolt`/equivalente do kit) no header da seção do funil
     mobile — aditivo, não mexer na casca crossfade.
   - Render `{isMobile && modoFocoOpen && <VendasModoFoco board={board} onExit={()=>setModoFocoOpen(false)}
     onWhatsApp={…} onCall={…} onReschedule={…} onNote={…} onWinSale={abrirFechar} onClose={…} />}`,
     ligando às funções que já existem.

## Layout da tela de foco (seguir os mockups aprovados)
- Topbar: `✕ Sair` · "Modo foco" (raio) · `{idx+1} / {n}`.
- Faixa de urgência (cor por tom: danger atrasado / warning hoje) com `leadUrgencyLabel` + **ring de
  score em SVG** (sem gradiente; stroke por `var()`).
- Card: nome, `segment · city`, chips (etapa = `statusLabel`; "N tentativas" só se existir o dado —
  se não houver campo de tentativas, OMITIR), facts (telefone, próxima ação=`nextAction`,
  último contato=`lastContactAt`), nota "por que agora" = `shortNote` ou o texto de oportunidade.
- Ações executar GRANDES: **WhatsApp** (verde do kit) + **Ligar**.
- Registrar resultado (4): **Reagendar** · **Observação** · **Fechar** · **Encerrar**. Cada conclusão
  **avança** pro próximo (`idx++`) automaticamente.
- Footer: progress dots + "Próximo lead →". Swipe lateral também avança.
- End state (`idx >= n`): ring de check "Fila do dia zerada", stats (trabalhados/reagendados/fechados
  contados na sessão), botões "Atacar os atrasados (N)" / "Voltar ao funil".

## Aceite
- `/vendas` mobile: botão "Modo foco" abre a tela; percorre a fila (hoje+atrasados) 1 a 1; ações
  reusam os handlers existentes e funcionam; avança; mostra end state ao zerar.
- Desktop sem regressão. `cd frontend && npm run lint` + typecheck VERDES.
- Verificação visual em ~390px fica com o orquestrador (Chrome localhost:3001).
