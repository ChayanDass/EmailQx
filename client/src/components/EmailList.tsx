import React, { useState, memo, useCallback } from "react";
import { Star, Calendar, Ban, ArrowUpRight, Mail } from "lucide-react";
import { EmailItem } from "../types";
import { UserProfile } from "../context/AuthContext";

interface EmailListProps {
  emails: EmailItem[];
  currentTab: string;
  user?: UserProfile | null;
  onCancelEmail: (id: string) => void;
  onOpenReschedule: (email: EmailItem) => void;
  onViewDetails: (email: EmailItem) => void;
  loading: boolean;
}

// ── Pure helpers (defined outside to avoid re-creation on every render) ────────

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday
    ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  SENT:      { bg: "#ecfdf5", border: "#bbf7d0", text: "#047857" },
  SCHEDULED: { bg: "#fff7ed", border: "#ffedd5", text: "#ea580c" },
  SENDING:   { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
  FAILED:    { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c" },
  CANCELLED: { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b" },
};
const DEFAULT_SC = { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b" };

// ── Row component (memoised so only changed rows re-render) ────────────────────

interface RowProps {
  email: EmailItem;
  isStarred: boolean;
  isMe: boolean;
  userPicture?: string;
  userInitials: string;
  onStar: (id: string, e: React.MouseEvent) => void;
  onCancelEmail: (id: string) => void;
  onOpenReschedule: (email: EmailItem) => void;
  onViewDetails: (email: EmailItem) => void;
}

const EmailRow: React.FC<RowProps> = memo(({
  email, isStarred, isMe, userPicture, userInitials,
  onStar, onCancelEmail, onOpenReschedule, onViewDetails,
}) => {
  const [hovered, setHovered] = useState(false);
  const isScheduled = email.status === "SCHEDULED";
  const isSent = email.status === "SENT";
  const sc = STATUS_COLORS[email.status] ?? DEFAULT_SC;

  // Avatar: if recipient is "me", use the user's picture/initials; else use recipient initial
  const recipientName = email.recipient.split("@")[0];
  const recipientInitial = recipientName[0].toUpperCase();

  return (
    <div
      onClick={() => onViewDetails(email)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        height: "54px",
        borderBottom: "1px solid #f1f5f9",
        backgroundColor: hovered ? "#f8fafc" : "#ffffff",
        cursor: "pointer",
        transition: "background-color 0.1s",
      }}
    >
      {/* Star */}
      <button
        onClick={(e) => onStar(email.id, e)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", marginRight: "10px", color: isStarred ? "#f59e0b" : "#cbd5e1", flexShrink: 0, display: "flex", alignItems: "center" }}
      >
        <Star size={15} fill={isStarred ? "#f59e0b" : "none"} />
      </button>

      {/* Avatar */}
      {isMe && userPicture ? (
        <img
          src={userPicture}
          alt="me"
          style={{ width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", flexShrink: 0, marginRight: "14px", border: "1.5px solid #e2e8f0" }}
        />
      ) : (
        <div
          style={{
            width: "34px", height: "34px", borderRadius: "50%",
            backgroundColor: isMe ? "#10b981" : "#6366f1",
            color: "#fff", fontWeight: 700, fontSize: "0.82rem",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, marginRight: "14px",
          }}
        >
          {isMe ? userInitials : recipientInitial}
        </div>
      )}

      {/* Recipient name — "me" or username */}
      <div
        style={{
          width: "130px", fontWeight: isSent ? 500 : 700, fontSize: "0.88rem",
          color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden",
          textOverflow: "ellipsis", flexShrink: 0, marginRight: "16px",
        }}
      >
        {isMe ? "me" : recipientName}
      </div>

      {/* Subject + snippet */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", minWidth: 0, overflow: "hidden" }}>
        <span style={{ fontWeight: isSent ? 500 : 700, fontSize: "0.88rem", color: "#0f172a", whiteSpace: "nowrap", flexShrink: 0, maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis" }}>
          {email.subject}
        </span>
        <span style={{ color: "#cbd5e1", flexShrink: 0 }}>—</span>
        <span style={{ fontSize: "0.85rem", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {email.body}
        </span>
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, marginLeft: "16px" }} onClick={(e) => e.stopPropagation()}>
        {/* Hover action buttons */}
        {hovered && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {isScheduled && (
              <button title="Reschedule" onClick={(e) => { e.stopPropagation(); onOpenReschedule(email); }}
                style={{ width: "28px", height: "28px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                <Calendar size={13} />
              </button>
            )}
            {isScheduled && (
              <button title="Cancel" onClick={(e) => { e.stopPropagation(); onCancelEmail(email.id); }}
                style={{ width: "28px", height: "28px", borderRadius: "6px", border: "1px solid #fee2e2", background: "#fef2f2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
                <Ban size={13} />
              </button>
            )}
            {isSent && email.etherealPreviewUrl && (
              <a href={email.etherealPreviewUrl} target="_blank" rel="noopener noreferrer" title="Preview" onClick={(e) => e.stopPropagation()}
                style={{ width: "28px", height: "28px", borderRadius: "6px", border: "1px solid #bbf7d0", background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", color: "#047857", textDecoration: "none" }}>
                <ArrowUpRight size={13} />
              </a>
            )}
          </div>
        )}

        {/* Status badge */}
        <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "3px 9px", borderRadius: "9999px", backgroundColor: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, whiteSpace: "nowrap" }}>
          {email.status.charAt(0) + email.status.slice(1).toLowerCase()}
        </span>

        {/* Date */}
        <span style={{ fontSize: "0.78rem", color: "#94a3b8", whiteSpace: "nowrap", minWidth: "56px", textAlign: "right" }}>
          {formatDateShort(email.scheduledAt)}
        </span>
      </div>
    </div>
  );
});

EmailRow.displayName = "EmailRow";

// ── List container ─────────────────────────────────────────────────────────────

export const EmailList: React.FC<EmailListProps> = memo(({
  emails, currentTab, user,
  onCancelEmail, onOpenReschedule, onViewDetails, loading,
}) => {
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());

  const toggleStar = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Compute user avatar helpers once
  const userInitials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";
  const userEmail = user?.email?.toLowerCase() ?? "";

  if (loading) {
    return (
      <div className="content-body">
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Loading...
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="content-body">
        <div style={{ padding: "80px 0", textAlign: "center" }}>
          <Mail size={40} style={{ color: "#cbd5e1", marginBottom: "14px" }} />
          <p style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}>
            No {currentTab.toLowerCase()} emails
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Use the + Compose button to schedule a new email.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-body" style={{ padding: 0 }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {emails.map((email) => (
          <EmailRow
            key={email.id}
            email={email}
            isStarred={starredIds.has(email.id)}
            isMe={!!userEmail && email.recipient.toLowerCase() === userEmail}
            userPicture={user?.picture}
            userInitials={userInitials}
            onStar={toggleStar}
            onCancelEmail={onCancelEmail}
            onOpenReschedule={onOpenReschedule}
            onViewDetails={onViewDetails}
          />
        ))}
      </div>
    </div>
  );
});

EmailList.displayName = "EmailList";
