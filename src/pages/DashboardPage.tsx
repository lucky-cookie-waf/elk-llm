import React from "react";
import { NavLink } from "react-router-dom";

/* ---------- UI helpers ---------- */
const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 16, padding: 16, color: "#e5e7eb", ...style }}>
    {children}
  </div>
);

const StatBadge: React.FC<{ label: string; value: string; sub?: React.ReactNode; rightIcon?: React.ReactNode }> = ({
  label,
  value,
  sub,
  rightIcon,
}) => (
  <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <div>
      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 0.2 }}>{value}</div>
      {sub && <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>{sub}</div>}
    </div>
    <div style={{ width: 56, height: 56, borderRadius: 14, background: "#111827", display: "grid", placeItems: "center" }}>
      {rightIcon ?? <span>🟡</span>}
    </div>
  </Card>
);

/* ---------- Charts ---------- */
const LineChart: React.FC<{ width: number; height: number; data: number[] }> = ({ width, height, data }) => {
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
        <line key={idx} x1={pad} y1={pad + g * h} x2={pad + w} y2={pad + g * h} stroke="#1f2937" />
      ))}
      <rect x={pad} y={pad} width={w} height={h} fill="none" stroke="#1f2937" />
      <polyline fill="none" stroke="#60a5fa" strokeWidth={2.5} points={points} />
      {data.map((v, i) => {
        const x = pad + i * stepX;
        const y = pad + h - (v / max) * h;
        return <circle key={i} cx={x} cy={y} r={3.5} fill="#60a5fa" />;
      })}
      {(() => {
        const i = data.indexOf(max);
        const x = pad + i * stepX;
        const y = pad + h - (max / max) * h;
        return (
          <g>
            <rect x={x - 16} y={y - 28} width={32} height={18} rx={6} fill="#1d4ed8" />
            <text x={x} y={y - 15} textAnchor="middle" fontSize={10} fill="#fff" fontWeight={700}>
              {max}
            </text>
          </g>
        );
      })()}
    </svg>
  );
};

const DonutChart: React.FC<{ size: number; thickness?: number; values: { label: string; value: number; color: string }[] }> = ({
  size,
  thickness = 34,
  values,
}) => {
  const total = values.reduce((a, b) => a + b.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const cx = size / 2,
    cy = size / 2;
  let acc = 0;
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#334155" strokeWidth={thickness} />
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
      {[0, 90, 180, 270].map((deg, i) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        const x = cx + radius * Math.cos(rad);
        const y = cy + radius * Math.sin(rad);
        return <circle key={i} cx={x} cy={y} r={12} fill="#60a5fa" opacity={0.65} />;
      })}
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={28} fill="#e5e7eb" fontWeight={800}>
        Attacks
      </text>
    </svg>
  );
};

/* ---------- Page ---------- */
export default function Dashboard() {
  const line = [10, 40, 120, 260, 210, 320, 752, 340, 410, 280, 260, 40, 20, 200, 360, 520, 470, 430, 410, 390, 420, 480];
  const donutVals = [
    { label: "SQL injection", value: 34249, color: "#93c5fd" },
    { label: "Xss Attack", value: 1420, color: "#60a5fa" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0f1a", color: "#e5e7eb" }}>
      <main style={{ flex: 1, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 32, fontWeight: 800 }}>Dashboard</h1>
          <div style={{ opacity: 0.8, fontSize: 12 }}>Admin • English 🇬🇧</div>
        </div>

        {/* top stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <StatBadge label="Total Attack" value="10293" sub={<span style={{ color: "#22c55e" }}>▲ 1.3% Up from past week</span>} />
          <StatBadge label="Recent Attacks" value="12.09.2019-12.53PM" rightIcon={<span>⏱️</span>} />
        </div>

        {/* insights: line(66%) + donut(34%) */}
        <Card style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Attack insights</div>
            <div style={{ display: "flex", gap: 8, opacity: 0.8 }}>
              <button style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #1f2937", background: "#0b1220", color: "#e5e7eb" }}>12 ▾</button>
              <button style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #1f2937", background: "#0b1220", color: "#e5e7eb" }}>
                October ▾
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "66% 34%", gap: 12 }}>
            <Card style={{ padding: 0, height: 320 }}>
              <LineChart width={760} height={320} data={line} />
            </Card>
            <Card style={{ padding: 0, display: "flex", alignItems: "center", justifyContent: "center", height: 320 }}>
              <DonutChart size={300} values={donutVals} />
            </Card>
          </div>
        </Card>

        {/* details table */}
        <Card style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Attack Details</div>
            <div style={{ display: "flex", gap: 8, opacity: 0.8 }}>
              <button style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #1f2937", background: "#0b1220", color: "#e5e7eb" }}>12 ▾</button>
              <button style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #1f2937", background: "#0b1220", color: "#e5e7eb" }}>
                October ▾
              </button>
            </div>
          </div>

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

            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 120px", padding: "16px", borderBottom: "1px solid #111827", alignItems: "center" }}
              >
                <div>SQL Injection</div>
                <div>72.14.201.174</div>
                <div>12.09.2019 - 12:53 PM</div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ background: "#ef4444", color: "#0f172a", padding: "6px 14px", borderRadius: 999, fontWeight: 800 }}>404</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ height: 40 }} />
      </main>
    </div>
  );
}
