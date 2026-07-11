# LEAD-COCKPIT — Detalhe avançado do lead no Pipeline de Vendas (11/07/2026)

> Pedido do dono: ao clicar no lead / no Detalhes, abrir uma TELA NA FRENTE (overlay) com o
> detalhe avançado "igual CNPJ biz" — o COCKPIT daquele lead. WhatsApp embutido (ou CTA
> configurar), e-mail direto (ou CTA configurar), cadastro completo, financeiro DO CLIENTE.
> Até 3 guias bem pensadas. Foco: UMA tela muito bem feita.

## Estado (marcar conforme avança — retomada em caso de queda)
- [x] Exploração (pipeline, DetalhesNegocio, ConversationPanel, EmailPanel, financeiro-tenant, RFB L4)
- [x] Plano salvo (este arquivo)
- [ ] W1 backend — endpoint cockpit (RFB rica por lead)
- [ ] W2 frontend — modal cockpit + integração vendas
- [ ] Checks locais (backend build + prisma:validate; frontend lint check-pele + build)
- [ ] Commit + `npm run publish`
- [ ] Teste no VPS (Chrome, https://www.hbxsystem.com.br, login em .test-login.local.md)
- [ ] Reporte final

## Decisões de UX
- **Entrada dupla:** (a) botão "expandir" (⤢) no header do painel Detalhes lateral — prop nova
  OPCIONAL `onExpand` em `DetalhesNegocio` (só Vendas passa; Atendimento/Leads intactos);
  (b) **duplo-clique na linha** da lista do pipeline abre o cockpit direto.
- **Overlay padrão central:** `.hbx-veil` + moldura grande (~min(1180px,94vw) × ~88vh),
  classes novas `.lead-cockpit-*` em `screens.css`. Esc/veil/✕ fecham. SEM re-centralizar inline.
- **3 guias com Glass Pill** (Lei nº2 — seleção ativa = glass pill deslizante,
  `useGlassPill`/`<GlassPill>` de `components/hbx/glass-pill.tsx`):
  1. **Atendimento** — WhatsApp + E-mail + inteligência de abordagem + agenda do lead.
  2. **Cadastro** — ficha completa (contato + empresa RFB rica + origem + datas), copy-1-clique.
  3. **Financeiro** — SÓ admin (`board.canViewValues`); vendedor nem vê a guia (LEI DO VENDEDOR).
- Header do cockpit: avatar (`Av`), nome + razão social, segmento, cidade/UF, badges de etapa
  (`statusLabel`) + temperatura + score de oportunidade; ações rápidas: ligar (`tel:`), copiar CNPJ.

## Guia 1 — Atendimento
- **WhatsApp embutido:** reusar `ConversationPanel` (`components/hbx/detalhes-negocio.tsx:792`,
  props `{phone, name, draftSignal?}`) — mesmo padrão da aba WhatsApp de `/leads/[id]`.
  Conexão: `GET /inbox/whatsapp-session` → `whatsappSession.accessible`; se `false`, CTA
  "Conectar WhatsApp" abrindo `WhatsAppConnectModal` (padrão `leads/[id]/page.client.tsx:373-379`).
  Sem telefone no lead → estado vazio honesto ("Lead sem telefone").
- **E-mail direto:** reusar `EmailPanel` (`app/(app)/leads/[id]/email-panel.tsx`) OU o par
  `POST /vendas/leads/:leadId/email/presentation/{preview,send}` (já existe no backend) —
  W2 decide pelo que encaixar com menos gambiarra; se e-mail da empresa não configurado
  (status via mesmo check que a EmailPanel usa), CTA "Configurar e-mail". Lead sem e-mail →
  estado vazio honesto.
- **Inteligência de abordagem** (dados JÁ no card, gated `canSeeLeadIntelligence`): canal
  recomendado, dor (painType/painPitch), template de mensagem com botão copiar, motivo da
  oportunidade.
- **Agenda do lead:** `GET /atividades/lead/:leadId` — lista compacta de compromissos
  (próximo retorno destacado).

## Guia 2 — Cadastro (a ficha "CNPJ biz")
- **Contato:** todos os telefones (`phones[]` + badge "WhatsApp ✓" via `phonesWhatsapp`),
  e-mails (`emails[]`), website, endereço completo, cidade/UF — tudo com copy-1-clique
  (padrão `CopyField` de `leads/[id]/page.client.tsx:87-114`).
- **Empresa (RFB rica — NOVO endpoint W1):** CNPJ, razão social, nome fantasia, situação,
  CNAE + descrição, **porte, capital social, natureza jurídica, data de abertura (+idade),
  Simples/MEI, matriz/filial, quadro societário completo** (`CnpjPublicPartner`).
  Gating igual ao bloco "Empresa" atual do DetalhesNegocio (`canSeeCompanyData` / LockGate Pro).
- **Origem & sinais:** fonte (`sourceType`/`primarySource`), vezes visto, rating/reviews,
  empresa recém-aberta (🐣 `isFreshCompany`/`daysSinceOpened`), datas criado/atualizado.
- **Responsável + histórico:** owner, timeline (`lead.timeline[]`) resumida.

## Guia 3 — Financeiro (cockpit financeiro DO cliente — só admin)
- **Venda do card:** saleStatus/label, valor fechado, produto (snapshot), comissão
  (valor/status/vencimento/recorrente), implantação (setup) — campos já no `VendasLead`.
- **Extrato do cliente:** se `lead.customerProfileId` → `GET /financeiro-tenant/clientes/:id/extrato`
  (JÁ EXISTE, @Admin, commitado hoje) — saldo aberto + títulos (status, valor, vencimento, origem).
  Sem customerProfile → estado vazio ("Sem movimentações — gere a primeira cobrança").
- **Ações:** "Gerar cobrança" (`POST /vendas/lead/:leadId/gerar-cobranca`, já existe, idempotente)
  e "Marcar pago" por título (`POST /financeiro-tenant/charges/:id/quitar`, já existe).
- Guia inteira omitida quando `!canViewValues` (o backend já devolve 403 pra vendedor — o front
  não expõe nem a aba).

## W1 — Backend (pequeno, aditivo; NÃO muda contrato existente)
**Novo:** `GET /vendas/lead/:leadId/cockpit` em `vendas.controller.ts` (mesmos guards do
controller: JwtAuthGuard + ModuleAccessGuard `vendas`).
- Resolve o lead do tenant (404 se de outra empresa), deriva CNPJ **server-side** (mesma
  hidratação RadarLeadPool do board; fallback `customerProfile.cnpj`).
- Lê `CnpjPublicCompany` (+ `CnpjPublicPartner` por cnpjBasico) DIRETO do banco local —
  **zero chamada externa, zero débito de crédito**.
- Respeita o MESMO gate de tier que já esconde CNPJ/razão no board (reusar o resolver de
  entitlements que o serializer do board usa; sem tier → `company: { found:false, locked:true }`).
- Resposta:
```json
{
  "company": {
    "found": true,
    "cnpj": "...", "razaoSocial": "...", "nomeFantasia": "...",
    "situacao": "...", "cnae": "...", "cnaeDescription": "...",
    "porte": "...", "capitalSocial": 150000.0, "naturezaJuridica": "...",
    "openedAt": "2018-05-01", "simples": true, "mei": false,
    "matrizFilial": "matriz",
    "partners": [{ "name": "...", "qualification": "..." }]
  }
}
```
  (`found:false` quando sem CNPJ/sem match; campos ausentes = null → front mostra "—".)
- Checks: `npm run prisma:validate` + `npm run build` em `backend/`.

## W2 — Frontend
**Novo:** `frontend/src/components/hbx/lead-cockpit-modal.tsx` — `LeadCockpitModal({ lead, canViewValues, open, onClose })`
recebe o `VendasLead` já carregado do board (SEM refetch do lead) e busca os extras:
cockpit RFB (W1), extrato financeiro, whatsapp-session, atividades.
**Integração:** `vendas/page.client.tsx` — estado `cockpit`, duplo-clique na linha, prop
`onExpand` no `DetalhesNegocio` (opcional, default ausente = zero mudança nas outras telas).
**CSS:** `.lead-cockpit-*` SÓ em `screens.css`, montado 100% em token/classe central
(kit `.hbx-veil/.hbx-modal`, `.dn-*` onde couber). NADA de hex/inline visual (check-pele).
Máscaras BR (telefone/data) pelo helper existente — não criar regex novo em TSX.
- Checks: `npm run lint` (check-pele) + `npm run build` em `frontend/`.

## Regras que amarram este trabalho
- Lei do Vendedor: valores/financeiro só admin — backend já protege; front não expõe.
- 5 Leis do design system + glass pill em toda seleção de guia.
- Branch: direto na `master`, commit local; publish faz parte da ordem ("implante e teste").
- Dado sem contrato → "—", nunca número fake.
- WhatsApp: só fluxo do app (`/inbox/conversations/start` → `/message` via ConversationPanel);
  NENHUMA chamada nova ao motor cru.
- `.next` cacheia "Can't resolve" → se aparecer módulo fantasma no dev, apagar `.next`.

## Teste (VPS, pós-publish — Chrome)
1. Login (credenciais `.test-login.local.md` VPS) → /vendas.
2. Clicar lead → painel Detalhes → botão expandir → cockpit abre; Esc fecha; duplo-clique abre.
3. Guia Atendimento: conversa WhatsApp carrega (ou CTA conectar); e-mail preview (ou CTA configurar).
4. Guia Cadastro: CNPJ/razão/capital social/sócios reais da base RFB (lead com CNPJ, ex.: os
   "RETENTORES" de Ribeirão Preto do funil).
5. Guia Financeiro: aparece como admin; extrato/estado vazio correto; gerar cobrança NÃO será
   disparado em produção com dado real sem necessidade — validar só a renderização.
6. Console sem erro; screenshot de cada guia pro reporte.
