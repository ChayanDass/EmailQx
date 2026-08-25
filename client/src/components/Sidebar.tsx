import React from "react";
import { Clock, Send, Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  scheduledCount: number;
  sentCount: number;
  onOpenCompose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  scheduledCount,
  sentCount,
  onOpenCompose,
}) => {
  const { user } = useAuth();

  const userInitials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "OB";

  return (
    <aside className="app-sidebar">
      {/* Brand Logo */}
      <div className="sidebar-logo">
        <span style={{ color: "#10b981" }}>O</span>NE
      </div>

      {/* User Profile Card */}
      <div className="sidebar-user-card">
        {user?.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div className="avatar-circle">{userInitials}</div>
        )}
        <div className="user-info">
          <span className="user-name">{user?.name || "Oliver Brown"}</span>
          <span className="user-email">{user?.email || "oliver.brown@domain.co"}</span>
        </div>
      </div>

      {/* Compose Button */}
      <button className="btn-compose" onClick={onOpenCompose}>
        <Plus size={15} strokeWidth={2.5} />
        Compose
      </button>

      {/* Navigation */}
      <div className="sidebar-section-title">CORE</div>
      <ul className="sidebar-menu">
        <li
          className={`sidebar-item ${currentTab === "SCHEDULED" ? "active" : ""}`}
          onClick={() => onTabChange("SCHEDULED")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Clock size={15} strokeWidth={2} />
            Scheduled
          </div>
          <span className="sidebar-item-badge">{scheduledCount}</span>
        </li>
        <li
          className={`sidebar-item ${currentTab === "SENT" ? "active" : ""}`}
          onClick={() => onTabChange("SENT")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Send size={14} strokeWidth={2} />
            Sent
          </div>
          <span className="sidebar-item-badge">{sentCount}</span>
        </li>
      </ul>
    </aside>
  );
};
