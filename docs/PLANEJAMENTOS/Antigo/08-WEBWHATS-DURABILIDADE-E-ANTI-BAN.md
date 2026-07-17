# 08 — WEBWHATS: DURABILIDADE E ANTI-BAN

## O que não falta

A projeção de estado de conexão já foi centralizada e o ID da outbox já foi migrado para BigInt. Não refazer.

## Ordem restante

- [ ] 1. Fechar a porta 8080 externamente e documentar allowlist.
- [ ] 2. Rotacionar chave somente em janela controlada.
- [ ] 3. Subir consumer da outbox em sombra, com cursor e métricas.
- [ ] 4. Provar por 14 dias que não perde nem duplica eventos.
- [ ] 5. Desligar polling antigo por flag e ensaiar rollback.
- [ ] 6. Ligar freio de envio em sombra: spacing, jitter, warm-up e orçamento diário.
- [ ] 7. Enforce somente em número descartável; inbound recente não pode ser freado.
- [ ] 8. Fatiar `webwhats-bridge.service` por strangler e teste de caracterização.
- [ ] 9. Fatiar `messaging.service`; motor Baileys fica por último.
- [ ] 10. Remover integrações mortas do fork e medir RAM/sockets.
- [ ] 11. Criar painel de frota: reconexões, sockets, RAM, lag e alertas.
- [ ] 12. Pilotar WhatsApp Cloud API como canal opcional, na mesma inbox.

## Guardrails permanentes

- Ler `Webwhats/AGENTS.md` antes de qualquer edição.
- Um número, uma conexão.
- Nunca loop livre de reconexão.
- Teste de conexão somente em chip descartável.
- Derrubar sessão pela rotina do app.
- Publicação/restart é etapa separada de implementação.

## Pronto quando

A porta pública está fechada, eventos fluem pela outbox, envio respeita orçamento e há observabilidade suficiente para agir antes de ban ou perda de mensagens.

