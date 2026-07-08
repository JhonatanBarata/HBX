# F1 — RESULTADO (07/07, orquestrador direto — frente financeira c/ revisão de diff)

## O que entrou
1. **Saldo devedor + extrato NA FICHA do app** (`/entrega/clientes`, edição): seção "Conta" com
   valor em aberto ("Em dia"/"Em aberto"), "R$ X fecham no mês" e extrato expandível (30 últimas
   cobranças, pago/aberto). Reusa `GET /logistica/clientes/:id/extrato` (R2, só o ERP via) que
   agora devolve `saldoAberto`/`aguardandoFechamento`. **Gate**: módulo financeiro OFF → seção não
   aparece e o extrato nem é buscado (LEI M4 estendida à ficha).
2. **QR Pix custo-ZERO na chegada**: `pix-brcode.ts` gera o BR Code EMV completo no aparelho
   (TLV + CRC16-CCITT/FALSE **validado contra o vetor padrão 29B1 e o payload canônico do manual
   BCB**); QR desenhado pelo `QrCanvas` local (zero lib nova, zero API, zero taxa — cai direto na
   conta do tenant). Aparece quando o pagamento é Pix NESTE ato (cliente `aberto` que tocou o chip
   Pix, ou `na_hora`+`metodoPadrao=pix`) e a chave está configurada. Copia-e-cola incluído.
   Config em Ajustes → "Pix na entrega" (chave/nome/cidade; nome/cidade normalizados p/ EMV no
   backend). `LogisticaConfig.pixChave/pixNome/pixCidade` (migration aditiva).
3. **Limite de fiado por cliente** (`CustomerProfile.limiteFiado`): campo na ficha (parse BR
   "1.500,00" ok); na chegada, badge "Deve R$ X" (módulo ON + saldo > 0) que vira alerta
   "· COBRAR" quando estoura o teto. Nunca bloqueia.
4. **FIX de dinheiro (achado na revisão do código)**: o confirmar gravava `qtdEntregue` do stepper
   mas NÃO recalculava `Entrega.valor` → **entregou 3, cobrava 2**. Agora, dentro da MESMA tx do
   Passo 1 (só escrita local), valor = Σ qtdEntregue×valorUnit quando o payload trouxe itens com
   preço; entrega legada intocada. O charge nasce do valor entregue. O QR do app faz a MESMA conta
   ao vivo no stepper.

## Blindagens preservadas (conferidas)
Idempotência do confirmar (replay por key/status) intacta; 1 charge por entrega; nada dispara MP
(`MANUAL`); módulo OFF → dinheiro não aparece nem roda (rota só agrega saldo com módulo ON);
`saldoAbertoPorClientes` = fonte ÚNICA do "quanto me deve" (rota e extrato nunca divergem).

## Revisão de diff (8 ângulos + verificação)
Aplicados: parse BR do limite (bug real: "1.500,00"→NaN limpava o teto em silêncio), gate do
módulo na ficha, saldo condicionado ao módulo ON, helper único de saldo. Não aplicados (com
razão): data por slice de ISO (evita shift de timezone do toLocaleDateString em date-only);
re-agregação a cada confirmar (aceitável ≤50 paradas; futura otimização = saldo no retorno do
confirmar + merge local).

## Checks
`prisma validate` ✅ · backend build ✅ · **testes logistica 52/52** (2 novos F1: recálculo do
valor + payload sem itens não recalcula) ✅ · front `tsc --noEmit` ✅ · check-pele: catraca
497/495 é estado PRÉ-EXISTENTE (memória 07/07), zero style inline novo nos arquivos do F1.

## Arquivos
Backend: schema.prisma, migrations/20260707200000_logistica_financeiro_ficha, logistica/{dto,
config.service,controller,service,service.test}, nucleo-cadastro.service (limiteFiado no detail).
Front: entrega/{pix-brcode.ts NOVO, ArrivalSheet, page.client, clientes-api, clientes/page.client,
ajustes/page.client, entrega-api, gestao-api}, hbx-theme/entrega.css (+~150 linhas ent-divida/
ent-pix/ent-saldo/ent-extrato).

## Pendências (fora do F1)
- Migration é aplicada no deploy (padrão N1 — dono publica quando quiser).
- Otimização futura: saldo atualizado no retorno do confirmar (evita re-agregar a rota).
