import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";

// package.json의 "proxy" 설정이 API 호출을 담당합니다.

/* -------------------- API 데이터 타입 정의 -------------------- */
interface OverviewStats {
  totalAttacks: number;
  wowChangePct: number;
  period: { from: string; to: string };
}

interface TrendPoint {
  ts: string;
  count: number;
}

interface AttackDetail {
  sessionId: number;
  attackType: string;
  ip: string;
  userAgent: string;
  statusCode: number | null;
  time: string;
  confidence: number;
}

/* -------------------- Card / Badge -------------------- */
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

const StatBadge: React.FC<{ label: string; value: string; rightIcon?: React.ReactNode }> = ({
  label,
  value,
  rightIcon,
}) => (
  <Card
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}
  >
    <div>
      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900 }}>{value}</div>
    </div>
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: 14,
        background: "#111827",
        display: "grid",
        placeItems: "center",
      }}
    >
      {rightIcon ?? <span>🟡</span>}
    </div>
  </Card>
);

/* -------------------- Charts -------------------- */
const LineChart: React.FC<{ width: number; height: number; data: number[] }> = ({
  width,
  height,
  data,
}) => {
  const max = Math.max(...data) || 1;
  const pad = 36;
  const w = width > pad * 2 ? width - pad * 2 : 0;
  const h = height > pad * 2 ? height - pad * 2 : 0;
  const stepX = data.length > 1 ? w / (data.length - 1) : 0;

  const points = data
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + h - (v / max) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {[0.25, 0.5, 0.75, 1].map((g, idx) => (
        <line
          key={idx}
          x1={pad}
          y1={pad + (1 - g) * h}
          x2={pad + w}
          y2={pad + (1 - g) * h}
          stroke="#1f2937"
        />
      ))}
      <rect x={pad} y={pad} width={w} height={h} fill="none" stroke="#1f2937" />
      <polyline
        fill="none"
        stroke="#60a5fa"
        strokeWidth={2.5}
        points={points}
      />
      {data.map((v, i) => {
        const x = pad + i * stepX;
        const y = pad + h - (v / max) * h;
        return <circle key={i} cx={x} cy={y} r={3.5} fill="#60a5fa" />;
      })}
      {data.map((_, i) => {
        const x = pad + i * stepX;
        return (
          <text
            key={i}
            x={x}
            y={height - 6}
            textAnchor="middle"
            fontSize={11}
            fill="#9ca3af"
          >
            {i + 1}
          </text>
        );
      })}
    </svg>
  );
};

const DonutChart: React.FC<{
  size: number;
  thickness?: number;
  values: { label: string; value: number; color: string }[];
}> = ({ size, thickness = 34, values }) => {
  const total = values.reduce((s, v) => s + v.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  let acc = 0;

  return (
    <svg width={size} height={size}>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#334155"
        strokeWidth={thickness}
      />
      {values.map((seg, idx) => {
        const frac = seg.value / total;
        const dash = 2 * Math.PI * radius * frac;
        const gap = 2 * Math.PI * radius - dash;
        const offset = -acc * 2 * Math.PI * radius;
        acc += frac;
        return (
          <circle
            key={idx}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={offset}
            strokeLinecap={"round" as any}
          />
        );
      })}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={24}
        fontWeight={800}
        fill="#e5e7eb"
      >
        {total.toLocaleString()}
      </text>
    </svg>
  );
};

/* -------------------- Popup -------------------- */
const Popup: React.FC<{
  visible: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}> = ({ visible, onClose, children }) => {
  if (!visible) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0b1220",
          border: "1px solid #1f2937",
          padding: 16,
          borderRadius: 12,
          minWidth: 320,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/* -------------------- YearPicker -------------------- */
const YearPicker: React.FC<{ value: number; onChange: (v: number) => void }> = ({
  value,
  onChange,
}) => {
  const years = [2025, 2024, 2023, 2022, 2021, 2020];
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid #1f2937",
        background: "#0b1220",
        color: "#e5e7eb",
      }}
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
};

/* -------------------- MiniCalendar -------------------- */
type MiniCalendarProps = {
  year: number;
  month: number; // 0-11
  selected?: Date | null;
  onSelect: (d: Date) => void;
};

const MiniCalendar: React.FC<MiniCalendarProps> = ({
  year,
  month,
  selected,
  onSelect,
}) => {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = new Array(firstDay).fill(null);
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const days = leading.concat(monthDays);

  const isSameDate = (d: Date, y: number, m: number, day: number) =>
    d &&
    d.getFullYear() === y &&
    d.getMonth() === m &&
    d.getDate() === day;

  return (
    <div style={{ color: "#e5e7eb" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
          marginBottom: 8,
        }}
      >
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((s) => (
          <div
            key={s}
            style={{ textAlign: "center", opacity: 0.6, fontSize: 12 }}
          >
            {s}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
        }}
      >
        {days.map((d, idx) =>
          d === null ? (
            <div key={idx} />
          ) : (
            <div
              key={idx}
              onClick={() => onSelect(new Date(year, month, d))}
              style={{
                padding: "8px 6px",
                textAlign: "center",
                borderRadius: 8,
                cursor: "pointer",
                background:
                  selected && isSameDate(selected, year, month, d)
                    ? "#2563eb"
                    : "#1f2937",
                color:
                  selected && isSameDate(selected, year, month, d)
                    ? "#ffffff"
                    : "#e5e7eb",
              }}
            >
              {d}
            </div>
          )
        )}
      </div>
    </div>
  );
};

/* -------------------- Main -------------------- */
const clampYear = (y: number) => Math.max(2020, Math.min(2025, y));

const DashboardPage: React.FC = () => {
  // 공통 상태
  const [apiStatus, setApiStatus] = useState("Checking...");

  // 상단 카드 상태
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
  const [latestAttack, setLatestAttack] = useState<string | null>(null);
  
  // Attack Insights (차트) 상태
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [donutValues, setDonutValues] = useState<{ label: string; value: number; color: string }[]>([]);
  const [isInsightLoading, setIsInsightLoading] = useState(true);
  
  // Attack Details (테이블) 상태
  const [attackDetails, setAttackDetails] = useState<AttackDetail[]>([]);
  const [isDetailsLoading, setIsDetailsLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // 날짜 선택 상태
  const now = new Date();
  const [insightYear, setInsightYear] = useState(clampYear(now.getFullYear()));
  const [insightMonth, setInsightMonth] = useState(now.getMonth()); // 0-11
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);

  const [detailYear, setDetailYear] = useState(now.getFullYear());
  const [detailMonth, setDetailMonth] = useState(now.getMonth());
  const [detailSelectedDate, setDetailSelectedDate] = useState<Date | null>(now);
  const [dayPopupOpen, setDayPopupOpen] = useState(false);

  // API 호출 헬퍼
  const apiFetch = useCallback(async (endpoint: string) => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} on ${endpoint}`);
      }
      return await res.json();
    } catch (err: any) {
      console.error(`API Error on ${endpoint}:`, err);
      setApiStatus(`API 연결 실패 ❌ (${err?.message ?? "Unknown"})`);
      throw err;
    }
  }, []);

  // 1. 초기 상단 카드 데이터 로드
  useEffect(() => {
    const fetchInitialStats = async () => {
      try {
        const [overview, recent] = await Promise.all([
          apiFetch('/stats/overview'),
          apiFetch('/stats/recent-attack')
        ]);
        setOverviewStats(overview);
        setLatestAttack(recent.latestAt);
        setApiStatus("Connected ✅");
      } catch (err) {
        // 에러 상태는 apiFetch 내부에서 처리
      }
    };
    fetchInitialStats();
  }, [apiFetch]);

  // 2. Attack Insights (차트) 데이터 로드 (월 변경 시)
  useEffect(() => {
    const fetchInsightData = async () => {
      setIsInsightLoading(true);
      const from = new Date(insightYear, insightMonth, 1);
      const to = new Date(insightYear, insightMonth + 1, 1);

      try {
        const trendUrl = `/attacks/trend?from=${from.toISOString()}&to=${to.toISOString()}&groupBy=day`;
        const trendResult = await apiFetch(trendUrl);
        setTrendData(trendResult.points || []);

        const attacksUrl = `/attacks?year=${insightYear}&month=${insightMonth + 1}&limit=500`;
        const attacksResult = await apiFetch(attacksUrl);
        const items: AttackDetail[] = attacksResult.items || [];
        
        const typeCounts: Record<string, number> = {};
        items.forEach((atk) => {
          typeCounts[atk.attackType] = (typeCounts[atk.attackType] || 0) + 1;
        });

        const palette = ["#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#7c3aed", "#ec4899", "#f97316", "#f59e0b", "#10b981"];
        const donutData = Object.entries(typeCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([label, value], i) => ({
              label,
              value,
              color: palette[i % palette.length],
          }));
        setDonutValues(donutData);

      } catch (err) {
        setTrendData([]);
        setDonutValues([]);
      } finally {
        setIsInsightLoading(false);
      }
    };
    fetchInsightData();
  }, [insightYear, insightMonth, apiFetch]);

  
  // 3. Attack Details (테이블) 데이터 로드 (일 변경 시)
  const fetchAttackDetails = useCallback(async (date: Date, cursor: string | null = null) => {
    setIsDetailsLoading(true);
    
    const from = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    
    let url = `/attacks?from=${from.toISOString()}&to=${to.toISOString()}&limit=20`;
    if (cursor) {
      url += `&cursor=${cursor}`;
    }

    try {
      const data = await apiFetch(url);
      setAttackDetails(prev => cursor ? [...prev, ...(data.items || [])] : (data.items || []));
      setNextCursor(data.nextCursor || null);
    } catch (err) {
      if (!cursor) setAttackDetails([]);
    } finally {
      setIsDetailsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (detailSelectedDate) {
      setAttackDetails([]);
      setNextCursor(null);
      fetchAttackDetails(detailSelectedDate);
    }
  }, [detailSelectedDate, fetchAttackDetails]);

  // 무한 스크롤 핸들러
  const handleScroll = useCallback(() => {
    const container = tableContainerRef.current;
    if (container && detailSelectedDate) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 100 && !isDetailsLoading && nextCursor) {
        fetchAttackDetails(detailSelectedDate, nextCursor);
      }
    }
  }, [isDetailsLoading, nextCursor, detailSelectedDate, fetchAttackDetails]);

  // 라인차트에 맞는 데이터 가공
  const dailyCountsForChart = useMemo(() => {
    const daysInMonth = new Date(insightYear, insightMonth + 1, 0).getDate();
    const counts = Array(daysInMonth).fill(0);
    if(trendData) {
        trendData.forEach(p => {
            const dayOfMonth = new Date(p.ts).getDate();
            if (dayOfMonth > 0 && dayOfMonth <= daysInMonth) {
                counts[dayOfMonth - 1] = p.count;
            }
        });
    }
    return counts;
  }, [trendData, insightYear, insightMonth]);
  
  // 도넛 차트 범례를 위한 전체 합계 계산
  const totalDonutValue = useMemo(() => donutValues.reduce((sum, item) => sum + item.value, 0) || 1, [donutValues]);

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
        <h1 style={{ fontSize: 32, fontWeight: 800 }}>Dashboard</h1>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          API Status: {apiStatus}
        </div>

        {/* Stat */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginTop: 16,
          }}
        >
          {/* [수정] 라벨 텍스트 변경 (백엔드 API 수정 필요) */}
          <StatBadge
            label="Total Attacks"
            value={overviewStats?.totalAttacks.toLocaleString() ?? '...'}
          />
          <StatBadge
            label="Recent Attack"
            value={
              latestAttack
                ? new Date(latestAttack).toLocaleString()
                : "N/A"
            }
          />
        </div>

        {/* Insights */}
        <Card style={{ marginTop: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              Attack Insights
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>
                {insightYear}년 {insightMonth + 1}월
              </div>
              <button
                onClick={() => setMonthPopupOpen(true)}
                style={{
                  background: "#1f2937",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "none",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                📅 Select Month
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              // [수정] 차트 레이아웃 비율 고정값으로 조정
              gridTemplateColumns: "60% 40%",
              gap: 24,
              alignItems: 'center'
            }}
          >
            <Card style={{ padding: 0, height: 320, opacity: isInsightLoading ? 0.5 : 1 }}>
              {/* [수정] 라인 차트 너비를 적절한 고정값으로 변경 */}
              <LineChart width={680} height={320} data={dailyCountsForChart} />
            </Card>
            
            <Card
              style={{
                padding: '16px',
                display: "flex",
                flexDirection: 'column',
                alignItems: "center",
                justifyContent: "center",
                height: 320,
                opacity: isInsightLoading ? 0.5 : 1,
              }}
            >
              {donutValues.length > 0 ? (
                <>
                  <DonutChart size={180} thickness={28} values={donutValues} />
                  <div style={{ marginTop: 16, width: '100%', fontSize: 12, color: '#9ca3af', overflowY: 'auto', maxHeight: '100px' }}>
                    {donutValues.map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingRight: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: item.color, marginRight: 8, flexShrink: 0 }}></span>
                          <span title={item.label}>{item.label}</span>
                        </div>
                        <strong style={{ flexShrink: 0, marginLeft: '8px' }}>{((item.value / totalDonutValue) * 100).toFixed(1)}%</strong>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color: "#9ca3af" }}>
                  {isInsightLoading ? 'Loading...' : 'No data for this month'}
                </div>
              )}
            </Card>
          </div>
        </Card>

        {/* Details */}
        <Card style={{ marginTop: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              Attack Details
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>
                {detailSelectedDate
                  ? detailSelectedDate.toLocaleDateString()
                  : "No date selected"}
              </div>
              <button
                onClick={() => setDayPopupOpen(true)}
                style={{
                  background: "#1f2937",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "none",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                📅 Select Day
              </button>
            </div>
          </div>

          <div
            ref={tableContainerRef}
            onScroll={handleScroll}
            style={{
              maxHeight: 320,
              overflowY: "auto",
              fontSize: 14,
              borderTop: "1px solid #1f2937",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
              <thead style={{ background: "#111827", position: "sticky", top: 0 }}>
                <tr>
                  <th style={{ padding: "10px 12px", fontSize: 13, width: "25%" }}>
                    Attack Type
                  </th>
                  <th style={{ padding: "10px 12px", fontSize: 13, width: "25%" }}>
                    IP
                  </th>
                  <th style={{ padding: "10px 12px", fontSize: 13, width: "30%" }}>
                    Date - Time
                  </th>
                  <th style={{ padding: "10px 12px", fontSize: 13, width: "20%" }}>
                    Session ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {attackDetails.length > 0 ? (
                  attackDetails.map((atk, i) => (
                    <tr
                      key={`${atk.sessionId}-${i}`}
                      style={{
                        borderBottom: "1px solid #1f2937",
                        transition: "background 0.2s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#1e293b")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td style={{ padding: "8px 12px" }}>
                        <span
                          style={{
                            background: "#2563eb22",
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontSize: 12,
                            color: "#60a5fa",
                          }}
                        >
                          {atk.attackType}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", fontFamily: 'monospace' }}>
                        {atk.ip}
                      </td>
                       <td style={{ padding: "8px 12px" }}>
                        {new Date(atk.time).toLocaleString()}
                      </td>
                      <td style={{ padding: "8px 12px", fontFamily: 'monospace' }}>
                        {atk.sessionId}
                      </td>
                    </tr>
                  ))
                ) : !isDetailsLoading && (
                  <tr>
                    <td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#9ca3af' }}>
                      No attacks for selected day
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {isDetailsLoading && (
              <div style={{ textAlign: 'center', padding: '16px', color: '#9ca3af' }}>
                Loading...
              </div>
            )}
          </div>
        </Card>
      </main>

      {/* Month Popup */}
      <Popup
        visible={monthPopupOpen}
        onClose={() => setMonthPopupOpen(false)}
      >
        <h3 style={{ marginBottom: 12 }}>Select Year / Month</h3>
        <YearPicker value={insightYear} onChange={(y) => setInsightYear(y)} />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 12,
          }}
        >
          {[
            "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
          ].map((m, i) => (
            <button
              key={i}
              onClick={() => {
                setInsightMonth(i);
                setMonthPopupOpen(false);
              }}
              style={{
                flex: "1 0 20%",
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #1f2937",
                background:
                  insightMonth === i ? "#2563eb" : "rgba(255,255,255,0.04)",
                color: insightMonth === i ? "#fff" : "#e5e7eb",
                cursor: "pointer",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </Popup>

      {/* Day Popup */}
      <Popup visible={dayPopupOpen} onClose={() => setDayPopupOpen(false)}>
        <h3 style={{ marginBottom: 12 }}>Select Date</h3>
        <YearPicker value={detailYear} onChange={(y) => setDetailYear(y)} />
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <button
            onClick={() =>
              setDetailMonth((prev) => (prev > 0 ? prev - 1 : 11))
            }
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              background: "#1f2937",
              border: "none",
              color: "#e5e7eb",
              cursor: "pointer",
            }}
          >
            ◀
          </button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 14 }}>
            {detailYear} - {detailMonth + 1}
          </div>
          <button
            onClick={() =>
              setDetailMonth((prev) => (prev < 11 ? prev + 1 : 0))
            }
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              background: "#1f2937",
              border: "none",
              color: "#e5e7eb",
              cursor: "pointer",
            }}
          >
            ▶
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <MiniCalendar
            year={detailYear}
            month={detailMonth}
            selected={detailSelectedDate}
            onSelect={(d) => {
              setDetailSelectedDate(d);
              setDayPopupOpen(false);
            }}
          />
        </div>
      </Popup>
    </div>
  );
};

export default DashboardPage;