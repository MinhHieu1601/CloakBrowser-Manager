import { useCallback, useEffect, useState } from "react";
import { api, type ProxyInfo, type ProxyCreateData, type ProxyCheckResult } from "../lib/api";

export function useProxies() {
  const [proxies, setProxies] = useState<ProxyInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listProxies();
      setProxies(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (data: ProxyCreateData) => {
      const proxy = await api.createProxy(data);
      setProxies((prev) => [proxy, ...prev]);
      return proxy;
    },
    [],
  );

  const update = useCallback(
    async (id: string, data: Partial<ProxyCreateData>) => {
      const proxy = await api.updateProxy(id, data);
      setProxies((prev) => prev.map((p) => (p.id === id ? proxy : p)));
      return proxy;
    },
    [],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.deleteProxy(id);
      setProxies((prev) => prev.filter((p) => p.id !== id));
    },
    [],
  );

  const check = useCallback(
    async (id: string): Promise<ProxyCheckResult> => {
      return api.checkProxy(id);
    },
    [],
  );

  return { proxies, loading, refresh, create, update, remove, check };
}
