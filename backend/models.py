"""Pydantic models for profile CRUD operations."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ProfileCreate(BaseModel):
    name: str
    fingerprint_seed: int | None = None  # random if not set
    proxy: str | None = None  # "http://user:pass@host:port" or null
    timezone: str | None = None  # "America/New_York"
    locale: str | None = None  # "en-US"
    platform: Literal["windows", "macos", "linux"] = "windows"
    user_agent: str | None = None
    screen_width: int = 1920
    screen_height: int = 1080
    gpu_vendor: str | None = None
    gpu_renderer: str | None = None
    hardware_concurrency: int | None = None
    humanize: bool = False
    human_preset: Literal["default", "careful"] = "default"
    headless: bool = False
    geoip: bool = False
    clipboard_sync: bool = True
    color_scheme: Literal["light", "dark", "no-preference"] | None = None
    notes: str | None = None
    tags: list[TagCreate] | None = None


class ProfileUpdate(BaseModel):
    name: str | None = None
    fingerprint_seed: int | None = None
    proxy: str | None = Field(default=None)
    timezone: str | None = Field(default=None)
    locale: str | None = Field(default=None)
    platform: Literal["windows", "macos", "linux"] | None = None
    user_agent: str | None = Field(default=None)
    screen_width: int | None = None
    screen_height: int | None = None
    gpu_vendor: str | None = Field(default=None)
    gpu_renderer: str | None = Field(default=None)
    hardware_concurrency: int | None = Field(default=None)
    humanize: bool | None = None
    human_preset: Literal["default", "careful"] | None = None
    headless: bool | None = None
    geoip: bool | None = None
    clipboard_sync: bool | None = None
    color_scheme: Literal["light", "dark", "no-preference"] | None = Field(default=None)
    notes: str | None = Field(default=None)
    tags: list[TagCreate] | None = None


class TagCreate(BaseModel):
    tag: str
    color: str | None = None  # hex color


class TagResponse(BaseModel):
    tag: str
    color: str | None = None


class ProfileResponse(BaseModel):
    id: str
    name: str
    fingerprint_seed: int
    proxy: str | None = None
    timezone: str | None = None
    locale: str | None = None
    platform: str = "windows"
    user_agent: str | None = None
    screen_width: int = 1920
    screen_height: int = 1080
    gpu_vendor: str | None = None
    gpu_renderer: str | None = None
    hardware_concurrency: int | None = None
    humanize: bool = False
    human_preset: str = "default"
    headless: bool = False
    geoip: bool = False
    clipboard_sync: bool = True

    @field_validator("clipboard_sync", mode="before")
    @classmethod
    def coerce_clipboard_sync(cls, v: object) -> bool:
        return v if v is not None else True

    color_scheme: str | None = None
    notes: str | None = None
    user_data_dir: str
    created_at: str
    updated_at: str
    tags: list[TagResponse] = []
    status: str = "stopped"  # "running" | "stopped"
    vnc_ws_port: int | None = None
    cdp_url: str | None = None


class LaunchResponse(BaseModel):
    profile_id: str
    status: str = "running"
    vnc_ws_port: int
    display: str
    cdp_url: str | None = None


class StatusResponse(BaseModel):
    running_count: int
    binary_version: str
    profiles_total: int


class ProfileStatusResponse(BaseModel):
    status: str  # "running" | "stopped"
    vnc_ws_port: int | None = None
    display: str | None = None
    cdp_url: str | None = None


class ClipboardRequest(BaseModel):
    text: str = Field(max_length=1_048_576)  # 1MB max


class TagUpdateRequest(BaseModel):
    new_name: str | None = None
    color: str | None = Field(default=None)


class TagListResponse(BaseModel):
    tag: str
    color: str | None = None
    profile_count: int


class LoginRequest(BaseModel):
    token: str


# ── Proxy Pool ────────────────────────────────────────────────────────────────


class ProxyCreate(BaseModel):
    name: str
    url: str  # http://user:pass@host:port or socks5://...
    type: Literal["http", "https", "socks5"] = "http"
    status: Literal["active", "disabled"] = "active"
    notes: str | None = None


class ProxyUpdate(BaseModel):
    name: str | None = None
    url: str | None = Field(default=None)
    type: Literal["http", "https", "socks5"] | None = None
    status: Literal["active", "disabled"] | None = None
    notes: str | None = Field(default=None)


class ProxyResponse(BaseModel):
    id: str
    name: str
    url: str
    type: str
    status: str
    notes: str | None = None
    profile_count: int = 0
    created_at: str
    updated_at: str


class ProxyCheckResponse(BaseModel):
    ok: bool
    ip: str | None = None
    country: str | None = None
    latency_ms: int | None = None
    error: str | None = None


# ── Admin ─────────────────────────────────────────────────────────────────────


class AdminStatsResponse(BaseModel):
    running_count: int
    profiles_total: int
    proxies_total: int
    tags_total: int
    binary_version: str


class AdminSettingsResponse(BaseModel):
    auth_enabled: bool
    data_dir: str
    binary_version: str


class DiskUsageResponse(BaseModel):
    disk_usage_mb: float


class CleanupResponse(BaseModel):
    deleted_count: int
