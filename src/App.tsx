import React from "react";
import { BrowserRouter as Router, Routes, Route, NavLink } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import RulePage from "./pages/RulePage";
import LogListPage from "./pages/LogListPage";
import SettingsPage from "./pages/SettingPage";
import LogoutPage from "./pages/LogoutPage";

const App: React.FC = () => {
  const linkStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    textDecoration: "none",
    color: "#e5e7eb",
  };

  const activeStyle: React.CSSProperties = {
    background: "#111827",
  };

  return (
    <Router>
      <div style={{ display: "flex", minHeight: "100vh", background: "#0a0f1a", color: "#e5e7eb" }}>
        {/* Sidebar */}
        <aside style={{ width: 220, background: "#0b1220", borderRight: "1px solid #111827", padding: 18 }}>
          <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: 0.2 }}>
            Dash<strong>Stack</strong>
          </div>
          <nav style={{ marginTop: 24, display: "grid", gap: 8 }}>
            <NavLink
              to="/"
              style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeStyle : {}) })}
              end
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/rule"
              style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeStyle : {}) })}
            >
              Rule
            </NavLink>
            <NavLink
              to="/loglists"
              style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeStyle : {}) })}
            >
              Log Lists
            </NavLink>
            <NavLink
              to="/settings"
              style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeStyle : {}) })}
            >
              Settings
            </NavLink>
            <NavLink
              to="/logout"
              style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeStyle : {}) })}
            >
              Logout
            </NavLink>
          </nav>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: 24 }}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/rule" element={<RulePage />} />
            <Route path="/loglists" element={<LogListPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/logout" element={<LogoutPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
