import React, { useEffect, useRef, useState } from "react";

type EventItem = {
  ts: number;
  type: string;
  summary: string;
};

const RealtimeDebugOverlay: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [noTranscriptWarn, setNoTranscriptWarn] = useState<string | null>(null);
  const lastTranscriptTs = useRef<number>(0);

  useEffect(() => {
    const off = window.electronAPI.realtime.onEvent((ev: any) => {
      const now = Date.now();
      let summary = "";
      if (ev?.type === "realtime.status") summary = String(ev.status);
      else if (ev?.type === "output.audio.delta")
        summary = `audio ${ev.audio?.length ?? 0}B @${ev.sampleRate ?? "?"}`;
      else if (ev?.type === "output.completed") summary = "audio done";
      else if (ev?.type === "realtime.transcript.delta") {
        summary = (ev.text ?? "").slice(0, 60);
        lastTranscriptTs.current = now;
      } else if (ev?.type === "realtime.transcript") {
        summary = (ev.text ?? "").slice(0, 60);
        lastTranscriptTs.current = now;
      } else if (ev?.type === "realtime.message")
        summary = String(ev?.data?.type ?? "message");
      else if (ev?.type === "error") summary = String(ev.error ?? "error");
      else summary = JSON.stringify(ev).slice(0, 80);

      setEvents((prev) => {
        const next = [...prev, { ts: now, type: ev?.type ?? "?", summary }];
        return next.slice(-30);
      });
    });
    const t = setInterval(() => {
      const ago = Date.now() - (lastTranscriptTs.current || 0);
      if (ago > 10000) {
        setNoTranscriptWarn(
          "No transcript in 10s — check OPENAI_TRANSCRIBE_MODEL and org access"
        );
      } else setNoTranscriptWarn(null);
    }, 2000);
    return () => {
      off();
      clearInterval(t);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        right: 8,
        bottom: 8,
        width: 360,
        maxHeight: 280,
        overflow: "auto",
        background: "rgba(0,0,0,0.8)",
        color: "#fff",
        fontFamily: "monospace",
        fontSize: 12,
        borderRadius: 6,
        boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
        zIndex: 9999,
        padding: 8,
      }}
    >
      <div style={{ marginBottom: 6, opacity: 0.9 }}>
        Realtime Debug — last {events.length} events
      </div>
      {noTranscriptWarn && (
        <div style={{ color: "#ffb347", marginBottom: 6 }}>
          {noTranscriptWarn}
        </div>
      )}
      <div>
        {events
          .slice()
          .reverse()
          .map((e, i) => (
            <div key={i} style={{ whiteSpace: "pre-wrap" }}>
              {new Date(e.ts).toLocaleTimeString()} | {e.type} | {e.summary}
            </div>
          ))}
      </div>
    </div>
  );
};

export default RealtimeDebugOverlay;
