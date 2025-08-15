import React, { useEffect, useMemo, useState } from "react";
import { useMCP } from "../hooks/useMCP";

interface MCPPanelProps {
  onClose: () => void;
}

const MCPPanel: React.FC<MCPPanelProps> = ({ onClose }) => {
  const {
    servers,
    loading,
    error,
    refresh,
    connect,
    disconnect,
    callFunction,
    toolsByServer,
    loadTools,
  } = useMCP();
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [toolName, setToolName] = useState<string>("ping");
  const [toolArgs, setToolArgs] = useState<string>("{}");
  const [result, setResult] = useState<any>(null);
  const [invoking, setInvoking] = useState(false);
  const [rawArgsMode, setRawArgsMode] = useState(true);
  const [filter, setFilter] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<
    {
      id: string;
      tool: string;
      args: any;
      ts: number;
      result?: any;
      server: string;
    }[]
  >([]);
  const [formatError, setFormatError] = useState<string | null>(null);

  const toolPresets = [
    "ping",
    "health",
    "listTools",
    "listResources",
    "search",
    "describe",
  ].filter((p) => p.toLowerCase().includes(toolName.toLowerCase()));

  const selected = useMemo(
    () => servers.find((s) => s.id === selectedServer),
    [servers, selectedServer]
  );

  const filteredServers = useMemo(() => {
    if (!filter.trim()) return servers;
    const f = filter.toLowerCase();
    return servers.filter(
      (s) => s.name.toLowerCase().includes(f) || s.id.toLowerCase().includes(f)
    );
  }, [servers, filter]);

  useEffect(() => {
    // If selected server disappears after filter, keep it visible by clearing filter
    if (selectedServer && !servers.some((s) => s.id === selectedServer)) {
      setSelectedServer(null);
    }
  }, [servers, selectedServer]);

  // Load tools when a connected server is selected
  useEffect(() => {
    if (!selectedServer) return;
    const sel = servers.find((s) => s.id === selectedServer);
    if (sel && sel.status === "connected" && !toolsByServer[selectedServer]) {
      loadTools(selectedServer);
    }
  }, [selectedServer, servers, toolsByServer, loadTools]);

  // Keep a valid selected tool when tools list changes
  useEffect(() => {
    if (!selectedServer) return;
    const list = toolsByServer[selectedServer] || [];
    if (!list.length) return;
    const hasCurrent = list.some((t: any) => t?.name === toolName);
    if (!hasCurrent) {
      setToolName(list[0].name);
    }
  }, [selectedServer, toolsByServer, toolName]);

  const handleInvoke = async () => {
    if (!selectedServer) return;
    setInvoking(true);
    setResult(null);
    try {
      let parsed: any = {};
      try {
        parsed = JSON.parse(toolArgs || "{}");
      } catch {
        /* ignore */
      }
      const res = await callFunction(selectedServer, toolName, parsed);
      setResult(res);
      setHistory((h) => [
        {
          id: `${Date.now()}`,
          tool: toolName,
          args: parsed,
          ts: Date.now(),
          result: res,
          server: selectedServer,
        },
        ...h,
      ]);
    } catch (e) {
      setResult({ error: (e as any)?.message || "Invocation failed" });
    } finally {
      setInvoking(false);
    }
  };

  const handleFormatJSON = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(toolArgs || "{}"), null, 2);
      setToolArgs(formatted);
      setFormatError(null);
    } catch (e: any) {
      setFormatError("Invalid JSON");
      setTimeout(() => setFormatError(null), 2500);
    }
  };

  const copyResult = () => {
    if (!result) return;
    navigator.clipboard
      .writeText(JSON.stringify(result, null, 2))
      .catch(() => {});
  };

  const clearResult = () => setResult(null);

  const handleDisconnect = async () => {
    if (!selectedServer) return;
    await disconnect(selectedServer);
    setResult(null);
  };

  return (
    <div
      className="mcp-panel"
      role="dialog"
      aria-modal="true"
      aria-label="MCP Servers Panel"
    >
      <div className="mcp-overlay" onClick={onClose} aria-hidden="true"></div>
      <div className="mcp-panel-header">
        <div className="title-group">
          <h2>MCP Servers</h2>
          <span className="count-badge">{servers.length}</span>
        </div>
        <div className="actions">
          <button
            className="btn subtle"
            onClick={() => refresh()}
            disabled={loading}
            title="Refresh"
          >
            ↻
          </button>
          <button
            className={`btn ${showHistory ? "primary" : "subtle"}`}
            onClick={() => setShowHistory(!showHistory)}
            title="Toggle history"
          >
            ⏱
          </button>
          <button className="btn danger" onClick={onClose} title="Close panel">
            ✖
          </button>
        </div>
      </div>
      {error && <div className="mcp-alert error">{error}</div>}
      <div className="mcp-layout">
        <div className="mcp-server-column">
          <div className="server-toolbar">
            <input
              className="server-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter servers..."
              aria-label="Filter servers"
            />
            <div className="stats-line" aria-live="polite">
              {filteredServers.length}/{servers.length} visible
            </div>
          </div>
          <div className="server-list" role="list">
            {loading && <div className="skeleton">Loading servers...</div>}
            {filteredServers.map((s) => {
              const active = s.id === selectedServer;
              return (
                <div
                  key={s.id}
                  role="listitem"
                  className={`server-card ${s.status} ${
                    active ? "active" : ""
                  }`}
                  onClick={() => setSelectedServer(s.id)}
                >
                  <div className="server-card-header">
                    <span className="status-dot" data-status={s.status}></span>
                    <span className="server-name">{s.name}</span>
                  </div>
                  <div className="server-meta">
                    <code>{s.id}</code>
                    <span className="server-status-label">{s.status}</span>
                  </div>
                  {s.status !== "connected" && (
                    <button
                      className="btn xs primary connect-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        connect(s.id);
                      }}
                      disabled={loading}
                    >
                      Connect
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {/* end server-list */}
        </div>
        {/* end server column */}
        <div className="mcp-detail-column">
          {!selected && (
            <div className="placeholder">
              Select a server to view details & invoke tools.
            </div>
          )}
          {selected && (
            <div className="server-detail">
              <div className="detail-header">
                <h3>{selected.name}</h3>
                <span className={`badge ${selected.status}`}>
                  {selected.status}
                </span>
                {selected.status === "connected" && (
                  <button
                    className="btn xs subtle"
                    onClick={handleDisconnect}
                    title="Disconnect"
                  >
                    ⏏
                  </button>
                )}
              </div>
              <div className="detail-grid">
                <div>
                  <label>ID</label>
                  <div className="mono small">{selected.id}</div>
                </div>
                <div>
                  <label>URL</label>
                  <div className="mono small truncate" title={selected.url}>
                    {selected.url}
                  </div>
                </div>
              </div>
              <div className="invoke-section">
                <div className="invoke-section">
                  <div
                    className="invoke-row"
                    style={{ justifyContent: "space-between" }}
                  >
                    <label>Tools</label>
                    <button
                      className="btn xs subtle"
                      onClick={() =>
                        selected.status === "connected" &&
                        loadTools(selected.id)
                      }
                      title={
                        selected.status === "connected"
                          ? "Reload tools"
                          : "Connect first"
                      }
                      disabled={selected.status !== "connected"}
                    >
                      ↻
                    </button>
                  </div>
                  {selected.status !== "connected" && (
                    <div
                      className="small"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Connect to fetch tools.
                    </div>
                  )}
                  {selected.status === "connected" && (
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
                    >
                      {(toolsByServer[selected.id] || []).map((t: any) => (
                        <button
                          key={t.name}
                          type="button"
                          className={`chip ${
                            toolName === t.name ? "selected" : ""
                          }`}
                          title={t.description || t.name}
                          aria-pressed={toolName === t.name}
                          onClick={() => setToolName(t.name)}
                        >
                          {t.name}
                        </button>
                      ))}
                      {(!toolsByServer ||
                        !toolsByServer[selected.id] ||
                        (toolsByServer[selected.id] as any[])?.length ===
                          0) && (
                        <span
                          className="small"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          No tools discovered yet
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="args-toggle">
                  <label>
                    <input
                      type="checkbox"
                      checked={rawArgsMode}
                      onChange={() => setRawArgsMode(!rawArgsMode)}
                    />
                    Raw JSON args
                  </label>
                  <div className="args-actions">
                    <button
                      type="button"
                      className="btn xs subtle"
                      onClick={handleFormatJSON}
                      title="Format JSON"
                    >
                      {}␍
                    </button>
                  </div>
                </div>
                {rawArgsMode && (
                  <textarea
                    className="args-textarea"
                    value={toolArgs}
                    onChange={(e) => setToolArgs(e.target.value)}
                    rows={6}
                    spellCheck={false}
                  />
                )}
                {formatError && (
                  <div className="mcp-alert error compact">{formatError}</div>
                )}
                <div className="invoke-actions">
                  <button
                    className="btn primary"
                    onClick={handleInvoke}
                    disabled={invoking || selected.status !== "connected"}
                  >
                    {invoking ? "Invoking..." : `Invoke (${toolName})`}
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setResult(null);
                      setToolArgs("{}");
                    }}
                  >
                    Reset
                  </button>
                </div>
                {result && (
                  <div className="result-wrapper">
                    <div className="result-header">
                      <span>Result</span>
                      <div className="result-tools">
                        <button
                          className="btn xs subtle"
                          onClick={copyResult}
                          title="Copy"
                        >
                          📋
                        </button>
                        <button
                          className="btn xs subtle"
                          onClick={clearResult}
                          title="Clear"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                    <pre className="result-pre">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
              {showHistory && (
                <div className="history-section">
                  <div className="history-header">
                    <h4>Invocation History</h4>
                    <button
                      className="btn xs subtle"
                      onClick={() => setHistory([])}
                      disabled={!history.length}
                    >
                      Clear
                    </button>
                  </div>
                  {history.length === 0 && (
                    <div className="empty small">No invocations yet</div>
                  )}
                  {history.length > 0 && (
                    <ul className="history-list">
                      {history.slice(0, 25).map((h) => (
                        <li key={h.id} className="history-item">
                          <div className="history-line">
                            <code className="mono small">{h.tool}</code>
                            <span className="ts">
                              {new Date(h.ts).toLocaleTimeString()}
                            </span>
                            <button
                              className="btn xs subtle"
                              title="Re-run"
                              onClick={() => {
                                setToolName(h.tool);
                                setToolArgs(JSON.stringify(h.args, null, 2));
                                setResult(h.result);
                              }}
                            >
                              ↺
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MCPPanel;
