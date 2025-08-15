import { useCallback, useEffect, useState } from "react";

export interface MCPServerInfo {
  id: string;
  name: string;
  status: string;
  url: string;
  capabilities?: Record<string, boolean>;
}

export function useMCP() {
  const [servers, setServers] = useState<MCPServerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolsByServer, setToolsByServer] = useState<Record<string, any[]>>({});

  const refresh = useCallback(async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.mcp.listServers();
      if (res.success) {
        setServers(res.servers || []);
      } else {
        setError(res.error || "Failed to load servers");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load servers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Subscribe to live updates from main process
    const off = window.electronAPI?.mcp?.onServersUpdated?.(
      async (evt: { serverId: string; status: string }) => {
        try {
          await refresh();
          if (evt?.status === "connected" && evt?.serverId) {
            const res = await window.electronAPI.mcp.listTools(evt.serverId);
            if (res?.success) {
              setToolsByServer((m) => ({
                ...m,
                [evt.serverId]: res.tools || [],
              }));
            }
          }
        } catch {}
      }
    );
    return () => {
      try {
        if (typeof off === "function") off();
      } catch {}
    };
  }, [refresh]);

  const connect = useCallback(
    async (id: string) => {
      if (!window.electronAPI) return;
      try {
        await window.electronAPI.mcp.connectServer(id);
        await refresh();
        // Proactively fetch tools to confirm connectivity in the UI
        try {
          const res = await window.electronAPI.mcp.listTools(id);
          if (res?.success) {
            setToolsByServer((m) => ({ ...m, [id]: res.tools || [] }));
          }
        } catch {}
      } catch (e) {
        console.error("Failed to connect server", e);
      }
    },
    [refresh]
  );

  const callFunction = useCallback(
    async (id: string, fn: string, args: any) => {
      if (!window.electronAPI) return { success: false };
      return window.electronAPI.mcp.callFunction(id, fn, args);
    },
    []
  );

  const disconnect = useCallback(
    async (id: string) => {
      if (!window.electronAPI) return;
      try {
        await window.electronAPI.mcp.disconnectServer(id);
        await refresh();
      } catch (e) {
        console.error("Failed to disconnect server", e);
      }
    },
    [refresh]
  );

  const loadTools = useCallback(async (id: string) => {
    if (!window.electronAPI) return [];
    try {
      const start = Date.now();
      const slowWarn = setTimeout(() => {
        console.warn(`[MCP] tools/list for ${id} is taking a while…`);
      }, 5000);
      const res = await window.electronAPI.mcp.listTools(id);
      clearTimeout(slowWarn);
      const dur = Date.now() - start;
      if (res.success) {
        setToolsByServer((m) => ({ ...m, [id]: res.tools || [] }));
        console.info(
          `[MCP] tools/list for ${id} loaded ${
            res.tools?.length || 0
          } tools in ${dur}ms`
        );
        return res.tools || [];
      }
    } catch {}
    return [];
  }, []);

  return {
    servers,
    loading,
    error,
    refresh,
    connect,
    disconnect,
    callFunction,
    toolsByServer,
    loadTools,
  };
}
