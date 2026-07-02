# W3 — Chave de fusão para informais (lead sem CNPJ não pode duplicar)

> Worker Sonnet. Leia ANTES: `docs/PLANEJAMENTOS/ARVORE-MESTRA/ARVORE-MESTRA.md` (caixa "5 · Fusão
> canônica") e `docs/Rules/MOTOR.md`.

## Missão
A fusão canônica usa CNPJ como chave ("2 fontes = 1 card"), mas o motor web existe justamente pra
trazer NOVOS/INFORMAIS — que não têm CNPJ. Sem chave secundária, o informal duplica card no estoque
e arrisca vender o mesmo lead 2x. Fechar esse buraco.

## Âncora no código
- `backend/src/webscraping/radar/01-search/radar-result-merger.service.ts` — já normaliza
  `phoneDigits`, website key/domain e nome (`normalizeLookupValue`). Mapear o que a fusão JÁ faz
  antes de escrever qualquer linha: o gap pode ser menor do que parece.

## Tarefas
1. **Auditar** o merger: com dois candidatos SEM CNPJ, quando eles fundem hoje? Escrever primeiro
   os testes que reproduzem a duplicata (mesmo fone; mesmo site; mesmo nome+cidade).
2. **Hierarquia de chave canônica** (implementar o que faltar):
   1. CNPJ (14 dígitos) — chave absoluta;
   2. `phoneDigits` normalizado (com e sem 9º dígito — `5588912345678` ≡ `558812345678`);
   3. domínio do website;
   4. nome normalizado + cidade (conservador: igualdade após normalização; fuzzy de verdade SÓ se
      já existir util no repo — não adicionar dependência).
3. **Fusão preserva o melhor de cada fonte** (não perder campo preenchido ao fundir) e concatena as
   origens (o campo de origem alimenta o `sourceChain` do W1 — não conflitar: W1 mexe em planner/
   persistência; você mexe SÓ no merger e testes).
4. Cuidado com falso-positivo: fone fixo genérico/compartilhado (ex.: número de galeria/shopping)
   — se o mesmo fone aparecer com nomes normalizados MUITO diferentes, logar e NÃO fundir cegamente
   (fone + primeira palavra do nome como desempate barato).

## Regras duras
- **NÃO tocar** `backend/prisma/schema.prisma`, planner, delivery, nem `Webwhats/`.
- Regra de ouro: histórico negativo nunca é apagado.
- Testes: `cd backend && npm run build` + `node --test dist/...` do merger.
- Commit na branch do worktree. Relatório final: branch, arquivos, decisões, testes.
