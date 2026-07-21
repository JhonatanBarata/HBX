# S10 — QA integral local (GATE do publish)

**Worker: Sonnet (ou orquestrador) · Depende de: TODAS · Read-mostly**

## Objetivo
"Tudo testado" do pedido do dono. Roteiro completo em localhost:3001 (Chrome,
credenciais `teste`/`teste123` — memória localhost-teste), evidência por
screenshot, veredito honesto. NADA sobe sem esta sprint verde.

## Roteiro
1. **Build de verdade**: `cd frontend && npm run lint && npm run build` +
   check-pele. Vermelhos pré-existentes documentados (kit.css radar-ai,
   lead-cockpit react-hooks) são os ÚNICOS tolerados — qualquer item novo reprova.
2. **Hub**: 4 cartões com dado real; fail-soft (derrubar a API na mão →
   "Tentar novamente"); chip ausente → StatusChip atenção.
3. **Atendente**: wizard completo (galeria S08) → editor → Ajustes IA → salvar →
   reload persiste → sandbox 2 cérebros (fallback do timeout visualmente distinto)
   → canvas Roteiro sem regressão.
4. **Cobrança**: canvas + prévia espelhando; status sem contradição.
5. **Prospecção**: sem jargão; prévia por persona; Aplicar via picker (S06) com
   busca; resultado honesto com lead bloqueado (se reproduzível local).
6. **Regras**: empties com diagrama; gatilho CRUD completo; rotina nos 2 estados
   de pesquisa salva (ida e volta do CTA).
7. **Gates de acesso** (3 perfis): bot-só, vendas-só, nenhum — cartões/seções
   aparecem/somem conforme o mapa da decisão nº2 (frente-mãe). Se não houver
   usuários de teste com esses perfis no seed local, criar via tela de equipe ou
   registrar a limitação no relatório (não inventar veredito).
8. **Redirects**: /bot, /automacoes, /assistente → seções certas (sem regressão
   da frente-mãe).
9. **2 temas** (claro/escuro): screenshot das 5 telas em cada.
10. `RELATORIO-S10.md`: checklist com ✅/❌/⚠️ + screenshots + lista final do que
    o dono precisa saber antes do publish.

## Aceite
- Relatório completo, zero ❌ sem explicação e plano.
- Working tree limpo, todos os commits das sprints no local.

## DoD
Commit local: `test(automacao): S10 — QA integral pré-publish da frente padrão-mercado`
