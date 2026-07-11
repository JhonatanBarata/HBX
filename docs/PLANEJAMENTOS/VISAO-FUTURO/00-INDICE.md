# ÍNDICE — VISAO-FUTURO (11/07/2026)

> Origem: brainstorm `docs/PLANEJAMENTOS/ROADMAP-VISAO-FUTURO.md` + ordem do dono 11/07:
> S1 ATIVA agora; S2-S6 DORMENTES (código pronto, flag OFF, master ativa sozinho);
> S7-S10 só plano. **GUIA-ATIVACAO-MASTER.md é o passo a passo de ativação sem IA.**
> Padrão da casa: 1 `.md` = 1 worker; concluiu e conferiu → pode deletar o `.md` (git preserva).

| Sprint | Estado | Flag(s) | O quê |
|---|---|---|---|
| [S1](S1-modo-distribuidora.md) | 🟢 ATIVA (sem flag — gate natural: empresa só-logística) | — | Desktop vira sistema avulso de distribuidora (mobile já era) |
| [S2](S2-cobranca-whatsapp.md) | 😴 DORMENTE | `HBX_COBRANCA_WHATS_ENABLED` + toggle tenant | Cobrança avisa no WhatsApp com PIX + lembrete de vencimento |
| [S3](S3-resumo-diario-dono.md) | 😴 DORMENTE | `HBX_RESUMO_DIARIO_ENABLED` + toggle tenant | Resumo diário do negócio no WhatsApp do dono |
| [S4](S4-score-de-fiado.md) | 😴 DORMENTE | `HBX_SCORE_FIADO_ENABLED` | Score de pontualidade do cliente final na ficha |
| [S5](S5-indicacao-com-creditos.md) | 😴 DORMENTE | `HBX_INDICACAO_ENABLED` | Indique e ganhe créditos (bônus na 1ª recarga paga) |
| [S6](S6-portal-pedido-publico.md) | 😴 DORMENTE | `HBX_PEDIDO_PUBLICO_ENABLED` + toggle tenant | Link público "peça seu galão" → entrega na rota |
| [S7](S7-painel-contador.md) | 📋 PLANO | — | Painel do contador multi-empresa (canal de venda) |
| [S8](S8-sdr-ia-piloto.md) | 📋 PLANO | — | SDR de IA — piloto manual-assistido (aposta 12m+) |
| [S9](S9-whisper-audio.md) | 📋 PLANO | — | Transcrição de áudio Whisper local (gate: infra VPS) |
| [S10](S10-export-dados-tenant.md) | 📋 PLANO | — | Export "seus dados são seus" (CSV 1-clique) |

Execução 11/07 (orquestrada): Onda A = S1 · Onda B = S2 · Onda C = S3 ∥ S4 · Onda D = S5 ∥ S6.
Guardrails transversais: flags nascem OFF; migration é ARQUIVO (dono aplica); WhatsApp SÓ pela rotina
do app com teto+disjuntor; commits por path (sessão paralela da frente Financeiro no mesmo tree).
