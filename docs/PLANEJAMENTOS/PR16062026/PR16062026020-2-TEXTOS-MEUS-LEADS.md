# PR16062026020-2 — Textos da tela de Leads no idioma da vendedora

> Bloco do PR16062026020. **Frontend só.** Aplica: Sonnet. Mexe em 2 arquivos.
> Corrige textos que ficaram errados/confusos na repaginação. Sem mudar contrato nem comportamento.

## Objetivo
Deixar a tela `/leads` clara pra vendedora: contador "disponíveis", tabela = "Meus leads", e vazio
que ensina o próximo passo.

## Mudança exata

### A) `frontend/src/components/hbx/puxar-leads-panel.tsx`
- O selo do contador hoje diz **"X esperando na lagoa"**. Trocar por **"X disponíveis"**.
  (manter `tag teal`, manter o `toLocaleString("pt-BR")`).

### B) `frontend/src/app/(app)/leads/page.client.tsx`
1. **KPI**: o item com label `"Disponíveis na lagoa"` → **`"Disponíveis"`** (só o texto do label;
   valor e ícone iguais).
2. **Título da tabela** — HOJE está **errado**: `{isSeller && !canDistribute ? "Leads disponíveis" : "Leads do Radar"}`.
   A tabela é a **carteira dela** (backend filtra por `assignedUserId` — só o que ela já puxou),
   então "disponíveis" mente. Trocar o ramo do vendedor para **"Meus leads"**:
   `{isSeller && !canDistribute ? "Meus leads" : "Leads do Radar"}`.
3. **Vazio da tabela** (o `<td colSpan={8}>` quando `items.length === 0`): para vendedora, deixar a
   mensagem ensinando: **"Você ainda não puxou nenhum lead. Use *Puxar leads* aqui em cima para
   trazer da lagoa para a sua carteira"** + (se `poolDisponivel`) **" — tem N disponíveis."**
   Manter o ramo de erro (`loadError`) e o de banco indisponível (`meta.available === false`) como
   estão; só melhorar o texto do caso normal vazio.

## Não fazer
- Não mexer nos selects (é o Bloco 1) nem na lógica de carga/contrato dos endpoints.
- Não tocar na visão admin (quando `canDistribute` é true, segue "Leads do Radar").
- 5 Leis: nada de hex/`style` visual novo.

## Critério de aceite
- Selo do card mostra "N disponíveis"; KPI mostra "Disponíveis".
- Vendedora vê a tabela como **"Meus leads"**; admin continua vendo "Leads do Radar".
- Vazio explica puxar e cita quantos há disponíveis.
- `cd frontend && npm run lint && npm run build` verdes.
