import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { api, type TrashProfile } from "../../lib/api";

export function TrashBin() {
  const [items, setItems] = useState<TrashProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // profile id or "__empty__"
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listTrash());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const showMessage = (type: "ok" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleRestore = useCallback(async (id: string) => {
    setBusy(id);
    try {
      await api.restoreProfile(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      showMessage("ok", "Profile restored");
    } catch {
      showMessage("error", "Restore failed");
    } finally {
      setBusy(null);
    }
  }, []);

  const handlePermanentDelete = useCallback(async (id: string) => {
    if (!confirm("Permanently delete this profile and all browser data? This cannot be undone.")) return;
    setBusy(id);
    try {
      await api.permanentDeleteProfile(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      showMessage("ok", "Profile permanently deleted");
    } catch {
      showMessage("error", "Delete failed");
    } finally {
      setBusy(null);
    }
  }, []);

  const handleEmptyTrash = useCallback(async () => {
    if (!confirm(`Permanently delete all ${items.length} trashed profile(s)? This cannot be undone.`)) return;
    setBusy("__empty__");
    try {
      const result = await api.emptyTrash();
      setItems([]);
      showMessage("ok", `Deleted ${result.deleted_count} profile(s)`);
    } catch {
      showMessage("error", "Empty trash failed");
    } finally {
      setBusy(null);
    }
  }, [items.length]);

  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  if (loading) {
    return <div className="text-gray-500 text-sm p-6">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">
          Trash
          {items.length > 0 && (
            <span className="ml-2 text-xs text-gray-500 font-normal">
              {items.length} profile{items.length !== 1 ? "s" : ""}
            </span>
          )}
        </h3>
        {items.length > 0 && (
          <button
            onClick={handleEmptyTrash}
            disabled={busy === "__empty__"}
            className="btn-danger flex items-center gap-1.5 text-xs"
          >
            {busy === "__empty__"
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Trash2 className="h-3 w-3" />}
            Empty Trash
          </button>
        )}
      </div>

      {/* Message */}
      {message && (
        <div
          className={`px-4 py-2 rounded-md text-sm mb-4 ${
            message.type === "ok"
              ? "bg-green-600/15 text-green-400 border border-green-600/30"
              : "bg-red-600/15 text-red-400 border border-red-600/30"
          }`}
        >
          {message.text}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center text-gray-500 text-xs py-12">
          Trash is empty
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((profile) => (
            <div
              key={profile.id}
              className="bg-surface-2 border border-border rounded-lg px-4 py-3 flex items-center gap-3 group"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-300 truncate">
                    {profile.name}
                  </span>
                  <span className="text-[10px] text-gray-600 capitalize">{profile.platform}</span>
                  {profile.tags.length > 0 && (
                    <div className="flex gap-1">
                      {profile.tags.map((t) => (
                        <span
                          key={t.tag}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-4 text-gray-500"
                          style={t.color ? { backgroundColor: `${t.color}15`, color: t.color } : undefined}
                        >
                          {t.tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  Deleted {timeAgo(profile.deleted_at)}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleRestore(profile.id)}
                  disabled={busy === profile.id}
                  className="btn-secondary flex items-center gap-1 text-xs py-1 px-2"
                  title="Restore profile"
                >
                  {busy === profile.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <RotateCcw className="h-3 w-3" />}
                  Restore
                </button>
                <button
                  onClick={() => handlePermanentDelete(profile.id)}
                  disabled={busy === profile.id}
                  className="btn-danger flex items-center gap-1 text-xs py-1 px-2"
                  title="Delete permanently"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
