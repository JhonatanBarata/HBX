from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TargetType = Literal["pj", "pf", "agenda_pf"]


class SearchRequest(BaseModel):
    city: str = ""
    state: str = ""
    segment: str = ""
    query: str = ""
    targetType: TargetType = "pj"
    limit: int = Field(10, ge=1, le=100)
    batchLimit: int | None = Field(None, ge=1, le=100)
    fresh: bool = False
    excludePhoneDigits: list[str] = Field(default_factory=list)
    excludeUrls: list[str] = Field(default_factory=list)
    preferredChannels: list[str] = Field(default_factory=list)
    requiredChannels: list[str] = Field(default_factory=list)
    channelMatchMode: str | None = None

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
        return []

    @model_validator(mode="after")
    def validate_limit_by_target_type(self) -> "SearchRequest":
        if self.batchLimit is not None:
            self.limit = min(self.limit, self.batchLimit)
        if self.targetType in {"pf", "agenda_pf"} and (not self.city or not self.state):
            raise ValueError("cidade e estado sao obrigatorios")
        if self.targetType != "agenda_pf" and not self.segment:
            raise ValueError("segment é obrigatorio")
        max_limit = 100
        if self.limit > max_limit:
            raise ValueError(f"limit maximo para targetType={self.targetType} é {max_limit}")
        return self


class QueryPayload(BaseModel):
    city: str
    state: str
    segment: str = ""
    query: str = ""
    targetType: TargetType = "pj"
    limit: int


class ContactResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    phone: str
    phoneDigits: str
    rating: float | None = None
    reviews: int | None = None
    address: str | None = None
    website: str | None = None
    instagramUrl: str | None = None
    facebookUrl: str | None = None
    source: str = "hbx_scraping:web"
    score: int | None = None


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
    preferredChannels: list[str] = Field(default_factory=list)
    requiredChannels: list[str] = Field(default_factory=list)
    timeBudgetSeconds: float | None = None

    @field_validator("name", "phone", "phoneDigits", "city", "state", "segment")
    @classmethod
    def normalize_optional_text(cls, value: str) -> str:
        return " ".join(str(value or "").split())

    @field_validator("preferredChannels", "requiredChannels")
    @classmethod
    def normalize_enrichment_channels(cls, values: list[str]) -> list[str]:
        return []


class EnrichLeadResponse(BaseModel):
    name: str
    phone: str = ""
    phoneDigits: str = ""
    website: str | None = None
    email: str | None = None
    emailStatus: str = "missing"
    emailSource: str = "none"
    emailConfidence: int = 0
    instagramUrl: str | None = None
    facebookUrl: str | None = None
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
