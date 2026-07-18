# PR17072026 — App do entregador: Onda 1 (confiança)

Refactor do app de entrega dentro do APK (`EntregaShell/app/src/logistica/assets/app/app.js`,
que a casca Android carrega e fala direto com a API do VPS). Diagnóstico e plano aprovados pelo dono
no chat (17/07). Onda 1 = o que evita prejuízo/suporte; Onda 2 (estado no servidor) e Onda 3
(explicabilidade + tela final) vêm depois.

## Escopo Onda 1 (3 itens)
1. **Encerramento seguro** — `POST /logistica/rota/encerrar` transacional que preserva
   entregues/comprovantes/cobranças e move as abertas para pendência (NÃO cancela). Substitui o
   loop `performCancelRoute` (cancela uma-a-uma → cancelamento parcial na queda de rede).
2. **Fix da pausa** — faixa explícita "Rota pausada — Continuar rota"; a seta nunca volta pro verde
   com rota viva; religar o `resume-route` (hoje é código morto, sem UI que o renderize).
3. **Popup único** — matar a duplicação do contador ("número no círculo" + "em X…"); trava de toque
   duplo; aplicar nos DOIS countdowns (próxima parada + prévia "gerar rota").

## Frentes (1 subagente por arquivo-alvo, sem colisão → paralelo)
- [01-backend-encerrar-rota.md](01-backend-encerrar-rota.md) — backend. **Dinheiro-crítico**:
  Opus revisa o diff linha a linha (não pode tocar em `FinanceiroCharge` nem em entrega `entregue`).
- [02-app-pausa-popup-encerrar.md](02-app-pausa-popup-encerrar.md) — app do APK (app.js + app.css).

## Contrato congelado (as duas frentes obedecem)
`POST /logistica/rota/encerrar`
- Guard: `JwtAuthGuard`, company-scoped (igual `rota/iniciar`). NÃO admin-only.
- Body: `{ date?: string (YYYY-MM-DD, default hoje SP), motivo?: string }`
- Resposta: `{ ok: true, resumo: { total: number, entregues: number, naoEntregues: number, pendentes: number } }`
  - `total` = todas as entregas do dia · `entregues` = status `entregue` (preservadas) ·
    `naoEntregues` = status `cancelada` (preservadas como estão) · `pendentes` = abertas revertidas.

## Regras do projeto (valem para todo subagente)
- Trabalhar **direto no master**. NÃO criar branch nem worktree. Commit fica local; **NÃO publicar**
  (o dono publica). NÃO rodar `npm run publish/up/new`.
- PT-BR. Só o texto que o dono pediu em tela (sem textão inventado).
- Reportar ao Opus: arquivos tocados, o que foi feito, resultado dos checks, o que ficou pendente.
