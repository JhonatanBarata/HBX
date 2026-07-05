# S6 — Painel front da carteira (Admin + Master) — RESULTADO

> Executado em worktree isolado (`.claude/worktrees/agent-a1c579bfbeb2ded46`), LOCAL. NÃO
> publicado, NÃO commitado na master. Escopo: só FRONT + fiação mínima consumindo os endpoints
> do S3-PARTE1 já existentes. Nenhuma mudança no backend de crédito.

---

## PASSO 0 — merge do backend de crédito

`git merge credits/build --no-edit` trouxe S1 (ledger) + S2 (shadow-debit) + S3-PARTE1 (catálogo/
concessão/`/credits/me`). 2 conflitos resolvidos (união dos dois lados, nenhuma remoção):

- `backend/src/app.module.ts` — `NucleoModule`/`LogisticaModule` (já no worktree) + `CreditsModule`
  (do merge) somados nos imports e no array `imports: [...]`.
- `backend/prisma/schema.prisma` — relação inversa `Company.contatos`/`Company.entregas` (já no
  worktree) + `Company.creditWallet` (do merge) somadas no model `Company`.

Confirmado: `GET /credits/me`, `GET/PUT /credits/master/packs*`,
`PUT /credits/master/config/expiry-default`, `POST /credits/master/company/:id/grant` presentes em
`backend/src/credits/credits.controller.ts` e `credits-master.controller.ts`.

## Arquivos criados (só NOVOS — nada refatorado)

- `frontend/src/components/hbx/credits-wallet-section.tsx` — painel da carteira, audiência
  ADMIN/dono. Fetch próprio de `GET /credits/me`. Renderiza ESTRITAMENTE o shape que a API manda:
  - `enabled:false` → "Recurso indisponível no momento." (flag `HBX_CREDITS_ENABLED` OFF).
  - Shape de cobrança (`balance`/`lots`/`packs` presentes) → saldo em destaque, tabela de LOTES
    (origem/concedido/restante/validade, com `tag warn` "expira em Nd" quando faltam ≤7 dias),
    grid de PACOTES disponíveis (créditos/preço/validade) com CTA "Recarregar".
  - Shape neutro (só `leadsDisponiveis`, sem `balance`/`lots`/`packs`) → só o número, sem nenhuma
    palavra de dinheiro. Este branch existe como defesa em profundidade (o componente só é
    montado atrás de `canSeeBilling` em `configuracoes/page.client.tsx`, então na prática não deve
    ser atingido hoje) — mas se algum dia o gate mudar, o componente ainda não vaza R$.
  - CTA "Recarregar": `onClick` seta uma mensagem "em breve" (`sc-msg is-warn`) — **não chama
    nenhum endpoint de checkout** (S3-PARTE2 não existe ainda).
- `frontend/src/app/(app)/master/janela-creditos.tsx` — painel MASTER, 3 guias (padrão
  `JanelaSelfCheckout`): **Pacotes** (editar título/observação/status/créditos/preço/validade de
  cada um dos 3 pacotes via `PUT /credits/master/packs/:packKey`), **Expiração** (prazo default
  global via `PUT /credits/master/config/expiry-default`), **Conceder crédito** (form empresa +
  amount + grantType + expiração opcional → `POST /credits/master/company/:id/grant`).
  - **Idempotência**: `usageKey` é gerada com `crypto.randomUUID()` UMA VEZ na abertura/reset do
    form (`useState(() => newIdempotencyKey())`), mandada em TODA chamada de `conceder()` enquanto
    o form não é resetado — double-click reusa a mesma chave (o backend dedupa e devolve
    `alreadyProcessed:true`, mostrado na tela). Ao concluir uma concessão, uma NOVA chave nasce
    para a próxima intenção (não é reusada entre concessões distintas).
  - Recebe `companies` como prop (mesma lista já carregada uma vez em `master/page.client.tsx`,
    reusada por `JanelaIntegracoes`/`JanelaEmpresas` — nenhuma chamada de rede nova para listar
    empresas).

## Arquivos alterados (aditivo — só import + nova entrada de nav/seção)

- `frontend/src/app/(app)/configuracoes/page.client.tsx`:
  - Novo import `CreditsWalletSection`.
  - `SECTIONS`/`SEC_IC`: item novo `"Créditos"` (ícone `money`, mesmo de "Plano e cobrança").
  - Filtro de visibilidade: `"Créditos"` some da nav pela MESMA régua `canSeeBilling` já usada em
    "Plano e cobrança" (`!isSeller && canViewBilling !== false` — LEI DO VENDEDOR, régua existente,
    NÃO reimplementada, só reaproveitada).
  - Render: `{sec === "Créditos" && canSeeBilling && <CreditsWalletSection />}` — bloco novo, não
    tocou em nenhum JSX existente de "Plano e cobrança"/Perfil/E-mail/etc.
- `frontend/src/app/(app)/master/page.client.tsx`:
  - Novo import `JanelaCreditos`.
  - `JANELAS`: item novo `{ id: "creditos", label: "Créditos", icon: "money" }` (logo após
    "Self-Checkout").
  - Render: `{janela === "creditos" && <JanelaCreditos companies={companies} />}` — bloco novo.
- `backend/src/app.module.ts`, `backend/prisma/schema.prisma`: só resolução de merge (ver Passo 0),
  nenhuma linha nova além da união dos dois lados.

## Como cada endpoint é consumido

| Endpoint | Consumido em | Uso |
|---|---|---|
| `GET /credits/me` | `credits-wallet-section.tsx` | `useEffect` no mount; re-render pelo shape (`enabled`, `balance`/`lots`/`packs` OU `leadsDisponiveis`) |
| `GET /credits/master/packs` | `janela-creditos.tsx` (guia Pacotes) | Lista os 3 pacotes (com pausados) no `<select>`; popula o form ao trocar de pacote |
| `PUT /credits/master/packs/:packKey` | `janela-creditos.tsx` (guia Pacotes → "Salvar pacote") | Body `{title,observation,status,credits,price,defaultExpiryDays}` |
| `PUT /credits/master/config/expiry-default` | `janela-creditos.tsx` (guia Expiração) | Body `{defaultExpiryDays}` |
| `POST /credits/master/company/:id/grant` | `janela-creditos.tsx` (guia Conceder crédito) | Body `{amount, grantType, usageKey, expiresAt?}` — `usageKey` SEMPRE presente |

## Decisões

1. **Onde entrou a seção do admin**: dentro de `configuracoes/page.client.tsx` como nova aba
   "Créditos", ao lado de "Plano e cobrança" — é literalmente a mesma família de tela (cobrança do
   tenant) e já tem a régua `canSeeBilling` pronta. Criar uma rota nova (`/creditos`) duplicaria
   navegação e guard sem necessidade; o padrão do projeto para "coisas de cobrança do tenant" já é
   essa tela.
2. **`CreditsWalletSection` faz fetch próprio** (em vez de subir estado pro componente pai) —
   segue o padrão de `CompanyEmailSection`/`MetaLeadAdsSection`, que também são seções
   self-contained plugadas em `configuracoes`.
3. **Pacote "card" no grid** usa `.panel` + `.sc-field` (classes já existentes) em vez de inventar
   uma classe `.credit-pack-card` nova — evita crescer o CSS central por um layout que já existe
   (grid de 4 colunas responsivo, mesma classe usada pelo catálogo de planos).
4. **Guia "Expiração" não tem GET** — o backend S3-PARTE1 só expõe `PUT
   /credits/master/config/expiry-default` (sem endpoint de leitura do valor atual). O campo nasce
   vazio com placeholder "90" (o default de código). Documentado como comentário no arquivo —
   fora de escopo mexer no backend para adicionar o GET.
5. **`crypto.randomUUID()` sem lib nova** — é API nativa do browser (contexto seguro/localhost),
   nenhum pacote novo instalado. Fallback defensivo (`grant-${Date.now()}-${random}`) cobre browser
   muito antigo/contexto não-seguro, sem quebrar a idempotência (ainda é estável por abertura do
   form).

## Checks

```
cd frontend && npm ci                    → node_modules instalado no worktree isolado (era vazio)
cd frontend && node ./scripts/check-pele.mjs
  → 12 violações R1 pré-existentes, TODAS em bot-builder.css/screens.css/whatsapp.css
    (confirmado via `git show master:...`: já existiam antes desta sessão, não tocados por mim).
    NENHUMA violação nos 2 arquivos novos nem nos 2 arquivos editados desta tarefa.
cd frontend && npm run build             → Next.js 16.1.4, TypeScript OK, 36 rotas geradas, sem erros
cd backend  && npm ci                    → node_modules instalado no worktree isolado (era vazio)
cd backend  && npm run build             → prisma generate OK + tsc sem erros
```

O check-pele "reprovando" é uma quebra PRÉ-EXISTENTE do repositório (12 ocorrências de
`rgba(...)`/`#1C1C1E` em 3 arquivos CSS legados, nenhum tocado nesta tarefa) — fora do escopo
deste sprint (que é só consumir os endpoints de crédito, não sanear CSS legado do bot/whatsapp).

## Confirmações pedidas no prompt

- **(a)** Nenhum R$/pacote/preço é renderizado fora da audiência de cobrança: `CreditsWalletSection`
  só entra na tela atrás de `canSeeBilling` (mesma régua de "Plano e cobrança"); mesmo se montado
  fora dessa régua, o branch neutro (sem `balance`/`lots`/`packs` no payload) mostra só
  `leadsDisponiveis`. No painel MASTER, preços dos pacotes são naturalmente visíveis ao master
  (audiência de administração, não de vendedor) — mesmo padrão de `JanelaSelfCheckout`.
- **(b)** O form de concessão manda `usageKey` (UUID) em TODA chamada de `POST
  /credits/master/company/:id/grant` — gerado uma vez por abertura/reset do form, nunca omitido.
- **(c)** Só arquivos NOVOS no front: `credits-wallet-section.tsx` e `janela-creditos.tsx`. Os 2
  arquivos existentes tocados (`configuracoes/page.client.tsx`, `master/page.client.tsx`) receberam
  só import + 1 linha de nav + 1 linha de render cada — nenhum JSX/lógica pré-existente foi
  alterado, removido ou reformatado.

## Fora de escopo (não feito, por design)

- Checkout MercadoPago real (S3-PARTE2) — botão "Recarregar" é só um aviso "em breve".
- Débito/enforce de crédito nos fluxos de venda (S2 backend já existe como shadow, sem UI aqui).
- Qualquer alteração no backend de crédito além da resolução de merge.
- Refatoração de `buscar-empresas`, `leads`, `vendas`, `dashboard` ou qualquer tela fora do
  aditivo descrito acima.
