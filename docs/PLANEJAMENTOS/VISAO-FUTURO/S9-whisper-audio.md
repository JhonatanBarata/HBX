# S9 — TRANSCRIÇÃO DE ÁUDIO (WHISPER LOCAL) (PLANO — não construído; depende de binário no VPS)

> Cliente PME AMA áudio. Hoje áudio de WhatsApp passa batido pelo bot/classificador e obriga o
> atendente a ouvir. Whisper roda em CPU no VPS (Ryzen) — custo por minuto ~zero.

## Desenho
- Worker de transcrição com fila (mesma filosofia do enriquecimento: budget + governor):
  áudio inbound → job → `faster-whisper` (modelo `small` int8 CPU; PT-BR nativo) → texto anexado
  à mensagem na conversa (prefixo "🎙️ transcrição:") + evento pro classificador de intenção processar
  como texto normal (opt-out por áudio passa a ser detectado!).
- Infra: instalar faster-whisper no VPS (container próprio ou venv no host — decidir com regra INFRA;
  ~1GB de modelo em disco; medir RAM antes — o VPS já roda Ollama qwen3:4b).
- Flags: `HBX_TRANSCRICAO_ENABLED` default OFF + teto de minutos/dia por empresa (governor por fonte,
  padrão MOTOR: fail-closed). Duração máx por áudio (ex.: 3min; maior → não transcreve, avisa atendente).
- Cobrança: crédito por minuto transcrito via action-catalog (track-first primeiro, como tudo).
- Fase 2 (só com GPU): TTS pra bot responder em áudio — NÃO pauta agora (GTX 550 Ti morta p/ IA; piso RTX 3060).

## Gate externo (por isso é plano)
Instalação/medição no VPS é ação de infra do dono (RAM compartilhada com Ollama/Postgres 28M).
Antes de codar: rodar faster-whisper avulso no VPS com 3 áudios reais e medir RAM/tempo/qualidade.

## Esforço estimado: 1 sprint de worker (fila+integração conversa) + 1 tarde de infra (instalar/medir).
