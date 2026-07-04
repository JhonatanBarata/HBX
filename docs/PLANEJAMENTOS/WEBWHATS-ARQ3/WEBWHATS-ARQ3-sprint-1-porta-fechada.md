# WEBWHATS-ARQ3 — Sprint 1: Porta fechada (P0) + BigInt da outbox publicado

> Ordem de serviço autocontida. NÃO executar sem ordem do dono (mexe em rede da VPS e publica
> migration). Índice: [sprint 0](WEBWHATS-ARQ3-sprint-0-visao.md).

## Problema ($)
**Confirmado de fora da VPS em 03/07/2026:** `http://<ip-vps>:8080/` responde 200 pra internet
inteira (manager do Evolution público) e os endpoints da API seguram numa ÚNICA apikey estática
(`AUTHENTICATION_API_KEY`). `ufw status` = inactive; bind = `0.0.0.0:8080`. Evolution API é
software com CVE conhecido e alvo de scanner automático. Um bypass/bruteforce = controle da frota
de chips (mandar mensagem como o cliente, derrubar sessão, ler conversa). Risco existencial e a
correção custa ~1 hora.

Aproveita a janela de deploy pra publicar o fix `EventOutbox.id Int→BigInt` que já está pronto
(branch `claude/objective-kilby-c68cd6`, commit `e4934eea`) — barato agora (tabela ≤ 7 dias de
retenção), caro depois.

## Fatos verificados
| Fato | Onde |
|---|---|
| Motor lê `process.env.HOST` no listen; default `0.0.0.0` | `Webwhats/src/main.ts:160` |
| Backend fala com o motor por `http://172.18.0.1:8080` | `WHATSAPP_MODAL_INTERNAL_URL` no `.env` do backend (VPS) |
| Ollama já usa o padrão certo: bind `172.18.0.1:11434` | `ss -ltnp` na VPS |
| Consumer S2 e fleet-health usam a MESMA env de URL interna | `backend/src/messaging/webwhats-outbox-consumer.service.ts:78` |
| Fix BigInt: schema pg+mysql + migration + cursor string no controller | branch `claude/objective-kilby-c68cd6` |

## Entregas
1. **Bind interno do motor**: `HOST=172.18.0.1` no `/root/HBX/Webwhats/.env` (mesmo padrão do
   Ollama). Motor some da internet; backend (Docker → gateway da bridge) continua alcançando.
2. **Firewall como segunda camada**: UFW com allowlist mínima (22/tcp, 80, 443 e o que o
   levantamento provar necessário) + `deny incoming` default. **Ordem anti-lockout**: `ufw allow
   22` ANTES de `ufw enable`; manter sessão SSH aberta de teste.
3. **Rotação da `AUTHENTICATION_API_KEY`** (esteve exposta a tentativa pública — higiene):
   gerar chave nova, atualizar `.env` do motor + `WHATSAPP_MODAL_API_KEY` do backend no MESMO
   deploy (senão a ponte quebra).
4. **Fix BigInt publicado**: merge do branch `claude/objective-kilby-c68cd6` → publish (o
   `db:deploy` do publish aplica a migration `20260703030000_eventoutbox_id_bigint`).

## Passos
1. **Levantamento (read-only)**: listar TUDO que fala com `:8080` hoje — grep nas envs de
   backend/frontend/ops-control por `8080`; conferir se o manager web é usado por alguém (dono
   usa?). Se algo externo legítimo usar a porta pública, PARAR e reportar antes de fechar.
2. Aplicar `HOST=172.18.0.1` no `.env` do motor → `systemctl restart webwhats` (⚠️ restart
   re-linka chips: comprovadamente seguro, close 515/428 momentâneo + re-open; fazer em horário
   calmo). Validar: `ss -ltnp | grep 8080` mostra bind interno; `curl` de fora TIMEOUT; backend
   segue enviando (mandar mensagem de teste via app).
3. UFW: `ufw allow 22 && ufw allow 80 && ufw allow 443` (+ portas provadas no passo 1) →
   `ufw enable` com sessão paralela aberta → smoke: app no ar, SSH ok, publish de teste depois.
4. Rotação de apikey: gerar, trocar nos DOIS lados, `systemctl restart webwhats` + recreate do
   backend (mudança de env em container = RECREATE, regra INFRA), smoke de envio/recebimento.
5. Merge + publish do BigInt; conferir `\d "EventOutbox"` = bigint e consumer lendo id string.

## Aceite
- [ ] `curl http://<ip>:8080/` de FORA da VPS: timeout/refused.
- [ ] `GET /health/fleet` de DENTRO (via 172.18.0.1) responde com a frota.
- [ ] Mensagem de teste enviada e recebida pelo app depois da rotação.
- [ ] `EventOutbox.id` = bigint na VPS; outbox segue incrementando.
- [ ] `ufw status` = active com allowlist mínima documentada no INFRA.md.

## Riscos / rollback
- Bind errado → backend não alcança o motor: rollback = voltar `HOST` e restart (1 min).
- UFW lockout → NUNCA enable sem allow 22 aplicado e sessão de reserva aberta; console do
  provedor é o plano C.
- Restart do motor re-linka chips — seguro comprovado, mas NÃO fazer junto com campanha ativa.
