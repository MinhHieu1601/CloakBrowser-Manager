import { useCallback, useEffect, useRef, useState } from "react";
import { Download, HardDrive, Loader2, Lock, RefreshCw, Shield, Trash2, Upload } from "lucide-react";
import { api, type AdminSettings } from "../../lib/api";
import type { DiskUsageState } from "../AdminDashboard";

function DiskUsageRow({ disk }: { disk: DiskUsageState }) {
  const formatted = disk.diskMb !== null
    ? (disk.diskMb >= 1024 ? `${(disk.diskMb / 1024).toFixed(1)} GB` : `${disk.diskMb} MB`)
    : "—";

  return (
    <div>
      <div className="flex justify-between items-center">
        <span className="text-gray-500">Disk Usage</span>
        <span className="flex items-center gap-1.5 text-gray-300">
          {formatted}
          <button
            onClick={disk.refreshDisk}
            disabled={disk.diskLoading}
            className="p-0.5 rounded hover:bg-surface-4 text-gray-500 hover:text-gray-300 transition-colors"
            title="Calculate disk usage"
          >
            <RefreshCw className={`h-3 w-3 ${disk.diskLoading ? "animate-spin" : ""}`} />
          </button>
        </span>
      </div>
      {disk.diskUpdatedAt && (
        <div className="text-[10px] text-gray-600 text-right mt-0.5">
          Updated: {new Date(disk.diskUpdatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

interface SettingsPanelProps {
  disk: DiskUsageState;
}

export function SettingsPanel({ disk }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    api.getAdminSettings(controller.signal)
      .then(setSettings)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg.includes("abort") ? "Request timed out — is the backend running?" : msg);
      })
      .finally(() => { clearTimeout(timeout); setLoading(false); });
    return () => { controller.abort(); clearTimeout(timeout); };
  }, []);

  const showMessage = (type: "ok" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cloakbrowser-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage("ok", "Export downloaded successfully");
    } catch {
      showMessage("error", "Export failed");
    } finally {
      setExporting(false);
    }
  }, []);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await api.importData(data);
      showMessage(
        "ok",
        `Imported ${result.imported_profiles} profiles, ${result.imported_proxies} proxies`,
      );
    } catch {
      showMessage("error", "Import failed — invalid JSON file");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  const handleCleanup = useCallback(async () => {
    if (!confirm("Delete ALL stopped profiles and their browser data? This cannot be undone."))
      return;
    setCleaning(true);
    try {
      const result = await api.cleanupStopped();
      showMessage("ok", `Deleted ${result.deleted_count} stopped profile(s)`);
    } catch {
      showMessage("error", "Cleanup failed");
    } finally {
      setCleaning(false);
    }
  }, []);

  if (loading) {
    return <div className="text-gray-500 text-sm p-6">Loading...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4 text-sm">
          <div className="text-red-400 font-medium mb-1">Failed to load settings</div>
          <div className="text-gray-500 text-xs">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Message */}
      {message && (
        <div
          className={`px-4 py-2 rounded-md text-sm ${
            message.type === "ok"
              ? "bg-green-600/15 text-green-400 border border-green-600/30"
              : "bg-red-600/15 text-red-400 border border-red-600/30"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Auth */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" /> Authentication
        </h3>
        <div className="bg-surface-2 border border-border rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-300">
              Auth is{" "}
              <span className={settings?.auth_enabled ? "text-green-400 font-medium" : "text-gray-500"}>
                {settings?.auth_enabled ? "enabled" : "disabled"}
              </span>
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Set the <code className="bg-surface-4 px-1 py-0.5 rounded text-gray-400">AUTH_TOKEN</code> environment variable to enable authentication. Token management is only available via environment variables for security.
          </p>
        </div>
      </section>

      {/* Data Management */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <HardDrive className="h-3.5 w-3.5" /> Data Management
        </h3>
        <div className="space-y-3">
          <div className="bg-surface-2 border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-300">Export Data</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Download all profiles and proxies as JSON
                </div>
              </div>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="btn-secondary flex items-center gap-1.5 text-xs"
              >
                {exporting
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Download className="h-3 w-3" />}
                {exporting ? "Exporting..." : "Export"}
              </button>
            </div>
          </div>

          <div className="bg-surface-2 border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-300">Import Data</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Import profiles and proxies from a JSON file
                </div>
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
                  className="btn-secondary flex items-center gap-1.5 text-xs"
                >
                  {importing
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Upload className="h-3 w-3" />}
                  {importing ? "Importing..." : "Import"}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-surface-2 border border-red-600/20 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-red-400">Cleanup Stopped Profiles</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Delete all stopped profiles and their browser data permanently
                </div>
              </div>
              <button
                onClick={handleCleanup}
                disabled={cleaning}
                className="btn-danger flex items-center gap-1.5 text-xs"
              >
                {cleaning
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Trash2 className="h-3 w-3" />}
                {cleaning ? "Cleaning..." : "Cleanup"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* System Info */}
      {settings && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            System Info
          </h3>
          <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Chromium Version</span>
              <span className="text-gray-300">{settings.binary_version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Data Directory</span>
              <span className="text-gray-300 font-mono text-xs">{settings.data_dir}</span>
            </div>
            <DiskUsageRow disk={disk} />
          </div>
        </section>
      )}
    </div>
  );
}
