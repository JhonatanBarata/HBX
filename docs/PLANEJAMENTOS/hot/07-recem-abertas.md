# HOT-07 — Produto "Empresa recém-aberta" (o lead mais quente que existe)

**Tela deles:** filtro "Data de abertura da empresa" com slider que vai até **"Hoje"** e
"Última semana". No FAQ: "em tempo real incluímos em nossa base as novas empresas recém abertas".
É argumento de venda deles — empresa nova compra TUDO (contador, site, máquina, uniforme, sistema).

## Verdade técnica (checada)
O dump da RFB é MENSAL. "Tempo real" deles é marketing + captação complementar. Nosso caminho:
1. **Diff mensal do dump** (HOT-01): `data_inicio_atividade` recente → já cobre "abriu este mês".
2. **Tempo quase-real (gap do mês corrente)**: descoberta web do `30-motor-receita.md` (busca
   "{segmento} {cidade} cnpj" + regex + BrasilAPI) naturalmente pesca novas; e consulta BrasilAPI
   de CNPJs sequenciais próximos aos últimos conhecidos é INVIÁVEL — não tentar. O honesto:
   "abriu nos últimos 30 dias" via dump + achados web. Suficiente pra vender.

## Plano (worker backend + toque de UI)
1. Filtro `abertaDe/abertaAte` já entra no HOT-02 (coluna `openedAt` existe). Preset "última semana/
   mês" na UI.
2. **Alerta assinável no Owner**: "me avisa quando abrir {CNAE} em {cidade}" → job diário que roda
   a query e notifica (Owner já tem mecanismo de notificação/painel; senão, lista "Novidades" na tela).
3. **Rota de distribuição**: recém-aberta com match de `preferredSegmentsJson` do vendedor entra
   com PRIORIDADE na fila de entrega (05-delivery) — flag `isFreshCompany` no lead.
4. Pós-F1 mensal: ao importar dump novo, marcar `firstSeenAt` — o diff (cnpj novo na base) é a
   lista oficial do mês.

## Criatividade (produto/venda)
- **"Cesta de boas-vindas" por segmento**: empresa nova de {CNAE} → oferta combinada site
  (website-kit) + WhatsApp IA + presença Google. Pitch: "quem abre empresa não tem NADA disso".
- Vídeo Roteiro C do HOT-06 usa exatamente esta tela — feature e marketing nascem juntos.
- No card do lead: badge "🐣 aberta há X dias" (urgência visual pro vendedor).

## Aceite
- [ ] Preset "abertas este mês" na tela HOT-02 retornando leads reais
- [ ] Badge 🐣 no card; prioridade na distribuição com flag; deletar este .md
