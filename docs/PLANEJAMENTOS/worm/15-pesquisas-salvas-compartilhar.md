# WORM-15 — Pesquisas salvas, compartilhar filtro e "sua lista está pronta"

**Tela deles:** topo da Pesquisa Avançada = "Minhas pesquisas salvas" (accordion). Ao aplicar
filtro: resumo legível de TODOS os critérios ("Empresas com as seguintes situações: Ativa;
CNAE(s): 71.11-1-00; abertas a partir de...") + **Salvar filtro** (modal com nome, ex. "Arquitetos
de SP") + **Compartilhar filtro** (link). Popup de notificação do navegador: "Deseja receber uma
notificação quando sua lista estiver pronta?".

## Por que importa
- Pesquisa salva = o usuário volta amanhã (retenção) e alimenta Rotinas (WORM-13c: "toda segunda,
  50 leads da pesquisa X").
- Resumo legível do filtro = confiança ("sei exatamente o que pedi").
- Compartilhar = dono manda o link do filtro pro vendedor — no HBX vira "atribuir este recorte
  ao vendedor Y" (nossa distribuição já é por vendedor, encaixa perfeito).

## Plano
1. [backend] `SavedSearch { id, ownerId, nome, filtroJson, createdAt, lastRunAt, lastCount }` +
   CRUD + `POST /saved-search/:id/run` (reusa query HOT-02).
2. [frontend Owner] barra "Minhas pesquisas" acima dos filtros + modal salvar + resumo legível
   (função que traduz filtroJson→frases, igual deles).
3. Atribuir a vendedor: salvar com `assignedSellerId` → entra como fonte preferencial na
   distribuição (05-delivery) daquele vendedor.
4. Notificação "lista pronta": pro processamento em lote (HOT-04/materialize grande), usar o
   canal de notificação já existente no Owner; browser-push é cereja, não prioridade.
5. `lastCount` histórico = gráfico "esse nicho está crescendo na minha cidade" (delta de empresas
   por mês — SÓ NÓS conseguimos, temos os dumps mensais). Feature de inteligência de mercado grátis.

## Aceite
- [ ] Salvar, rodar, atribuir a vendedor; resumo legível correto; deletar este .md
