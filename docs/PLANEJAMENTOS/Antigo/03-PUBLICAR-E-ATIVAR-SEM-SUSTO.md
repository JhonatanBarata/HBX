# 03 — PUBLICAR E ATIVAR SEM SUSTO

## Objetivo

Levar a rodada consolidada para produção e ativar recursos dormentes um por vez, sempre com rollback claro.

## Pré-condições

- Plano 01 concluído.
- Plano 02 concluído.
- Working tree limpo.
- Migrations commitadas junto do código consumidor.
- Nenhuma flag de enforcement ligada por acidente.

## Microetapas de publicação

- [ ] 1. Conferir migrations pendentes localmente e na VPS, sem aplicar ainda.
- [ ] 2. Confirmar backup recente dos dados do tenant; não incluir a base RFB no backup comum.
- [ ] 3. Publicar somente a árvore consolidada pelo fluxo oficial do repositório.
- [ ] 4. Conferir containers/processos, migration status e logs de boot.
- [ ] 5. Rodar fumaça de login, Vendas, Entrega, Configurações e Master.
- [ ] 6. Observar erros por um ciclo antes de ativar qualquer flag.

## Ativações separadas

Cada linha abaixo é uma conversa e uma janela própria. Primeiro tenant de teste; depois um cliente.

- [ ] `HBX_SCORE_FIADO_ENABLED`: somente leitura.
- [ ] `HBX_RESUMO_DIARIO_ENABLED` + toggle do tenant: destino de teste.
- [ ] `HBX_COBRANCA_WHATS_ENABLED` + toggle do tenant: número descartável.
- [ ] `HBX_INDICACAO_ENABLED`: recarga de teste e idempotência.
- [ ] `HBX_PEDIDO_PUBLICO_ENABLED` + toggle do tenant: link piloto.
- [ ] `HBX_LOGISTICA_ENABLED`: somente após conferir cobrança e WhatsApp do tenant.
- [ ] Créditos: `ENABLED` → período `SHADOW` → `ENFORCE` por tenant, nunca tudo junto.

## Rollback

- Flag global OFF e recreate do serviço quando a flag vier de env.
- Toggle do tenant OFF quando o problema for isolado.
- Não reverter migration aditiva como primeira reação.
- Em WhatsApp, parar disparo; não reconectar chip em loop.

## Pronto quando

Produção está estável e cada feature ativa possui fumaça, dono, métrica e rollback testado.

