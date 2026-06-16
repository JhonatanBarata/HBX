# PR16062026023 — INDEX: Upgrade/Downgrade automático + Implantação por contato + Destruição

> **Ordem do dono (16/06).** Fechamos o modelo de troca de plano. Este doc é a **porta de
> entrada**: o Sonnet lê ISTO primeiro, entende a Regra de Ouro e os invariantes, e só depois
> executa cada bloco (024→032), **um de cada vez, na ordem**.
>
> **Cobrança é território travado (`docs/Rules/PAGAMENTOS.md`).** Cada bloco abaixo já carrega o
> "go" do dono. Mesmo assim: NÃO ampliar escopo, NÃO mexer em preço de plano vivo, NÃO inventar
> endpoint fora do que o bloco pede.

## A REGRA DE OURO (vale para TODOS os blocos)
**Nada muda enquanto o cartão não confirma.** Clicar num plano **não** altera plano, módulo nem
entitlement. O backend só **sobe ou corta** acesso:
- no **upgrade** → quando o pagamento da diferença é confirmado;
- no **downgrade** → na confirmação explícita do cliente (que **não cobra nada** — vira crédito).

Se a pessoa **não pagar**, o estado anterior fica **intacto** (zero efeito colateral). É o modelo
do GPT/Claude: tem trial → pagou usa → não pagou, beleza.

## INVARIANTES (não quebrar em nenhum bloco)
1. **Só ADMIN com cobrança** (`assertCanManageBilling` no financeiro / `canSelectPlan` no
   commercial-plans). Vendedor e Gerente (canViewBilling=false) **nunca** veem valor nem trocam.
2. **Backend é a fonte de verdade.** Entitlement só segue o plano **depois** que o provedor
   confirma. Nunca liberar feature paga sem pagamento (red flag do PAGAMENTOS.md).
3. **Estado canônico `Company.status`** (`resolveCompanyAccessState`). Sem campo legado, sem
   re-derivar de campo cru.
4. **Preço só do catálogo** (`commercial-plan-catalog.ts`). Nada de número à mão no front.
5. **Recalcular assento na troca** — usuários inclusos mudam: List 1 / Lead 2 / Pro 3 /
   Implantação 5 (`COMMERCIAL_PLAN_INCLUDED_USERS`). O extra (`extraUserMonthly`) entra no cálculo.
6. **Implantação (ex-HBX Company / `hbx_melhor`) está FORA do self-checkout** nos dois sentidos.
   Não dá pra assinar nem cair como destino de cobrança automática. Vira **card de contato**.
7. **Direção da troca = ranking de preço mensal:** List 49 < Lead 99 < Pro 249. (Implantação não
   entra no ranking pago — é contato.) Subir = upgrade (cobra diferença). Descer = downgrade (crédito).

## MAPA DOS BLOCOS (ordem de execução)
| Bloco | Assunto | Risco |
|---|---|---|
| **024** | Implantação: renomear `hbx_melhor` → **"Implantação"**, esconder preço, virar card de contato (Email/WhatsApp/Telefone) — FRONT | médio |
| **025** | Implantação: endpoint de e-mail do botão "Email" → `jhonatan@hbxsystem.com.br` — BACKEND | baixo |
| **026** | Regra de Ouro no código + ranking de plano + **liberar o Pro** no caminho de troca | médio |
| **027** | Tela única de troca (mostra o número ANTES: "vai pagar R$ X" / "tem R$ Y de crédito") — FRONT | médio |
| **028** | Upgrade: cobrar a diferença proporcional e **só então** subir o plano; upgrade pro Pro aciona suporte do bot — BACKEND | **alto** |
| **029** | Downgrade: vira **crédito**, sem cartão; mantém o tier até compensar os dias pagos — BACKEND | **alto** |
| **030** | Cancelamento: mantém os dias já pagos + botão "Falar com o suporte HBX" (sem reembolso automático) | médio |
| **031** | DESTRUIÇÃO (auditoria primeiro): mapear regra morta de cobrança — **read-only**, gera lista | baixo |
| **032** | DESTRUIÇÃO (executar): remover o que a 031 provou morto (chaves legadas, porta morta do `select`), preservando o **módulo** `hbx_recovery` | médio |

## CONTATOS OFICIAIS (usar exatamente isto)
- **Telefone / WhatsApp do dono:** `+5519997024884` (mesmo número nos dois).
- **E-mail da Implantação:** `jhonatan@hbxsystem.com.br`.

## ALINHAMENTO COM DOCS QUE JÁ EXISTEM (não brigar com eles)
- **006 (fonte única de planos)** e **011 (/planos com preço)** mandam o front ler preço do
  `public-catalog`. O bloco 024 **adiciona** `contactOnly` no catálogo e faz o `public-catalog`
  **omitir o preço** da Implantação — assim os 3 lugares (casca, /planos, checkout) escondem o
  preço dela naturalmente, sem hardcode. Não reescrever 006/011; só respeitar a flag.

## CHECKS POR BLOCO (mínimo)
- Backend: `cd backend && npm run prisma:validate && npm run build` (+ testes do que tocou).
- Frontend: `cd frontend && npm run lint && npm run build` (check-pele tem que passar).
- Ao vivo (dev, `PAYMENTS_PROVIDER=mock`): provar o caminho tela-a-tela antes de marcar feito.

## STATUS
Planejado 16/06 — blocos abertos. Executa na ordem, marca cada um como feito no rodapé do
próprio bloco. **Não rodar nada de cobrança LIVE sem o dono** (mock em dev é livre).
