# PR16062026035 — MASTER COM MAIS DECISÕES SOBRE AS EMPRESAS

> **Ordem do dono (16/06):** "preciso q ele [o Master] tenha mais decisões nas empresas,
> não vou palpitar, quero q vc leia e responda para onde seguimos, ficou seco, não consigo
> um monte de acesso." Análise feita lendo o /master inteiro (front + endpoints). **Nada de
> código aplicado** — o dono pediu só o plano escrito.

## DIAGNÓSTICO (o "seco" não é falta de poder no backend — é o painel estrangulado)

O backend já expõe, por empresa, um baralho grande de decisões
(`backend/src/modules/modules.controller.ts:425-702`): plano, cortesia, módulos por exceção,
trial, suspensão, limites de cards, **teto de assentos (`seatCap`)**, condições de cobrança,
credenciais master (WA/MP), pagamento manual, perfil cadastral, excluir, assumir contexto.

**Por que "ficou seco":** o painel esconde quase tudo atrás da régua única (PR13062026007).
Em `frontend/src/app/(app)/master/janela-empresas.tsx:596`:

```ts
const isFull = String(c?.selectedPlanKey || "").toLowerCase() === "hbx_melhor";
```

Cortesia (`:745`), Módulos (`:745`), Trial/Suspensão (`:871`), Limites/Assentos +
Condições + Credenciais (`:948`), aba Financeiro (`:1040`), aba Implantação (`:1093`) e o
filtro das abas (`:801`) **só aparecem no Full**. Para List/Lead (a maioria, o self-service)
sobra: editar perfil, usuários, excluir, plano, auditoria. Daí a sensação de painel vazio.

**Por que "não consigo um monte de acesso" (literal, dois travamentos):**
1. **O Master não cria acesso.** O único caminho de nascer usuário numa empresa é
   `POST users/company/create` — `@Admin()` amarrado ao `req.user.companyId`
   (`backend/src/users/users.controller.ts:1112`). Ou seja, **só o admin da própria empresa**.
   Do /master só dá pra editar / resetar senha / excluir (`/users/master/:id*`). Não existe
   "dar mais um acesso pra empresa X".
2. **O teto de assentos barra e está escondido.** `users.controller.ts:1133` bloqueia criar
   acesso além do `seatCap`; o campo que sobe esse teto vive dentro do bloco `isFull`
   (`janela-empresas.tsx:948`) → em List/Lead nem se enxerga o teto pra levantar. O setter
   já existe: `PUT modules/master/company/:id/card-quota` → `modules.service.ts:4847`.

## BLOCOS (ordem do mais barato → caro; recomendo 1 → 2 → 3)

### Bloco 1 — Soltar acesso + assentos (ataca o reclamo direto)
**Resolve:** "não consigo um monte de acesso."
- **Backend (novo):** endpoint master-only pra criar acesso em QUALQUER empresa, ex.
  `POST modules/master/company/:companyId/access` (ou `users/master/company/:companyId`),
  com `MasterGuard`. Reusa `usersService.create({...,, companyId})` — NÃO duplicar a lógica
  do `createCompanyUser`; extrair o miolo se preciso. Body mínimo: `{ role: 'ADMIN'|'USER',
  email|username, name?, phone?, password? }`. Espelha o padrão senha-opcional do
  `users.controller.ts:1181` (com senha = troca no 1º login; sem senha = nasce sem acesso).
- **Assentos:** expor o controle de `seatCap` (e cards/mês, cards/dia) **fora** do `isFull`.
  O endpoint `PUT .../card-quota` já aceita qualquer empresa; é só tirar o gate no front.
  Decisão do Master ao criar acesso acima do teto: ou **sobe o teto junto** (1 clique) ou
  barra com a mensagem que já existe (`users.controller.ts:1134`).
- **Invariante:** backend é a verdade da autorização; ação auditada (cai na `auditTimeline`
  que o detalhe já mostra). Toca auth → **só com ordem do dono na tarefa** (regra
  PAGAMENTOS.md). Relacionado, mas distinto, do bloco **034** (cadastro simples/completo do
  lado da EMPRESA) — aqui é o lado MASTER.

### Bloco 2 — Tirar a régua do painel (conserta o "seco" inteiro)
**Resolve:** painel vazio em List/Lead.
- **Front-only** (`janela-empresas.tsx`): mostrar **cortesia, suspensão, módulos, limites e
  assentos em toda empresa**, não só no Full. O backend desses controles já é plano-neutro;
  é remover/relaxar o `isFull` nos blocos `:745`, `:871`, `:948` e no filtro de abas `:801`.
- **Manter no Full** (não é decisão genérica de acesso): aba **Financeiro** (`:1040`) e aba
  **Implantação** (`:1093`) e "Condições de cobrança" — ou mostrar read-only fora do Full.
  Decidir caso a caso ao implementar; default = manter no Full.
- **Invariante crítico:** isto reabre **só o painel do Master**. NÃO desfaz a régua
  "List/Lead = automático" do lado do CLIENTE (o que a empresa vê nas próprias telas). É o
  dono reabrindo o que ele mesmo enxugou — mas só pra ele, no /master.

### Bloco 3 — Decisões novas (maior, depois)
**Resolve:** ampliar o que o Master decide além do que já existe no backend.
- **WhatsApp por empresa pelo Master:** forçar desconectar / reatar / resetar conexão a
  partir do /master (hoje o controle vive nas telas da empresa). Ver
  `backend/src/companies/whatsapp-modal.service.ts` + `master-whatsapp-situation.ts`.
- **Falar com o admin:** mandar e-mail/mensagem pro admin da empresa de dentro do painel
  (reusa `CompanyMailer` / templates do `/master`).
- **Cobrança:** resetar carência/dunning, pausar cobrança (encosta em PAGAMENTOS — só com
  ordem; backend com teste).
- **Travar telas/módulos** além do plano (override fino por empresa).

## RESTRIÇÕES (PAGAMENTOS.md — valem mesmo com autorização)
Backend é a verdade da autorização; criar acesso = auth/autorização (Bloco 1 e 3 tocam isso);
assentos/cobrança encostam em $; tudo auditado; vendedor (role USER) nunca vê valor/cobrança;
**não reintroduzir trial sem cartão**; nada em PRODUÇÃO sem ordem na hora; visual só em
token/classe central (5 Leis).

## ESTADO
Planejado. Nada aplicado. Esperando o dono dizer qual bloco travar primeiro.
