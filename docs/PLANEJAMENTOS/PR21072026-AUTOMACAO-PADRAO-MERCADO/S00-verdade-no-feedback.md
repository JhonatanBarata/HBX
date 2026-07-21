# S00 — Verdade no feedback (2 fixes cirúrgicos)

**Worker: Sonnet · Depende de: nada · Front-only**

## Objetivo
Matar as duas MENTIRAS visuais achadas no QA de 21/07 antes de qualquer beleza:
feedback falso é pior que tela feia.

## Tarefas
1. **A3 — Aplicar cadência honesto.** `frontend/src/app/(app)/automacao/secao-prospeccao.tsx`
   (~linhas 447-464): o `apiFetch` do aplicar tipa só `{inscritos, jaInscritos, total}`;
   o backend TAMBÉM devolve `conflitosAutomacao` (cadencia.service.ts:317). Incluir no
   tipo e na mensagem de resultado. Regra de exibição:
   - `inscritos > 0` → sucesso ("✓ N lead(s) inscrito(s)…" como hoje, somando os extras).
   - `inscritos === 0` e (`jaInscritos+conflitosAutomacao > 0`) → tom de AVISO, não de
     sucesso: nada de "✓" verde. Ex.: "Nenhum novo: 2 já estavam · 1 bloqueado por
     outra automação." (respeitar teto de copy — 1 linha).
   - Usar classes de nota/aviso já existentes na tela (sem inventar estilo).
2. **B1 — selo "WhatsApp ✓" só com prova.** `frontend/src/components/hbx/lead-cockpit-modal.tsx:671`
   mostra o selo pra QUALQUER `lead.phone` preenchido. A linha 771 do MESMO arquivo já
   faz certo (`whatsappMap[onlyDigits(phone)] === true`). Aplicar a MESMA condição na
   671. Quando não houver checagem no map: **sem selo** (ausência > mentira). Conferir
   se há outro ponto do cockpit com o mesmo vício (grep `WhatsApp ✓` no arquivo).

## Aceite
- Aplicar com lead bloqueado não mostra check verde; motivo aparece em 1 linha.
- Telefone fixo sem WhatsApp não ganha selo. Telefone com checagem `true` ganha.
- `cd frontend && npm run lint && npm run build` + check-pele: verdes (baseline).

## DoD
Commit local: `fix(automacao): S00 — feedback honesto no aplicar + selo WhatsApp real`
