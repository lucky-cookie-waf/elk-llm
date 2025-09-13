import React, { useState } from "react";

/* 카드 컴포넌트 */
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

/* 뱃지 */
const StatBadge: React.FC<{
  label: string;
  value: string;
  sub?: React.ReactNode;
  rightIcon?: React.ReactNode;
}> = ({ label, value, sub, rightIcon }) => (
  <Card
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}
  >
    <div>
      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 0.2 }}>
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>{sub}</div>
      )}
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

/* 선 그래프 */
const LineChart: React.FC<{ width: number; height: number; data: number[] }> = ({
  width,
  height,
  data,
}) => {
  const max = Math.max(...data) || 1;
  const min = 0;
  const pad = 24;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const stepX = w / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + h - ((v - min) / (max - min)) * h;
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
    </svg>
  );
};

/* 도넛 그래프 */
const DonutChart: React.FC<{
  size: number;
  thickness?: number;
  values: { label: string; value: number; color: string }[];
}> = ({ size, thickness = 34, values }) => {
  const total = values.reduce((a, b) => a + b.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const cx = size / 2,
    cy = size / 2;
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
        y={cy + 6}
        textAnchor="middle"
        fontSize={22}
        fill="#e5e7eb"
        fontWeight={800}
      >
        Attacks
      </text>
    </svg>
  );
};

/* 간단 달력 팝업 */
const CalendarPopup: React.FC<{
  selectedDate: Date;
  onSelect: (date: Date) => void;
}> = ({ selectedDate, onSelect }) => {
  const [currentMonth, setCurrentMonth] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();

  const days: (number | null)[] = Array(startDay)
    .fill(null)
    .concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        marginTop: 8,
        background: "#111827",
        padding: 12,
        borderRadius: 8,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}>{"<"}</button>
        <div>
          {currentMonth.toLocaleString("default", { month: "long" })} {year}
        </div>
        <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}>{">"}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 12, opacity: 0.7 }}>
            {d}
          </div>
        ))}
        {days.map((day, idx) => (
          <div
            key={idx}
            style={{
              textAlign: "center",
              padding: 6,
              cursor: day ? "pointer" : "default",
              background:
                day === selectedDate.getDate() &&
                month === selectedDate.getMonth() &&
                year === selectedDate.getFullYear()
                  ? "#2563eb"
                  : "transparent",
              borderRadius: 6,
            }}
            onClick={() => day && onSelect(new Date(year, month, day))}
          >
            {day}
          </div>
        ))}
      </div>
    </div>
  );
};

/* 페이지 */
const DashboardPage: React.FC = () => {
 console.log("✅ 최신 DashboardPage 코드가 로드됨 at", new Date().toLocaleString());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showPickerGraph, setShowPickerGraph] = useState(false);
  const [showPickerTable, setShowPickerTable] = useState(false);

  const line = [10, 40, 120, 260, 210, 320, 752, 340, 410, 280, 260, 40];
  const donutVals = [
    { label: "SQL injection", value: 34249, color: "#93c5fd" },
    { label: "XSS Attack", value: 1420, color: "#60a5fa" },
  ];

  const attacks = [
    {
      type: "SQL Injection",
      ip: "72.14.201.174",
      timestamp: "2025-09-05T12:53:00",
      status: 404,
    },
    {
      type: "XSS Attack",
      ip: "192.168.0.10",
      timestamp: "2025-09-05T14:30:00",
      status: 200,
    },
    {
      type: "SQL Injection",
      ip: "10.0.0.5",
      timestamp: "2025-09-04T10:10:00",
      status: 403,
    },
  ];

  const filteredAttacks = attacks.filter((attack) => {
    const d = new Date(attack.timestamp);
    return (
      d.getDate() === selectedDate.getDate() &&
      d.getMonth() === selectedDate.getMonth() &&
      d.getFullYear() === selectedDate.getFullYear()
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
        {/* 상단 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h1 style={{ fontSize: 32, fontWeight: 800 }}>Dashboard</h1>
          <div style={{ opacity: 0.8, fontSize: 12 }}>Admin • English 🇬🇧</div>
        </div>

        {/* 카드 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginTop: 16,
          }}
        >
          <StatBadge
            label="Total Attack"
            value="10293"
            sub={<span style={{ color: "#22c55e" }}>▲ 1.3% Up from past week</span>}
          />
          <StatBadge
            label="Recent Attacks"
            value={new Date().toLocaleString()}
            rightIcon={<span>⏱️</span>}
          />
        </div>

        {/* 그래프 */}
        <Card style={{ marginTop: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18 }}>Attack Insights</div>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowPickerGraph(!showPickerGraph)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #1f2937",
                  background: "#0b1220",
                  color: "#e5e7eb",
                }}
              >
                {selectedDate.toLocaleDateString("en-GB")} ▾
              </button>
              {showPickerGraph && (
                <CalendarPopup
                  selectedDate={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setShowPickerGraph(false);
                  }}
                />
              )}
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
              <LineChart width={760} height={320} data={line} />
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
              <DonutChart size={300} values={donutVals} />
            </Card>
          </div>
        </Card>

        {/* Attack Details */}
        <Card style={{ marginTop: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18 }}>Attack Details</div>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowPickerTable(!showPickerTable)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #1f2937",
                  background: "#0b1220",
                  color: "#e5e7eb",
                }}
              >
                {selectedDate.toLocaleDateString("en-GB")} ▾
              </button>
              {showPickerTable && (
                <CalendarPopup
                  selectedDate={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setShowPickerTable(false);
                  }}
                />
              )}
            </div>
          </div>

          {/* 테이블 */}
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 120px",
                padding: "12px 16px",
                borderBottom: "1px solid #1f2937",
                color: "#9ca3af",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              <div>Attack type</div>
              <div>IP</div>
              <div>Date - Time</div>
              <div style={{ textAlign: "right" }}>Status code</div>
            </div>

            {filteredAttacks.length > 0 ? (
              filteredAttacks.map((atk, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 120px",
                    padding: "16px",
                    borderBottom: "1px solid #111827",
                    alignItems: "center",
                  }}
                >
                  <div>{atk.type}</div>
                  <div>{atk.ip}</div>
                  <div>{new Date(atk.timestamp).toLocaleString()}</div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        background: atk.status === 404 ? "#ef4444" : "#22c55e",
                        color: "#0f172a",
                        padding: "6px 14px",
                        borderRadius: 999,
                        fontWeight: 800,
                      }}
                    >
                      {atk.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div
                style={{
                  padding: 20,
                  textAlign: "center",
                  color: "#9ca3af",
                }}
              >
                No attacks found for selected date.
              </div>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
};

export default DashboardPage;
