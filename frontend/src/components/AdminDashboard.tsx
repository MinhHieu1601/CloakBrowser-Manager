import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BarChart3, Globe, Settings } from "lucide-react";
import { api } from "../lib/api";
import { SystemOverview } from "./admin/SystemOverview";
import { ProxyPool } from "./admin/ProxyPool";
import { SettingsPanel } from "./admin/SettingsPanel";

type AdminTab = "overview" | "proxies" | "settings";

interface AdminDashboardProps {
  onBack: () => void;
}

export interface DiskUsageState {
  diskMb: number | null;
  diskUpdatedAt: string | null;
  diskLoading: boolean;
  refreshDisk: () => Promise<void>;
}

const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: "proxies", label: "Proxy Pool", icon: <Globe className="h-3.5 w-3.5" /> },
  { id: "settings", label: "Settings", icon: <Settings className="h-3.5 w-3.5" /> },
];

export function AdminDashboard({ onBack }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  // Shared disk usage state — persisted in backend DB
  const [diskMb, setDiskMb] = useState<number | null>(null);
  const [diskUpdatedAt, setDiskUpdatedAt] = useState<string | null>(null);
  const [diskLoading, setDiskLoading] = useState(false);

  // Load last saved value from DB on mount
  useEffect(() => {
    api.getDiskUsage().then((data) => {
      setDiskMb(data.disk_usage_mb);
      setDiskUpdatedAt(data.updated_at);
    }).catch(() => {});
  }, []);

  // Recalculate (slow) — only when user clicks refresh
  const refreshDisk = useCallback(async () => {
    setDiskLoading(true);
    try {
      const data = await api.refreshDiskUsage();
      setDiskMb(data.disk_usage_mb);
      setDiskUpdatedAt(data.updated_at);
    } catch {
      // keep last value
    } finally {
      setDiskLoading(false);
    }
  }, []);
  const diskState: DiskUsageState = { diskMb, diskUpdatedAt, diskLoading, refreshDisk };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-surface-1">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-surface-3 transition-colors"
          title="Back to profiles"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-sm font-semibold text-gray-200">Admin Dashboard</h2>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-6 pt-3 bg-surface-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-md text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-surface-0 text-gray-100 border border-border border-b-transparent"
                : "text-gray-500 hover:text-gray-300 hover:bg-surface-2"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6 bg-surface-0">
        {activeTab === "overview" && <SystemOverview disk={diskState} />}
        {activeTab === "proxies" && <ProxyPool />}
        {activeTab === "settings" && <SettingsPanel disk={diskState} />}
      </div>
    </div>
  );
}
