# PR16062026020 — FRONT: terminar e mapear as telas da vendedora

> Migrado de `PR14062026003`. A régua por cargo já está no ar (vendedora nasce com Vendas+Radar,
> sem cobrança, sem área do dono). Boa parte do front dela já foi ligada (ver memória
> `atendimento-fidelidade-whatsapp`: Atendimento ligado ao inbox rico + botões mortos ligados).

## Contexto travado (não reinterpretar)
As 2 vendedoras = **força de vendas DO HBX** (comissão pura, sem salário, NÃO são devs). Vendem o
próprio HBX. Canal: telefone (motor) + **WhatsApp do chip de trabalho, número da HBX** (não
pessoal — quando ela sai, a HBX fica com número e histórico). Evolution/Webwhats em volume humano
(grátis por mensagem); **Meta = depois** (caro, só com loop provado + opt-in).

## ⛔ FALTA (auditar + terminar)
1. **Percorrer** Vendas/Leads/Atendimento/Relatórios na pele real da vendedora (entrar no e-mail
   dela cadastrado, fluxo ponta a ponta).
2. **Ligar botões mortos** relevantes ao trabalho dela; tirar KPIs "—" onde houver contrato.
3. **Mapear cada tela** (funciona / cru / falta pra rodar) e devolver a lista pro dono priorizar.

## Não-objetivos
- Não construir estágios novos da esteira agora. Não ligar Meta. Não mexer em cobrança/preço.
- 5 Leis (classe central/token, sem visual inline).

## Status
Muito já ligado; falta a varredura final + o mapa pro dono.

---

## REPAGINAÇÃO da tela /leads na pele da vendedora (ordem do dono 16/06)
> Dono apontou: **"minha preferência de leads" + "puxar leads" estão sem utilidade** (duas
> caixas que pedem a mesma coisa). Escolheu **"fundir + repaginar a tela toda"**. Frontend-only,
> contrato de backend intocado, 5 Leis (só classe central/token).

### Diagnóstico confirmado no código
- `MinhaPreferenciaPanel` (só vendedor) e `PuxarLeadsPanel` (vendedor+admin) ficam empilhados no
  topo de `/leads` — ambos pedem segmento + cidade + UF. Confunde.
- A "preferência de SEGMENTO" tem efeito real só no backend: **boost de ordenação** da lista
  (`radar-core-presentation.mixin.ts:2618` `resolveRadarPreferenceSegments`/`boostRadarRowsByPreference`)
  — NÃO é filtro. Também pré-preenche o segmento do "Puxar".
- A "preferência de CIDADE/ESTADO" (`preferredCityRegion`) é **campo morto**: salva e devolve pra
  própria tela (`profile.controller.ts:102`), mas não pré-preenche o "Puxar", não entra no boost,
  não filtra nada.

### Plano (frontend)
1. **Deletar** `MinhaPreferenciaPanel` da tela + o componente (e o campo morto cidade/estado some junto).
2. **Repaginar `PuxarLeadsPanel`** como card único, linguagem de vendedora:
   - "Segmento" → **"Tipo de cliente"**; "Quantidade" → **"Quantos"**; botão → **"Puxar N leads"**.
   - Subtítulo curto do que faz; contador da lagoa ("X esperando") dentro do próprio card.
   - **Boost preservado sem formulário**: ao puxar com sucesso, `PATCH /profile/preferred-segments`
     fire-and-forget grava o segmento puxado (vendedor) = a preferência vira plumbing invisível.
3. **Relabels seguros no resto** (sem mudar contrato/comportamento, sem mexer no admin):
   título do painel pra vendedor, ações rápidas, KPIs no idioma dela.

### Mapa da tela /leads (vendedora) — funciona / cru / falta
| Elemento | Estado | Ação |
|---|---|---|
| `MinhaPreferenciaPanel` | redundante | **remover** (boost migra pro pull) |
| `PuxarLeadsPanel` | funciona, cru visual | **repaginar** (card único, linguagem dela) |
| KPIs (4) | funciona | relabel claro |
| Painel "Leads do Radar" + chips de etapa | funciona | título no idioma do vendedor |
| Tabela de leads + pager | funciona | manter |
| `aside` Contexto + Ações rápidas | funciona | relabel (Enviar p/ Vendas, Iniciar conversa) |
| Distribuição (botão/drawer/distribuir) | admin-only (oculto p/ vendedor) | **não tocar** |
