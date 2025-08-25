import React, { useEffect, useMemo, useState } from "react";

type ProgressEvent = {
  step: string;
  state: "start" | "done" | "error";
  info?: any;
  ts: number;
  opId?: string;
};

const stepLabel: Record<string, string> = {
  "mcp-connect": "Connect MCP",
  "refresh-schemas": "Refresh Schemas",
  "suggest-payload": "Suggest Payload",
  invoke: "Invoke",
  "tools-call": "Tool Call",
  guidance: "Guidance",
  "ai-process": "AI Process",
  "param-scan": "Param Scan",
  "param-candidates": "Commands",
  "param-scan-cmd": "Scan Cmd",
  "param-matches": "Matches",
  "param-suggestions": "Param Suggestions",
  "param-chosen": "Chosen",
  "payload-suggest": "Payload Suggest",
  "payload-override": "Payload Override",
  "invoke-args": "Invoke Args",
  "invoke-attempt": "Invoke Attempt",
  "invoke-retry": "Invoke Retry",
};

export default function ProgressPane() {
  const [events, setEvents] = useState<ProgressEvent[]>([]);

  useEffect(() => {
    if (!window?.electronAPI?.chat?.onProgress) return;
    const off = window.electronAPI.chat.onProgress((e) => {
      setEvents((prev) => [...prev.slice(-199), e]);
    });
    return () => {
      try {
        if (typeof off === "function") off();
      } catch {}
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, ProgressEvent[]>();
    for (const e of events) {
      const key = e.opId || "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    // Sort by first event time desc
    return Array.from(map.entries()).sort((a, b) => {
      const ta = a[1][0]?.ts || 0;
      const tb = b[1][0]?.ts || 0;
      return tb - ta;
    });
  }, [events]);

  const format = (ts: number) => new Date(ts).toLocaleTimeString();

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        width: 320,
        maxHeight: 300,
        overflow: "auto",
        background: "rgba(20,20,24,0.9)",
        border: "1px solid #333",
        borderRadius: 8,
        padding: 8,
        fontSize: 12,
        color: "#ddd",
        boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <strong>Progress</strong>
        <button onClick={() => setEvents([])} style={{ fontSize: 11 }}>
          Clear
        </button>
      </div>
      {grouped.length === 0 ? (
        <div style={{ opacity: 0.6 }}>No recent activity</div>
      ) : (
        grouped.map(([opId, list]) => (
          <div
            key={opId}
            style={{
              marginBottom: 8,
              paddingBottom: 6,
              borderBottom: "1px solid #2a2a2a",
            }}
          >
            <div style={{ opacity: 0.7, marginBottom: 4 }}>Op {opId}</div>
            {list.map((e, idx) => (
              <div
                key={idx}
                style={{ display: "flex", gap: 6, alignItems: "baseline" }}
              >
                <span style={{ opacity: 0.5, width: 56 }}>{format(e.ts)}</span>
                <span style={{ width: 120 }}>
                  {stepLabel[e.step] || e.step}
                </span>
                <span
                  style={{
                    color:
                      e.state === "error"
                        ? "#f66"
                        : e.state === "done"
                        ? "#6f6"
                        : "#ccc",
                  }}
                >
                  {e.state}
                </span>
                {e.info ? (
                  <span
                    style={{
                      opacity: 0.7,
                      marginLeft: 6,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {typeof e.info === "string"
                      ? e.info
                      : JSON.stringify(e.info)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
