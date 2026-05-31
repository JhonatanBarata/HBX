# Prompt para Codex — Aplicar novos cards HBX Radar

Leia primeiro estes arquivos:

- `docs/ICONES/CARDS/README.md`
- `docs/ICONES/CARDS/hbx-radar-card-design-tokens.json`
- `docs/ICONES/CARDS/hbx-radar-card-icons.svg`
- `docs/ICONES/CARDS/hbx-radar-card-reference-light.svg`
- `docs/ICONES/CARDS/hbx-radar-card-reference-dark.svg`

Objetivo:
Implementar no frontend os novos cards do Radar conforme a referência aprovada, sem alterar o hero e sem quebrar o fluxo atual.

## Regras absolutas

- Não alterar o hero.
- Não alterar rotas públicas.
- Não alterar payload esperado antigo.
- Não alterar importedCount.
- Não alterar regras comerciais/plano.
- Não alterar backend nesta etapa, salvo pequenos tipos/adapters de frontend se necessário.
- Campos novos devem ser opcionais.
- Cards antigos sem `sourceEvidence`, `fieldEvidence`, `qualityDecision`, `opportunityReason` etc. devem continuar renderizando.
- Social pendente/erro não deve parecer erro do card.
- Delivery e social devem aparecer como status separados.

## Encontrar os arquivos do frontend

Procure no projeto por componentes/telas que renderizam:

- Radar
- Webscraping
- Leads encontrados
- Cards de leads
- Vendas/Radar
- `socialStatus`
- `instagramUrl`
- `facebookUrl`
- `whatsappStatus`
- `importedCount`
- `Lead+`
- `creditos`
- `Ver detalhes`
- `Abrir`
- `Resgatar lead`

Não mexer em telas fora do Radar/Vendas onde esses cards aparecem.

## Assets

Usar os assets desta pasta:

```txt
docs/ICONES/CARDS/
  hbx-radar-card-icons.svg
  hbx-radar-card-design-tokens.json
  hbx-radar-card-reference-light.svg
  hbx-radar-card-reference-dark.svg
```

Se o frontend não puder importar SVG diretamente de `docs/`, copiar estes assets para uma pasta pública do frontend, por exemplo:

```txt
frontend/public/assets/hbx-radar-cards/
```

ou a pasta pública equivalente do projeto.

Manter os nomes dos ícones/symbol IDs:

- `hbx-icon-instagram`
- `hbx-icon-facebook`
- `hbx-icon-whatsapp`
- `hbx-icon-site`
- `hbx-icon-email`
- `hbx-icon-map`
- `hbx-icon-phone`
- `hbx-icon-cnpj`
- `hbx-icon-quality`
- `hbx-icon-confidence`
- `hbx-icon-opportunity`
- `hbx-icon-channel`
- `hbx-icon-action`
- `hbx-icon-check`
- `hbx-icon-social-partial`
- `hbx-icon-enriching`
- `hbx-icon-copy`
- `hbx-icon-external`
- `hbx-icon-filter`
- `hbx-icon-sort`
- `hbx-icon-radar`
- `hbx-icon-lead-plus`
- `hbx-icon-coins`

## Componentes desejados

Criar ou adaptar componentes reutilizáveis:

- `RadarLeadCard`
- `RadarLeadCardCollapsed`
- `RadarLeadCardExpanded`
- `RadarStatusPill`
- `RadarContactIconRow`
- `RadarQualityGauge`
- `RadarEvidenceList`
- `RadarOpportunityPanel`
- `RadarRecommendedChannel`
- `RadarNextBestAction`
- `RadarCreditChip`

Use os nomes reais do projeto se já existirem componentes equivalentes.

## Estados visuais

Implementar 4 estados:

1. Card simples fechado
   - Para plano List ou lead básico.
   - Mostrar nome, cidade, segmento, telefone quando houver, badges mínimos, custo/creditos e CTA.

2. Card simples aberto
   - Dados mínimos.
   - Ícones de contato disponíveis.
   - CTA claro.

3. Card enriquecido fechado
   - Para Lead+ ou card com enriquecimento.
   - Mostrar badges: Entregue, Enriquecendo, Social parcial/encontrado, WhatsApp confirmado/provável, Lead+.

4. Card enriquecido aberto
   - Mostrar linha de ícones: Instagram, Facebook, WhatsApp, Site, E-mail, Mapa.
   - Mostrar dados da empresa: CNPJ, e-mail, site, telefone, endereço.
   - Mostrar qualidade do lead com gauge.
   - Mostrar confiança/evidências.
   - Mostrar insight de oportunidade.
   - Mostrar canal recomendado.
   - Mostrar próxima melhor ação.
   - Mostrar créditos usados/custo.
   - Mostrar histórico/atualizado quando existir.

## Mapeamento de dados

Usar os campos novos quando existirem:

- `deliveryStatus`
- `enrichmentStatus`
- `socialStatus`
- `whatsappStatus`
- `qualityDecision`
- `qualityScore`
- `sourceEngines`
- `sourceEvidence`
- `fieldEvidence`
- `positiveSignals`
- `weakSignals`
- `opportunityReason`
- `recommendedChannel`
- `nextBestAction`
- `asyncEnrichmentJobs`
- `postDeliveryJobs`

Fallback obrigatório:

- Se não houver `qualityScore`, usar `score`, `commercialScore`, `enrichmentScore` ou ocultar o gauge.
- Se não houver `opportunityReason`, ocultar painel de oportunidade.
- Se não houver `recommendedChannel`, inferir visualmente por prioridade: WhatsApp confirmado > Instagram encontrado > telefone > e-mail > site.
- Se não houver `nextBestAction`, mostrar CTA padrão: `Ver detalhes` ou `Iniciar conversa` quando WhatsApp existir.
- Se não houver `sourceEvidence`, não mostrar seção técnica; manter card simples.

## Status e labels

Mapear:

- `deliveryStatus=delivered` ou item entregue => `Entregue`.
- `enrichmentStatus=pending|partial|processing` ou jobs pendentes => `Enriquecendo`.
- `socialStatus=found|confirmed` => `Social encontrado`.
- `socialStatus=partial` => `Social parcial`.
- `socialStatus=candidate_review|missing|error|pending|searching` => badge discreto, nunca erro vermelho principal.
- `whatsappStatus=confirmed|valid|available` => `WhatsApp confirmado`.
- `whatsappStatus=probable|unverified` => `WhatsApp provável`.
- `qualityDecision=deliver_with_pending_enrichment` => `Enriquecendo`.
- `qualityDecision=review` => `Revisar`.

## WhatsApp

Preservar comportamento atual.

Regra importante:

- `whatsappStatus=confirmed` deve continuar vindo do Webwhats ou de dado já confirmado.
- Website crawl pode sugerir `probable` ou `unverified`, mas não deve promover sozinho para `confirmed`.
- Não trocar o mecanismo de consulta WhatsApp.

## Layout desktop

Seguir `hbx-radar-card-reference-light.svg` e `hbx-radar-card-reference-dark.svg`:

- Desktop pode usar lista à esquerda + card aberto à direita, ou card em grid/lista com expansão inline, conforme estrutura atual.
- Card fechado deve ser compacto.
- Card aberto deve usar seções em grid:
  - Dados da empresa
  - Qualidade do lead
  - Confiança/evidências
  - Insight de oportunidade
  - Canal recomendado
  - Próxima melhor ação
- Não ocupar espaço exagerado quando o card estiver fechado.

## Layout mobile

- Card fechado deve caber bem na tela.
- Card aberto deve ser vertical e escaneável.
- Ícones em grid de 3x2 ou carrossel horizontal.
- CTA principal fixo no fim do card aberto, não no hero.
- Não quebrar responsividade.

## Visual

Aplicar tokens de `hbx-radar-card-design-tokens.json`.

Claro:
- Cards brancos, borda suave, sombra premium.
- Azul como ação principal.
- Verde para sucesso/confirmado.
- Laranja/gold para créditos.

Escuro:
- Cards dark com glow azul sutil.
- Verde para confirmado.
- Roxo para premium/Lead+.
- Gold para créditos.

## Testes/validação

Rodar build do frontend.

Validar:

1. Card antigo sem campos novos renderiza.
2. Card novo enriquecido mostra badges e painéis.
3. Social pending/error não vira erro visual do card.
4. WhatsApp confirmado aparece corretamente.
5. Card mobile não quebra layout.
6. Tema claro e escuro renderizam.
7. CTA de WhatsApp só aparece quando houver telefone/WhatsApp.
8. importedCount não muda.
9. Hero não foi alterado.

## Resultado esperado

Após aplicar, o usuário deve perceber visualmente que o HBX Radar entrega:

- lead qualificado;
- enriquecimento progressivo;
- sociais e canais encontrados;
- qualidade/confiança;
- oportunidade comercial;
- próxima ação recomendada;
- custo em créditos;
- card premium Lead+.
