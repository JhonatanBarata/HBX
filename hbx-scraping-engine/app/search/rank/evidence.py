from pydantic import BaseModel, Field


class Evidence(BaseModel):
    identityScore: int = 0
    contactScore: int = 0
    sourceScore: int = 0
    intentScore: int = 0
    commercialFitScore: int = 0
    freshnessScore: int = 0
    penalties: list[str] = Field(default_factory=list)
    penaltyScore: int = 0
    channels: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    finalScore: int = 0
