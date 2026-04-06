import { useCallback, useState } from "react";
import { Check, Edit2, Loader2, Plus, Trash2, Wifi } from "lucide-react";
import { useProxies } from "../../hooks/useProxies";
import type { ProxyCheckResult, ProxyCreateData } from "../../lib/api";


const EMPTY_FORM: ProxyCreateData = { name: "", url: "", type: "http", status: "active", notes: null };

/** Normalize proxy shorthand formats to full URL.
 *  - host:port:user:pass → http://user:pass@host:port
 *  - host:port            → http://host:port
 *  - Already a URL        → unchanged
 */
function normalizeProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^(https?|socks5):\/\//i.test(trimmed)) return trimmed;
  const parts = trimmed.split(":");
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    return `http://${user}:${pass}@${host}:${port}`;
  }
  if (parts.length === 2) {
    return `http://${trimmed}`;
  }
  return trimmed;
}

export function ProxyPool() {
  const { proxies, loading, create, update, remove, check } = useProxies();
  const [editing, setEditing] = useState<string | null>(null); // proxy id or "__new__"
  const [form, setForm] = useState<ProxyCreateData>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [checkResults, setCheckResults] = useState<Record<string, ProxyCheckResult>>({});

  const startCreate = () => {
    setEditing("__new__");
    setForm({ ...EMPTY_FORM });
  };

  const startEdit = (id: string) => {
    const proxy = proxies.find((p) => p.id === id);
    if (!proxy) return;
    setEditing(id);
    setForm({
      name: proxy.name,
      url: proxy.url,
      type: proxy.type,
      status: proxy.status,
      notes: proxy.notes,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
  };

  const handleSave = useCallback(async () => {
    if (!form.name.trim() || !form.url.trim()) return;
    const normalized = { ...form, url: normalizeProxyUrl(form.url) };
    setSaving(true);
    try {
      if (editing === "__new__") {
        await create(normalized);
      } else if (editing) {
        await update(editing, normalized);
      }
      setEditing(null);
      setForm({ ...EMPTY_FORM });
    } finally {
      setSaving(false);
    }
  }, [editing, form, create, update]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this proxy?")) return;
    await remove(id);
  }, [remove]);

  const handleCheck = useCallback(async (id: string) => {
    setChecking(id);
    try {
      const result = await check(id);
      setCheckResults((prev) => ({ ...prev, [id]: result }));
    } finally {
      setChecking(null);
    }
  }, [check]);

  if (loading) {
    return <div className="text-gray-500 text-sm p-6">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">Proxy Pool</h3>
        <button onClick={startCreate} className="btn-primary flex items-center gap-1.5 text-xs">
          <Plus className="h-3 w-3" /> Add Proxy
        </button>
      </div>

      {/* Add/Edit form */}
      {editing && (
        <div className="bg-surface-2 border border-border rounded-lg p-4 mb-4 space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase">
            {editing === "__new__" ? "New Proxy" : "Edit Proxy"}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. US Residential #1"
              />
            </div>
            <div>
              <label className="label">URL</label>
              <input
                className="input"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="host:port:user:pass or http://user:pass@host:port"
              />
              <div className="text-[10px] text-gray-500 mt-0.5">host:port:user:pass · host:port · http://user:pass@host:port</div>
            </div>
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={form.type ?? "http"}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="socks5">SOCKS5</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={form.status ?? "active"}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <input
                className="input"
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-1.5 text-xs"
            >
              <Check className="h-3 w-3" />
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={cancelEdit} className="btn-secondary text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Proxy list */}
      {proxies.length === 0 && !editing ? (
        <div className="text-center text-gray-500 text-xs py-8">
          No proxies in pool. Click "Add Proxy" to get started.
        </div>
      ) : (
        <div className="space-y-1">
          {proxies.map((proxy) => {
            const result = checkResults[proxy.id];
            return (
              <div
                key={proxy.id}
                className="bg-surface-2 border border-border rounded-lg px-4 py-3 flex items-center gap-3 group"
              >
                {/* Status dot */}
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    proxy.status === "active" ? "bg-green-500" : "bg-gray-600"
                  }`}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-100 truncate">{proxy.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-4 text-gray-400 uppercase">
                      {proxy.type}
                    </span>
                    {proxy.profile_count > 0 && (
                      <span className="text-[10px] text-gray-500">
                        {proxy.profile_count} profile{proxy.profile_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">
                    {proxy.url}
                  </div>
                  {result && (
                    <div className={`text-xs mt-1 ${result.ok ? "text-green-400" : "text-red-400"}`}>
                      {result.ok
                        ? `✓ IP: ${result.ip}${result.country ? ` (${result.country})` : ""} — ${result.latency_ms}ms`
                        : `✗ ${result.error}`}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCheck(proxy.id)}
                    disabled={checking === proxy.id}
                    className="p-1.5 rounded hover:bg-surface-4 text-gray-500 hover:text-gray-300"
                    title="Test connectivity"
                  >
                    {checking === proxy.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Wifi className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => startEdit(proxy.id)}
                    className="p-1.5 rounded hover:bg-surface-4 text-gray-500 hover:text-gray-300"
                    title="Edit"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(proxy.id)}
                    className="p-1.5 rounded hover:bg-surface-4 text-red-500 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
