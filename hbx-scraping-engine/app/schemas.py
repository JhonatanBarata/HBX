from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TargetType = Literal["pj", "pf", "agenda_pf"]
ChannelMatchMode = Literal["prefer", "any_required", "all_required"]
FreshnessMode = Literal["live", "database_first", "hybrid"]

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


def normalize_card_discovery_contract(model: BaseModel) -> BaseModel:
    model.preferredChannels = normalize_channel_list(getattr(model, "preferredChannels", []) or [])
    model.requiredChannels = normalize_channel_list(getattr(model, "requiredChannels", []) or [])
    if getattr(model, "channelMatchMode", None) not in {"prefer", "any_required", "all_required"}:
        model.channelMatchMode = "prefer"
    if isinstance(getattr(model, "salesProfile", None), dict):
        model.salesProfile = {
            key: value
            for key, value in model.salesProfile.items()
            if key not in {"preferredChannels", "requiredChannels", "channelMatchMode"}
        }
    return model


class SearchRequest(BaseModel):
    city: str = ""
    state: str = ""
    radiusKm: int = Field(0, ge=0, le=250)
    originLat: float | None = Field(None, ge=-90, le=90)
    originLng: float | None = Field(None, ge=-180, le=180)
    segment: str = ""
    segments: list[str] = Field(default_factory=list)
    query: str = ""
    targetType: TargetType = "pj"
    limit: int = Field(10, ge=1, le=100)
    quantity: int | None = Field(None, ge=1, le=100)
    batchLimit: int | None = Field(None, ge=1, le=100)
    fresh: bool = False
    excludePhoneDigits: list[str] = Field(default_factory=list)
    excludeUrls: list[str] = Field(default_factory=list)
    preferredChannels: list[str] = Field(default_factory=list)
    requiredChannels: list[str] = Field(default_factory=list)
    channelMatchMode: ChannelMatchMode = "prefer"
    freshness: FreshnessMode = "live"
    whatDoYouSell: str | None = None
    offerCategory: str | None = None
    targetAudience: dict | list[str] | None = None
    targetSegments: dict | list[str] | None = None
    avoidSegments: dict | list[str] | None = None
    hardRejectSegments: list[str] | None = None
    leadPreferences: dict | None = None
    negativeRules: dict | None = None
    salesProfile: dict | None = None

    @field_validator("city", "state", "segment", "query")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return " ".join(str(value or "").split())

    @field_validator("state")
    @classmethod
    def normalize_state(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("excludePhoneDigits")
    @classmethod
    def normalize_exclude_phone_digits(cls, values: list[str]) -> list[str]:
        seen: set[str] = set()
        normalized: list[str] = []
        for value in values or []:
            digits = "".join(ch for ch in str(value or "") if ch.isdigit())
            if digits.startswith("55") and len(digits) > 11:
                digits = digits[2:]
            if digits and digits not in seen:
                seen.add(digits)
                normalized.append(digits)
        return normalized

    @field_validator("excludeUrls")
    @classmethod
    def normalize_exclude_urls(cls, values: list[str]) -> list[str]:
        seen: set[str] = set()
        normalized: list[str] = []
        for value in values or []:
            url = str(value or "").strip().rstrip("/")
            if url and url not in seen:
                seen.add(url)
                normalized.append(url)
        return normalized

    @field_validator("preferredChannels", "requiredChannels")
    @classmethod
    def normalize_channels(cls, values: list[str]) -> list[str]:
        return normalize_channel_list(values)

    @field_validator("segments")
    @classmethod
    def normalize_segments(cls, values: list[str]) -> list[str]:
        seen: set[str] = set()
        normalized: list[str] = []
        for value in values or []:
            item = " ".join(str(value or "").split())
            key = item.lower()
            if item and key not in seen:
                seen.add(key)
                normalized.append(item)
        return normalized

    @model_validator(mode="after")
    def validate_limit_by_target_type(self) -> "SearchRequest":
        if self.quantity is not None:
            self.limit = min(self.quantity, 100)
        if self.batchLimit is not None:
            self.limit = min(self.limit, self.batchLimit)
        if self.segment and self.segment not in self.segments:
            self.segments = [self.segment, *self.segments]
        if not self.segment and self.segments:
            self.segment = self.segments[0]
        if self.targetType in {"pf", "agenda_pf"} and (not self.city or not self.state):
            raise ValueError("cidade e estado sao obrigatorios")
        if self.targetType != "agenda_pf" and not self.segment:
            raise ValueError("segment é obrigatorio")
        max_limit = 100
        if self.limit > max_limit:
            raise ValueError(f"limit maximo para targetType={self.targetType} é {max_limit}")
        return normalize_card_discovery_contract(self)


class WebSearchRequest(BaseModel):
    query: str
    limit: int = Field(5, ge=1, le=10)
    fresh: bool = False

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        normalized = " ".join(str(value or "").split())
        if not normalized:
            raise ValueError("query é obrigatória")
        return normalized


class WebSearchResult(BaseModel):
    title: str
    url: str
    snippet: str = ""
    rank: int
    source: str
    fetchedAt: str


class WebSearchResponse(BaseModel):
    query: str
    count: int
    cached: bool = False
    results: list[WebSearchResult] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    stats: dict | None = None


class SearchIntent(BaseModel):
    city: str = ""
    state: str = ""
    radiusKm: int = 0
    originLat: float | None = None
    originLng: float | None = None
    segments: list[str] = Field(default_factory=list)
    targetType: TargetType = "pj"
    quantity: int = Field(10, ge=1, le=100)
    preferredChannels: list[str] = Field(default_factory=list)
    requiredChannels: list[str] = Field(default_factory=list)
    channelMatchMode: ChannelMatchMode = "prefer"
    freshness: FreshnessMode = "live"
    salesProfile: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def normalize_discovery_contract(self) -> "SearchIntent":
        return normalize_card_discovery_contract(self)

    @classmethod
    def from_request(cls, request: SearchRequest) -> "SearchIntent":
        return cls(
            city=request.city,
            state=request.state,
            radiusKm=request.radiusKm,
            originLat=request.originLat,
            originLng=request.originLng,
            segments=request.segments or ([request.segment] if request.segment else []),
            targetType=request.targetType,
            quantity=request.limit,
            preferredChannels=request.preferredChannels,
            requiredChannels=request.requiredChannels,
            channelMatchMode=request.channelMatchMode,
            freshness=request.freshness,
            salesProfile={
                **(request.salesProfile or {}),
                **({"whatDoYouSell": request.whatDoYouSell} if request.whatDoYouSell else {}),
                **({"offerCategory": request.offerCategory} if request.offerCategory else {}),
                **({"targetAudience": request.targetAudience} if request.targetAudience else {}),
                **({"targetSegments": request.targetSegments} if request.targetSegments else {}),
                **({"avoidSegments": request.avoidSegments} if request.avoidSegments else {}),
                **({"hardRejectSegments": request.hardRejectSegments} if request.hardRejectSegments else {}),
                **({"leadPreferences": request.leadPreferences} if request.leadPreferences else {}),
                **({"negativeRules": request.negativeRules} if request.negativeRules else {}),
            },
        )


class QueryPayload(BaseModel):
    city: str
    state: str
    radiusKm: int = 0
    originLat: float | None = None
    originLng: float | None = None
    segment: str = ""
    segments: list[str] = Field(default_factory=list)
    query: str = ""
    targetType: TargetType = "pj"
    limit: int
    quantity: int | None = None
    preferredChannels: list[str] = Field(default_factory=list)
    requiredChannels: list[str] = Field(default_factory=list)
    channelMatchMode: ChannelMatchMode = "prefer"
    freshness: FreshnessMode = "live"
    salesProfile: dict | None = None

    @model_validator(mode="after")
    def normalize_discovery_contract(self) -> "QueryPayload":
        return normalize_card_discovery_contract(self)


class ContactResult(BaseModel):
    # "allow": captura TODO dado localizado (cnpj, cnae, razão social, etc.) — nada é
    # descartado na origem. Exibir é decisão de quem consome (o sistema não expõe o
    # sensível por padrão). Decisão do dono 25/06: dado de graça não se joga fora.
    model_config = ConfigDict(extra="allow")

    name: str
    phone: str
    phoneDigits: str
    rating: float | None = None
    reviews: int | None = None
    address: str | None = None
    website: str | None = None
    email: str | None = None
    emailStatus: str | None = None
    emailSource: str | None = None
    emailConfidence: int | None = None
    instagramUrl: str | None = None
    facebookUrl: str | None = None
    socialStatus: str | None = None
    socialConfidence: int | None = None
    source: str = "hbx_scraping:web"
    sourceEngine: str | None = None
    sourceUrl: str | None = None
    score: int | None = None
    evidenceJson: dict | None = None
    enrichmentJson: dict | None = None
    rejectReasons: list[str] | None = None
    qualityReason: str | None = None
    visibilityTier: str | None = None
    deliveryProduct: str | None = None
    recommendedChannel: str | None = None
    # Dados de registro público (Receita/CNPJ) — capturados quando localizados.
    cnpj: str | None = None
    cnae: str | None = None
    razaoSocial: str | None = None


class EnrichLeadRequest(BaseModel):
    name: str
    phone: str = ""
    phoneDigits: str = ""
    city: str = ""
    state: str = ""
    segment: str = ""
    website: str | None = None
    email: str | None = None
    instagramUrl: str | None = None
    facebookUrl: str | None = None
    sourceUrl: str | None = None
    requestedFields: list[str] = Field(default_factory=list)
    preferredChannels: list[str] = Field(default_factory=list)
    requiredChannels: list[str] = Field(default_factory=list)
    timeBudgetSeconds: float | None = None
    allowPaid: bool = False
    allowPremium: bool = False
    debug: bool = False

    @field_validator("name", "phone", "phoneDigits", "city", "state", "segment")
    @classmethod
    def normalize_optional_text(cls, value: str) -> str:
        return " ".join(str(value or "").split())

    @field_validator("preferredChannels", "requiredChannels", "requestedFields")
    @classmethod
    def normalize_enrichment_channels(cls, values: list[str]) -> list[str]:
        # Enriquecimento deve respeitar hints de canal sem bloquear resultado.
        return normalize_channel_list(values)


class EnrichLeadResponse(BaseModel):
    name: str
    phone: str = ""
    phoneDigits: str = ""
    rating: float | None = None
    reviews: int | None = None
    address: str | None = None
    website: str | None = None
    email: str | None = None
    emailStatus: str = "missing"
    emailSource: str = "none"
    emailConfidence: int = 0
    instagramUrl: str | None = None
    facebookUrl: str | None = None
    linkedinUrl: str | None = None
    possibleSocialCandidates: list[dict] = Field(default_factory=list)
    nearbyResults: list[dict] = Field(default_factory=list)
    discardedResults: list[dict] = Field(default_factory=list)
    evidenceJson: dict | None = None
    googleMapsUrl: str | None = None
    cnpj: str | None = None
    socialStatus: str = "missing"
    socialConfidence: int = 0
    stats: dict | None = None


class SearchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    engine: Literal["hbx_scraping"] = "hbx_scraping"
    query: QueryPayload
    count: int
    results: list[ContactResult]
    status: Literal["completed", "completed_with_errors", "partial_error"] = "completed"
    errors: list[str] = Field(default_factory=list)
    stats: dict | None = None
    social: dict | None = None
