# PR16062026024 — Implantação: renomear, esconder preço, virar card de CONTATO

> Lê o **023** antes. Plano alvo: `hbx_melhor` (hoje "HBX Company"). Vira **"Implantação"**,
> **sem preço**, **sem botão de assinar** — um card que abre uma seleção de contato.

## OBJETIVO
1. Renomear o título exibido de `hbx_melhor` para **"Implantação"** (definitivo).
2. **Esconder o preço** dela em TODA superfície de cliente (catálogo, /planos, register, checkout,
   configurações).
3. Trocar o CTA dela por uma **tela de seleção de contato**: **Email · WhatsApp · Telefone**.

## ⚠️ CUIDADO QUE NÃO PODE FALHAR (porta atrás da porta)
**NÃO apague o preço interno.** `COMMERCIAL_PRICING.melhorMonthly` e o `monthlyPrice` do catálogo
ainda alimentam o cálculo de cobrança de quem **já é Company** (cortesia/manual/contrato). Se
zerar, o billing breakdown dessas empresas vira R$ 0.
→ Solução: **manter o número interno**, só **não exibir**. Use uma flag `contactOnly: true`.

## FAZER — BACKEND (catálogo)
Arquivo: `backend/src/commercial-plans/commercial-plan-catalog.ts`
1. `getCommercialPlanTitle()`: no caso `MELHOR`, retornar `'Implantação'` (era `'HBX Company'`).
2. Em `buildCommercialPlansCatalog()`, no objeto do `MELHOR`:
   - trocar `title: 'HBX Company'` → `title: 'Implantação'`;
   - adicionar `contactOnly: true`;
   - manter `monthlyPrice` e `priceFrom` como estão (uso interno) — **não** mexer no número;
   - ajustar `badge`/`headline`/`description` se citarem "Company" (manter sentido: implantação
     feita pela HBX, contato direto). **Não** prometer self-checkout.
3. Não tocar em `getCommercialPlanMonthlyPrice` / `COMMERCIAL_PRICING` (billing interno intacto).

Arquivo: `backend/src/commercial-plans/commercial-plans.controller.ts` (`getPublicCatalog`)
4. No `.map(...)`, quando `plan.contactOnly` for true: devolver `monthlyPrice: null` (e pode
   incluir `contactOnly: true` no payload público). Assim a casca/`/planos`/checkout escondem o
   preço sem hardcode (alinha com 006/011).

## FAZER — FRONT (esconder preço + card de contato)
Regra geral: **onde houver preço de plano, se `contactOnly` (ou `monthlyPrice == null`), não
renderizar preço** e trocar o botão de assinar por **"Quero implantação"** que abre a tela do bloco.

1. `frontend/src/app/(app)/configuracoes/page.client.tsx` (seção "Plano e cobrança", catálogo):
   - já existe o ramo `p.requiresAssistedSetup` → hoje mostra "Falar com a HBX" (`setConfirmFull`).
     Trocar esse caminho por **abrir a tela de seleção** do bloco (componente novo). Esconder
     `fmtPreco` quando `contactOnly`. O `ConfirmFull` antigo pode ser aposentado aqui (a 032 limpa
     o `requestFullPlan` se ninguém mais usar).
2. `frontend/src/app/page.client.tsx` (casca / vitrine) e `frontend/src/app/planos/page.client.tsx`:
   - o card da Implantação não mostra número; CTA leva pra mesma seleção de contato (ou pro
     `/planos` e lá abre a seleção). Sem preço, sem "a partir de".
3. `frontend/src/components/hbx/checkout-panel.tsx` e `register/page.client.tsx`:
   - Implantação **não** é comprável: se cair aqui, mostrar o bloco de contato, não o checkout.
4. `frontend/src/components/hbx/planos-editor.tsx` (editor master de planos): se exibe preço da
   Implantação, respeitar `contactOnly` (não quebrar o editor; só não vender).

## A TELA DE SELEÇÃO DE CONTATO (componente novo)
Criar `frontend/src/components/hbx/implantacao-contato.tsx` — reusa classes `.bv-*`/`.btn-*`
(Lei 5: zero hex/estilo inline novo). Três opções:
- **Telefone** → link `tel:+5519997024884` (abre o discador; já funciona nativo).
- **WhatsApp** → abre `https://wa.me/5519997024884` (novo a aba). Já é o padrão do sistema
  (`supportWhatsAppUrl`).
- **Email** → abre um **quadradinho de texto** (textarea) pra pessoa escrever + botão "Enviar".
  Ao enviar → `POST` do **bloco 025** (manda pro `jhonatan@hbxsystem.com.br`). Mostrar sucesso
  ("Recebemos! A HBX te chama.") e erro com o WhatsApp como plano B.

## NÃO FAZER
- Não deletar `melhorMonthly` nem o `monthlyPrice` do catálogo.
- Não liberar assinatura/checkout pra Implantação (ela continua bloqueada em `select` e
  `createSubscription` — está certo assim).
- Sem hex/estilo visual em TSX (check-pele).

## CHECKS
`cd frontend && npm run lint && npm run build`; `cd backend && npm run build`.
Ao vivo: catálogo em Configurações mostra "Implantação" **sem preço** + botão que abre a seleção;
`/planos` e a casca também sem preço; os 3 botões de contato funcionam (email cai no 025).

## DEPENDE DE
Nada (pode ser o primeiro a rodar). O botão "Email" só fecha o fluxo com o **025**.

## STATUS
Planejado 16/06.
