import React, { useEffect, useMemo, useRef, useState } from "react";

/* time 설정 */
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtParts = (iso: string) => {
  const d = new Date(iso);
  const yy = String(d.getFullYear()).slice(-2);
  const MM = pad2(d.getMonth() + 1);
  const DD = pad2(d.getDate());
  const HH = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return { ymd: `${yy}/${MM}/${DD}`, hms: `${HH}:${mm}:${ss}` };
};
const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) => (m === 2 ? (isLeapYear(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);
const stampLabel = (y: number, m: number, d: number, h: number, min: number) =>
  `${String(y).slice(-2)}.${pad2(m)}.${pad2(d)}.${pad2(h)}:${pad2(min)}`;

/* 세션 상태 */
type Status = "Safe" | "Danger" | "Detecting";
type OrderType = "latest" | "earliest" | "user-agent";
type LogItem = {
  id: string;
  detection: Status;
  session_id: string;
  ip_address: string;
  user_agent: string;
  start_time: string; // ISO
  end_time: string;   // ISO
};

/* 로그 */
const MOCK: LogItem[] = Array.from({ length: 9 }).map((_, i) => ({
  id: String(i + 1),
  detection: (["Safe", "Danger", "Detecting"] as Status[])[i % 3],
  session_id: "sessionid1",
  ip_address: "172.26.0.1",
  user_agent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.130 Safari/537.36",
  start_time: "2020-07-17T11:23:00Z",
  end_time: "2020-07-17T12:23:34Z",
}));

/* 버튼튼 */
const Badge: React.FC<{ type: Status }> = ({ type }) => {
  const map: Record<Status, string> = { Safe: "#34d399", Danger: "#ef4444", Detecting: "#6b7280" };
  return (
    <span style={{ background: map[type], color: "#0f172a", padding: "4px 10px", borderRadius: 8, fontWeight: 700, fontSize: 12 }}>{type}</span>
  );
};
const ToolbarButton: React.FC<{ label: string; value?: string; onClick?: () => void }> = ({ label, value, onClick }) => (
  <button
    onClick={onClick}
    style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#0b1220", border: "1px solid #1f2937", color: "#e5e7eb", cursor: "pointer" }}
  >
    <span style={{ opacity: 0.8 }}>{label}</span>
    {value && <span style={{ fontWeight: 800 }}>{value}</span>}
    <span style={{ marginLeft: 6, opacity: 0.5 }}>▾</span>
  </button>
);
const Pill: React.FC<{ active?: boolean; onClick?: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #334155", background: active ? "#3b82f6" : "#0b1220", color: active ? "white" : "#cbd5e1", fontWeight: 700, cursor: "pointer" }}
  >
    {children}
  </button>
);
const Modal: React.FC<{ open: boolean; width?: number; onClose: () => void; children: React.ReactNode }> = ({ open, width = 560, onClose, children }) => {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width, background: "#0f172a", border: "1px solid #1f2937", borderRadius: 16, padding: 20, color: "#e2e8f0", boxShadow: "0 10px 40px rgba(0,0,0,.35)" }}>
        {children}
      </div>
    </div>
  );
};

/*  */
function useOutside(handler: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const md = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) handler(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") handler(); };
    window.addEventListener("mousedown", md);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", md); window.removeEventListener("keydown", esc); };
  }, [handler]);
  return ref;
}
const Pop: React.FC<{ open: boolean; anchor?: DOMRect; onClose: () => void; children: React.ReactNode }> = ({ open, anchor, onClose, children }) => {
  const ref = useOutside(onClose);
  if (!open || !anchor) return null;
  const top = anchor.top + window.scrollY + anchor.height + 8;
  const left = anchor.left + window.scrollX;
  return (
    <div ref={ref} style={{ position: "absolute", top, left, width: anchor.width, background: "#0f172a", border: "1px solid #1f2937", borderRadius: 12, padding: 12, color: "#e5e7eb", boxShadow: "0 10px 30px rgba(0,0,0,.35)", zIndex: 60 }}>
      {children}
    </div>
  );
};

/* Page */
export default function LogListPage() {
  /* 상단 검색(모양만) */
  const [q, setQ] = useState("");

  /* Time 복귀 */
  const now = new Date();
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeTemp, setTimeTemp] = useState({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate(), h: now.getHours(), min: now.getMinutes() });
  const [timeApplied, setTimeApplied] = useState<{ y: number; m: number; d: number; h: number; min: number } | null>(null);
  const bump = (key: "y" | "m" | "d" | "h" | "min", dir: 1 | -1) =>
    setTimeTemp((p) => {
      let { y, m, d, h, min } = p;
      if (key === "y") y = Math.min(2100, Math.max(1, y + dir));
      if (key === "m") m = Math.min(12, Math.max(1, m + dir));
      if (key === "d") d = Math.min(daysInMonth(y, m), Math.max(1, d + dir));
      if (key === "h") h = Math.min(23, Math.max(0, h + dir));
      if (key === "min") min = Math.min(59, Math.max(0, min + dir));
      return { y, m, d, h, 기 */
  const [uaPop, setUaPop] = useState<{ open: boolean; rect?: DOMRect; text?: string }>({ open: false });
  const onUAClick = (e: React.MouseEvent<HTMLDivElement>, text: string) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    setUaPop({ open: true, rect, text });
  };

  /* 화면 표시용 리스트 정렬,필터,검색 */
  const list = useMemo(() => {
    let a = [...rows];

    if (statusApplied.size) a = a.filter((r) => statusApplied.has(r.detection));
    if (q.trim()) {
      const s = q.toLowerCase();
      a = a.filter(
        (r) =>
          r.session_id.toLowerCase().includes(s) ||
          r.ip_address.toLowerCase().includes(s) ||
          r.user_agent.toLowerCase().includes(s)
      );
    }
    if (orderApplied === "user-agent") a.sort((x, y) => x.user_agent.localeCompare(y.user_agent));
    else if (orderApplied === "earliest") a.sort((x, y) => (x.start_time > y.start_time ? 1 : -1));
    else a.sort((x, y) => (x.end_time < y.end_time ? 1 : -1)); 



    return a;
  }, [rows, statusApplied, orderApplied, q, timeApplied]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 상단 바 검색,우측 상태) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0b1220", border: "1px solid #1f2937", borderRadius: 999, padding: "8px 14px", width: 380 }}>
          <span style={{ opacity: 0.6 }}>🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            style={{ flex: 1, background: "transparent", color: "#e5e7eb", outline: "none", border: "none", fontSize: 14 }}
          />
        </div>
        <div style={{ opacity: 0.8, fontSize: 12 }}>Admin • English 🇬🇧</div>
      </div>

      <h1 style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>Log Lists</h1>

      {/* 필터바 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#0b1220", border: "1px solid #1f2937", borderRadius: 12, padding: 10 }}>
        <ToolbarButton label="Time" value={timeLabel} onClick={() => setTimeOpen(true)} />
        <ToolbarButton label="Order Type" value={orderLabel} onClick={() => { setOrderTemp(orderApplied); setOrderOpen(true); }} />
        <ToolbarButton label="Order Status" value={statusLabel} onClick={() => { setStatusTemp(new Set(statusApplied)); setStatusOpen(true); }} />
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setRows(MOCK); setOrderApplied("latest"); setStatusApplied(new Set()); setQ(""); setTimeApplied(null); }}
          style={{ padding: "10px 14px", borderRadius: 10, background: "#0b1220", border: "1px solid #ef4444", color: "#fca5a5", fontWeight: 800, cursor: "pointer" }}
        >
          Reset Filter
        </button>
      </div>

      {/* 테이블 */}
      <style>{`
        .grid-head, .grid-row {
          display: grid;
          /* 정렬: label 140 / session 200 / ip 160 / UA auto / end 160 / start 160 */
          grid-template-columns: 140px 200px 160px minmax(320px, 1fr) 160px 160px;
          column-gap: 12px;
          align-items: center;
        }
        @media (max-width: 1280px) {
          .grid-head, .grid-row {
            grid-template-columns: 120px 180px 150px minmax(240px, 1fr) 140px 140px;
          }
        }
        .ua-cell {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
        }
        .time-cell { white-space: nowrap; }
      `}</style>

      <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden" }}>
        <div className="grid-head" style={{ padding: "14px 16px", borderBottom: "1px solid #1f2937", color: "#9ca3af", fontSize: 12, letterSpacing: 0.3, textTransform: "uppercase" }}>
          <div>Label</div>
          <div>session_id</div>
          <div>ip_address</div>
          <div>user_agent</div>
          <div>end_time</div>
          <div>start_time</div>
        </div>

        {list.map((row) => {
          const start = fmtParts(row.start_time);
          const end = fmtParts(row.end_time);
          return (
            <div key={row.id} className="grid-row" style={{ padding: "14px 16px", borderBottom: "1px solid #111827" }}>
              <div><Badge type={row.detection} /></div>
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.session_id}</div>
              <div style={{ whiteSpace: "nowrap" }}>{row.ip_address}</div>
              <div className="ua-cell" onClick={(e) => onUAClick(e, row.user_agent)} title="Click to view full user-agent">
                {row.user_agent}
              </div>
              <div className="time-cell" title={`${end.ymd}-${end.hms}`}>{end.ymd}-{end.hms}</div>
              <div className="time-cell" title={`${start.ymd}-${start.hms}`}>{start.ymd}-{start.hms}</div>
            </div>
          );
        })}
      </div>

      {/* UA 전체보기 팝업 */}
      <Pop open={uaPop.open} anchor={uaPop.rect} onClose={() => setUaPop({ open: false })}>
        <div style={{ fontSize: 12, lineHeight: 1.5, wordBreak: "break-all" }}>{uaPop.text}</div>
      </Pop>

      {/* Time Modal 복귀 */}
      <Modal open={timeOpen} onClose={() => setTimeOpen(false)} width={620}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Time Filter</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
          {([
            { key: "y", label: "Year" as const },
            { key: "m", label: "Month" as const },
            { key: "d", label: "Date" as const },
            { key: "h", label: "Hour" as const },
            { key: "min", label: "Minute" as const },
          ]).map((f) => (
            <div key={f.key} style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 12 }}>
              <div style={{ padding: "8px 12px", fontSize: 12, opacity: 0.8 }}>{f.label}</div>
              <div style={{ display: "grid", g렬 */}
      <Modal open={orderOpen} onClose={() => setOrderOpen(false)} width={600}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Select Order Type</h3>
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <Pill active={orderTemp === "latest"} onClick={() => setOrderTemp("latest")}>Latest</Pill>
          <Pill active={orderTemp === "earliest"} onClick={() => setOrderTemp("earliest")}>Earliest</Pill>
          <Pill active={orderTemp === "user-agent"} onClick={() => setOrderTemp("user-agent")}>User-Agent</Pill>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Pill active onClick={() => { setOrderApplied(orderTemp); setOrderOpen(false); }}>
            Apply Now
          </Pill>
        </div>
      </Modal>

      {/* 상태로 정렬 */}
      <Modal open={statusOpen} onClose={() => setStatusOpen(false)} width={640}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Select Order Status</h3>
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <Pill active={statusTemp.has("Safe")} onClick={() => toggleStatus("Safe")}>Safe</Pill>
          <Pill active={statusTemp.has("Danger")} onClick={() => toggleStatus("Danger")}>Danger</Pill>
          <Pill active={statusTemp.has("Detecting")} onClick={() => toggleStatus("Detecting")}>Detecting</Pill>
        </div>
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>* 여러 개를 동시에 선택할 수 있습니다.</div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Pill active onClick={() => { setStatusApplied(new Set(statusTemp)); setStatusOpen(false); }}>
            Apply Now
          </Pill>
        </div>
      </Modal>
    </div>
  );
}
