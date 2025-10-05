import React, { useEffect, useState } from "react";

/* 카드 박스 */
const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
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

// DB의 enum과 타입을 일치시킵니다.
type StatusKind = "Accepted" | "Rejected" | "Processing";

/* 상태 Pill */
const StatusPill: React.FC<{
  kind: StatusKind;
  onClick?: () => void;
}> = ({ kind, onClick }) => {
  const map = {
    Accepted: { bg: "#34d399", fg: "#0f172a" },
    Rejected: { bg: "#ef4444", fg: "#0f172a" },
    Processing: { bg: "#8b5cf6", fg: "#0f172a" },
  } as const;

  const styleProps = map[kind] || { bg: "#6b7280", fg: "#ffffff" };

  return (
    <span
      onClick={onClick}
      style={{
        background: styleProps.bg,
        color: styleProps.fg,
        padding: "6px 12px",
        borderRadius: 999,
        fontWeight: 800,
        fontSize: 12,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {kind || 'Unknown'}
    </span>
  );
};

/* 타입 (백엔드 Rule 모델과 프론트엔드 Row 구조를 통합) */
interface RuleRow {
  id: string;
  attack: string;
  suggestion: string;
  explanation: string;
  date: string;
  status: StatusKind;
  raw: any; // Raw rule preview를 위한 원본 데이터
}

/* 메인 페이지 */
export default function RulePage() {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // API에서 데이터 불러오기
  useEffect(() => {
    const fetchRules = async () => {
      try {
        const res = await fetch("/api/rules?limit=20&offset=0");
        const data = await res.json();

        if (data && data.items) {
          const mapped: RuleRow[] = data.items.map((item: any) => ({
            id: String(item.id),
            attack: item.rule_name ?? "Unknown",
            suggestion: item.operator ?? "",
            explanation: item.logdata ?? "",
            date: new Date(item.created_at).toLocaleString(),
            // DB에 status 필드가 없거나 null이면 'Processing'을 기본값으로 사용
            status: item.status || "Processing", 
            raw: item,
          }));
          setRows(mapped);
        } else {
          console.error("No items found in response data");
        }
      } catch (err) {
        console.error("Failed to fetch rules", err);
      } finally {
        setLoading(false);
      }
    };
    fetchRules();
  }, []);
  
  // DB 연동을 위한 비동기 API 호출 로직
  const handleStatusChange = async (newStatus: StatusKind) => {
    if (!editingId) return;

    try {
      // ✅ API 경로가 '/api/rules/:id' 형태로 백엔드와 일치하는지 확인
      const response = await fetch(`/api/rules/${editingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update status on the server');
      }

      const updatedRuleFromServer = await response.json();

      setRows((prev) =>
        prev.map((r) =>
          r.id === editingId ? { ...r, status: updatedRuleFromServer.status } : r
        )
      );
    } catch (error) {
      console.error("Error updating rule status:", error);
      alert('상태 변경에 실패했습니다. 서버 로그를 확인해주세요.');
    } finally {
      setEditingId(null);
    }
  };


  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          background: "#0a0f1a",
          color: "#e5e7eb",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Loading rules...
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#0a0f1a",
        color: "#e5e7eb",
      }}
    >
      <main style={{ flex: 1, padding: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h1 style={{ fontSize: 32, fontWeight: 800 }}>
            Custom Rule management
          </h1>
          <div style={{ opacity: 0.8, fontSize: 12 }}>
            Admin • English 🇬🇧
          </div>
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
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
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
                      onClick={() =>
                        setOpen((o) => ({ ...o, [r.id]: !isOpen }))
                      }
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
                    <StatusPill
                      kind={r.status}
                      onClick={() => setEditingId(r.id)}
                    />
                  </div>
                </div>

                {isOpen && (
                  <div style={{ padding: "0 16px 16px 16px" }}>
                    <Card style={{ padding: 12, background: "#0a1424" }}>
                      <div
                        style={{
                          opacity: 0.8,
                          fontSize: 12,
                          marginBottom: 6,
                        }}
                      >
                        Raw rule preview
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {JSON.stringify(r.raw, null, 2)}
                      </pre>
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
              <StatusPill
                kind="Accepted"
                onClick={() => handleStatusChange("Accepted")}
              />
              <StatusPill
                kind="Rejected"
                onClick={() => handleStatusChange("Rejected")}
              />
              <StatusPill
                kind="Processing"
                onClick={() => handleStatusChange("Processing")}
              />
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