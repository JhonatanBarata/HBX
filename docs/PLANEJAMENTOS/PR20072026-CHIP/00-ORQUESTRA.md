# PR20072026-CHIP — Vazamento de chip + DDD 55 + chave geral

Incidente 20/07/2026 (empresa 5, HBX). Vendedora Gabriele (User 33) mandou 9 mensagens de
prospecção manual pelo painel Vendas; **todas saíram pelo chip PESSOAL do dono** (`5519997024884`,
instância `company-5-user-6`), não pelo dela. Um número (DDD 55, RS) falhou por bug de
normalização. Depois o dono ligou a chave geral do header e a campanha (parada) **deu partida
sozinha** e disparou 1 msg.

Análise forense completa: memória `incidente-chip-vazado-20-07`.

## Escopo APROVADO pelo dono (20/07)
- **BLOCO B** — bug DDD 55 (Worker 01).
- **BLOCO A** — vazamento de identidade de chip (Worker 02, o núcleo).
- **BLOCO E** — chave geral deixa de dar partida na frota (Worker 03).

## Cortado pelo dono (NÃO fazer)
- **BLOCO D** (freio/regra no caminho manual de envio) — dono: "worker manual NÃO impor regras".
- **Reenvio das 9** pelo chip da Gabriele — dono: "não fazer o reenvio".
- **BLOCO C** (zap-check bloqueante no manual) — DEFERIDO: é gate no manual (mesma família do que o
  dono cortou) e o "unavailable" da conversa 2501 foi provavelmente sintoma do bug DDD-55 (Bloco B
  já resolve). Reavaliar com o dono depois.
- **E4** (módulo Bot IA OFF no Gerencial travar o worker da empresa) — DEFERIDO, decisão do dono.

## Regras de execução (todos os workers)
1. Trabalhar **direto na branch atual (master)**. **NUNCA criar branch/worktree.** Commit fica LOCAL.
2. **NÃO publicar** (`npm run publish`/`new`/`force`). O dono publica.
3. **NÃO** tocar em `Webwhats/` (projeto separado).
4. Código e comentários em **PT-BR**, no estilo do arquivo.
5. Dono edita em paralelo → se achar tree sujo, **não reverter o que não é seu**; preservar.
6. Rodar `cd backend && npm run typecheck` (ou o check do domínio) e deixar **verde**.
7. Ajustar/`criar` testes unitários do que mexeu.
8. Ao terminar: reportar diff resumido + resultado do typecheck. Não auto-publicar, não rodar SQL em prod.

## Ordem
- Round 1 (paralelo, sem conflito de arquivo): **Worker 01** + **Worker 03**.
- Round 2 (depois do 01, compartilham `vendas-automation.service.ts`): **Worker 02**.
