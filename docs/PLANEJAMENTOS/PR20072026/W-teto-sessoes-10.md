# W — Teto de sessões web multi-sessão: 4 → 10

## Contexto (dados de prod, 20/07)
Mesmo com o service-login (`ops:true`, PR19072026) tirando os robôs da faixa humana, o dono
continuou sendo despejado do /master por `session_limit_reached`: uma sessão-zumbi de robô
(criada antes do restart do agent, já revogada à mão no banco) ocupava 1 vaga, e o teto de 4
(`MAX_ADMIN_WEB_SESSIONS`) é apertado pro uso real do dono — celular + múltiplas
janelas/perfis de Chrome + app. Cada login novo despejava a sessão mais ociosa DELE MESMO
(despejo por `lastSeenAt`, `backend/src/auth/auth.service.ts` ~linha 1095-1118), aquela
superfície caía pro login, ele relogava, despejava outra — loop percebido como "caindo sem parar".

## O que fazer
1. `backend/src/auth/session-policy.ts`: `MAX_ADMIN_WEB_SESSIONS = 4` → `10`.
   Comentário curto (PT-BR) explicando o porquê: teto protege contra vazamento de sessões,
   não pode ser menor que o nº real de aparelhos/janelas do dono; 4 causava auto-despejo
   (session_limit_reached) em uso legítimo multi-dispositivo — caso real 20/07.
2. Procurar testes/código que dependam do valor 4 (grep por `MAX_ADMIN_WEB_SESSIONS` e por
   asserções de teto em `backend/src/auth/*.test.ts`, ex. auth.service.test.ts) e ajustar
   SÓ o que o novo valor quebrar — sem reescrever teste que continua válido.

## Regras
- Trabalhar direto na master; NÃO commitar (orquestrador publica).
- Não tocar em nada além do necessário pros itens 1–2.

## Checks obrigatórios (rodar e colar saída real)
```
cd backend && npm run build
node --test dist/auth/auth.service.test.js
node --test dist/auth/jwt.strategy.test.js
node --test dist/auth/service-login.test.js
```
Reportar: arquivos tocados, saída dos checks, desvios.
