# PR15062026 — ÍNDICE URGENTE (fonte única da fila de correções)

> Protocolo do dono (15/06, tarde). Este índice manda sobre a ordem. Atualizar o
> **status** de cada plano aqui a cada etapa.

## Contrato (travado pelo dono)

1. O dono **testa** e reporta cada problema.
2. Para cada um, eu **PERGUNTO TUDO primeiro** e só então **congelo um `.md` pronto**
   nesta pasta, marcado **URGENTE**, com: diagnóstico → correção → como testar na VPS.
3. **NÃO encosto em nada** (não corrijo, não publico, não reinicio) até o dono falar a
   frase exata.
4. **Frase-gatilho:** **`corrija todos os .md urgente`**.
   - Ao ouvir a frase → **acesso TOTAL, sem pedir permissão a cada passo**.
   - **Escopo:** TODOS os `.md` desta pasta (`PR15062026/`), inclusive WEBSITE e CACA-RADAR.
   - **Ritmo:** **um plano por vez** → corrige → `npm run publish` → **testa na VPS se
     resolveu** → só então o próximo.
   - Ordem = a do `PR15062026000-PRIORIDADES.md` (dependência), com os planos URGENTE
     novos entrando pela prioridade que o dono der.

## Única ressalva de segurança (vale mesmo sob a frase)

- **Pagamento REAL / cartão ao vivo (#7 do PRIORIDADES)** depende fisicamente do dono
  (é o cartão dele). Sob a frase eu faço TUDO sozinho, **menos cobrar dinheiro real /
  rodar o checkout ao vivo de produção** — nesse ponto eu **paro e chamo o dono**.
  Todo o resto (fix, build, publish, restart, teste VPS) = sigo sem perguntar.

## Fila (status: 🟢 pronto p/ aplicar · 🟡 planejando/faltam respostas · ✅ aplicado+testado)

| # | Plano | Assunto | Status |
|---|-------|---------|--------|
| 00 | `PR15062026000-PRIORIDADES.md` | Ordem de batalha (índice, não executável) | referência |
| 01 | `PR15062026001-WEBSITE.md` | Website público com visual do /login | 🟡 (pré-existente) |
| 05 | `PR15062026005-CACA-RADAR-LEADS.md` | Radar+Leads viram 1 tela "Radar" | 🟡 (pré-existente) |
| — | _(aguardando os bugs do teste do dono)_ | — | — |

## Log de execução (preencher ao aplicar)

_(vazio — começa quando o dono falar a frase)_
