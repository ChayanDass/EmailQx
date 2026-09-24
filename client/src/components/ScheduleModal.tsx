import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Paperclip,
  Clock,
  Upload,
  Undo,
  Redo,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  Quote,
  Strikethrough,
  X,
  ChevronDown,
  Image as ImageIcon,
} from "lucide-react";
import { EmailItem, AttachmentData } from "../types";

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (data: {
    senderEmail?: string;
    recipient: string;
    subject: string;
    body: string;
    scheduledAt: string;
    attachments?: AttachmentData[];
  }) => Promise<void>;
  onReschedule?: (id: string, scheduledAt: string) => Promise<void>;
  editingEmail?: EmailItem | null;
}

const SENDER_OPTIONS = [
  "oliver.brown@domain.co",
  "sender1@emailqx.ai",
  "sales@emailqx.ai",
  "support@emailqx.ai",
];

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  onClose,
  onSchedule,
  onReschedule,
  editingEmail,
}) => {
  const [senderEmail, setSenderEmail] = useState(SENDER_OPTIONS[0]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [delayBetweenEmails, setDelayBetweenEmails] = useState("00");
  const [hourlyLimit, setHourlyLimit] = useState("00");
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const [uploadedCount, setUploadedCount] = useState<number | null>(null);

  // Send Later popover
  const [isSendLaterOpen, setIsSendLaterOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("tomorrow_10am");
  const [isScheduleSet, setIsScheduleSet] = useState(false); // true once user confirms a time

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  const toInputFormat = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  useEffect(() => {
    if (editingEmail) {
      setSenderEmail(editingEmail.senderEmail || SENDER_OPTIONS[0]);
      setRecipients([editingEmail.recipient]);
      setSubject(editingEmail.subject);
      setBody(editingEmail.body);
      setScheduledAt(toInputFormat(new Date(editingEmail.scheduledAt)));
      setIsSendLaterOpen(false);
      setIsScheduleSet(true);
    } else {
      setSenderEmail(SENDER_OPTIONS[0]);
      setRecipients([]);
      setRecipientInput("");
      setSubject("");
      setBody("");
      const t = new Date();
      t.setDate(t.getDate() + 1);
      t.setHours(10, 0, 0, 0);
      setScheduledAt(toInputFormat(t));
      setIsSendLaterOpen(false);
    }
    setError(null);
    setAttachments([]);
    setUploadedCount(null);
    setIsScheduleSet(false);
  }, [editingEmail, isOpen]);

  if (!isOpen) return null;

  // ── Recipient helpers ──────────────────────────────────────────────
  const commitRecipient = () => {
    const val = recipientInput.trim();
    if (val && val.includes("@") && !recipients.includes(val)) {
      setRecipients((p) => [...p, val]);
    }
    setRecipientInput("");
  };

  const handleRecipientKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitRecipient();
    } else if (e.key === "Backspace" && recipientInput === "" && recipients.length > 0) {
      setRecipients((p) => p.slice(0, -1));
    }
  };

  const removeRecipient = (i: number) =>
    setRecipients((p) => p.filter((_, idx) => idx !== i));

  // ── CSV upload ─────────────────────────────────────────────────────
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text
        .split(/[\n,;]/)
        .map((s) => s.trim())
        .filter((s) => s.includes("@"));
      if (lines.length > 0) {
        setRecipients((p) => Array.from(new Set([...p, ...lines])));
        setUploadedCount(lines.length);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── File attachment ────────────────────────────────────────────────
  const handleAttachFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        const base64 = result.split(",")[1];
        setAttachments((p) => [...p, { name: file.name, type: file.type, data: base64 }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeAttachment = (i: number) =>
    setAttachments((p) => p.filter((_, idx) => idx !== i));

  // ── Schedule presets ───────────────────────────────────────────────
  const applyPreset = (preset: string) => {
    setSelectedPreset(preset);
    const d = new Date();
    if (preset === "tomorrow") {
      d.setDate(d.getDate() + 1);
    } else if (preset === "tomorrow_10am") {
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
    } else if (preset === "tomorrow_1pm") {
      d.setDate(d.getDate() + 1);
      d.setHours(13, 0, 0, 0);
    } else if (preset === "tomorrow_2pm") {
      d.setDate(d.getDate() + 1);
      d.setHours(14, 0, 0, 0);
    }
    setScheduledAt(toInputFormat(d));
  };

  // ── Submit ─────────────────────────────────────────────────────────
  const handleSend = async (immediate = false) => {
    setError(null);
    const allRecipients = recipientInput.trim()
      ? [...recipients, recipientInput.trim()].filter((r) => r.includes("@"))
      : recipients;

    if (allRecipients.length === 0) {
      setError("Add at least one recipient.");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setError("Subject and message body are required.");
      return;
    }

    const sendDate = immediate ? new Date(Date.now() + 5000) : new Date(scheduledAt);
    if (isNaN(sendDate.getTime())) {
      setError("Please pick a valid schedule time.");
      return;
    }

    try {
      setLoading(true);
      for (const r of allRecipients) {
        if (editingEmail && onReschedule) {
          await onReschedule(editingEmail.id, sendDate.toISOString());
        } else {
          await onSchedule({
            senderEmail,
            recipient: r,
            subject,
            body,
            scheduledAt: sendDate.toISOString(),
            attachments,
          });
        }
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to schedule email.");
    } finally {
      setLoading(false);
    }
  };

  // ── Helpers for attachment card display ───────────────────────────
  const isImage = (att: AttachmentData) => att.type.startsWith("image/");
  const dataUrl = (att: AttachmentData) => `data:${att.type};base64,${att.data}`;
  const humanSize = (base64: string) => {
    const bytes = Math.round((base64.length * 3) / 4);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      {/* Invisible close backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "transparent" }}
      />

      {/* Full-height compose panel — same layout as EmailDetailModal */}
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
          {/* Left */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                padding: "6px",
                borderRadius: "8px",
              }}
            >
              <ArrowLeft size={20} />
            </button>
            <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#0f172a" }}>
              {editingEmail ? "Reschedule Email" : "Compose New Email"}
            </span>
          </div>

          {/* Right */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Paperclip shortcut */}
            <button
              title="Attach files"
              onClick={() => attachInputRef.current?.click()}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#10b981",
                display: "flex",
                alignItems: "center",
                padding: "6px",
              }}
            >
              <Paperclip size={20} />
            </button>

            {/* Clock icon — opens the schedule popover */}
            <button
              title="Set send time"
              onClick={() => setIsSendLaterOpen((v) => !v)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: isScheduleSet ? "#047857" : "#10b981",
                display: "flex",
                alignItems: "center",
                padding: "6px",
              }}
            >
              <Clock size={20} />
            </button>

            {/* Single send button — "Send" or "Send Later" */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => {
                  if (isScheduleSet) {
                    handleSend(false);
                  } else {
                    handleSend(true);
                  }
                }}
                disabled={loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "8px 20px",
                  borderRadius: "9999px",
                  border: isScheduleSet ? "1.5px solid #10b981" : "none",
                  background: isScheduleSet
                    ? "#ffffff"
                    : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: isScheduleSet ? "#047857" : "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: isScheduleSet ? "none" : "0 2px 8px rgba(16,185,129,0.3)",
                  transition: "all 0.15s",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? (
                  "Sending…"
                ) : isScheduleSet ? (
                  <>
                    <Clock size={14} />
                    Send Later
                  </>
                ) : (
                  "Send"
                )}
              </button>

              {/* Schedule popover */}
              {isSendLaterOpen && (
                <div
                  style={{
                    position: "fixed",
                    top: "72px",
                    right: "24px",
                    width: "300px",
                    background: "#ffffff",
                    borderRadius: "14px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
                    padding: "20px",
                    zIndex: 210,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a", marginBottom: "14px" }}>
                    Schedule Send
                  </div>

                  <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                    Pick date & time
                  </label>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                    <input
                      type="date"
                      value={scheduledAt.slice(0, 10)}
                      onChange={(e) => {
                        const time = scheduledAt.slice(11) || "10:00";
                        setScheduledAt(`${e.target.value}T${time}`);
                      }}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "0.85rem",
                        outline: "none",
                        boxSizing: "border-box" as const,
                        minWidth: 0,
                      }}
                    />
                    <input
                      type="time"
                      value={scheduledAt.slice(11, 16)}
                      onChange={(e) => {
                        const date = scheduledAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
                        setScheduledAt(`${date}T${e.target.value}`);
                      }}
                      style={{
                        width: "100px",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "0.85rem",
                        outline: "none",
                        boxSizing: "border-box" as const,
                        flexShrink: 0,
                      }}
                    />
                  </div>

                  {[
                    { key: "tomorrow", label: "Tomorrow" },
                    { key: "tomorrow_10am", label: "Tomorrow, 10:00 AM" },
                    { key: "tomorrow_1pm", label: "Tomorrow, 1:00 PM" },
                    { key: "tomorrow_2pm", label: "Tomorrow, 2:00 PM" },
                  ].map(({ key, label }) => (
                    <div
                      key={key}
                      onClick={() => applyPreset(key)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        fontSize: "0.85rem",
                        fontWeight: selectedPreset === key ? 600 : 500,
                        color: selectedPreset === key ? "#047857" : "#374151",
                        background: selectedPreset === key ? "#ecfdf5" : "transparent",
                        cursor: "pointer",
                        marginBottom: "2px",
                        transition: "background 0.1s",
                      }}
                    >
                      {label}
                    </div>
                  ))}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" }}>
                    <button
                      onClick={() => {
                        setIsScheduleSet(false);
                        setIsSendLaterOpen(false);
                      }}
                      style={{ background: "none", border: "none", color: "#64748b", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
                    >
                      CLEAR
                    </button>
                    <button
                      onClick={() => {
                        setIsScheduleSet(true);
                        setIsSendLaterOpen(false);
                      }}
                      style={{
                        padding: "7px 18px",
                        borderRadius: "8px",
                        border: "none",
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                      }}
                    >
                      DONE
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Banners */}
          {uploadedCount !== null && (
            <div
              style={{
                padding: "10px 32px",
                background: "#ecfdf5",
                color: "#047857",
                fontSize: "0.85rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid #d1fae5",
              }}
            >
              <span>✓ Loaded {uploadedCount} recipient{uploadedCount > 1 ? "s" : ""} from file</span>
              <button onClick={() => setUploadedCount(null)} style={{ background: "none", border: "none", color: "#047857", cursor: "pointer" }}>
                <X size={14} />
              </button>
            </div>
          )}
          {error && (
            <div style={{ padding: "10px 32px", background: "#fef2f2", color: "#dc2626", fontSize: "0.85rem", borderBottom: "1px solid #fecaca" }}>
              {error}
            </div>
          )}

          {/* Form area — centered, max width, fills the panel */}
          <div style={{ padding: "0 60px", maxWidth: "900px", width: "100%", margin: "0 auto" }}>

            {/* From */}
            <div style={fieldRowStyle}>
              <span style={labelStyle}>From</span>
              <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                <select
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "6px 32px 6px 12px",
                    fontSize: "0.88rem",
                    fontWeight: 500,
                    color: "#1f2937",
                    background: "#f8fafc",
                    appearance: "none",
                    cursor: "pointer",
                    outline: "none",
                    minWidth: "220px",
                  }}
                >
                  {SENDER_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: "10px", color: "#64748b", pointerEvents: "none" }} />
              </div>
            </div>

            {/* To */}
            <div style={fieldRowStyle}>
              <span style={labelStyle}>To</span>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "6px",
                  minHeight: "32px",
                }}
              >
                {recipients.map((r, i) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "3px 10px",
                      borderRadius: "9999px",
                      background: "#ecfdf5",
                      border: "1px solid #bbf7d0",
                      color: "#047857",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                    }}
                  >
                    {r}
                    <X size={12} style={{ cursor: "pointer" }} onClick={() => removeRecipient(i)} />
                  </span>
                ))}
                <input
                  type="text"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  onKeyDown={handleRecipientKey}
                  onBlur={commitRecipient}
                  placeholder={recipients.length === 0 ? "recipient@example.com" : ""}
                  style={plainInputStyle}
                />
              </div>
              {/* Upload List */}
              <button
                onClick={() => csvInputRef.current?.click()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "none",
                  border: "none",
                  color: "#10b981",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  flexShrink: 0,
                  padding: "0 4px",
                }}
              >
                <Upload size={13} />
                Upload List
              </button>
              <input type="file" ref={csvInputRef} accept=".csv,.txt" style={{ display: "none" }} onChange={handleCSVUpload} />
            </div>

            {/* Subject */}
            <div style={fieldRowStyle}>
              <span style={labelStyle}>Subject</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                style={{ ...plainInputStyle, flex: 1 }}
              />
            </div>

            {/* Delay + Hourly controls */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "28px",
                padding: "14px 0",
                borderBottom: "1px solid #f1f5f9",
                fontSize: "0.85rem",
                color: "#64748b",
                fontWeight: 500,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Delay between 2 emails</span>
                <input
                  type="text"
                  value={delayBetweenEmails}
                  onChange={(e) => setDelayBetweenEmails(e.target.value)}
                  style={smallInputStyle}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Hourly Limit</span>
                <input
                  type="text"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(e.target.value)}
                  style={smallInputStyle}
                />
              </div>
            </div>

            {/* Body textarea — above the toolbar, light grey bg */}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type Your Reply..."
              style={{
                width: "100%",
                minHeight: "220px",
                border: "none",
                outline: "none",
                resize: "vertical",
                fontSize: "0.95rem",
                fontFamily: "'Inter', system-ui, sans-serif",
                color: "#1e293b",
                lineHeight: 1.7,
                padding: "18px 0 8px 0",
                background: "transparent",
                boxSizing: "border-box",
              }}
            />

            {/* ── Formatting toolbar ── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "2px",
                borderTop: "1px solid #f1f5f9",
                borderBottom: "1px solid #f1f5f9",
                flexWrap: "wrap" as const,
                background: "#fafafa",
                margin: "0 -60px",
                padding: "6px 60px",
              }}
            >
              {/* Undo / Redo */}
              <ToolbarBtn title="Undo"><Undo size={14} /></ToolbarBtn>
              <ToolbarBtn title="Redo"><Redo size={14} /></ToolbarBtn>
              <Divider />

              {/* Font size indicator */}
              <div style={{ display: "flex", alignItems: "center", gap: "2px", padding: "0 4px", fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>
                T<span style={{ fontSize: "0.65rem", verticalAlign: "super" }}>↕</span>
              </div>
              <Divider />

              {/* Text style */}
              <ToolbarBtn title="Bold"><Bold size={14} /></ToolbarBtn>
              <ToolbarBtn title="Italic"><Italic size={14} /></ToolbarBtn>
              <ToolbarBtn title="Underline"><Underline size={14} /></ToolbarBtn>
              <Divider />

              {/* Alignment */}
              <ToolbarBtn title="Align left"><AlignLeft size={14} /></ToolbarBtn>
              <ToolbarBtn title="Align center"><AlignCenter size={14} /></ToolbarBtn>
              <Divider />

              {/* Lists */}
              <ToolbarBtn title="Numbered list"><ListOrdered size={14} /></ToolbarBtn>
              <ToolbarBtn title="Bullet list"><List size={14} /></ToolbarBtn>
              <ToolbarBtn title="Indent"><IndentIncrease size={14} /></ToolbarBtn>
              <ToolbarBtn title="Outdent"><IndentDecrease size={14} /></ToolbarBtn>
              <Divider />

              {/* Quote / table / strikethrough */}
              <ToolbarBtn title="Block quote"><Quote size={14} /></ToolbarBtn>
              <ToolbarBtn title="Insert image" onClick={() => attachInputRef.current?.click()}>
                <ImageIcon size={14} />
              </ToolbarBtn>
              <ToolbarBtn title="Strikethrough"><Strikethrough size={14} /></ToolbarBtn>
            </div>

            {/* ── Attachment previews ── */}
            {attachments.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                  padding: "20px 0 8px 0",
                }}
              >
                {attachments.map((att, i) => (
                  <div
                    key={i}
                    style={{
                      position: "relative",
                      width: isImage(att) ? "160px" : "auto",
                      borderRadius: "10px",
                      overflow: "hidden",
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                    }}
                  >
                    {/* Remove button */}
                    <button
                      onClick={() => removeAttachment(i)}
                      style={{
                        position: "absolute",
                        top: "6px",
                        right: "6px",
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.5)",
                        border: "none",
                        color: "#fff",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1,
                      }}
                    >
                      <X size={11} />
                    </button>

                    {isImage(att) ? (
                      /* Image thumbnail */
                      <>
                        <img
                          src={dataUrl(att)}
                          alt={att.name}
                          style={{
                            width: "160px",
                            height: "110px",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                        <div style={{ padding: "6px 10px" }}>
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {att.name}
                          </div>
                          <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>{humanSize(att.data)}</div>
                        </div>
                      </>
                    ) : (
                      /* File chip */
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px" }}>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "8px",
                            background: "#eff6ff",
                            border: "1px solid #bfdbfe",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#1d4ed8",
                            flexShrink: 0,
                          }}
                        >
                          <Paperclip size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#0f172a", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {att.name}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>{humanSize(att.data)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Bottom padding */}
            <div style={{ height: "32px" }} />
          </div>
        </div>

        {/* Hidden file inputs */}
        <input type="file" ref={attachInputRef} multiple accept="*/*" style={{ display: "none" }} onChange={handleAttachFiles} />
      </div>
    </>
  );
};

// ── Small reusable components ─────────────────────────────────────────

const ToolbarBtn: React.FC<{ title: string; onClick?: () => void; children: React.ReactNode }> = ({
  title,
  onClick,
  children,
}) => (
  <button
    title={title}
    onClick={onClick}
    style={{
      width: "28px",
      height: "28px",
      borderRadius: "5px",
      border: "none",
      background: "transparent",
      color: "#64748b",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background 0.1s",
    }}
    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#f1f5f9")}
    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
  >
    {children}
  </button>
);

const Divider = () => (
  <div style={{ width: "1px", height: "18px", background: "#e2e8f0", margin: "0 4px" }} />
);

// ── Shared styles ────────────────────────────────────────────────────

const fieldRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "16px",
  padding: "14px 0",
  borderBottom: "1px solid #f1f5f9",
};

const labelStyle: React.CSSProperties = {
  width: "56px",
  fontSize: "0.88rem",
  fontWeight: 600,
  color: "#94a3b8",
  flexShrink: 0,
};

const plainInputStyle: React.CSSProperties = {
  border: "none",
  outline: "none",
  fontSize: "0.88rem",
  fontFamily: "'Inter', system-ui, sans-serif",
  color: "#1f2937",
  background: "transparent",
  minWidth: "120px",
};

const smallInputStyle: React.CSSProperties = {
  width: "48px",
  padding: "4px 8px",
  borderRadius: "6px",
  border: "1px solid #e2e8f0",
  fontSize: "0.85rem",
  textAlign: "center",
  outline: "none",
  background: "#f8fafc",
  color: "#374151",
  fontWeight: 600,
};
