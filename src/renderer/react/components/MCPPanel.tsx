import React, { useEffect, useMemo, useState } from "react";
import { useMCP } from "../hooks/useMCP";
import CloseIcon from "../assets/icons/close.svg";
import TrashIcon from "../assets/icons/trash.svg";

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

  // Curated example args derived from CLIPPLAYER_MCP_USAGE.md and AMPP tools
  const exampleArgsByTool: Record<
    string,
    Array<{ label: string; args: any }>
  > = useMemo(
    () => ({
      // ClipPlayer controls
      load_clip: [
        { label: "file", args: { file: "S3://my-bucket/video.mp4" } },
        { label: "clipId", args: { clipId: "01GSY8CK27A1AW12W8C1V66HJXC" } },
      ],
      play_pause: [{ label: "toggle", args: {} }],
      transport_state: [
        { label: "play loop", args: { state: "play", endBehaviour: "loop" } },
        { label: "pause", args: { state: "pause" } },
      ],
      seek: [{ label: "frame 1000", args: { frame: 1000 } }],
      set_rate: [
        { label: "2.0x", args: { rate: 2.0 } },
        { label: "-0.5x", args: { rate: -0.5 } },
      ],
      shuttle: [
        { label: "scrub -2.0", args: { rate: -2.0 } },
        { label: "scrub 3.0", args: { rate: 3.0 } },
      ],
      transport_command: [
        {
          label: "pos/in/out/rate/loop",
          args: {
            position: 100,
            inPosition: 10,
            outPosition: 200,
            rate: 1.0,
            endBehaviour: "loop",
          },
        },
      ],
      goto_start: [{ label: "start", args: {} }],
      goto_end: [{ label: "end", args: {} }],
      step_forward: [{ label: "step +1", args: {} }],
      step_back: [{ label: "step -1", args: {} }],
      mark_in: [{ label: "mark in", args: {} }],
      mark_out: [{ label: "mark out", args: {} }],
      fast_forward: [{ label: "fast forward", args: {} }],
      rewind: [{ label: "rewind", args: {} }],
      loop: [{ label: "toggle loop", args: {} }],
      get_state: [{ label: "get state", args: {} }],
      clear_assets: [{ label: "clear", args: {} }],

      // AMPP discovery / workloads / schemas
      ampp_list_application_types: [{ label: "all apps", args: {} }],
      ampp_list_workloads: [
        { label: "ClipPlayer", args: { applicationType: "ClipPlayer" } },
        { label: "MiniMixer", args: { applicationType: "MiniMixer" } },
      ],
      ampp_list_all_workloads: [{ label: "all apps & workloads", args: {} }],
      ampp_list_workload_names: [
        { label: "ClipPlayer names", args: { applicationType: "ClipPlayer" } },
      ],
      set_active_workload: [
        {
          label: "ClipPlayer active",
          args: {
            applicationType: "ClipPlayer",
            workloadId: "your-workload-id",
          },
        },
      ],
      get_active_workload: [
        {
          label: "ClipPlayer active?",
          args: { applicationType: "ClipPlayer" },
        },
      ],
      ampp_refresh_application_schemas: [{ label: "refresh", args: {} }],
      ampp_list_commands_for_application: [
        { label: "ClipPlayer cmds", args: { applicationType: "ClipPlayer" } },
        {
          label: "ClipPlayer cmds+summary",
          args: { applicationType: "ClipPlayer", includeSummary: true },
        },
      ],
      ampp_show_command_schema: [
        {
          label: "schema(play)",
          args: { applicationType: "ClipPlayer", command: "play" },
        },
      ],
      ampp_get_command_doc: [
        {
          label: "doc(play)",
          args: {
            applicationType: "ClipPlayer",
            command: "play",
            format: "markdown",
          },
        },
      ],
      ampp_validate_payload: [
        {
          label: "validate",
          args: {
            applicationType: "ClipPlayer",
            command: "controlstate",
            payload: { Index: 1, Program: true },
          },
        },
      ],
      ampp_suggest_payload: [
        {
          label: "suggest",
          args: { applicationType: "ClipPlayer", command: "controlstate" },
        },
      ],
      ampp_invoke: [
        {
          label: "invoke(controlstate)",
          args: {
            applicationType: "ClipPlayer",
            workloadId: "your-workload-id",
            command: "controlstate",
            payload: { Index: 1, Program: true },
          },
        },
      ],
      ampp_invoke_by_workload_name: [
        {
          label: "invoke by name",
          args: {
            applicationType: "ClipPlayer",
            workloadName: "Studio:ClipPlayer",
            command: "controlstate",
            payload: { Index: 1, Program: true },
          },
        },
      ],
      ampp_list_macros: [{ label: "list", args: {} }],
      ampp_execute_macro_by_name: [
        { label: "execute", args: { name: "Start Show" } },
      ],
      ampp_list_example_prompts: [
        { label: "all", args: {} },
        { label: "ClipPlayer", args: { applicationType: "ClipPlayer" } },
      ],
    }),
    []
  );

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
          <button
            className="btn danger"
            onClick={onClose}
            title="Close panel"
            aria-label="Close MCP panel"
          >
            <img src={CloseIcon} alt="Close" width={14} height={14} />
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
                    <div className="tools-scroll">
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
                {/* Example presets */}
                {selected &&
                  selected.status === "connected" &&
                  (exampleArgsByTool[toolName]?.length || 0) > 0 && (
                    <div className="examples-row">
                      <div className="examples-header">
                        <label>Examples</label>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "6px",
                        }}
                      >
                        {(exampleArgsByTool[toolName] ?? []).map((ex, idx) => (
                          <button
                            key={`${toolName}-ex-${idx}`}
                            type="button"
                            className="chip"
                            title={`Insert example: ${ex.label}`}
                            onClick={() =>
                              setToolArgs(JSON.stringify(ex.args, null, 2))
                            }
                          >
                            {ex.label}
                          </button>
                        ))}
                      </div>
                    </div>
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
                          aria-label="Clear result"
                        >
                          <img
                            src={TrashIcon}
                            alt="Clear"
                            width={12}
                            height={12}
                          />
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
                      title="Clear history"
                      aria-label="Clear invocation history"
                    >
                      <img src={TrashIcon} alt="Clear" width={12} height={12} />
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
