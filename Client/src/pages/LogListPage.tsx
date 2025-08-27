import React, { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";

/* ---------- helpers ---------- */
const pad2 = (n: number) => String(n).padStart(2, "0");
const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) => {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
};
const fmtStamp = (y: number, m: number, d: number, h: number, min: number) => {
  const yy = String(y).slice(-2);
  return `${yy}.${pad2(m)}.${pad2(d)}.${pad2(h)}:${pad2(min)}`;
};

type Status = "Safe" | "Danger" | "Detecting";
type LogItem = {
  id: string;
  detection: Status;
  timestamp: string; // ISO
  ip: string;
  method: string;
  uri: string;
  agent: string;
  referrer: string;
  body: number;
};
type OrderType = "latest" | "earliest" | "user-agent";

const sampleLogs: LogItem[] = [
  {
    id: "1",
    detection: "Safe",
    timestamp: "2020-07-17T12:23:34+01:00",
    ip: "172.26.0.1",
    method: "GET",
    uri: "/blog/index.php/2020/04/04/voluptatum-reprehenderit-maiores-ab-sequi-quaerat/",
    agent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.130 Safari/537.36",
    referrer: "내용 없음",
    body: 200,
  },
  {
    id: "2",
    detection: "Danger",
    timestamp: "2020-07-17T12:23:34+01:00",
    ip: "172.26.0.1",
    method: "GET",
    uri: "/blog/index.php/2020/04/04/voluptatum-reprehenderit-maiores-ab-sequi-quaerat/",
    agent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.130 Safari/537.36",
    referrer: "내용 없음",
    body: 200,
  },
  {
    id: "3",
    detection: "Detecting",
    timestamp: "2020-07-17T12:23:34+01:00",
    ip: "172.26.0.1",
    method: "GET",
    uri: "/blog/index.php/2020/04/04/voluptatum-reprehenderit-maiores-ab-sequi-quaerat/",
    agent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.130 Safari/537.36",
    referrer: "내용 없음",
    body: 200,
  },
];

const Badge: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span style={{ background: color, color: "#0f172a", padding: "4px 10px", borderRadius: 8, fontWeight: 600, fontSize: 12 }}>{children}</span>
);
const PillButton: React.FC<{ active?: boolean; onClick?: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: "10px 16px",
      borderRadius: 10,
      border: "1px solid #334155",
      background: active ? "#3b82f6" : "#0b1220",
      color: active ? "white" : "#cbd5e1",
      fontWeight: 600,
      cursor: "pointer",
    }}
  >
    {children}
  </button>
);
const ToolbarButton: React.FC<{ label: string; value?: string; onClick?: () => void }> = ({ label, value, onClick }) => (
  <button
    onClick={onClick}
    style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#0b1220", border: "1px solid #1f2937", color: "#e5e7eb" }}
  >
    <span style={{ opacity: 0.8 }}>{label}</span>
    <span style={{ fontWeight: 700 }}>{value ?? ""}</span>
    <span style={{ marginLeft: 6, opacity: 0.5 }}>▾</span>
  </button>
);
const Modal: React.FC<{ open: boolean; onClose?: () => void; width?: number; children: React.ReactNode }> = ({ open, onClose, width = 560, children }) => {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width, background: "#0f172a", border: "1px solid #1f2937", borderRadius: 16, padding: 20, color: "#e2e8f0", boxShadow: "0 10px 40px rgba(0,0,0,0.35)" }}>
        {children}
      </div>
    </div>
  );
};

/* ---------- Page ---------- */
export default function LogList() {
  const now = new Date();
  const [tsModalOpen, setTsModalOpen] = useState(false);
  const [tsApplied, setTsApplied] = useState<{ y: number; m: number; d: number; h: number; min: number } | null>(null);
  const [tsTemp, setTsTemp] = useState({ y: Math.max(1, now.getFullYear()), m: now.getMonth() + 1, d: now.getDate(), h: now.getHours(), min: now.getMinutes() });
  const bump = (key: "y" | "m" | "d" | "h" | "min", dir: 1 | -1) => {
    setTsTemp((prev) => {
      let { y, m, d, h, min } = prev;
      if (key === "y") y = Math.min(2100, Math.max(1, y + dir));
      if (key === "m") m = Math.min(12, Math.max(1, m + dir));
      if (key === "h") h = Math.min(23, Math.max(0, h + dir));
      if (key === "min") min = Math.min(59, Math.max(0, min + dir));
      const maxD = daysInMonth(y, m);
      if (key === "d") d = Math.min(maxD, Math.max(1, d + dir));
      else d = Math.min(maxD, d);
      return { y, m, d, h, min };
    });
  };
  const appliedTsLabel = tsApplied ? fmtStamp(tsApplied.y, tsApplied.m, tsApplied.d, tsApplied.h, tsApplied.min) : "Date";

  const [orderTypeOpen, setOrderTypeOpen] = useState(false);
  const [orderApplied, setOrderApplied] = useState<OrderType>("latest");
  const [orderTemp, setOrderTemp] = useState<OrderType>("latest");

  const [statusOpen, setStatusOpen] = useState(false);
  const [statusApplied, setStatusApplied] = useState<Set<Status>>(new Set());
  const [statusTemp, setStatusTemp] = useState<Set<Status>>(new Set());
  const toggleStatus = (s: Status) => {
    setStatusTemp((cur) => {
      const next = new Set(cur);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const resetAll = () => {
    setTsApplied(null);
    setOrderApplied("latest");
    setStatusApplied(new Set());
  };

  const logs = useMemo(() => {
    let list = [...sampleLogs];
    if (statusApplied.size > 0) list = list.filter((l) => statusApplied.has(l.detection));
    if (orderApplied === "latest") list.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    else if (orderApplied === "earliest") list.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
    else list.sort((a, b) => a.agent.localeCompare(b.agent));
    return list;
  }, [orderApplied, statusApplied]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0f1a", color: "#e5e7eb" }}>
      <main style={{ flex: 1, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 32, fontWeight: 800 }}>Log Lists</h1>
          <div style={{ opacity: 0.8, fontSize: 12 }}>Admin • English 🇬🇧</div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, background: "#0b1220", border: "1px solid #1f2937", borderRadius: 12, padding: 10 }}>
          <span style={{ opacity: 0.7, padding: "0 8px" }}>Filter By</span>
          <ToolbarButton label="" value={appliedTsLabel} onClick={() => setTsModalOpen(true)} />
          <ToolbarButton label="Order Type" onClick={() => { setOrderTemp(orderApplied); setOrderTypeOpen(true); }} />
          <ToolbarButton label="Order Status" onClick={() => { setStatusTemp(new Set(statusApplied)); setStatusOpen(true); }} />
          <div style={{ flex: 1 }} />
          <button onClick={resetAll} style={{ padding: "10px 14px", borderRadius: 10, background: "#0b1220", border: "1px solid #ef4444", color: "#fca5a5", fontWeight: 700, cursor: "pointer" }}>
            Reset Filter
          </button>
        </div>

        {/* Table */}
        <div style={{ marginTop: 16, background: "#0b1220", border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px 200px 140px 100px 1fr 1fr 120px",
              padding: "14px 16px",
              borderBottom: "1px solid #1f2937",
              color: "#9ca3af",
              fontSize: 12,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            <div>Detection Result</div>
            <div>Timestamp</div>
            <div>IP</div>
            <div>Method</div>
            <div>URI</div>
            <div>Agent</div>
            <div>Body</div>
          </div>

          {logs.map((row) => (
            <div
              key={row.id}
              style={{ display: "grid", gridTemplateColumns: "160px 200px 140px 100px 1fr 1fr 120px", padding: "16px", borderBottom: "1px solid #111827", alignItems: "start", gap: 12 }}
            >
              <div>{row.detection === "Safe" && <Badge color="#34d399">Safe</Badge>}{row.detection === "Danger" && <Badge color="#ef4444">Danger</Badge>}{row.detection === "Detecting" && <Badge color="#6b7280">Detecting</Badge>}</div>
              <div style={{ whiteSpace: "nowrap" }}>{new Date(row.timestamp).toUTCString()}</div>
              <div>{row.ip}</div>
              <div>{row.method}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{row.uri}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{row.agent}</div>
              <div>{row.body}</div>
            </div>
          ))}
        </div>
      </main>

      {/* Timestamp Modal */}
      <Modal open={tsModalOpen} onClose={() => setTsModalOpen(false)} width={620}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Timestamp</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
          {([
            { key: "y", label: "Year", min: 1, max: 2100 },
            { key: "m", label: "Month", min: 1, max: 12 },
            { key: "d", label: "Date", min: 1, max: daysInMonth(tsTemp.y, tsTemp.m) },
            { key: "h", label: "Hour", min: 0, max: 23 },
            { key: "min", label: "Minute", min: 0, max: 59 },
          ] as const).map((f) => (
            <div key={f.key} style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 12 }}>
              <div style={{ padding: "8px 12px", fontSize: 12, opacity: 0.8 }}>{f.label}</div>
              <div style={{ display: "grid", gridTemplateRows: "auto auto auto", alignItems: "center" }}>
                <button onClick={() => bump(f.key, +1 as 1)} style={{ padding: 8, borderTopLeftRadius: 12, borderTopRightRadius: 12, border: "none", background: "#111827", color: "#e5e7eb", cursor: "pointer" }}>
                  ▲
                </button>
                <div style={{ textAlign: "center", fontWeight: 800, padding: 8 }}>
                  {f.key === "y" && tsTemp.y}
                  {f.key === "m" && pad2(tsTemp.m)}
                  {f.key === "d" && pad2(tsTemp.d)}
                  {f.key === "h" && pad2(tsTemp.h)}
                  {f.key === "min" && pad2(tsTemp.min)}
                </div>
                <button onClick={() => bump(f.key, -1 as -1)} style={{ padding: 8, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, border: "none", background: "#111827", color: "#e5e7eb", cursor: "pointer" }}>
                  ▼
                </button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 12 }}>* 범위: 연도 1–2100, 월 1–12, 일은 월/윤년 반영, 시 0–23, 분 0–59</div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PillButton
            active
            onClick={() => {
              setTsApplied(tsTemp);
              setTsModalOpen(false);
            }}
          >
            Apply Now
          </PillButton>
        </div>
      </Modal>

      {/* Order Type Modal */}
      <Modal open={orderTypeOpen} onClose={() => setOrderTypeOpen(false)} width={600}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Select Order Type</h3>
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <PillButton active={orderTemp === "latest"} onClick={() => setOrderTemp("latest")}>Latest</PillButton>
          <PillButton active={orderTemp === "earliest"} onClick={() => setOrderTemp("earliest")}>Earliest</PillButton>
          <PillButton active={orderTemp === "user-agent"} onClick={() => setOrderTemp("user-agent")}>User-Agent</PillButton>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PillButton
            active
            onClick={() => {
              setOrderApplied(orderTemp);
              setOrderTypeOpen(false);
            }}
          >
            Apply Now
          </PillButton>
        </div>
      </Modal>

      {/* Order Status Modal */}
      <Modal open={statusOpen} onClose={() => setStatusOpen(false)} width={640}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Select Order Status</h3>
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <PillButton active={statusTemp.has("Safe")} onClick={() => toggleStatus("Safe")}>Safe</PillButton>
          <PillButton active={statusTemp.has("Danger")} onClick={() => toggleStatus("Danger")}>Danger</PillButton>
          <PillButton active={statusTemp.has("Detecting")} onClick={() => toggleStatus("Detecting")}>Detecting</PillButton>
        </div>
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>* 여러 개를 동시에 선택할 수 있습니다.</div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PillButton
            active
            onClick={() => {
              setStatusApplied(new Set(statusTemp));
              setStatusOpen(false);
            }}
          >
            Apply Now
          </PillButton>
        </div>
      </Modal>
    </div>
  );
}
