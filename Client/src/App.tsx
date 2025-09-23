import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  useLocation,
} from "react-router-dom";

import DashboardPage from "./pages/DashboardPage";
import RulePage from "./pages/RulePage";
import LogListPage from "./pages/LogListPage";
import SettingsPage from "./pages/SettingPage";
import LogoutPage from "./pages/LogoutPage";
import RawLogPage from "./pages/RawLogPage";

/* 공통 스타일 */
const linkStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  color: "#e5e7eb",
};
const activeStyle: React.CSSProperties = { background: "#111827" };

/* 사이드바 */
const Sidebar: React.FC = () => {
  const { pathname } = useLocation();
  const isOnLogLists =
    pathname.startsWith("/loglists") ||
    pathname.startsWith("/loglist") ||
    pathname.startsWith("/rawlog");

  return (
    <aside
      style={{
        width: 220,
        background: "#0b1220",
        borderRight: "1px solid #111827",
        padding: 18,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: 0.2 }}>
        Dash<strong>Stack</strong>
      </div>
      <nav style={{ marginTop: 24, display: "grid", gap: 8 }}>
        <NavLink
          to="/"
          end
          style={({ isActive }) => ({
            ...linkStyle,
            ...(isActive ? activeStyle : {}),
          })}
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/rule"
          style={({ isActive }) => ({
            ...linkStyle,
            ...(isActive ? activeStyle : {}),
          })}
        >
          Rule
        </NavLink>

        {/* Log Lists: /rawlog 에 있을 때도 활성화 */}
        <NavLink
          to="/loglists"
          style={({ isActive }) => ({
            ...linkStyle,
            ...((isActive || isOnLogLists) ? activeStyle : {}),
          })}
        >
          Log Lists
        </NavLink>

        <NavLink
          to="/settings"
          style={({ isActive }) => ({
            ...linkStyle,
            ...(isActive ? activeStyle : {}),
          })}
        >
          Settings
        </NavLink>

        <NavLink
          to="/logout"
          style={({ isActive }) => ({
            ...linkStyle,
            ...(isActive ? activeStyle : {}),
          })}
        >
          Logout
        </NavLink>
      </nav>
    </aside>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          background: "#0a0f1a",
          color: "#e5e7eb",
        }}
      >
        <Sidebar />

        {/* Main */}
        <main style={{ flex: 1, padding: 24 }}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/rule" element={<RulePage />} />

            {/* Log Lists */}
            <Route path="/loglists" element={<LogListPage />} />
            <Route path="/loglist" element={<LogListPage />} />

            {/* RawLog */}
            <Route path="/rawlog/:sessionId" element={<RawLogPage />} />

            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/logout" element={<LogoutPage />} />

            {/* 기타 경로는 Log Lists로 */}
            <Route path="*" element={<LogListPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
