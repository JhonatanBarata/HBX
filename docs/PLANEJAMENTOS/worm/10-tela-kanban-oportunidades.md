# WORM-10 — Tela Oportunidades (kanban com R$ por coluna)

**Tela deles:** `/appjs/deals`. Kanban 5 colunas com SUBTÍTULO de trabalho: Prospecção ("Novos
leads") → Qualificação ("Classificação e Ranking") → Proposta ("Em negociação") → Negociação
("Follow-up") → Fechamento ("Contrato e compromissos"). Cada coluna soma **R$ no topo**
(ex. R$ 2.750,00). Card: nome, valor, data, termômetro (estrelas), avatar responsável. Botões
Ganho/Perdido no detalhe. Visões: kanban ⇄ lista. Pipelines configuráveis em `/appjs/config/pipelines`.

## O que o HBX tem
Cards Vendas/Atendimento reformados (working tree); `FecharVendaModal` como convergência de
fechamento; comissão-ao-closer no working tree. Não é kanban de arrastar com soma por etapa.

## Gap real / o que vale roubar
1. **R$ somado por coluna** — o vendedor vê o funil em dinheiro, não em contagem. É a diferença
   entre "tenho 12 cards" e "tenho R$ 18.400 parados em Proposta".
2. **Subtítulo de AÇÃO em cada etapa** (o que fazer aqui) — onboarding embutido.
3. **Termômetro** (1-5) — no HBX pode ser AUTOMÁTICO (nota IA + sinais: respondeu WhatsApp? abriu
   site?) em vez de manual. Eles = estrela na mão; nós = estrela viva.
4. Ganho/Perdido com motivo (alimenta relatório WORM-18).

## Plano (worker frontend Master + endpoints já existentes onde der)
1. Mapear o fluxo atual de estados do card de Vendas → definir as 5 etapas HBX (aproveitar os
   status existentes; NÃO inventar máquina de estados nova — renomear/агrupar).
2. Componente kanban no padrão hbx-theme (tokens! nada solto) com drag entre colunas = update de
   status; soma de `valor` por coluna no header.
3. Campo `valorEstimado` no card se não existir (default por plano/segmento, editável).
4. Termômetro: derivado (IA score + engajamento) com override manual. Tooltip explica o porquê.
5. Ganho → abre `FecharVendaModal` (convergência já planejada); Perdido → select de motivo.
**Fora de escopo:** múltiplos pipelines custom (deles) — 1 pipeline de Vendas + 1 de Atendimento basta.

## Aceite
- [ ] Kanban com soma R$ por coluna, drag funcionando, LEI DO VENDEDOR respeitada (valores só Admin
  onde a lei manda); check-pele verde; deletar este .md
