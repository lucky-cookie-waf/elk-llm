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
  method?: string | null;
  uri?: string | null;
  http_version?: string | null;
  host?: string | null;
  user_agent?: string | null;
  request_headers?: any | null;
  request_body?: any | null;
  response_headers?: any | null;
  response_body?: any | null;
  matched_rules: string | null;
  audit_summary?: string | null;
  full_log: string | null;
  created_at: string;
  sessionId: number;
};

const stringify = (v: any) => {
  if (v == null || v === "") return "-";
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
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
        const res = await fetch(
          `/api/session/${encodeURIComponent(String(numericId))}?limit=500&order=asc`
        );
        const text = await res.text();
        if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${text}`);
        const json = JSON.parse(text);

        console.log("🔎 RawLog API 응답", json);

        // ✅ LogList와 동일하게 json.data 기준으로 통일
        const data: RawLogRow[] =
          Array.isArray(json?.rawLogs?.items)
            ? json.rawLogs.items
            : Array.isArray(json?.data)
            ? json.data
            : [];

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

  /** 컬럼 정의 */
  const columns: { key: keyof RawLogRow; label: string; min: number; render?: (r: RawLogRow) => React.ReactNode }[] = [
    { key: "transaction_id", label: "transaction_id", min: 140 },
    { key: "timestamp", label: "timestamp", min: 170, render: (r) => fmtParts(r.timestamp) },
    { key: "remote_host", label: "remote_host", min: 170 },
    { key: "remote_port", label: "remote_port", min: 120 },
    { key: "local_host", label: "local_host", min: 170 },
    { key: "local_port", label: "local_port", min: 120 },
    { key: "method", label: "method", min: 110 },
    { key: "uri", label: "uri", min: 320 },
    { key: "http_version", label: "http_version", min: 140 },
    { key: "host", label: "host", min: 200 },
    { key: "user_agent", label: "user_agent", min: 320 },
    { key: "request_headers", label: "request_headers", min: 360, render: (r) => stringify(r.request_headers) },
    { key: "request_body", label: "request_body", min: 320, render: (r) => stringify(r.request_body) },
    { key: "response_headers", label: "response_headers", min: 360, render: (r) => stringify(r.response_headers) },
    { key: "response_body", label: "response_body", min: 320, render: (r) => stringify(r.response_body) },
    { key: "matched_rules", label: "matched_rules", min: 220, render: (r) => stringify(r.matched_rules) },
    { key: "audit_summary", label: "audit_summary", min: 260, render: (r) => stringify(r.audit_summary) },
    { key: "full_log", label: "full_log", min: 360, render: (r) => stringify(r.full_log) },
    { key: "created_at", label: "created_at", min: 180, render: (r) => fmtParts(r.created_at) },
  ];

  const gridTemplate = columns.map((c) => `minmax(${c.min}px, auto)`).join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, overflowX: "hidden", touchAction: "pan-y" }}>
      {/* 상단 바 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
        <Link to="/loglists" style={{ color: "#3b82f6", fontSize: 14, textDecoration: "underline" }}>
          ← Back to Session List
        </Link>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid #1f2937",
            background: connected === null ? "#7c3aed" : connected ? "#0f766e" : "#7f1d1d",
            color: "#e5e7eb",
            fontWeight: 700,
            fontSize: 11,
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
      <div
        style={{
          background: "#0b1220",
          border: "1px solid #1f2937",
          borderRadius: 12,
          overflowX: "auto",
          overflowY: "hidden",
          width: "100%",
          overscrollBehaviorX: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplate,
            columnGap: 12,
            padding: "14px 16px",
            borderBottom: "1px solid #1f2937",
            color: "#9ca3af",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.3,
            width: "max-content",
          }}
        >
          {columns.map((c) => (
            <div key={c.key as string} style={{ whiteSpace: "nowrap" }}>
              {c.label}
            </div>
          ))}
        </div>

        {/* 바디 */}
        {list.map((row) => (
          <div
            key={String(row.id)}
            style={{
              display: "grid",
              gridTemplateColumns: gridTemplate,
              columnGap: 12,
              padding: "14px 16px",
              borderBottom: "1px solid #111827",
              width: "max-content",
            }}
          >
            {columns.map((c) => {
              const raw = (row as any)[c.key];
              const val = c.render ? c.render(row) : raw ?? "-";
              return (
                <div
                  key={String(c.key)}
                  style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: c.min + 200 }}
                  title={typeof val === "string" ? val : undefined}
                >
                  {String(val ?? "-")}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
