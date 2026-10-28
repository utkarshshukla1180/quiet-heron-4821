"""Pydantic models for API responses."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

Source = Literal["cache", "live", "snapshot"]


class Stats(BaseModel):
    n: int
    mae: float | None
    rmse: float | None
    bias: float | None
    nmae_pct: float | None
    p10: float | None
    p50: float | None
    p90: float | None


class GroupStats(Stats):
    group: str | int


class Health(BaseModel):
    status: str
    elexon_reachable: bool
    warmup: str
    cached_days: dict[str, int]
    default_start: str
    default_end: str


class SeriesPoint(BaseModel):
    t: datetime
    actual: float | None
    forecast: float | None
    publish_time: datetime | None
    horizon_h: float | None
    error: float | None


class SeriesResponse(BaseModel):
    source: Source
    unavailable_days: list[str]
    counts: dict[str, int]
    points: list[SeriesPoint]


class MetricsResponse(BaseModel):
    source: Source
    unavailable_days: list[str]
    group_by: str
    overall: Stats
    groups: list[GroupStats]


class Vintage(BaseModel):
    publish_time: datetime
    forecast: float
    horizon_h: float


class VintagesResponse(BaseModel):
    source: Source
    slot: datetime
    actual: float | None
    vintages: list[Vintage]