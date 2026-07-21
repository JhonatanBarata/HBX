# S06 — Aplicar cadência: picker visual de leads

**Worker: Sonnet · Depende de: S05 · Front-only**

## Objetivo
Matar o achado A4 — a vergonha da tela vs mercado: "Aplicar" pede IDs de card
colados à mão. Ninguém fora do dev sabe o que é um ID. Vira seletor visual
(padrão HubSpot/CNPJ Biz: busca + lista + checkbox).

## Fato ancorado (não re-derivar)
`GET /vendas/board` já devolve os cards do funil e o front já consome
(`vendas/page.client.tsx:515`, `apiFetch<BoardResponse>('/vendas/board'+qs)`).
O picker REUSA esse fetch. Zero endpoint novo (Lei 6) — se o shape do board não
bastar (ex.: precisa filtrar por nome no client), filtra no client: a lista da
empresa 5 tem ~33 cards; board é paginado/limitado? VERIFICAR o shape real antes
de codar e registrar no relatório.

## Arquivos
- EDITAR `frontend/src/app/(app)/automacao/secao-prospeccao.tsx` (modal Aplicar)
- EDITAR `frontend/src/app/hbx-theme/automacao.css`

## Tarefas
1. Aba "Lista de leads" do modal: substituir o textarea de IDs por —
   busca por nome (filtro client-side) + lista de cards do funil (nome, cidade/
   segmento se houver, dot se já está em cadência quando o dado existir) +
   checkbox por linha + "selecionar visíveis" + contador "N selecionados".
2. Aba "Pesquisa salva" permanece como está.
3. Envio: mesmos `leadIds` de hoje pro mesmo `POST /automation/plays/cadencia/:id/aplicar`
   — só muda DE ONDE os ids vêm (seleção, não colagem).
4. Estados: lista vazia (funil sem cards) → `EmptyState` do kit com CTA pra /vendas;
   busca sem resultado → 1 linha.
5. Resultado do aplicar: já honesto pela S00 — conferir integração (selecionar 1
   lead bloqueado de propósito se existir, ver o aviso).
6. QA local: aplicar 1 lead de teste selecionando pela busca; modal fecha e contador
   de "leads dentro" reflete após reload da lista.

## Aceite
- Impossível o usuário ver/precisar de um ID em qualquer ponto do fluxo.
- Zero chamada de negócio nova (board + aplicar existentes).
- lint + build + check-pele verdes.

## DoD
Commit local: `feat(automacao): S06 — aplicar cadência com seletor visual de leads`
