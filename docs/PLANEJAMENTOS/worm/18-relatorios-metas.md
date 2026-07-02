# WORM-18 — Relatórios (o que eles medem e o que NÓS devíamos medir)

**Tela deles:** `/appjs/reports` "Acompanhe sua equipe". Widgets: Leads convertidos (nº grande),
Leads por responsável (barra por vendedor), **Chats sem resposta por Etapa** (tempo real!),
Funil de conversão por etapa (ganhas × perdidas), Atividades da equipe (concluídas/planejadas/
atrasadas). Filtros: período, pipeline, responsável. Botão Editar (dashboard customizável).

## A métrica roubável nº1: "Chats sem resposta por etapa"
Lead esperando resposta em Negociação = dinheiro evaporando em tempo real. NINGUÉM olha isso em
CRM pequeno. Nós temos as conversas do Webwhats no banco — dá pra computar "última msg é do lead
e ninguém respondeu há X horas", por etapa e por vendedor.

## Dashboard HBX (proposta, 6 widgets)
| Widget | Fonte | Pra quem |
|---|---|---|
| 💰 Funil em R$ por etapa (ganho/perdido no período) | cards | dono |
| 🔕 Chats sem resposta >2h, por vendedor | Webwhats | dono (cobrança!) |
| 📈 Leads entregues × trabalhados × convertidos por vendedor | distribuição+cards | dono |
| ⏱️ Tempo médio 1ª resposta por vendedor | Webwhats | dono |
| 🐣 Recém-abertas aproveitadas (contatadas em <48h?) | HOT-07 | dono |
| 🤖 IA: conversas tocadas pelo bot × devolvidas pro humano × convertidas | bot | dono |

## Plano
1. [backend] endpoints agregados (queries diretas, cache 5min; nada de warehouse).
2. [frontend] tela Relatórios no Master (admin) com os 6 widgets, período selecionável.
   Gráfico = componente simples do hbx-theme (barra/número), sem lib pesada nova.
3. **Criatividade**: "Relatório de segunda-feira" — resumo IA local semanal em texto corrido
   mandado pro WhatsApp do dono via rotina: "Semana: 34 leads, 12 conversas, 3 vendas (R$X).
   Vendedor A não responde 5 chats há 2 dias. Nicho Y bombou em Fortaleza (+18 empresas novas)."
   O dono do HBX vira o primeiro cliente disso — e vira vídeo do HOT-06.

## Aceite
- [ ] 6 widgets com dados reais; relatório semanal chegando no WhatsApp do dono
- [ ] LEI DO VENDEDOR (valores só admin); deletar este .md
