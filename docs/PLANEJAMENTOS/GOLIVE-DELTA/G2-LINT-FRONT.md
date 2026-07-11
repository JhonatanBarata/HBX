# G2 — Zerar erros de lint do frontend (P1.6)

## Contexto
`cd frontend && npm run lint` acusa **57 errors / 35 warnings** mas sai com exit 0 (o gate não
trava). Precisamos de lint verde para o quality gate (G4) valer. Correções **sem mudar
comportamento**.

## Arquivos
- `frontend/src/**` — rodar `cd frontend && npm run lint` para a lista completa e atual.

## Escopo
1. Zerar os **57 errors**. Exemplos já vistos:
   - `@next/next/no-assign-module-variable` em `frontend/src/lib/voice-rubberband.ts:21`
     (variável chamada `module`) → renomear a variável (ex. `mod`), sem mudar a lógica.
   - `react-hooks/set-state-in-effect` em `frontend/src/components/hbx/radar-disc.tsx:40` →
     resolver com lazy initial state / derivar sem setState no effect, ou, se o efeito for
     legítimo, `// eslint-disable-next-line` PONTUAL com comentário justificando.
   - `@typescript-eslint/no-unused-vars` e "Unused eslint-disable directive" → remover o que
     estiver morto.
2. Reduzir warnings quando trivial (unused disable, deps) — sem forçar mudança de comportamento.

## Fora de escopo
- NÃO refatorar lógica de componente/estado além do necessário para o lint.
- NÃO tocar CSS, tokens ou peles (Leis do design system — `frontend/src/app/hbx-theme/`).
- NÃO tocar backend nem motor.

## Guardrails
- **Zero mudança de comportamento** visual/funcional. Renomear var ≠ mudar fluxo.
- Falso-positivo legítimo → `eslint-disable-next-line <regra>` com comentário explicando **por
  quê** (nunca disable global de arquivo/regra).
- `cd frontend && npm run build` (`next build`) tem de passar ao fim.

## Pronto quando
- `npm run lint` = **0 errors** (warnings restantes só se justificados).
- `next build` verde.
- Diff é só renome/remoção/disable-pontual — nenhuma alteração de comportamento.
