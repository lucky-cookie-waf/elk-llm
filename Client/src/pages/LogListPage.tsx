import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

/* ========== time helpers ========== */
const pad2 = (n: number) => String(n).padStart(2, "0");
const parseLoose = (s: string) => {
  if (!s) return new Date(NaN);
  const t = s.includes("T") ? s : s.replace(" ", "T");
  return new Date(t);
};
const fmtParts = (isoLike: string) => {
  const d = parseLoose(isoLike);
  const yy = String(d.getFullYear()).slice(-2);
  const MM = pad2(d.getMonth() + 1);
  const DD = pad2(d.getDate());
  const HH = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return { ymd: `${yy}/${MM}/${DD}`, hm: `${HH}:${mm}` };
};
const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) =>
  m === 2 ? (isLeapYear(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
const stampLabel = (y: number, m: number, d: number, h: number, min: number) =>
  `${String(y).slice(-2)}.${pad2(m)}.${pad2(d)}.${pad2(h)}:${pad2(min)}`;

/* ========== types ========== */
type Status = "Safe" | "Danger" | "Detecting";
type OrderType = "latest" | "earliest"; 
type TimeKey = "y" | "m" | "d" | "h" | "min";

type SessionRowFromAPI = {
  id: number | string;            
  session_id: string;
  ip_address: string | null;
  user_agent: string | null;
  start_time: string; 
  end_time: string;   
  created_at?: string;
  label?: string | null;           
  classification?: string | null;  
};

type LogItem = {
  id: string;          
  detection: Status;
  session_id: string;
  ip_address: string;
  user_agent: string;
  start_time: string;  
  end_time: string;
};

/* ========== small UI atoms ========== */
const Badge: React.FC<{ type: Status }> = ({ type }) => {
  const map: Record<Status, string> = {
    Safe: "#34d399",
    Danger: "#ef4444",
    Detecting: "#6b7280",
  };
  return (
    <span
      style={{
        background: map[type],
        color: "#0f172a",
        padding: "4px 10px",
        borderRadius: 8,
        fontWeight: 700,
        fontSize: 12,
      }}
    >
      {type}
    </span>
  );
};

const ToolbarButton: React.FC<{
  label: string;
  value?: string;
  onClick?: () => void;
}> = ({ label, value, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 14px",
      borderRadius: 10,
      background: "#0b1220",
      border: "1px solid #1f2937",
      color: "#e5e7eb",
      cursor: "pointer",
    }}
  >
    <span style={{ opacity: 0.8 }}>{label}</span>
    {value && <span style={{ fontWeight: 800 }}>{value}</span>}
  </button>
);

const Pill: React.FC<{
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: "10px 16px",
      borderRadius: 10,
      border: "1px solid #334155",
      background: active ? "#3b82f6" : "#0b1220",
      color: active ? "white" : "#cbd5e1",
      fontWeight: 700,
      cursor: "pointer",
    }}
  >
    {children}
  </button>
);

const Modal: React.FC<{
  open: boolean;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, width = 560, onClose, children }) => {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: "calc(100vw - 40px)",            
          boxSizing: "border-box",
          background: "#0f172a",
          border: "1px solid #1f2937",
          borderRadius: 16,
          padding: 20,
          color: "#e2e8f0",
          boxShadow: "0 10px 40px rgba(0,0,0,.35)",
        }}
      >
        {children}
      </div>
    </div>
  );
};

/* ========== popover helpers ========== */
function useOutside(handler: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const md = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handler();
    };
    window.addEventListener("mousedown", md);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", md);
      window.removeEventListener("keydown", esc);
    };
  }, [handler]);
  return ref;
}

const Pop: React.FC<{
  open: boolean;
  anchor?: DOMRect;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, anchor, onClose, children }) => {
  const ref = useOutside(onClose);
  if (!open || !anchor) return null;
  const top = anchor.top + window.scrollY + anchor.height + 8;
  const left = anchor.left + window.scrollX;
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top,
        left,
        width: anchor.width,
        background: "#0f172a",
        border: "1px solid #1f2937",
        borderRadius: 12,
        padding: 12,
        color: "#e5e7eb",
        boxShadow: "0 10px 30px rgba(0,0,0,.35)",
        zIndex: 60,
      }}
    >
      {children}
    </div>
  );
};

/* ========== helpers: API mapping ========== */
function toDetection(label?: string | null, classification?: string | null): Status {
  const L = (label || "").toUpperCase();
  const C = (classification || "").toUpperCase();
  if (["MALICIOUS", "ATTACK", "DANGER", "SUSPICIOUS"].some((k) => C.includes(k) || L.includes(k))) {
    return "Danger";
  }
  if (L === "NORMAL" || L === "SAFE") return "Safe";
  return "Detecting";
}

function mapRow(item: SessionRowFromAPI): LogItem {
  return {
    id: String(item.id),
    detection: toDetection(item.label, item.classification),
    session_id: String(item.session_id ?? ""),
    ip_address: item.ip_address ?? "-",
    user_agent: item.user_agent ?? "(empty)",
    start_time: item.start_time,
    end_time: item.end_time,
  };
}

/* ========== Page ========== */
export default function LogListPage() {
  const location = useLocation();
  /* 초기 상태 */
  const initialOrder: OrderType = "latest";
  const initialStatuses = new Set<Status>();
  const initialQuery = "";
  const now = new Date();
  const initialTime: { y: number; m: number; d: number; h: number; min: number } | null = null;

  /* 데이터 로드 */
  const [rows, setRows] = useState<LogItem[]>([]);
  const [connected, setConnected] = useState<null | boolean>(null);

  // 공통 fetch 함수: /api 실패 시 / 로 재시도
  const fetchSessions = useCallback(async () => {
    const qs = "label=NORMAL&page=1&pageSize=100&sort=end_time&order=desc";
    const tryFetch = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      const arr: SessionRowFromAPI[] = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
        ? data
        : [];
      return arr.map(mapRow);
    };
    try {
      let list = await tryFetch(`/api/session?${qs}`);
      if (!list.length) {
        list = await tryFetch(`/session?${qs}`);
      }
      setRows(list);
      setConnected(true);
    } catch (e) {
      console.error("Failed to fetch sessions:", e);
      setRows([]);
      setConnected(false);
    }
  }, [setRows, setConnected]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, location.key]);

  /* 검색 */
  const [q, setQ] = useState(initialQuery);

  /* 정렬/상태 필터 */
  const [orderApplied, setOrderApplied] = useState<OrderType>(initialOrder);
  const [statusApplied, setStatusApplied] = useState<Set<Status>>(new Set(initialStatuses));

  // 라벨
  const orderLabel = useMemo(() => {
    if (orderApplied === "latest") return "Latest";
    return "Earliest";
  }, [orderApplied]);

  const statusLabel = useMemo(() => {
    if (!statusApplied.size) return "All";
    return Array.from(statusApplied).join(", ");
  }, [statusApplied]);

  /* 모달: Status (유지) */
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTemp, setStatusTemp] = useState<Set<Status>>(new Set());
  const toggleStatus = (s: Status) =>
    setStatusTemp((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  /* Time 필터 */
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeTemp, setTimeTemp] = useState({
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    d: now.getDate(),
    h: now.getHours(),
    min: now.getMinutes(),
  });
  const [timeApplied, setTimeApplied] =
    useState<{ y: number; m: number; d: number; h: number; min: number } | null>(initialTime);

  const bump = (key: TimeKey, dir: 1 | -1) =>
    setTimeTemp((p) => {
      let { y, m, d, h, min } = p;
      if (key === "y") y = Math.min(2100, Math.max(1, y + dir));
      if (key === "m") m = Math.min(12, Math.max(1, m + dir));
      if (key === "d") d = Math.min(daysInMonth(y, m), Math.max(1, d + dir));
      if (key === "h") h = Math.min(23, Math.max(0, h + dir));
      if (key === "min") min = Math.min(59, Math.max(0, min + dir));
      return { y, m, d, h, min };
    });

  const timeLabel = useMemo(
    () =>
      timeApplied
        ? stampLabel(timeApplied.y, timeApplied.m, timeApplied.d, timeApplied.h, timeApplied.min)
        : "Any time",
    [timeApplied]
  );

  // 팝업: UA & session_id 전체보기
  const [uaPop, setUaPop] = useState<{ open: boolean; rect?: DOMRect; text?: string }>({ open: false });
  const [sidPop, setSidPop] = useState<{ open: boolean; rect?: DOMRect; text?: string }>({ open: false });
  const onUAClick = (e: React.MouseEvent<HTMLDivElement>, text: string) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    setUaPop({ open: true, rect, text });
  };
  const onSIDClick = (e: React.MouseEvent<HTMLDivElement>, text: string) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    setSidPop({ open: true, rect, text });
  };

  /* 화면 표시용 리스트 정렬/필터/검색 */
  const list = useMemo(() => {
    let a = [...rows];

    // 상태 필터
    if (statusApplied.size) a = a.filter((r) => statusApplied.has(r.detection));

    // 검색
    if (q.trim()) {
      const s = q.toLowerCase();
      a = a.filter(
        (r) =>
          r.session_id.toLowerCase().includes(s) ||
          (r.ip_address || "").toLowerCase().includes(s) ||
          (r.user_agent || "").toLowerCase().includes(s)
      );
    }

    // 시간 필터 – end_time이 선택 시간 이후인 것만
    if (timeApplied) {
      const t = new Date(
        timeApplied.y,
        timeApplied.m - 1,
        timeApplied.d,
        timeApplied.h,
        timeApplied.min
      ).getTime();
      a = a.filter((r) => parseLoose(r.end_time).getTime() >= t);
    }

    // 정렬 
    if (orderApplied === "earliest")
      a.sort((x, y) => (parseLoose(x.start_time) > parseLoose(y.start_time) ? 1 : -1));
    else
      a.sort((x, y) => (parseLoose(x.end_time) < parseLoose(y.end_time) ? 1 : -1)); // latest

    return a;
  }, [rows, statusApplied, orderApplied, q, timeApplied]);

  /* Time 필드 정의 */
  const timeDefs: ReadonlyArray<{ key: TimeKey; label: string }> = [
    { key: "y", label: "Year" },
    { key: "m", label: "Month" },
    { key: "d", label: "Date" },
    { key: "h", label: "Hour" },
    { key: "min", label: "Minute" },
  ] as const;

  /* Order Type 토글 */
  const toggleOrder = () => {
    setOrderApplied((p) => (p === "latest" ? "earliest" : "latest"));
  };

  /* Reset: 초기 필터로 복귀, 서버에서 다시 불러오기 */
  const onReset = async () => {
    setOrderApplied(initialOrder);
    setStatusApplied(new Set(initialStatuses));
    setQ(initialQuery);
    setTimeApplied(initialTime);
    await fetchSessions();
  };

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "#0b1220",
            border: "1px solid #1f2937",
            borderRadius: 999,
            padding: "8px 14px",
            width: 380,
          }}
        >
          <span style={{ opacity: 0.6 }}>🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            style={{
              flex: 1,
              background: "transparent",
              color: "#e5e7eb",
              outline: "none",
              border: "none",
              fontSize: 14,
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ opacity: 0.8, fontSize: 12 }}>Admin • English 🇬🇧</div>
          <span
            title={
              connected === null
                ? "Checking..."
                : connected
                ? `API connected (${rows.length})`
                : "No data / fetch failed"
            }
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
            {connected === null ? "Checking" : connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      <h1 style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>Log Lists</h1>

      {/* 필터 바 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "#0b1220",
          border: "1px solid #1f2937",
          borderRadius: 12,
          padding: 10,
        }}
      >
        <ToolbarButton label="Time" value={timeLabel} onClick={() => setTimeOpen(true)} />

        {/*  Order Type  */}
        <ToolbarButton
          label="Order Type"
          value={orderLabel}
          onClick={toggleOrder}
        />

        <ToolbarButton
          label="Order Status"
          value={statusLabel}
          onClick={() => {
            setStatusTemp(new Set(statusApplied));
            setStatusOpen(true);
          }}
        />
        <div style={{ flex: 1 }} />
        <button
          onClick={onReset}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "#0b1220",
            border: "1px solid #ef4444",
            color: "#fca5a5",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Reset Filter
        </button>
      </div>

      {/* 테이블 */}
      <style>{`
        .grid-head, .grid-row {
          display: grid;
          grid-template-columns: 80px 220px 160px minmax(320px, 1fr) 160px 160px 160px;
          /*  id | session_id | ip | user_agent | end_time | start_time  (기존 6열 + id 추가) */
          column-gap: 12px;
          align-items: center;
        }
        @media (max-width: 1280px) {
          .grid-head, .grid-row {
            grid-template-columns: 70px 200px 150px minmax(240px, 1fr) 140px 140px 140px;
          }
        }
        .ua-cell, .sid-cell {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
        }
        .time-cell { white-space: nowrap; }
        .id-link {
          color: #3b82f6;
          text-decoration: underline;
          white-space: nowrap;
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
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          <div>id</div>
          <div>session_id</div>
          <div>ip_address</div>
          <div>user_agent</div>
          <div>end_time</div>
          <div>start_time</div>
          <div>Label</div>
        </div>

        {list.map((row) => {
          const start = fmtParts(row.start_time);
          const end = fmtParts(row.end_time);
          return (
            <div
              key={`${row.id}-${row.session_id}`}
              className="grid-row"
              style={{ padding: "14px 16px", borderBottom: "1px solid #111827" }}
            >
              {/* RawLog 링크 (세션 상세로 이동) */}
              <div>
                <Link
                className="id-link"
                to={`/rawlog/${encodeURIComponent(row.id)}`}   
                title="See RawLog"
                state={{ session_id: row.session_id, session_db_id: Number(row.id) }}         
                >
                  {row.id}
                </Link>

              </div>

              {/* session_id */}
              <div
                className="sid-cell"
                onClick={(e) => onSIDClick(e, row.session_id)}
                title="Click to view full session_id"
                style={{ color: "#e5e7eb" }}
              >
                {row.session_id}
              </div>

              <div style={{ whiteSpace: "nowrap" }}>{row.ip_address}</div>

              {/* user_agent */}
              <div
                className="ua-cell"
                onClick={(e) => onUAClick(e, row.user_agent)}
                title="Click to view full user-agent"
              >
                {row.user_agent}
              </div>

              <div className="time-cell" title={`${end.ymd}-${end.hm}`}>
                {end.ymd}-{end.hm}
              </div>
              <div className="time-cell" title={`${start.ymd}-${start.hm}`}>
                {start.ymd}-{start.hm}
              </div>

              <div>
                <Badge type={row.detection} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 팝업들 */}
      <Pop open={uaPop.open} anchor={uaPop.rect} onClose={() => setUaPop({ open: false })}>
        <div style={{ fontSize: 12, lineHeight: 1.5, wordBreak: "break-all" }}>{uaPop.text}</div>
      </Pop>
      <Pop open={sidPop.open} anchor={sidPop.rect} onClose={() => setSidPop({ open: false })}>
        <div style={{ fontSize: 12, lineHeight: 1.5, wordBreak: "break-all" }}>{sidPop.text}</div>
      </Pop>

      {/* Time Modal */}
      <Modal open={timeOpen} onClose={() => setTimeOpen(false)} width={760}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Time Filter</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(120px, 1fr))",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {timeDefs.map((f) => (
            <div
              key={f.key}
              style={{
                background: "#0b1220",
                border: "1px solid #1f2937",
                borderRadius: 12,
              }}
            >
              <div style={{ padding: "8px 12px", fontSize: 12, opacity: 0.8 }}>
                {f.label}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: 8,
                  padding: "8px 12px 12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  
                  <button
                    onClick={() => bump(f.key, -1)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #334155",
                      background: "#0b1220",
                      color: "#cbd5e1",
                      cursor: "pointer",
                    }}
                  >
                    −
                  </button>
                  <div style={{ fontWeight: 800, fontSize: 16, minWidth: 48, textAlign: "center" }}>
                    {f.key === "y"
                      ? timeTemp.y
                      : f.key === "m"
                      ? pad2(timeTemp.m)
                      : f.key === "d"
                      ? pad2(timeTemp.d)
                      : f.key === "h"
                      ? pad2(timeTemp.h)
                      : pad2(timeTemp.min)}
                  </div>
                  <button
                    onClick={() => bump(f.key, 1)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #334155",
                      background: "#0b1220",
                      color: "#cbd5e1",
                      cursor: "pointer",
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <Pill
            onClick={() => {
              setTimeApplied(timeTemp);
              setTimeOpen(false);
            }}
            active
          >
            Apply Now
          </Pill>
          <Pill
            onClick={() => {
              setTimeApplied(null);
              setTimeOpen(false);
            }}
          >
            Clear
          </Pill>
        </div>
      </Modal>

      {/* Status Modal */}
      <Modal open={statusOpen} onClose={() => setStatusOpen(false)} width={640}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>
          Select Order Status
        </h3>
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <Pill
            active={statusTemp.has("Safe")}
            onClick={() => toggleStatus("Safe")}
          >
            Safe
          </Pill>
          <Pill
            active={statusTemp.has("Danger")}
            onClick={() => toggleStatus("Danger")}
          >
            Danger
          </Pill>
          <Pill
            active={statusTemp.has("Detecting")}
            onClick={() => toggleStatus("Detecting")}
          >
            Detecting
          </Pill>
        </div>
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>
          * 여러 개를 동시에 선택할 수 있습니다.
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <Pill
            active
            onClick={() => {
              setStatusApplied(new Set(statusTemp));
              setStatusOpen(false);
            }}
          >
            Apply Now
          </Pill>
          <Pill
            onClick={() => {
              setStatusTemp(new Set());
            }}
          >
            Clear Temp
          </Pill>
        </div>
      </Modal>
    </div>
  );
}
