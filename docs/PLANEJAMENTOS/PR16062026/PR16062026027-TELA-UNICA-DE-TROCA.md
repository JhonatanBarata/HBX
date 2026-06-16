# PR16062026027 — Tela única de troca (mostra o número ANTES de mexer em qualquer coisa)

> Lê o **023** + **026**. É a tela que o cliente vê ao escolher outro plano. Mostra o valor exato
> e **espera confirmação**. Nada acontece só por clicar (Regra de Ouro).

## OBJETIVO
Uma tela/modal único de troca de plano que, ao escolher um plano diferente, mostra:
- **Upgrade:** "Você vai pagar **R$ X agora**" (a diferença proporcional do bloco 028) +
  **se estiver em trial:** "Você vai **perder {N dias de free trial}** — tem certeza?".
- **Downgrade:** "Você tem **R$ Y de crédito**" (bloco 029) — sem cartão.
E um botão **Confirmar** que só então dispara o backend.

## FLUXO
1. Admin clica num plano diferente no catálogo (Configurações → Plano e cobrança).
2. Front pede o **cálculo** ao backend (preview, **sem efeito**): direção, valor a cobrar agora
   (upgrade) OU crédito gerado (downgrade), dias de trial que se perdem.
3. Tela mostra o número na cara + avisos. Botão **Confirmar**.
4. Confirmou:
   - **upgrade** → abre o cartão (reusa `SubscribeCardModal`/Card Brick), cobra a diferença →
     backend sobe o plano (028). Não pagou = fecha sem mudar nada.
   - **downgrade** → confirma sem cartão → backend registra crédito + agenda a descida (029).
5. Mostra o veredito (✓ liberado / ✓ crédito aplicado) e recarrega o estado do plano.

## FAZER — FRONT
- Componente novo `frontend/src/components/hbx/trocar-plano-modal.tsx` (classes `.bv-*`/`.btn-*`,
  zero hex). Recebe `fromPlan`, `toPlan`, e o preview do backend.
- `configuracoes/page.client.tsx`: o botão "Assinar este plano" / "Trocar" de cada card do catálogo
  abre este modal (em vez de ir direto pro `SubscribeCardModal`). Implantação **não** abre isto —
  abre a seleção de contato do 024.
- Preview vem de um GET/POST de cálculo (definido no 028/029) — **nunca** calcular valor no front
  (preço só do catálogo / backend).

## COPY (curta, honesta)
- Upgrade c/ trial: "Trocando agora você perde os **{N} dias** de teste e já paga **R$ X** (proporcional
  ao que falta do mês). Seguir?"
- Upgrade sem trial: "Você paga **R$ X** agora (diferença proporcional) e o acesso ao {plano} libera
  na hora."
- Downgrade: "Você continua no {plano atual} até **{data}** (já está pago). Depois cai pro {plano
  novo}. Sobra **R$ Y** de crédito pro próximo mês."

## NÃO FAZER
- Não disparar troca no clique do card — só no **Confirmar** do modal.
- Não mostrar valor pra role USER/Gerente sem cobrança (o backend já mascara; o front respeita).

## CHECKS
`cd frontend && npm run lint && npm run build`. Ao vivo (mock): trocar List→Pro mostra "vai pagar";
Pro→List mostra "crédito"; cancelar o modal não muda nada (provar que o estado fica igual).

## DEPENDE DE
**026** (rank/direção). O preview de número depende dos cálculos do **028**/**029** — pode subir a
casca do modal antes e ligar o número quando 028/029 expuserem o preview.

## STATUS
Planejado 16/06.
