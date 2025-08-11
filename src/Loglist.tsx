import React, { useEffect, useMemo, useState } from "react";

/**
 * Lucky Cookie – Log Lists (single page)
 * - Pixel-ish layout to mirror Figma
 * - React + Tailwind only (no UI libs)
 * - Includes: Sidebar, TopBar(with search + bell + locale + avatar),
 *   FilterBar (Filter By / Date / Order Type / Order Status / Reset),
 *   DatePicker overlay (Year/Month/Date/Hour/Minute),
 *   Logs table, Bottom status (Showing 1-09 of 78) + Next Date pill.
 * - URL ?state=1..7 can be used to quickly preview different states (dev aid).
 */

// ------------ Icons ---------------------------------------------------------
function Icon({ name, className = "" }: { name: string; className?: string }) {
  const cls = `w-5 h-5 ${className}`;
  switch (name) {
    case "list":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <path strokeWidth="2" strokeLinecap="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case "home":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-8 9 8M5 10v10h14V10" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 4v5c0 5-3.5 9-7 9s-7-4-7-9V7l7-4z" />
        </svg>
      );
    case "cog":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M10.3 4.3l.7-1.8h2l.7 1.8a7.9 7.9 0 012.1.9l1.7-1 1.4 1.4-1 1.7c.4.7.6 1.4.9 2.1l1.8.7v2l-1.8.7c-.2.7-.5 1.5-.9 2.1l1 1.7-1.4 1.4-1.7-1a7.9 7.9 0 01-2.1.9l-.7 1.8h-2l-.7-1.8a7.9 7.9 0 01-2.1-.9l-1.7 1-1.4-1.4 1-1.7a7.9 7.9 0 01-.9-2.1L2 13v-2l1.8-.7c.2-.7.5-1.5.9-2.1l-1-1.7L5 5.1l1.7 1a7.9 7.9 0 012.1-.9z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "logout":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M10 17l5-5-5-5M15 12H3" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <circle cx="11" cy="11" r="7" strokeWidth="2" />
          <path d="M21 21l-3.8-3.8" strokeWidth="2" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
        </svg>
      );
    case "chev-down":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      );
    case "funnel":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 4h18L14 12v6l-4 2v-8L3 4z" />
        </svg>
      );
    case "reset":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 109-9v3M3 3v6h6" />
        </svg>
      );
    case "arrow-left":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
      );
    case "bell":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls}>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 17H9a4 4 0 01-4-4V9a7 7 0 1114 0v4a4 4 0 01-4 4z" />
          <path strokeWidth="2" strokeLinecap="round" d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
      );
    default:
      return null;
  }
}

// ------------ Small primitives --------------------------------------------
function Dropdown({ label, options, value, onChange }: { label: React.ReactNode; options: string[]; value?: string; onChange?: (v: string) => void; }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onBlur={() => setOpen(false)} tabIndex={0}>
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700/60">
        {label}
        <Icon name="chev-down" className="opacity-70" />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-44 overflow-hidden rounded-lg border border-slate-700/60 bg-slate-800 shadow-lg">
          {options.map((opt) => (
            <button key={opt} className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-700 ${value === opt ? "text-white" : "text-slate-300"}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange?.(opt); setOpen(false); }}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ v }: { v: "safe" | "danger" | "detecting" }) {
  const map = {
    safe: { text: "Safe", cls: "bg-emerald-500 text-white" },
    danger: { text: "Danger", cls: "bg-red-600 text-white" },
    detecting: { text: "bg-slate-500 text-white", cls: "bg-slate-500 text-white" },
  } as const;
  const text = v === "safe" ? "Safe" : v === "danger" ? "Danger" : "Detecting";
  return <span className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-medium ${map[v].cls}`}>{text}</span>;
}

// ------------ Types & mock --------------------------------------------------
export type LogItem = {
  id: string;
  detection: "safe" | "danger" | "detecting";
  timestamp: string;
  ip: string;
  method: string;
  uri: string;
  agent: string;
  referer: string;
  body: string;
  status: number;
};

const MOCK: LogItem[] = [
  { id: "1", detection: "safe", timestamp: "17/Jul/2020:12:23:34 +0100", ip: "172.26.0.1", method: "GET", uri: "/blog/index.php/2020/04/04/voluptatum-reprehenderit-maiores-ab-sequi-quaerat/", agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.130 Safari/537.36", referer: "내용 없음", body: "", status: 200 },
  { id: "2", detection: "danger", timestamp: "17/Jul/2020:12:23:34 +0100", ip: "172.26.0.1", method: "GET", uri: "/blog/index.php/2020/04/04/voluptatum-reprehenderit-maiores-ab-sequi-quaerat/", agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.130 Safari/537.36", referer: "내용 없음", body: "", status: 200 },
  { id: "3", detection: "detecting", timestamp: "17/Jul/2020:12:23:34 +0100", ip: "172.26.0.1", method: "GET", uri: "/blog/index.php/2020/04/04/voluptatum-reprehenderit-maiores-ab-sequi-quaerat/", agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.130 Safari/537.36", referer: "내용 없음", body: "", status: 200 },
];

// ------------ Layout blocks -------------------------------------------------
function Sidebar({ current = "logs" }: { current?: "dashboard" | "rule" | "logs" | "settings" }) {
  const Item = ({ to, icon, label }: { to: string; icon: string; label: string }) => (
    <a href={to} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-700/50 ${ (label === "Log Lists" && current === "logs") || (label === "Dashboard" && current === "dashboard") || (label === "Rule" && current === "rule") || (label === "Settings" && current === "settings") ? "bg-blue-600 text-white" : "text-slate-300" }`}>
      <Icon name={icon} />
      <span>{label}</span>
    </a>
  );

  return (
    <aside className="flex w-64 flex-col gap-2 border-r border-slate-800 bg-slate-900/80 p-4">
      <div className="mb-2 flex items-center gap-2 px-2 text-xl font-semibold text-white">
        <span className="text-blue-400">Dash</span>
        <span>Stack</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        <Item to="#" icon="home" label="Dashboard" />
        <Item to="#" icon="shield" label="Rule" />
        <Item to="#" icon="list" label="Log Lists" />
        <div className="my-2 h-px bg-slate-800" />
        <Item to="#" icon="cog" label="Settings" />
      </nav>
      <a href="#" className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50">
        <Icon name="logout" /> Logout
      </a>
    </aside>
  );
}

function TopBar({ onSearch, state }: { onSearch: (q: string) => void; state: number }) {
  const [q, setQ] = useState("");
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-900/70 p-4 backdrop-blur">
      <div className="relative w-[520px]">
        <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSearch(q)} placeholder="Search" className="w-full rounded-lg border border-slate-700/60 bg-slate-800 pl-10 pr-10 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-600" />
        {/* X button centered over search like the screenshot */}
        <button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-700/50" aria-label="clear" onClick={() => setQ("")}> <Icon name="x" /> </button>
      </div>
      <div className="flex items-center gap-5 pr-2 text-sm">
        {/* bell with badge */}
        <div className="relative">
          <Icon name="bell" className="text-slate-300" />
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">6</span>
        </div>
        <span className="rounded-md bg-slate-800 px-2 py-1">🇬🇧 English</span>
        <div className="flex items-center gap-2">
          <img alt="avatar" src={`data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><circle cx='16' cy='16' r='16' fill='#475569'/><text x='50%' y='55%' font-family='Arial' font-size='14' fill='white' text-anchor='middle'>MR</text></svg>`)} `} className="h-8 w-8 rounded-full" />
          <div className="leading-tight">
            <div className="font-medium text-slate-100">Moni Roy</div>
            <div className="text-xs text-slate-400">Admin</div>
          </div>
        </div>
      </div>
    </header>
  );
}

function FilterBar({ onOpenDate }: { onOpenDate: () => void }) {
  const [filterBy, setFilterBy] = useState("All");
  const [time, setTime] = useState("Date");
  const [orderType, setOrderType] = useState("Order Type");
  const [orderStatus, setOrderStatus] = useState("Order Status");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-800 px-3 py-2 text-slate-200"><Icon name="funnel" /></div>
      <Dropdown label={<span>Filter By</span>} options={["All", "Attack", "Normal"]} value={filterBy} onChange={setFilterBy} />
      {/* Date button opens overlay */}
      <button onClick={onOpenDate} className="inline-flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700/60">Date</button>
      <Dropdown label={<span>Order Type</span>} options={["Newest", "Oldest"]} value={orderType} onChange={setOrderType} />
      <Dropdown label={<span>Order Status</span>} options={["All statuses", "Safe", "Danger", "Detecting"]} value={orderStatus} onChange={setOrderStatus} />
      <button className="inline-flex items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-sm text-amber-300 hover:text-amber-200"><Icon name="reset" /> Reset Filter</button>
    </div>
  );
}

function DateOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const Cell = ({ label, value }: { label: string; value: string }) => (
    <div className="flex w-28 flex-col items-center gap-1">
      <div className="text-slate-300">{label}</div>
      <button className="rounded-md border border-slate-700/60 p-1 text-slate-300 hover:bg-slate-700/60">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" d="M6 15l6-6 6 6"/></svg>
      </button>
      <div className="h-9 w-full rounded-md border border-slate-700/60 bg-slate-800 text-center leading-9">{value}</div>
      <button className="rounded-md border border-slate-700/60 p-1 text-slate-300 hover:bg-slate-700/60">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" d="M18 9l-6 6-6-6"/></svg>
      </button>
    </div>
  );
  if (!open) return null;
  return (
    <div className="absolute left-40 top-40 z-30 w-[540px] rounded-2xl border border-slate-700/60 bg-slate-900/95 p-6 shadow-2xl">
      <div className="mb-3 text-sm text-slate-300">Timestamp</div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Cell label="Year" value="2025" />
        <Cell label="Month" value="07" />
        <Cell label="Date" value="31" />
        <Cell label="Hour" value="17" />
        <Cell label="Minute" value="32" />
      </div>
      <div className="mt-6 flex justify-center">
        <button onClick={onClose} className="rounded-md bg-indigo-500 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-400">Apply Now</button>
      </div>
    </div>
  );
}

function LogsTable({ items }: { items: LogItem[] }) {
  const cols = "160px 200px 130px 90px 1fr 1fr 120px 80px"; // adjusted from screenshot
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
      <div className={`grid grid-cols-[${cols}] border-b border-slate-800 bg-slate-800/60 px-5 py-3 text-xs font-medium text-slate-300`}>
        <div>Detection Result</div>
        <div>Timestamp</div>
        <div>IP</div>
        <div>Method</div>
        <div>URI</div>
        <div>Agent</div>
        <div>Referer</div>
        <div>Body</div>
      </div>
      {items.map((row) => (
        <div key={row.id} className={`grid grid-cols-[${cols}] items-start gap-3 border-b border-slate-800 px-5 py-6 text-sm text-slate-200`}>
          <div className="pt-1"><Badge v={row.detection} /></div>
          <div className="text-slate-300">{row.timestamp}</div>
          <div className="text-slate-300">{row.ip}</div>
          <div className="text-slate-300">{row.method}</div>
          <div className="truncate text-slate-200/90" title={row.uri}>{row.uri}</div>
          <div className="truncate text-slate-300" title={row.agent}>{row.agent}</div>
          <div className="text-slate-300">{row.referer}</div>
          <div className="text-slate-300">{row.status}</div>
        </div>
      ))}
      <div className="flex items-center justify-end gap-2 px-5 py-3">
        <button className="rounded-md border border-slate-700/60 p-2 text-slate-300 hover:bg-slate-700/60"><Icon name="arrow-left" /></button>
        <button className="rounded-md border border-slate-700/60 p-2 text-slate-300 hover:bg-slate-700/60"><Icon name="arrow-right" /></button>
      </div>
    </div>
  );
}

// ------------ Page ----------------------------------------------------------
export default function LogsDashboard() {
  const [query, setQuery] = useState("");
  const [openDate, setOpenDate] = useState(false);

  // dev: allow ?state=1..7 to simulate various open panels
  useEffect(() => {
    const url = new URL(window.location.href);
    const s = Number(url.searchParams.get("state") || 1);
    if (s === 2) setOpenDate(true); // e.g., log2 shows the date overlay open
  }, []);

  const filtered = useMemo(() => {
    if (!query) return MOCK;
    const q = query.toLowerCase();
    return MOCK.filter((r) => [r.ip, r.method, r.uri, r.agent, r.referer].some((f) => f.toLowerCase().includes(q)) );
  }, [query]);

  return (
    <div className="min-h-screen bg-[#0f1724] text-slate-100">
      <div className="mx-auto flex max-w-[1400px]">
        <Sidebar current="logs" />
        <div className="relative flex min-h-screen flex-1 flex-col">
          {/* Top Bar - darker navy with subtle blue border */}
          <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#2b3b52] bg-[#1f2a37] px-6 py-4">
            <div className="relative w-[560px]">
              <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="w-full rounded-[10px] border border-[#334461] bg-[#263245] pl-10 pr-10 py-2.5 text-sm text-slate-200 placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#3b68f5]"
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-[#334461]/40"
                aria-label="clear"
                onClick={() => setQuery("")}
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="flex items-center gap-5 pr-2 text-sm">
              <div className="relative">
                <Icon name="bell" className="text-slate-300" />
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f43f5e] px-1 text-[10px] font-bold text-white">6</span>
              </div>
              <span className="rounded-md bg-[#263245] px-2 py-1 text-slate-200">🇬🇧 English</span>
              <div className="flex items-center gap-2">
                <img
                  alt="avatar"
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><circle cx='16' cy='16' r='16' fill='#475569'/><text x='50%' y='55%' font-family='Arial' font-size='14' fill='white' text-anchor='middle'>MR</text></svg>`)} `}
                  className="h-8 w-8 rounded-full"
                />
                <div className="leading-tight">
                  <div className="font-medium text-slate-100">Moni Roy</div>
                  <div className="text-xs text-slate-400">Admin</div>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 space-y-6 p-6">
            <section className="space-y-4">
              <div className="text-2xl font-semibold">Log Lists</div>
              {/* Filter bar segmented style */}
              <div className="flex items-stretch gap-px overflow-hidden rounded-xl border border-[#2b3b52] bg-[#1f2634]">
                <div className="flex items-center gap-2 px-4 py-2 text-slate-200"><Icon name="funnel" /></div>
                <div className="flex items-center gap-3 border-l border-[#2b3b52] px-4 py-2">
                  <Dropdown label={<span className="text-slate-200">Filter By</span>} options={["All","Attack","Normal"]} />
                </div>
                <button onClick={() => setOpenDate(true)} className="border-l border-[#2b3b52] px-4 py-2 text-sm text-slate-200 hover:bg-[#263245]">Date</button>
                <div className="border-l border-[#2b3b52] px-4 py-2"><Dropdown label={<span className="text-slate-200">Order Type</span>} options={["Newest","Oldest"]} /></div>
                <div className="border-l border-[#2b3b52] px-4 py-2"><Dropdown label={<span className="text-slate-200">Order Status</span>} options={["All statuses","Safe","Danger","Detecting"]} /></div>
                <button className="ml-auto flex items-center gap-2 border-l border-[#2b3b52] px-4 py-2 text-sm text-[#f59e0b] hover:bg-[#263245]">
                  <Icon name="reset" /> Reset Filter
                </button>
              </div>
            </section>

            <section>
              <div className="overflow-hidden rounded-2xl border border-[#2b3b52] bg-[#1a2331]">
                <div className="grid grid-cols-[160px_200px_130px_90px_1fr_1fr_120px_80px] border-b border-[#2b3b52] bg-[#1d2736] px-6 py-3 text-xs font-medium text-[#c7d2e0]">
                  <div>Detection Result</div>
                  <div>Timestamp</div>
                  <div>IP</div>
                  <div>Method</div>
                  <div>URI</div>
                  <div>Agent</div>
                  <div>Referer</div>
                  <div>Body</div>
                </div>

                {filtered.map((row) => (
                  <div key={row.id} className="grid grid-cols-[160px_200px_130px_90px_1fr_1fr_120px_80px] items-start gap-3 border-b border-[#2b3b52] px-6 py-8 text-sm text-slate-200">
                    <div className="pt-1">
                      <span className={`${row.detection === 'safe' ? 'bg-[#22c55e]' : row.detection === 'danger' ? 'bg-[#dc2626]' : 'bg-[#6b7280]'} inline-flex items-center rounded-md px-3 py-1 text-xs font-medium text-white`}>
                        {row.detection === 'safe' ? 'Safe' : row.detection === 'danger' ? 'Danger' : 'Detecting'}
                      </span>
                    </div>
                    <div className="text-slate-300">{row.timestamp}</div>
                    <div className="text-slate-300">{row.ip}</div>
                    <div className="text-slate-300">{row.method}</div>
                    <div className="truncate text-slate-200/90" title={row.uri}>{row.uri}</div>
                    <div className="truncate text-slate-300" title={row.agent}>{row.agent}</div>
                    <div className="text-slate-300">{row.referer}</div>
                    <div className="text-slate-300">{row.status}</div>
                  </div>
                ))}

                <div className="flex items-center justify-between px-6 py-3 text-xs text-slate-400">
                  <div>Showing 1-09 of 78</div>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-[#2b3b52] bg-[#1f2634] px-3 py-2 text-slate-200">Next Date &gt;</button>
                </div>
              </div>
            </section>
          </main>

          {/* Backdrop + Date overlay centered */}
          {openDate && (
            <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/50 pt-28">
              <div className="w-[600px] rounded-2xl border border-[#2b3b52] bg-[#202a3a] p-6 shadow-2xl">
                <div className="mb-3 text-sm text-slate-300">Timestamp</div>
                <div className="mx-auto grid grid-cols-5 gap-8">
                  {[
                    { label: 'Year', value: '2025' },
                    { label: 'Month', value: '07' },
                    { label: 'Date', value: '31' },
                    { label: 'Hour', value: '17' },
                    { label: 'Minute', value: '32' },
                  ].map((c) => (
                    <div key={c.label} className="flex w-28 flex-col items-center gap-2">
                      <div className="text-slate-300">{c.label}</div>
                      <button className="rounded-md border border-[#334461] p-1 text-slate-300 hover:bg-[#334461]/40">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" d="M6 15l6-6 6 6"/></svg>
                      </button>
                      <div className="h-9 w-full rounded-md border border-[#334461] bg-[#263245] text-center leading-9 text-slate-200">{c.value}</div>
                      <button className="rounded-md border border-[#334461] p-1 text-slate-300 hover:bg-[#334461]/40">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" d="M18 9l-6 6-6-6"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex justify-center">
                  <button onClick={() => setOpenDate(false)} className="rounded-md bg-[#3b68f5] px-6 py-2 text-sm font-medium text-white hover:bg-[#5d83ff]">Apply Now</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
