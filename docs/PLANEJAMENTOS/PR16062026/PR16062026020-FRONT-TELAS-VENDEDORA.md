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

### JÁ FEITO nesta sessão (working tree, NÃO commitado) — ponto de partida do Sonnet
- `MinhaPreferenciaPanel` **deletado** e fundido no `PuxarLeadsPanel` (card único). Auto-save da
  preferência ligado (dono aprovou a fusão + o auto-save). **Isto fica.**
- ⚠️ Sobrou intermediário a CORRIGIR pelos blocos: (a) os campos do puxar **ainda são `datalist`**
  (bug da setinha que não reabre) → Bloco 1; (b) selo diz "esperando na lagoa" → Bloco 2;
  (c) renomeei a tabela pra **"Leads disponíveis"** — está **ERRADO** (a tabela é a carteira dela,
  filtrada por `assignedUserId`); o certo é **"Meus leads"** → Bloco 2.

### Decisões do dono (16/06, travadas)
1. Segmento = `<select>` por categoria **+ opção "Outro…"** pra digitar livre.
2. Preferência só é "confirmada" depois de **3 ações** reais no mesmo segmento.
3. Daqui é **só plano em blocos pequenos**; quem aplica é o **Sonnet** (não este agente).

### Por que "Leads do Radar" aparece vazio (não é bug)
Pra vendedora a tabela é filtrada por `assignedUserId` (`radar-core-presentation.mixin.ts:2675`):
**só os leads que ELA já puxou**. A lagoa não vira linha (vem mascarada), só conta no contador.
Antes de puxar = vazio. Por isso o nome certo é **"Meus leads"**, com vazio que ensina a puxar.

### BLOCOS DE EXECUÇÃO (um `.md` por bloco, pro Sonnet)
| Bloco | Arquivo | Camada | Depende |
|---|---|---|---|
| 1 | `PR16062026020-1-PUXAR-SELECTS.md` | front | — |
| 2 | `PR16062026020-2-TEXTOS-MEUS-LEADS.md` | front | — |
| 3 | `PR16062026020-3-PREFERENCIA-AFINIDADE.md` | backend(+front limpa) | — |
| 4 | `PR16062026020-4-AVISO-NOVOS-LEADS.md` | backend + front | Bloco 3 |

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
