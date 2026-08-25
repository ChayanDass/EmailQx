import React, { useState } from "react";
import { Search, Filter, RefreshCw, Server, Database, LogOut } from "lucide-react";
import { HealthStatus } from "../types";
import { useAuth } from "../context/AuthContext";

interface HeaderProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  health: HealthStatus | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  searchTerm,
  onSearchChange,
  health,
  onRefresh,
  isRefreshing,
}) => {
  const { user, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const isHealthy = health?.status === "ok";

  return (
    <header className="main-header">
      {/* Top Search Bar */}
      <div className="header-search">
        <Search className="header-search-icon" size={16} />
        <input
          type="text"
          placeholder="Search emails by subject or recipient..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Header Actions & User Profile */}
      <div className="header-actions">
        {/* Health Pills */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "6px 12px",
            borderRadius: "9999px",
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            fontSize: "0.78rem",
            fontWeight: 600,
            color: "#64748b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Server size={13} color={health?.services.redis === "connected" ? "#10b981" : "#ef4444"} />
            <span>Redis</span>
          </div>
          <span style={{ color: "#cbd5e1" }}>|</span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Database size={13} color={health?.services.database === "connected" ? "#10b981" : "#ef4444"} />
            <span>PostgreSQL</span>
          </div>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: isHealthy ? "#10b981" : "#ef4444",
            }}
          />
        </div>

        {/* Filter Action */}
        <button className="icon-btn" title="Filter emails">
          <Filter size={16} />
        </button>

        {/* Refresh Action */}
        <button
          className="icon-btn"
          onClick={onRefresh}
          title="Refresh Data"
          disabled={isRefreshing}
        >
          <RefreshCw
            size={16}
            style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }}
          />
        </button>

        {/* User Profile Avatar & Logout Popover */}
        <div style={{ position: "relative" }}>
          <div
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "9999px",
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              transition: "all 0.15s ease",
            }}
          >
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                style={{ width: "28px", height: "28px", borderRadius: "50%" }}
              />
            ) : (
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: "#10b981",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {user?.name ? user.name[0].toUpperCase() : "U"}
              </div>
            )}
            <span
              style={{
                fontSize: "0.82rem",
                fontWeight: 700,
                color: "#0f172a",
                maxWidth: "120px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {user?.name || "User"}
            </span>
          </div>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div
              style={{
                position: "absolute",
                top: "44px",
                right: 0,
                width: "220px",
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
                border: "1px solid #e2e8f0",
                padding: "16px",
                zIndex: 100,
              }}
            >
              <div style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>{user?.name}</div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", wordBreak: "break-all" }}>
                  {user?.email}
                </div>
              </div>

              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  logout();
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#fef2f2",
                  color: "#ef4444",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                <LogOut size={16} />
                <span>Sign Out / Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
