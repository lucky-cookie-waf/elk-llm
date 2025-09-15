import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";

/* time helper */
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtParts = (isoLike: string) => {
  const t = isoLike.includes("T") ? isoLike : isoLike.replace(" ", "T");
  const d = new Date(t);
  const yy = String(d.getFullYear()).slice(-2);
  const MM = pad2(d.getMonth() + 1);
  const DD = pad2(d.getDate());
  const HH = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${yy}/${MM}/${DD} ${HH}:${mm}:${ss}`;
};

/* 타입 */
type RawLogRow = {
  id: string;
  transaction_id: string;
  timestamp: string;
  remote_host: string;
  user_agent: string;
  session_id?: string; // 백엔드에서 붙여줄 수 있음
};

export default function RawLogPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [rows, setRows] = useState<RawLogRow[]>([]);
  const [connected, setConnected] = useState<null | boolean>(null);

  useEffect(() => {
    if (!sessionId) return;

    const tryFetch = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      if (Array.isArray(data?.data)) return data.data as RawLogRow[];
      if (Array.isArray(data)) return data as RawLogRow[];
      return [];
    };

    (async () => {
      try {
        let list = await tryFetch(`/api/rawlog?session_id=${encodeURIComponent(sessionId)}`);
        if (!list.length) {
          list = await tryFetch(`/rawlog?session_id=${encodeURIComponent(sessionId)}`);
        }
        setRows(list);
        setConnected(true);
      } catch (err) {
        console.error("Failed to fetch raw logs:", err);
        setRows([]);
        setConnected(false);
      }
    })();
  }, [sessionId]);

  const list = useMemo(() => rows, [rows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 상단 바 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 0",
        }}
      >
        <Link
          to="/loglist"
          style={{
            color: "#3b82f6",
            fontSize: 14,
            textDecoration: "underline",
          }}
        >
          ← Back to Session List
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ opacity: 0.8, fontSize: 12 }}>Admin • English 🇬🇧</div>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              border: "1px solid #1f2937",
              background:
                connected === null ? "#7c3aed" : connected ? "#0f766e" : "#7f1d1d",
              color: "#e5e7eb",
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            {connected === null
              ? "Checking"
              : connected
              ? `Connected (${rows.length})`
              : "Disconnected"}
          </span>
        </div>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
        Raw Logs for Session
      </h1>
      <div style={{ opacity: 0.7, fontSize: 14 }}>{sessionId}</div>

      {/* 테이블 */}
      <style>{`
        .grid-head, .grid-row {
          display: grid;
          grid-template-columns: 120px 320px 160px 1fr 180px;
          column-gap: 12px;
          align-items: center;
        }
        .ua-cell {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>

      <div
        style={{
          background: "#0b1220",
          border: "1px solid #1f2937",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          className="grid-head"
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #1f2937",
            color: "#9ca3af",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.3,
          }}
        >
          <div>Label</div>
          <div>Session ID</div>
          <div>IP Address</div>
          <div>User Agent</div>
          <div>Timestamp</div>
        </div>

        {list.map((row) => (
          <div
            key={row.id}
            className="grid-row"
            style={{ padding: "14px 16px", borderBottom: "1px solid #111827" }}
          >
            <div style={{ fontWeight: 700, color: "#34d399" }}>Log</div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {sessionId}
            </div>
            <div>{row.remote_host}</div>
            <div className="ua-cell" title={row.user_agent}>
              {row.user_agent || "(empty)"}
            </div>
            <div>{fmtParts(row.timestamp)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
