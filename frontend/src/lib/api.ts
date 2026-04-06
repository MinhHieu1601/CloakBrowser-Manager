/**
 * API client for CloakBrowser Manager backend.
 */

export interface Profile {
  id: string;
  name: string;
  fingerprint_seed: number;
  proxy: string | null;
  timezone: string | null;
  locale: string | null;
  platform: string;
  user_agent: string | null;
  screen_width: number;
  screen_height: number;
  gpu_vendor: string | null;
  gpu_renderer: string | null;
  hardware_concurrency: number | null;
  humanize: boolean;
  human_preset: string;
  headless: boolean;
  geoip: boolean;
  clipboard_sync: boolean;
  color_scheme: string | null;
  notes: string | null;
  user_data_dir: string;
  created_at: string;
  updated_at: string;
  tags: { tag: string; color: string | null }[];
  status: "running" | "stopped";
  vnc_ws_port: number | null;
  cdp_url: string | null;
}

export interface ProfileCreateData {
  name: string;
  fingerprint_seed?: number | null;
  proxy?: string | null;
  timezone?: string | null;
  locale?: string | null;
  platform?: string;
  user_agent?: string | null;
  screen_width?: number;
  screen_height?: number;
  gpu_vendor?: string | null;
  gpu_renderer?: string | null;
  hardware_concurrency?: number | null;
  humanize?: boolean;
  human_preset?: string;
  headless?: boolean;
  geoip?: boolean;
  clipboard_sync?: boolean;
  color_scheme?: string | null;
  notes?: string | null;
  tags?: { tag: string; color: string | null }[];
}

export interface LaunchResult {
  profile_id: string;
  status: string;
  vnc_ws_port: number;
  display: string;
  cdp_url: string | null;
}

export interface SystemStatus {
  running_count: number;
  binary_version: string;
  profiles_total: number;
}

export interface TagInfo {
  tag: string;
  color: string | null;
  profile_count: number;
}

export interface ProxyInfo {
  id: string;
  name: string;
  url: string;
  type: string;
  status: string;
  notes: string | null;
  profile_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProxyCreateData {
  name: string;
  url: string;
  type?: string;
  status?: string;
  notes?: string | null;
}

export interface ProxyCheckResult {
  ok: boolean;
  ip: string | null;
  country: string | null;
  latency_ms: number | null;
  error: string | null;
}

export interface AdminStats {
  running_count: number;
  profiles_total: number;
  proxies_total: number;
  tags_total: number;
  binary_version: string;
}

export interface AdminSettings {
  auth_enabled: boolean;
  data_dir: string;
  binary_version: string;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Global 401 callback — set by App to trigger login page on auth failure
let _onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: (() => void) | null) {
  _onUnauthorized = cb;
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  }).catch((err) => {
    // Network errors (backend down, CORS, etc.) — rethrow with useful message
    throw new Error(err instanceof Error ? err.message : "Network error");
  });
  if (!res.ok) {
    if (res.status === 401 && _onUnauthorized) {
      _onUnauthorized();
      throw new ApiError(401, "Unauthorized");
    }
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail || res.statusText);
  }
  return res.json();
}

export const api = {
  authStatus: () =>
    request<{ auth_required: boolean; authenticated: boolean }>("/api/auth/status"),

  login: (token: string) =>
    request<{ ok: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  logout: () =>
    request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  listProfiles: () => request<Profile[]>("/api/profiles"),

  getProfile: (id: string) => request<Profile>(`/api/profiles/${id}`),

  createProfile: (data: ProfileCreateData) =>
    request<Profile>("/api/profiles", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateProfile: (id: string, data: Partial<ProfileCreateData>) =>
    request<Profile>(`/api/profiles/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteProfile: (id: string) =>
    request<{ ok: boolean }>(`/api/profiles/${id}`, { method: "DELETE" }),

  launchProfile: (id: string) =>
    request<LaunchResult>(`/api/profiles/${id}/launch`, { method: "POST" }),

  stopProfile: (id: string) =>
    request<{ ok: boolean }>(`/api/profiles/${id}/stop`, { method: "POST" }),

  getStatus: () => request<SystemStatus>("/api/status"),

  setClipboard: (id: string, text: string) =>
    request<{ ok: boolean }>(`/api/profiles/${id}/clipboard`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  getClipboard: (id: string) =>
    request<{ text: string }>(`/api/profiles/${id}/clipboard`),

  // Tag management
  listTags: () => request<TagInfo[]>("/api/tags"),

  updateTag: (tagName: string, data: { new_name?: string; color?: string | null }) =>
    request<TagInfo[]>(`/api/tags/${encodeURIComponent(tagName)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteTag: (tagName: string) =>
    request<{ ok: boolean; removed_from: number }>(
      `/api/tags/${encodeURIComponent(tagName)}`,
      { method: "DELETE" },
    ),

  // Proxy pool
  listProxies: () => request<ProxyInfo[]>("/api/proxies"),

  createProxy: (data: ProxyCreateData) =>
    request<ProxyInfo>("/api/proxies", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateProxy: (id: string, data: Partial<ProxyCreateData>) =>
    request<ProxyInfo>(`/api/proxies/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteProxy: (id: string) =>
    request<{ ok: boolean }>(`/api/proxies/${id}`, { method: "DELETE" }),

  checkProxy: (id: string) =>
    request<ProxyCheckResult>(`/api/proxies/${id}/check`),

  // Admin
  getAdminStats: (signal?: AbortSignal) =>
    request<AdminStats>("/api/admin/stats", signal ? { signal } : undefined),

  getAdminSettings: (signal?: AbortSignal) =>
    request<AdminSettings>("/api/admin/settings", signal ? { signal } : undefined),

  getDiskUsage: () =>
    request<{ disk_usage_mb: number | null; updated_at: string | null }>("/api/admin/disk-usage"),

  refreshDiskUsage: () =>
    request<{ disk_usage_mb: number; updated_at: string | null }>("/api/admin/disk-usage", {
      method: "POST",
    }),

  exportData: () =>
    request<{ profiles: Profile[]; proxies: ProxyInfo[] }>("/api/admin/export", {
      method: "POST",
    }),

  importData: (data: { profiles?: unknown[]; proxies?: unknown[] }) =>
    request<{ ok: boolean; imported_profiles: number; imported_proxies: number }>(
      "/api/admin/import",
      { method: "POST", body: JSON.stringify(data) },
    ),

  cleanupStopped: () =>
    request<{ deleted_count: number }>("/api/admin/cleanup", { method: "POST" }),
};
