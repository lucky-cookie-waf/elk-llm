import React, { useState } from "react";

/* 카드 박스 */
const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      background: "#0b1220",
      border: "1px solid #1f2937",
      borderRadius: 16,
      padding: 16,
      color: "#e5e7eb",
      ...style,
    }}
  >
    {children}
  </div>
);

/* 상태 Pill */
const StatusPill: React.FC<{ kind: "Accepted" | "Rejected" | "Processing"; onClick?: () => void }> = ({
  kind,
  onClick,
}) => {
  const map = {
    Accepted: { bg: "#34d399", fg: "#0f172a" },
    Rejected: { bg: "#ef4444", fg: "#0f172a" },
    Processing: { bg: "#8b5cf6", fg: "#0f172a" },
  } as const;
  return (
    <span
      onClick={onClick}
      style={{
        background: map[kind].bg,
        color: map[kind].fg,
        padding: "6px 12px",
        borderRadius: 999,
        fontWeight: 800,
        fontSize: 12,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {kind}
    </span>
  );
};

/* 타입 */
interface RuleRow {
  id: string;
  attack: string;
  suggestion: string;
  explanation: string;
  date: string; // 04/Aug/2025:22:15:30
  status: "Accepted" | "Rejected" | "Processing";
}

const SAMPLE_SUGGESTION = String.raw`\\union\\b+\\s*select|\\binsert\\b|\\bdelete\\b|\\bdrop\\b|\\bupdate\\b|\\s*select\\b.*from\\b`;

const rowsInit: RuleRow[] = Array.from({ length: 10 }).map((_, i) => ({
  id: String(i + 1),
  attack: "SQL injection",
  suggestion: SAMPLE_SUGGESTION,
  explanation: "--ad0c2a0-B--",
  date: "04/Aug/2025:22:15:30",
  status: i === 3 ? "Rejected" : i === 4 ? "Processing" : "Accepted",
}));

/* 메인 페이지 */
export default function Rule() {
  const [rows, setRows] = useState<RuleRow[]>(rowsInit);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleStatusChange = (status: RuleRow["status"]) => {
    if (!editingId) return;
    setRows((prev) => prev.map((r) => (r.id === editingId ? { ...r, status } : r)));
    setEditingId(null); // 모달 닫기
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0f1a", color: "#e5e7eb" }}>
      <main style={{ flex: 1, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 32, fontWeight: 800 }}>Custom Rule management</h1>
          <div style={{ opacity: 0.8, fontSize: 12 }}>Admin • English 🇬🇧</div>
        </div>

        <Card style={{ marginTop: 18, padding: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 2fr 1.2fr 1.4fr 160px",
              padding: "14px 16px",
              borderBottom: "1px solid #1f2937",
              color: "#9ca3af",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            <div>Attack</div>
            <div>Suggestion</div>
            <div>Explaination</div>
            <div>Date</div>
            <div style={{ textAlign: "right" }}>Status</div>
          </div>

          {rows.map((r) => {
            const isOpen = !!open[r.id];
            return (
              <div key={r.id} style={{ borderBottom: "1px solid #111827" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.1fr 2fr 1.2fr 1.4fr 160px",
                    padding: "16px",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div>{r.attack}</div>
                  <div>
                    <pre
                      style={{
                        margin: 0,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.3,
                        opacity: 0.95,
                      }}
                    >
                      {r.suggestion}
                    </pre>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ opacity: 0.9 }}>{r.explanation}</span>
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [r.id]: !isOpen }))}
                      aria-label="toggle details"
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #1f2937",
                        background: "#0b1220",
                        color: "#e5e7eb",
                        cursor: "pointer",
                      }}
                    >
                      {isOpen ? "▴" : "▾"}
                    </button>
                  </div>
                  <div>{r.date}</div>
                  <div style={{ textAlign: "right" }}>
                    <StatusPill kind={r.status} onClick={() => setEditingId(r.id)} />
                  </div>
                </div>

                {isOpen && (
                  <div style={{ padding: "0 16px 16px 16px" }}>
                    <Card style={{ padding: 12, background: "#0a1424" }}>
                      <div style={{ opacity: 0.8, fontSize: 12, marginBottom: 6 }}>Raw rule preview</div>
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >{`SecRule REQUEST_URI "${SAMPLE_SUGGESTION}" \
  "id:93${r.id}00,phase:2,deny,status:403,log,msg:'SQLi pattern detected'"`}</pre>
                    </Card>
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        <div style={{ height: 40 }} />
      </main>

      {/* 모달 */}
      {editingId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#1f2937",
              borderRadius: 12,
              padding: 24,
              minWidth: 280,
              textAlign: "center",
            }}
          >
            <h2 style={{ marginBottom: 16 }}>Change Status</h2>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <StatusPill kind="Accepted" onClick={() => handleStatusChange("Accepted")} />
              <StatusPill kind="Rejected" onClick={() => handleStatusChange("Rejected")} />
              <StatusPill kind="Processing" onClick={() => handleStatusChange("Processing")} />
            </div>
            <button
              onClick={() => setEditingId(null)}
              style={{
                marginTop: 20,
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid #374151",
                background: "#111827",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
