import React from "react";
import {
  ArrowLeft,
  Star,
  Archive,
  Trash2,
  ExternalLink,
  ChevronDown,
  Paperclip,
} from "lucide-react";
import { EmailItem, AttachmentData } from "../types";
import { UserProfile } from "../context/AuthContext";

interface EmailDetailModalProps {
  email: EmailItem | null;
  onClose: () => void;
  user?: UserProfile | null;
}

function statusLabel(status: string) {
  switch (status) {
    case "SENT":      return { label: "Sent",      bg: "#ecfdf5", border: "#bbf7d0", color: "#047857" };
    case "SCHEDULED": return { label: "Scheduled", bg: "#fff7ed", border: "#ffedd5", color: "#ea580c" };
    case "SENDING":   return { label: "Sending…",  bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8" };
    case "FAILED":    return { label: "Failed",    bg: "#fef2f2", border: "#fecaca", color: "#b91c1c" };
    case "CANCELLED": return { label: "Cancelled", bg: "#f8fafc", border: "#e2e8f0", color: "#64748b" };
    default:          return { label: status,      bg: "#f8fafc", border: "#e2e8f0", color: "#64748b" };
  }
}

function parseAttachments(raw: string | null | undefined): AttachmentData[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function humanSize(base64: string): string {
  const bytes = Math.round((base64.length * 3) / 4);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({ email, onClose, user }) => {
  if (!email) return null;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const senderName = email.senderEmail.split("@")[0];
  const senderInitial = senderName[0].toUpperCase();
  const st = statusLabel(email.status);
  const attachments = parseAttachments(email.attachments);

  // "to me" logic — compare case-insensitively
  const isRecipientMe =
    user?.email &&
    email.recipient.toLowerCase() === user.email.toLowerCase();

  // User avatar helpers
  const userInitials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "transparent" }}
      />

      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          left: "260px",
          zIndex: 201,
          backgroundColor: "#ffffff",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          animation: "slideInFromRight 0.2s ease-out",
          borderLeft: "1px solid #e2e8f0",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.06)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top bar ── */}
        <div
          style={{
            height: "64px",
            borderBottom: "1px solid #f1f5f9",
            padding: "0 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          {/* Left: back + subject + status */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex", padding: "6px", borderRadius: "8px", flexShrink: 0 }}
            >
              <ArrowLeft size={20} />
            </button>

            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "480px" }}>
              {email.subject}
              <span style={{ fontWeight: 400, color: "#94a3b8", marginLeft: "10px", fontSize: "0.88rem" }}>
                | {email.id.slice(0, 8).toUpperCase()}
              </span>
            </div>

            <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "3px 10px", borderRadius: "9999px", backgroundColor: st.bg, border: `1px solid ${st.border}`, color: st.color, flexShrink: 0 }}>
              {st.label}
            </span>
          </div>

          {/* Right: preview link + icon buttons + user avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            {email.etherealPreviewUrl && (
              <a
                href={email.etherealPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "8px", backgroundColor: "#ecfdf5", color: "#047857", border: "1px solid #bbf7d0", fontWeight: 600, fontSize: "0.8rem", textDecoration: "none", marginRight: "6px" }}
              >
                <ExternalLink size={13} />
                Preview Ethereal
              </a>
            )}

            {([
              { icon: <Star size={16} />, title: "Star" },
              { icon: <Archive size={16} />, title: "Archive" },
              { icon: <Trash2 size={16} />, title: "Delete" },
            ] as const).map(({ icon, title }) => (
              <button
                key={title}
                title={title}
                style={{ width: "34px", height: "34px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}
              >
                {icon}
              </button>
            ))}

            {/* Vertical divider */}
            <div style={{ width: "1px", height: "24px", backgroundColor: "#e2e8f0", margin: "0 4px" }} />

            {/* User profile picture */}
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                title={user.name}
                style={{ width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid #e2e8f0", cursor: "default" }}
              />
            ) : (
              <div
                title={user?.name}
                style={{ width: "34px", height: "34px", borderRadius: "50%", backgroundColor: "#10b981", color: "#fff", fontWeight: 700, fontSize: "0.78rem", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #e2e8f0" }}
              >
                {userInitials}
              </div>
            )}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "36px 52px" }}>
          <div style={{ maxWidth: "720px", margin: "0 auto" }}>

            {/* Sender row */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "24px" }}>
              {/* Sender avatar — initial only, no picture available for arbitrary senders */}
              <div style={{ width: "42px", height: "42px", borderRadius: "50%", backgroundColor: "#10b981", color: "#fff", fontWeight: 700, fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {senderInitial}
              </div>

              <div style={{ flex: 1 }}>
                {/* Sender name + address */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a" }}>
                    {senderName}
                  </span>
                  <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
                    &lt;{email.senderEmail}&gt;
                  </span>
                </div>

                {/* "to me" or "to recipient@..." */}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.8rem", color: "#64748b", marginTop: "3px" }}>
                  <span>to</span>
                  {isRecipientMe ? (
                    <span style={{ fontWeight: 700, color: "#0f172a" }}>me</span>
                  ) : (
                    <span style={{ fontWeight: 600, color: "#475569" }}>{email.recipient}</span>
                  )}
                  <ChevronDown size={13} style={{ color: "#94a3b8" }} />
                </div>
              </div>

              <div style={{ fontSize: "0.8rem", color: "#94a3b8", whiteSpace: "nowrap", flexShrink: 0, paddingTop: "2px" }}>
                {formatDate(email.scheduledAt)}
              </div>
            </div>

            {/* ── Email body card ── */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "28px 32px",
                backgroundColor: "#ffffff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "0.95rem",
                  color: "#1e293b",
                  lineHeight: 1.85,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {email.body}
              </div>

              {/* ── Attachments ── */}
              {attachments.length > 0 && (
                <div style={{ marginTop: "28px", paddingTop: "20px", borderTop: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", fontWeight: 700, color: "#64748b", marginBottom: "16px" }}>
                    <Paperclip size={14} />
                    <span>{attachments.length} Attachment{attachments.length > 1 ? "s" : ""}</span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
                    {attachments.map((att, i) => {
                      const isImg = att.type.startsWith("image/");
                      const src = `data:${att.type};base64,${att.data}`;
                      return (
                        <div
                          key={i}
                          style={{ borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden", background: "#f8fafc", width: isImg ? "160px" : "auto", minWidth: isImg ? "160px" : "200px" }}
                        >
                          {isImg ? (
                            <>
                              <img src={src} alt={att.name} style={{ width: "160px", height: "110px", objectFit: "cover", display: "block" }} />
                              <div style={{ padding: "8px 10px" }}>
                                <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</div>
                                <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "2px" }}>{humanSize(att.data)}</div>
                              </div>
                            </>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px" }}>
                              <div style={{ width: "38px", height: "38px", borderRadius: "8px", background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", color: "#1d4ed8", flexShrink: 0 }}>
                                <Paperclip size={17} />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }}>{att.name}</div>
                                <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "2px" }}>{humanSize(att.data)}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Metadata footer ── */}
            <div style={{ marginTop: "24px", display: "flex", flexWrap: "wrap", gap: "20px", fontSize: "0.78rem", color: "#94a3b8" }}>
              <span><span style={{ fontWeight: 600, color: "#64748b" }}>ID: </span>{email.id}</span>
              <span><span style={{ fontWeight: 600, color: "#64748b" }}>Scheduled: </span>{formatDate(email.scheduledAt)}</span>
              {email.sentAt && (
                <span><span style={{ fontWeight: 600, color: "#64748b" }}>Sent: </span>{formatDate(email.sentAt)}</span>
              )}
              {email.errorReason && (
                <span style={{ color: "#ef4444" }}><span style={{ fontWeight: 600 }}>Error: </span>{email.errorReason}</span>
              )}
            </div>

          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideInFromRight {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
};
