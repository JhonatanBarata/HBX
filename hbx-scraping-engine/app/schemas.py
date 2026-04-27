from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TargetType = Literal["pj", "pf"]


class SearchRequest(BaseModel):
    city: str
    state: str
    segment: str
    targetType: TargetType = "pj"
    limit: int = Field(10, ge=1, le=100)
    fresh: bool = False

    @field_validator("city", "state", "segment")
    @classmethod
    def required_text(cls, value: str) -> str:
        cleaned = " ".join(str(value or "").split())
        if not cleaned:
            raise ValueError("campo obrigatorio")
        return cleaned

    @field_validator("state")
    @classmethod
    def normalize_state(cls, value: str) -> str:
        return value.strip().upper()

    @model_validator(mode="after")
    def validate_limit_by_target_type(self) -> "SearchRequest":
        max_limit = 100 if self.targetType == "pf" else 50
        if self.limit > max_limit:
            raise ValueError(f"limit maximo para targetType={self.targetType} é {max_limit}")
        return self


class QueryPayload(BaseModel):
    city: str
    state: str
    segment: str
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
    source: str = "hbx_scraping:web"
    score: int


class SearchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    engine: Literal["hbx_scraping"] = "hbx_scraping"
    query: QueryPayload
    count: int
    results: list[ContactResult]
