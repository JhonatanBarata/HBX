# HBX OpsControl — consolidação de Motores + filtro obrigatório de canal

Este arquivo é um patch-notes técnico porque o conector GitHub disponível nesta conversa expôs leitura/inspeção, mas não expôs uma ação de escrita/aplicar patch.

## Objetivo

- Remover `Motores` do painel `/bancodedados` e do fluxo `/master`.
- Remover a aba separada `Radar Motores` do Windows app.
- Consolidar tudo em `HBX Owner > Ops Control` como cockpit único.
- Manter scraping noturno em `engine: "hbx"`, sem APIs pagas de Places.
- Permitir turbo local, VPS ou ambos.
- Permitir filtro obrigatório por canal, por exemplo `requiredChannels: ["email"]`, com `channelMatchMode: "all_required"`, para salvar somente cards com email público/comercial válido.

## Correção crítica no backend

Arquivo: `backend/src/webscraping/radar/03-enrichment/radar-core-quality-enrichment.mixin.ts`

Substituir o stub atual:

```ts
private candidateHasRequiredChannels(_candidate: Record<string, any>, _input?: NormalizedSearchInput | NormalizedRadarFilters, _qualityV2?: LeadQualityV2 | null) {
  return true;
}
```

Por:

```ts
private candidateHasRequiredChannels(
  candidate: Record<string, any>,
  input?: NormalizedSearchInput | NormalizedRadarFilters,
  qualityV2?: LeadQualityV2 | null,
) {
  const required = this.requiredChannelsForInput(input);
  if (!required.length) return true;

  const mode = this.normalizeChannelMatchMode((input as any)?.channelMatchMode);
  if (mode === 'prefer') return true;

  const checks = required.map((channel) => this.candidateHasRequiredChannel(candidate, channel, qualityV2));
  if (mode === 'any_required') return checks.some(Boolean);
  return checks.every(Boolean);
}
```

## DTO/config necessários

Arquivos principais:

- `backend/src/webscraping/webscraping.controller.ts`
- `backend/src/webscraping/radar/shared/radar-core-shared.ts`
- `backend/src/webscraping/radar/01-search/mass-data/radar-core-mass-data.mixin.ts`

Adicionar nos DTOs/configs de turbo/mass-data:

```ts
@IsOptional()
@Transform(({ value }) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value])
@IsArray()
@IsString({ each: true })
requiredChannels?: string[];

@IsOptional()
@Transform(({ value }) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value])
@IsArray()
@IsString({ each: true })
preferredChannels?: string[];

@IsOptional()
@IsIn(['prefer', 'any_required', 'all_required'])
channelMatchMode?: 'prefer' | 'any_required' | 'all_required';
```

Adicionar em `WebscrapingOperationalConfigInput` e `RadarCampaignInput`:

```ts
requiredChannels?: string[] | null;
preferredChannels?: string[] | null;
channelMatchMode?: 'prefer' | 'any_required' | 'all_required' | string | null;
freshness?: 'live' | 'database_first' | 'hybrid' | string | null;
```

Ao criar campanha automática/forçada, repassar:

```ts
engine: 'hbx',
requiredChannels: config.requiredChannels || input.requiredChannels || [],
preferredChannels: config.preferredChannels || input.preferredChannels || [],
channelMatchMode: config.channelMatchMode || input.channelMatchMode || 'prefer',
freshness: 'live',
```

Para o caso `force=email`:

```json
{
  "engine": "hbx",
  "requiredChannels": ["email"],
  "channelMatchMode": "all_required",
  "freshness": "live"
}
```

## Windows app

Arquivo: `hbx-owner/windows-app/hbx_owner_app.py`

Mudanças:

- Remover `"Radar Motores"` de `TAB_NAMES`.
- Remover o branch que chama `_build_radar_engines_tab(frame)`.
- Deprecar `open_radar_owner_panel()` e não abrir navegador.
- Reusar a tabela/ações de `_build_radar_engines_tab` dentro de `_build_ops_control_tab`.
- Incluir controles:
  - Escopo: `localhost`, `vps`, `both`.
  - Canal obrigatório: `email`, `whatsapp`, `instagram`, `website`, `phone`, `facebook`.
  - Botões: `Turbo LOCAL`, `Turbo VPS`, `Turbo ambos`, `Forçar filtro`, `Cancelar scraping`, `Atualizar cockpit`.

## Local agent

Arquivo: `hbx-owner/local-agent/server.js`

Novos endpoints sugeridos:

```txt
GET  /opscontrol/cockpit
POST /opscontrol/turbo
POST /opscontrol/force-filter
POST /opscontrol/scrape
POST /opscontrol/cancel
```

Payload comum:

```json
{
  "scope": "both",
  "intensity": "turbo",
  "engine": "hbx",
  "requiredChannels": ["email"],
  "channelMatchMode": "all_required",
  "freshness": "live",
  "targetTotal": 300
}
```

Regras:

- Sem campo de comando livre.
- Localhost chama backend local ou comandos whitelistados.
- VPS usa `ops_vps_ssh_target`/config equivalente e apenas comandos whitelistados.
- O cockpit só mostra/aciona VPS quando o alvo estiver online.

## Frontend `/bancodedados`

Arquivo: `frontend/src/app/bancodedados/page.client.tsx`

Mudanças:

- Remover `"motores"` de `TabId`.
- Remover o item `Motores` de `TABS`.
- `normalizeTab` não deve aceitar `motores`.
- `loadAll` não deve chamar `fetchElasticStatus`.
- Remover KPI `Motores`.
- Remover renderização de `<ElasticEnginePanel />` na guia `motores`.
- Remover botão/atalho que manda para `/master` dentro dessa tela.

