import React, { useEffect, useState } from "react";

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
  const w = width - pad * 2;
  const h = height - pad * 2;
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
          y1={pad + g * h}
          x2={pad + w}
          y2={pad + g * h}
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
            strokeLinecap="round"
          />
        );
      })}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={12}
        fill="#e5e7eb"
      >
        {total}
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
  const [attacksData, setAttacksData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState("Checking...");

  const now = new Date();
  const [insightYear, setInsightYear] = useState(clampYear(now.getFullYear()));
  const [insightMonth, setInsightMonth] = useState(now.getMonth());
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);

  const [detailYear, setDetailYear] = useState(now.getFullYear());
  const [detailMonth, setDetailMonth] = useState(now.getMonth());
  const [detailSelectedDate, setDetailSelectedDate] =
    useState<Date | null>(now);
  const [dayPopupOpen, setDayPopupOpen] = useState(false);

  const API_BASE = process.env.REACT_APP_API_BASE || "";

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const url = `${API_BASE}/session?label=MALICIOUS&page=1&pageSize=500&sort=end_time&order=desc`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        let items: any[] = [];
        if (Array.isArray(json)) items = json;
        else if (Array.isArray(json.data)) items = json.data;
        else if (Array.isArray(json.items)) items = json.items;
        else items = [];

        if (mounted) {
          setAttacksData(items);
          setApiStatus("Connected ✅");
        }
      } catch (err: any) {
        if (mounted) {
          setApiStatus(
            `API 연결 실패 ❌ (${err?.message ?? "Unknown"})`
          );
          setAttacksData([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData();
    return () => {
      mounted = false;
    };
  }, [API_BASE]);

  // daily counts for selected month
  const daysInSelectedMonth = new Date(
    insightYear,
    insightMonth + 1,
    0
  ).getDate();
  const dailyCounts = Array.from({ length: daysInSelectedMonth }, (_, d) =>
    attacksData.filter((atk) => {
      const t = new Date(atk.end_time);
      return (
        t.getFullYear() === insightYear &&
        t.getMonth() === insightMonth &&
        t.getDate() === d + 1
      );
    }).length
  );

  // donut data
  const filteredForInsightMonth = attacksData.filter((atk) => {
    const t = new Date(atk.end_time);
    return (
      t.getFullYear() === insightYear && t.getMonth() === insightMonth
    );
  });
  const typeCounts: Record<string, number> = {};
  filteredForInsightMonth.forEach((atk) => {
    const key = atk.attack_type ?? atk.type ?? atk.label ?? "Unknown";
    typeCounts[key] = (typeCounts[key] || 0) + 1;
  });
  const palette = [
    "#93c5fd",
    "#60a5fa",
    "#3b82f6",
    "#2563eb",
    "#1d4ed8",
    "#7c3aed",
    "#ec4899",
    "#f97316",
    "#f59e0b",
    "#10b981",
  ];
  const donutValues = Object.entries(typeCounts).map(
    ([label, value], i) => ({
      label,
      value,
      color: palette[i % palette.length],
    })
  );

  // details
  const filteredDetails = attacksData.filter((atk) => {
    if (!detailSelectedDate) return false;
    const t = new Date(atk.end_time);
    return (
      t.getFullYear() === detailSelectedDate.getFullYear() &&
      t.getMonth() === detailSelectedDate.getMonth() &&
      t.getDate() === detailSelectedDate.getDate()
    );
  });

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
          <StatBadge
            label="Total Attacks"
            value={String(attacksData.length)}
          />
          <StatBadge
            label="Recent Attack"
            value={
              attacksData.length > 0
                ? new Date(attacksData[0].end_time).toLocaleString()
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
              gridTemplateColumns: "66% 34%",
              gap: 12,
            }}
          >
            <Card style={{ padding: 0, height: 320 }}>
              <LineChart width={760} height={320} data={dailyCounts} />
            </Card>
            <Card
              style={{
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 320,
              }}
            >
              {donutValues.length > 0 ? (
                <div style={{ textAlign: "center" }}>
                  <DonutChart size={260} values={donutValues} />
                  <div
                    style={{
                      marginTop: 8,
                      color: "#9ca3af",
                      fontSize: 13,
                    }}
                  >
                    Types in selected month
                  </div>
                </div>
              ) : (
                <div style={{ color: "#9ca3af" }}>
                  No data for this month
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
            style={{
              maxHeight: 320,
              overflowY: "auto",
              fontSize: 14,
              borderTop: "1px solid #1f2937",
            }}
          >
            {filteredDetails.length > 0 ? (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                }}
              >
                <thead style={{ background: "#111827" }}>
                  <tr>
                    <th style={{ padding: "10px 12px", fontSize: 13 }}>
                      Time
                    </th>
                    <th style={{ padding: "10px 12px", fontSize: 13 }}>
                      Type
                    </th>
                    <th style={{ padding: "10px 12px", fontSize: 13 }}>
                      Source IP
                    </th>
                    <th style={{ padding: "10px 12px", fontSize: 13 }}>
                      Destination IP
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDetails.map((atk, i) => (
                    <tr
                      key={i}
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
                        {new Date(atk.end_time).toLocaleTimeString()}
                      </td>
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
                          {atk.attack_type ?? atk.type ?? "Unknown"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", color: "#f87171" }}>
                        {atk.src_ip}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#34d399" }}>
                        {atk.dst_ip}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 12, color: "#9ca3af" }}>
                No attacks for selected day
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
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
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
