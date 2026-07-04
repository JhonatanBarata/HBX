# WEBWHATS-ARQ3 — Sprint 4: Freio de envio ON + orçamento por chip

> Liga e afina o `WaSendThrottleService` (GATEWAY-WA S3, já no ar dormente). Sprint de operação
> instrumentada. Depende do Sprint 2 (eventos/telemetria fluindo) e do Sprint 3 (idade real da
> sessão). Índice: [sprint 0](WEBWHATS-ARQ3-sprint-0-visao.md).

## Problema ($)
Hoje o anti-ban proativo é só o disjuntor de reconexão + bom senso. Não existe teto de RITMO de
envio por chip: uma campanha de prospecção/recovery pode disparar rápido demais e queimar o chip
do cliente pagante. Chip banido = receita daquele cliente morta + suporte + risco reputacional. O
freio já existe (`backend/src/messaging/wa-send-throttle.service.ts`) com warm-up, isenção
inbound-24h e reagendamento sem queimar tentativa — mas está DESLIGADO.

## Fatos verificados
| Fato | Onde |
|---|---|
| Freio: warm-up por `connectedAt`, isenta inbound-24h, estouro REAGENDA (não descarta) | `backend/src/messaging/wa-send-throttle.service.ts` |
| Chamado no dispatcher antes do envio, atrás de `HBX_WA_SEND_THROTTLE_ENABLED` (OFF) | `backend/src/messaging/messaging.service.ts:8026` |
| Idade da sessão vem de `resolveSendThrottleConnectedAt` (null = maduro) | `messaging.service.ts:7917` |
| Envs de tuning já definidas (per-minute/hour/spacing/jitter/warmup) | WHATSAPP.md (GATEWAY-WA S3) |
| Zap-check guard (freio físico de verificação) já no ar | `backend/src/messaging/zap-check-guard.service.ts` |

## Entregas
1. **Ligar em modo observação primeiro (shadow):** rodar o cálculo do freio e LOGAR o que ELE
   teria bloqueado/adiado, sem ainda barrar (flag intermediária ou nível de log). 1 semana →
   dado real de quanto tráfego o teto atual pegaria. Evita descobrir o teto errado no cliente.
2. **Calibrar os tetos com número real da frota** (medir pico dos envios/dia por chip nos logs)
   antes de enforcement. Defaults do S3 são chute conservador; ajustar per-minute/per-hour ao
   padrão observado + margem.
3. **Enforcement ON:** `HBX_WA_SEND_THROTTLE_ENABLED=true`. Curva de warm-up ativa para chip novo
   (idade real vem do Sprint 3). Isenção inbound-24h preservada (responder quem te chamou é seguro).
4. **Orçamento diário por chip** (extensão do freio): teto/dia além do teto/hora, com o excedente
   REAGENDADO pro dia seguinte — não descartado. Visível no fleet-health (quanto do orçamento cada
   chip gastou hoje). Base para o dono planejar campanha sem chutar volume.
5. **Painel do freio (Master):** por chip — enviados hoje, adiados pelo freio, % do orçamento,
   idade/warm-up. Transforma anti-ban de "torcer" em "operar com painel".

## Aceite
- [ ] Shadow: relatório de 7 dias com "teria adiado X% dos envios de campanha".
- [ ] Enforcement: campanha de teste em número descartável respeita spacing/jitter (medir
      timestamps reais de saída); estouro do teto REAGENDA (msg volta a PENDING, `attemptCount`
      intacto) e sai depois — nada descartado.
- [ ] Chip novo (descartável, recém-conectado) sai devagar (warm-up); chip maduro no teto cheio.
- [ ] Resposta a inbound recente NÃO é freada (isenção 24h).
- [ ] Orçamento diário estourado → reagenda pro dia seguinte; painel mostra o consumo.

## Riscos / rollback
- Teto baixo demais atrasa venda legítima: por isso shadow + calibração ANTES do enforcement.
- Teto alto demais não protege: o painel + telemetria de reconexão (S1) mostram se um chip começa
  a flapar → sinal de queimando → apertar.
- Rollback = flag OFF + recreate. Nenhuma migração destrutiva (orçamento é coluna/contador aditivo).
- Testes de ritmo SÓ em número descartável meu; jamais calibrar no chip do dono.
