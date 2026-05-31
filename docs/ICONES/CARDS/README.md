# HBX Radar — Cards e Assets

Este pacote contém os assets e a direção visual aprovada para transformar os cards do Radar no frontend.

## Arquivos

- `hbx-radar-card-icons.svg` — sprite SVG com ícones reutilizáveis dos cards.
- `hbx-radar-card-design-tokens.json` — tokens visuais, temas, status e IDs dos ícones.
- `hbx-radar-card-reference-light.svg` — referência visual simplificada do card claro.
- `hbx-radar-card-reference-dark.svg` — referência visual simplificada do card escuro.
- `CODEX_APPLY_RADAR_CARDS.md` — prompt pronto para o Codex aplicar no frontend.

## Visão do card

O frontend deve manter o fluxo atual e alterar apenas a apresentação dos cards do Radar/Vendas.

Existem 4 estados visuais principais:

1. `simple-collapsed` — card simples fechado para plano List/lead básico.
2. `simple-expanded` — card simples aberto, com dados mínimos e CTA.
3. `enriched-collapsed` — card Lead+ fechado, com badges de status.
4. `enriched-expanded` — card Lead+ aberto, com redes, evidências, qualidade, oportunidade e próxima ação.

## Regras de produto

- Não alterar o hero.
- Não alterar payload público.
- Não alterar importedCount.
- Não alterar regras comerciais/plano.
- Campos novos devem ser opcionais: se não vierem do backend, o card continua funcionando.
- Social `pending`, `error` ou `candidate_review` não deve parecer erro do card.
- `deliveryStatus` e `socialStatus` devem ser exibidos separadamente.
- Lead qualificado com enrichment pendente deve mostrar `Enriquecendo`, não `Falha`.

## Dados novos que o card pode usar

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

## Ícones principais

Use o sprite SVG:

```html
<svg class="hbx-card-icon"><use href="/docs/ICONES/CARDS/hbx-radar-card-icons.svg#hbx-icon-whatsapp" /></svg>
```

Se o bundler não permitir usar `/docs`, copie o sprite para `frontend/public/assets/hbx-radar-cards/` mantendo os nomes.

## Direção visual

### Claro

- Fundo: `#F8FAFC`
- Surface: `#FFFFFF`
- Texto: `#0F172A`
- Azul principal: `#2563EB`
- Verde sucesso: `#16A34A`
- Gold/créditos: `#F59E0B`
- Cards com borda `#E2E8F0`, radius 24px e sombra suave.

### Escuro

- Fundo: `#020617`
- Surface: `#0B1220`
- Texto: `#F8FAFC`
- Azul neon: `#38BDF8`
- Verde sucesso: `#22C55E`
- Premium: `#A855F7`
- Cards com glow azul sutil e bordas `rgba(148, 163, 184, 0.22)`.

## UX esperada

### Card fechado

Mostrar:

- Logo/avatar ou inicial da empresa.
- Nome da empresa.
- Cidade/UF.
- Segmento.
- Telefone principal, quando houver.
- Badges: Entregue, Enriquecendo, Social parcial, WhatsApp confirmado, Lead+.
- Custo em créditos.
- CTA `Abrir`, `Ver detalhes` ou `Resgatar lead` conforme contexto.

### Card aberto/enriquecido

Mostrar:

- Linha de ícones: Instagram, Facebook, WhatsApp, Site, E-mail, Mapa.
- Dados da empresa: CNPJ, e-mail, site, telefone, endereço.
- Qualidade do lead: score/gauge.
- Confiança/evidências: sinais confirmados.
- Insight de oportunidade.
- Canal recomendado.
- Próxima melhor ação.
- Créditos usados ou custo do lead.
- Histórico/atualização quando existir.

## Observação sobre WhatsApp

`whatsappStatus=confirmed` deve continuar vindo do Webwhats ou de dado previamente confirmado. Website crawl pode sugerir `probable`/`unverified`, mas não deve promover sozinho para `confirmed`.
