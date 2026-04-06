import { useCallback, useEffect, useState } from "react";
import { Activity, Database, Globe, HardDrive, Layers, Tag, RefreshCw } from "lucide-react";
import { api, type AdminStats } from "../../lib/api";
import type { DiskUsageState } from "../AdminDashboard";

function formatDisk(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

interface SystemOverviewProps {
  disk: DiskUsageState;
}

export function SystemOverview({ disk }: SystemOverviewProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const data = await api.getAdminStats(controller.signal);
      clearTimeout(timeout);
      setStats(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg.includes("abort") ? "Request timed out — is the backend running?" : msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading && !stats) {
    return <div className="text-gray-500 text-sm p-6">Loading...</div>;
  }

  if (error || !stats) {
    return (
      <div className="p-6">
        <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4 text-sm">
          <div className="text-red-400 font-medium mb-1">Failed to load system stats</div>
          <div className="text-gray-500 text-xs">{error ?? "Backend unreachable"}</div>
          <button onClick={refresh} className="btn-secondary text-xs mt-3">Retry</button>
        </div>
      </div>
    );
  }

  const cards: { label: string; value: string | number; icon: React.ReactNode; color: string }[] = [
    {
      label: "Running Browsers",
      value: stats.running_count,
      icon: <Activity className="h-5 w-5" />,
      color: stats.running_count > 0 ? "text-green-400" : "text-gray-500",
    },
    {
      label: "Total Profiles",
      value: stats.profiles_total,
      icon: <Layers className="h-5 w-5" />,
      color: "text-blue-400",
    },
    {
      label: "Proxy Pool",
      value: stats.proxies_total,
      icon: <Globe className="h-5 w-5" />,
      color: "text-purple-400",
    },
    {
      label: "Tags",
      value: stats.tags_total,
      icon: <Tag className="h-5 w-5" />,
      color: "text-amber-400",
    },
    {
      label: "Chromium Version",
      value: stats.binary_version,
      icon: <Database className="h-5 w-5" />,
      color: "text-gray-400",
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-gray-300">System Overview</h3>
        <button
          onClick={refresh}
          disabled={loading}
          className="btn-secondary flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-surface-2 border border-border rounded-lg p-4 flex items-start gap-3"
          >
            <div className={`${card.color} mt-0.5`}>{card.icon}</div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{card.label}</div>
              <div className="text-lg font-semibold text-gray-100">{card.value}</div>
            </div>
          </div>
        ))}
        {/* Disk Usage — loaded on demand */}
        <div className="bg-surface-2 border border-border rounded-lg p-4 flex items-start gap-3">
          <div className="text-cyan-400 mt-0.5"><HardDrive className="h-5 w-5" /></div>
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-1">Disk Usage</div>
            {disk.diskMb !== null ? (
              <>
                <div className="text-lg font-semibold text-gray-100">{formatDisk(disk.diskMb)}</div>
                {disk.diskUpdatedAt && (
                  <div className="text-[10px] text-gray-600 mt-0.5">
                    {new Date(disk.diskUpdatedAt).toLocaleString()}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-500">Click ↻ to calculate</div>
            )}
          </div>
          <button
            onClick={disk.refreshDisk}
            disabled={disk.diskLoading}
            className="p-1 rounded hover:bg-surface-4 text-gray-500 hover:text-gray-300 transition-colors mt-0.5"
            title="Calculate disk usage"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${disk.diskLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
