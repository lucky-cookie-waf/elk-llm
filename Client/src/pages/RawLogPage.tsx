import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";

/* time helper */
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtParts = (isoLike?: string) => {
  if (!isoLike) return "-";
  const t = isoLike.includes("T") ? isoLike : isoLike.replace(" ", "T");
  const d = new Date(t);
  if (isNaN(d.getTime())) return "-";
  const yy = String(d.getFullYear()).slice(-2);
  const MM = pad2(d.getMonth() + 1);
  const DD = pad2(d.getDate());
  const HH = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${yy}/${MM}/${DD} ${HH}:${mm}`;
};

/* 타입 */
type RawLogRow = {
  id: number | string;
  transaction_id: string | null;
  timestamp: string;
  remote_host: string | null;
  remote_port: number | string | null;
  local_host: string | null;
  local_port: number | string | null;
  matched_rules: string | null;
  full_log: string | null;
  created_at: string;
  sessionId: number;
};

export default function RawLogPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const numericId = Number.parseInt(String(sessionId ?? ""), 10);

  const [rows, setRows] = useState<RawLogRow[]>([]);
  const [connected, setConnected] = useState<null | boolean>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setRows([]);
    setErrorMsg(null);

    if (!Number.isFinite(numericId) || numericId <= 0) {
      setConnected(false);
      setErrorMsg("잘못된 세션 ID입니다(숫자 PK 필요). LogList에서 다시 클릭하세요.");
      return;
    }

    const run = async () => {
      try {
        setConnected(null);
        const res = await fetch(`/api/session/${encodeURIComponent(String(numericId))}?limit=500&order=asc`);
        const text = await res.text();
        if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${text}`);
        const json = JSON.parse(text);
        const data: RawLogRow[] = Array.isArray(json?.rawLogs?.items) ? json.rawLogs.items : [];
        setRows(data);
        setConnected(true);
      } catch (e: any) {
        setConnected(false);
        setErrorMsg(String(e?.message || e));
      }
    };
    run();
  }, [numericId]);

  const list = useMemo(() => rows, [rows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 상단 바 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
        <Link to="/loglists" style={{ color: "#3b82f6", fontSize: 14, textDecoration: "underline" }}>
          ← Back to Session List
        </Link>
        <span
          style={{
            padding: "2px 8px", borderRadius: 999, border: "1px solid #1f2937",
            background: connected === null ? "#7c3aed" : connected ? "#0f766e" : "#7f1d1d",
            color: "#e5e7eb", fontWeight: 700, fontSize: 11,
          }}
          title={errorMsg || ""}
        >
          {connected === null ? "Checking" : connected ? `Connected (${rows.length})` : "Disconnected"}
        </span>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>Raw Logs for Session</h1>
      <div style={{ opacity: 0.7, fontSize: 14 }}>ID: {Number.isFinite(numericId) ? numericId : "(invalid)"}</div>

      {errorMsg && (
        <pre style={{ background: "#3f1d1d", border: "1px solid #7f1d1d", color: "#fecaca", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>
          {errorMsg}
        </pre>
      )}

      {/* 테이블 */}
      <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 12, overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "160px 180px 180px 120px 160px 120px 200px 400px 180px",
            columnGap: 12, padding: "14px 16px", borderBottom: "1px solid #1f2937",
            color: "#9ca3af", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.3, minWidth: "1800px",
          }}
        >
          <div>Transaction ID</div>
          <div>Timestamp</div>
          <div>Remote Host</div>
          <div>Remote Port</div>
          <div>Local Host</div>
          <div>Local Port</div>
          <div>Matched Rules</div>
          <div>Full Log</div>
          <div>Created At</div>
        </div>

        {list.map((row) => (
          <div
            key={String(row.id)}
            style={{
              display: "grid",
              gridTemplateColumns: "160px 180px 180px 120px 160px 120px 200px 400px 180px",
              columnGap: 12, padding: "14px 16px", borderBottom: "1px solid #111827", minWidth: "1800px",
            }}
          >
            <div>{row.transaction_id ?? "-"}</div>
            <div>{fmtParts(row.timestamp)}</div>
            <div>{row.remote_host ?? "-"}</div>
            <div>{row.remote_port ?? "-"}</div>
            <div>{row.local_host ?? "-"}</div>
            <div>{row.local_port ?? "-"}</div>
            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={String(row.matched_rules ?? "")}>
              {row.matched_rules ?? "-"}
            </div>
            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={row.full_log ?? ""}>
              {row.full_log ?? "-"}
            </div>
            <div>{fmtParts(row.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
