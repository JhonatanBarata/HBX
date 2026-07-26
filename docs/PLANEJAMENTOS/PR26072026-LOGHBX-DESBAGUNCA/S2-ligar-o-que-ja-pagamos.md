# S2 — Ligar o que já pagamos (AGENDA V2 + ROTA-CONFERIDA presas atrás de flag)

## O desperdício hoje
- **AGENDA-SEMANAL**: 4 sprints EM PROD desde 25/07 (~20:47), coluna `agendaV2Ativa` FALSE nas 9
  empresas → ninguém usa. Pior: o APK mantém o caminho V1 (dia-preview) E o V2 juntos
  (`app.js:2329` `agendaSupportsWeeklyOrder`, fallback em `2377`) — todo bug de agenda tem que ser
  caçado em DOIS fluxos.
- **ROTA-CONFERIDA**: 8 sprints publicadas, flag `rotaConferidaAtiva` sem coluna (S0 resolve) →
  conferência, congelamento da rota aprovada e preview de créditos invisíveis pra 100% das
  empresas.

Código publicado e desligado é custo puro: pagou-se o desenvolvimento, paga-se a manutenção dupla,
e o retorno é zero. O mercado faz rollout com cobaia → geral → **remoção do caminho velho com data**.

## O que fazer (depende só de S0 aplicado em prod)

⚡ **LEI DO DONO (26/07): entregar é entregar LIGADO.** Nada de cobaia/rollout gradual por
iniciativa própria — "pedi a coisa, você faz e pronto". A validação acontece ANTES (no aparelho),
não segurando a chave.

1. **Validar no aparelho ANTES de ligar geral** (mesma sessão, sem publish no meio):
   - Agenda: montar o dia pela agenda semanal, reordenar em lote, importar sequência, divergência.
   - Conferida: planejar → conferir (semáforo/pausa/resolver) → aprovar → iniciar → conferir que a
     rota iniciada é EXATAMENTE a aprovada; preview de créditos bate com o extrato.
2. **Ligar nas 9 empresas de uma vez**: `agendaV2Ativa=true` e `rotaConferidaAtiva=true`
   (UPDATE em `LogisticaConfig` na VPS ou PATCH `/logistica/config` — registrar o comando usado).
   `@default(false)` das colunas vira `@default(true)` na migration do S0, pra empresa nova já
   nascer com o comportamento atual.
3. **Matar o caminho V1**: com as 9 ligadas, abrir tarefa IMEDIATA (não "daqui a 1 semana") pra
   remover o dia-preview do APK (funções `loadManagedDayPreview`/`mergeDayPreview`/fallbacks de
   `agendaAvailable` em app.js:2129-2153, 2046-2062) e os endpoints legados que só ele usa.
   O fallback só se justifica enquanto houver APARELHO em versão velha — conferir no
   version-logistica.json/uso e datar a remoção no resultado.

## Verificação (gate)
- Roteiro do passo 1 executado no moto g15 com print.
- `GET /logistica/config` das 9 empresas devolve as duas flags true.
- Rota de verdade montada pela agenda V2 depois de ligar (não só a tela abrindo).

## Não fazer
- NÃO remover o V1 nesta sprint (só marcar a data) — aparelhos desatualizados ainda atravessam
  versões, exatamente o motivo do fallback existir (comentário em app.js:80-82).
