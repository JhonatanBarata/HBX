# Codex — Corrigir Radar Social + Backend de Planos

Objetivo: corrigir o Radar sem reintroduzir a regra que bloqueava tudo. Canal social/site/email/WhatsApp deve ser **hint de enriquecimento e filtro visual**, nunca bloqueio de descoberta. Card rico é produto, não prêmio cosmético.

Base observada: `1880b09` + `a4dabea`.

## Problema real

O commit `1880b09` removeu corretamente o descarte por `required_channel_missing`, mas também zerou canais dentro do motor Python. Com isso, o motor deixou de tentar enriquecer Instagram/Facebook/website/email.

No backend Nest, `maskRadarSmartFieldsForList` ainda apaga `email`, `instagramUrl`, `facebookUrl`, `googleMapsUrl`, `businessCategory` etc. Isso faz parecer que o motor não achou nada, mesmo quando achou.

## Regra principal

Nunca apagar campos ricos reais do card:

- `phone`
- `phoneDigits`
- `whatsappStatus`
- `whatsappCheckStatus`
- `website`
- `email`
- `emailStatus`
- `instagramUrl`
- `facebookUrl`
- `googleMapsUrl`
- `rating`
- `reviews`
- `businessCategory`
- `socialStatus`
- `socialConfidence`

Plano pode limitar apenas inteligência avançada:

- `painType`
- `painLabel`
- `painPitch`
- `recommendedChannel` quando for recomendação IA, não canal óbvio
- `qualityV2`
- `enrichmentJson` completo
- score avançado/premium
- templates/mensagens/automação

## Parte A — Motor Python: restaurar hints sociais sem bloquear

Arquivo:

`hbx-scraping-engine/app/schemas.py`

Já existe patch parcial em `a4dabea`: `preferredChannels` e `requiredChannels` devem normalizar canais em vez de retornar `[]`.

Garantir que existam aliases:

```py
CHANNEL_ALIASES = {
    "insta": "instagram",
    "instagram": "instagram",
    "ig": "instagram",
    "facebook": "facebook",
    "face": "facebook",
    "fb": "facebook",
    "site": "website",
    "website": "website",
    "web": "website",
    "email": "email",
    "e-mail": "email",
    "mail": "email",
    "telefone": "phone",
    "phone": "phone",
    "whatsapp": "whatsapp",
    "wpp": "whatsapp",
    "zap": "whatsapp",
}
```

E:

```py
def normalize_channel_list(values: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for value in values or []:
        key = str(value or "").strip().lower().replace("_", "-")
        channel = CHANNEL_ALIASES.get(key)
        if channel and channel not in seen:
            seen.add(channel)
            normalized.append(channel)
    return normalized
```

## Parte B — Motor Python: usar hints no search_service

Arquivo:

`hbx-scraping-engine/app/services/search_service.py`

### 1. Trocar funções que foram zeradas

Substituir:

```py
def requested_social_channels(...):
    return set()

def required_social_channels(...):
    return set()

def has_required_social_channels(...):
    return True
```

Por:

```py
def requested_social_channels(
    self,
    preferred_channels: list[str] | None = None,
    required_channels: list[str] | None = None,
) -> set[str]:
    channels = set(preferred_channels or []) | set(required_channels or [])
    return {channel for channel in channels if channel in {"instagram", "facebook"}}


def required_social_channels(self, required_channels: list[str] | None = None) -> set[str]:
    return {channel for channel in (required_channels or []) if channel in {"instagram", "facebook"}}


def has_required_social_channels(self, contact: dict, required_channels: set[str]) -> bool:
    if not required_channels:
        return True
    # Legacy compatibility only. Não usar isso para bloquear busca principal.
    return any(
        contact.get("instagramUrl" if channel == "instagram" else "facebookUrl")
        for channel in required_channels
    )
```

### 2. Corrigir `enrich_social_links_for_contacts`

Hoje está assim:

```py
requested_channels: set[str] = set()
required_social: set[str] = set()
```

Trocar por:

```py
requested_channels = self.requested_social_channels(preferred_channels, required_channels)
required_social = self.required_social_channels(required_channels)
```

Importante: `required_social` é prioridade de busca, não bloqueio de entrega.

### 3. Corrigir `enrich_lead`

Hoje está assim:

```py
required_channels: set[str] = set()
website_required = bool({"website", "site"} & required_channels)
social_required = bool({"instagram", "facebook"} & required_channels)
...
preferred_channels: list[str] = []
contacts, social_stats = self.enrich_social_links_for_contacts(..., preferred_channels, [], ...)
```

Trocar por:

```py
preferred_channels = list(request.preferredChannels or [])
required_channels = set(request.requiredChannels or [])
website_required = "website" in required_channels
social_required = bool({"instagram", "facebook"} & required_channels)
...
contacts, social_stats = self.enrich_social_links_for_contacts(
    [contact],
    request.city,
    request.state,
    request.segment,
    preferred_channels,
    list(required_channels),
    time_budget_seconds=self.remaining_budget_seconds(deadline, budget_seconds),
)
```

### 4. Corrigir `search`

Hoje está assim:

```py
requested_social_channels: set[str] = set()
required_social_channels: set[str] = set()
social_requested = bool(requested_social_channels)
```

Trocar por:

```py
requested_social_channels = self.requested_social_channels(request.preferredChannels, request.requiredChannels)
required_social_channels = self.required_social_channels(request.requiredChannels)
social_requested = bool(requested_social_channels)
```

### 5. Corrigir chamadas para descoberta/enriquecimento social

Hoje descoberta recebe listas vazias:

```py
discover_social_profiles(..., [], [])
```

Trocar por:

```py
discover_social_profiles(
    request.city,
    request.state,
    request.segment,
    request.limit,
    list(requested_social_channels),
    list(required_social_channels),
)
```

Hoje enriquecimento recebe listas vazias:

```py
self.enrich_social_links_for_contacts(..., [], [])
```

Trocar por:

```py
self.enrich_social_links_for_contacts(
    deduped,
    request.city,
    request.state,
    request.segment,
    list(requested_social_channels),
    list(required_social_channels),
)
```

### 6. Não bloquear item por canal social ausente

Manter:

```py
stats["missing_required_channel"] = 0
```

Não voltar a descartar item no loop principal por `required_social_channels`.

## Parte C — Backend Nest: List/Lite não pode apagar card rico

Arquivo:

`backend/src/webscraping/webscraping.service.ts`

Função:

`maskRadarSmartFieldsForList`

Hoje ela zera campos essenciais. Substituir a função por esta versão:

```ts
private maskRadarSmartFieldsForList(item: any) {
  const validInstagram = item?.instagramUrl
    && !looksLikeThirdPartySocialProfile(item.instagramUrl)
    && socialProfileLooksCompatibleWithLead(item, item.instagramUrl);
  const validFacebook = item?.facebookUrl
    && !looksLikeThirdPartySocialProfile(item.facebookUrl)
    && socialProfileLooksCompatibleWithLead(item, item.facebookUrl);
  const safeEmail = normalizeBusinessEmail(item?.email);
  const hadPremiumSignal = Boolean(
    item?.recommendedChannel
    || item?.painType
    || item?.painLabel
    || item?.painPitch
    || item?.opportunityReason
    || item?.enrichmentScore
    || item?.qualityV2
    || item?.enrichmentJson
  );

  return {
    ...item,

    // Campo rico real do card: NÃO apagar no List/Lite.
    email: safeEmail || item?.email || null,
    emailStatus: item?.emailStatus || (safeEmail ? 'probable' : 'missing'),
    emailSource: item?.emailSource || null,
    emailConfidence: item?.emailConfidence || 0,
    instagramUrl: validInstagram ? item.instagramUrl : null,
    facebookUrl: validFacebook ? item.facebookUrl : null,
    socialStatus: validInstagram || validFacebook ? item?.socialStatus || 'found' : item?.socialStatus || 'missing',
    socialConfidence: validInstagram || validFacebook ? item?.socialConfidence || 0 : 0,
    googleMapsUrl: item?.googleMapsUrl || null,
    businessCategory: item?.businessCategory || null,
    openingHoursStatus: item?.openingHoursStatus || null,
    whatsappStatus: item?.whatsappStatus || item?.whatsappCheckStatus || 'unverified',
    whatsappCheckStatus: item?.whatsappCheckStatus || item?.whatsappStatus || 'unverified',
    website: item?.website || null,
    rating: item?.rating ?? null,
    reviews: item?.reviews ?? null,

    // Premium/IA: pode mascarar.
    recommendedChannel: this.isRadarProtectedStatus(item?.companyStatus || item?.status) ? 'discard' : null,
    painType: null,
    painLabel: null,
    painPitch: null,
    enrichmentScore: 0,
    enrichmentConfidence: 0,
    enrichmentJson: null,
    qualityV2: null,
    quality: null,
    lastEnrichedAt: null,

    premiumLocked: true,
    premiumFeatureStatus: 'locked',
    premiumTeaser: hadPremiumSignal,
  };
}
```

## Parte D — Backend Nest: `stripListPremiumFields` não pode apagar sinais úteis do search-run

Arquivo:

`backend/src/webscraping/webscraping.service.ts`

Função:

`stripListPremiumFields`

Hoje ela apaga `quality`, `qualityV2`, `enrichmentJson`, mas preserva social/email porque eles já estão no `publicItem`. Manter social/email/site/maps/rating/reviews.

Substituir apenas o bloco:

```ts
['score', 'enrichmentJson', 'quality', 'qualityV2'].forEach((key) => delete clean[key]);
```

Por:

```ts
['score', 'enrichmentJson', 'quality', 'qualityV2'].forEach((key) => delete clean[key]);
clean.recommendedChannel = null;
clean.painType = null;
clean.painLabel = null;
clean.painPitch = null;
```

Não deletar:

```ts
instagramUrl
facebookUrl
email
website
googleMapsUrl
rating
reviews
whatsappStatus
```

## Parte E — Testes obrigatórios

### Python — adicionar/ajustar testes

Criar/ajustar em `hbx-scraping-engine/tests` se existir, ou adicionar teste equivalente no padrão atual:

1. `SearchRequest` preserva `preferredChannels=['instagram']`.
2. `SearchRequest` normaliza aliases `insta`, `fb`, `site`, `wpp`.
3. `SearchService.requested_social_channels(['instagram'], [])` retorna `{'instagram'}`.
4. `SearchService.enrich_social_links_for_contacts` roda quando Instagram é preferido.
5. Search com Instagram preferido não descarta card sem Instagram; só tenta enriquecer.

### Backend — adicionar/ajustar em `backend/src/webscraping/webscraping.service.test.ts`

Adicionar teste:

```ts
test('maskRadarSmartFieldsForList preserva contato e contexto rico do card', () => {
  const service = new WebscrapingService(createPrisma()) as any;
  const item = service.maskRadarSmartFieldsForList({
    name: 'Oficina Rica',
    phone: '(19) 98888-0004',
    phoneDigits: '19988880004',
    website: 'https://oficinarica.com.br',
    instagramUrl: 'https://instagram.com/oficinarica',
    facebookUrl: 'https://facebook.com/oficinarica',
    email: 'contato@oficinarica.com.br',
    googleMapsUrl: 'https://maps.google.com/?cid=123',
    businessCategory: 'Oficina mecânica',
    rating: 4.8,
    reviews: 123,
    whatsappStatus: 'missing',
    recommendedChannel: 'email',
    painType: 'site_fraco',
    painPitch: 'Pitch premium',
    enrichmentJson: { premium: true },
    qualityV2: { version: 'lead-quality-v2' },
  });

  assert.equal(item.website, 'https://oficinarica.com.br');
  assert.equal(item.instagramUrl, 'https://instagram.com/oficinarica');
  assert.equal(item.facebookUrl, 'https://facebook.com/oficinarica');
  assert.equal(item.email, 'contato@oficinarica.com.br');
  assert.equal(item.googleMapsUrl, 'https://maps.google.com/?cid=123');
  assert.equal(item.businessCategory, 'Oficina mecânica');
  assert.equal(item.rating, 4.8);
  assert.equal(item.reviews, 123);
  assert.equal(item.whatsappStatus, 'missing');

  assert.equal(item.recommendedChannel, null);
  assert.equal(item.painType, null);
  assert.equal(item.painPitch, null);
  assert.equal(item.enrichmentJson, null);
  assert.equal(item.qualityV2, null);
  assert.equal(item.premiumLocked, true);
});
```

Adicionar também teste de integração para Radar List:

- card com `instagramUrl` e `facebookUrl` deve aparecer no retorno mesmo sem Lead+;
- card sem social deve continuar aparecendo se tem telefone/site/email;
- filtro social deve ser aplicado na tela de Vendas, não no motor.

## Critério de aceite

1. Buscar `oficina Campinas SP` com Instagram preferido deve tentar achar Instagram/Facebook.
2. Se não achar Instagram, o card com telefone/site/email continua aparecendo.
3. Se achar Instagram/Facebook, eles aparecem no card também no List/Lite.
4. Lite/List não recebe pitch/IA avançada, mas recebe canais reais.
5. `missing_required_channel` pode aparecer como diagnóstico, mas nunca pode reduzir `approved` sozinho.
6. `whatsappCheckMode=only_valid` ainda pode filtrar WhatsApp explicitamente, mas isso deve ser escolha separada, não efeito colateral de plano/canal.

## Resumo operacional

A regra final é:

```txt
Canal pedido = tenta enriquecer / prioriza / permite filtro visual.
Canal ausente = não bloqueia descoberta.
Plano List = card rico básico visível.
Plano Lead+ = inteligência, priorização e automação extras.
```
