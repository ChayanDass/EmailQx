import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "./context/AuthContext";
import { LoginView } from "./components/LoginView";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { EmailList } from "./components/EmailList";
import { ScheduleModal } from "./components/ScheduleModal";
import { EmailDetailModal } from "./components/EmailDetailModal";
import { EmailItem, SystemStats, HealthStatus, AttachmentData } from "./types";
import { getApiUrl } from "./config/api";

// ── URL helpers ────────────────────────────────────────────────────────────────

function readParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    tab: p.get("tab") || "SCHEDULED",
    emailId: p.get("email") || null,
    compose: p.has("compose"),
    editId: p.get("edit") || null,
  };
}

function pushURL(tab: string, emailId?: string | null, compose?: boolean, editId?: string | null) {
  const p = new URLSearchParams();
  p.set("tab", tab);
  if (emailId) p.set("email", emailId);
  if (compose) p.set("compose", "1");
  if (editId) p.set("edit", editId);
  const url = `?${p.toString()}`;
  if (window.location.search !== `?${p.toString()}`) {
    window.history.pushState({}, "", url);
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export const AppContent: React.FC = () => {
  const { user } = useAuth();

  // Initialise state from URL on first render
  const init = readParams();

  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const [currentTab, setCurrentTab] = useState<string>(init.tab);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(init.compose);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(init.editId);
  const [editingEmail, setEditingEmail] = useState<EmailItem | null>(null);
  const [selectedDetailEmailId, setSelectedDetailEmailId] = useState<string | null>(init.emailId);
  const [selectedDetailEmail, setSelectedDetailEmail] = useState<EmailItem | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Track emails by id for instant lookup without refetch
  const emailsMapRef = useRef<Map<string, EmailItem>>(new Map());

  const userHeaders = useMemo(
    (): Record<string, string> =>
      user?.email
        ? { "x-user-email": user.email, "x-user-name": user.name || "" }
        : {},
    [user?.email, user?.name]
  );

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ── Fetch functions ──────────────────────────────────────────────────────────

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/health"));
      if (res.ok) setHealth(await res.json());
    } catch {
      setHealth(null);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/stats"), { headers: userHeaders });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, [userHeaders]);

  const fetchEmails = useCallback(
    async (tab = currentTab, search = searchTerm) => {
      try {
        const query = new URLSearchParams();
        if (tab !== "ALL") query.append("status", tab);
        if (search.trim()) query.append("search", search.trim());

        const res = await fetch(getApiUrl(`/api/emails?${query.toString()}`), { headers: userHeaders });
        if (res.ok) {
          const data = await res.json();
          const list: EmailItem[] = data.emails;
          setEmails(list);
          // Update the map for instant lookups
          emailsMapRef.current = new Map(list.map((e) => [e.id, e]));
          // If an email detail is open, refresh it too
          setSelectedDetailEmail((prev) => {
            if (!prev) return prev;
            return emailsMapRef.current.get(prev.id) ?? prev;
          });
        }
      } catch (err) {
        console.error("Error fetching emails:", err);
      } finally {
        setLoading(false);
      }
    },
    [currentTab, searchTerm, userHeaders]
  );

  const refreshAllData = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([fetchHealth(), fetchStats(), fetchEmails()]);
    setIsRefreshing(false);
  }, [fetchHealth, fetchStats, fetchEmails]);

  // ── Initial load + polling ────────────────────────────────────────────────────

  useEffect(() => {
    refreshAllData();
    const interval = setInterval(refreshAllData, 5000);
    return () => clearInterval(interval);
  }, [refreshAllData]);

  // ── Resolve editingEmail from id once emails are loaded ──────────────────────

  useEffect(() => {
    if (editingEmailId && emailsMapRef.current.has(editingEmailId)) {
      setEditingEmail(emailsMapRef.current.get(editingEmailId) ?? null);
    }
  }, [editingEmailId, emails]);

  // Resolve selectedDetailEmail from id
  useEffect(() => {
    if (selectedDetailEmailId && emailsMapRef.current.has(selectedDetailEmailId)) {
      setSelectedDetailEmail(emailsMapRef.current.get(selectedDetailEmailId) ?? null);
    }
  }, [selectedDetailEmailId, emails]);

  // ── Handle browser back/forward ───────────────────────────────────────────────

  useEffect(() => {
    const onPopState = () => {
      const p = readParams();
      setCurrentTab(p.tab);
      setSelectedDetailEmailId(p.emailId);
      setIsScheduleModalOpen(p.compose);
      setEditingEmailId(p.editId);
      if (!p.emailId) setSelectedDetailEmail(null);
      if (!p.compose) { setEditingEmail(null); setEditingEmailId(null); }
      fetchEmails(p.tab, "");
      setSearchTerm("");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [fetchEmails]);

  // ── Navigation helpers (update URL + state together) ─────────────────────────

  const openTab = (tab: string) => {
    setCurrentTab(tab);
    setSelectedDetailEmail(null);
    setSelectedDetailEmailId(null);
    setIsScheduleModalOpen(false);
    pushURL(tab);
    fetchEmails(tab, searchTerm);
  };

  const openEmailDetail = (email: EmailItem) => {
    setSelectedDetailEmail(email);
    setSelectedDetailEmailId(email.id);
    setIsScheduleModalOpen(false);
    pushURL(currentTab, email.id);
  };

  const closeEmailDetail = () => {
    setSelectedDetailEmail(null);
    setSelectedDetailEmailId(null);
    pushURL(currentTab);
  };

  const openCompose = (email?: EmailItem) => {
    setEditingEmail(email ?? null);
    setEditingEmailId(email?.id ?? null);
    setIsScheduleModalOpen(true);
    setSelectedDetailEmail(null);
    setSelectedDetailEmailId(null);
    pushURL(currentTab, null, true, email?.id);
  };

  const closeCompose = () => {
    setIsScheduleModalOpen(false);
    setEditingEmail(null);
    setEditingEmailId(null);
    pushURL(currentTab);
  };

  // ── Optimistic helpers ────────────────────────────────────────────────────────

  /** Patch a single email in the list without a full refetch */
  const patchEmail = (id: string, patch: Partial<EmailItem>) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
    setSelectedDetailEmail((prev) =>
      prev?.id === id ? { ...prev, ...patch } : prev
    );
  };

  // ── Action handlers ───────────────────────────────────────────────────────────

  const handleScheduleSubmit = async (payload: {
    senderEmail?: string;
    recipient: string;
    subject: string;
    body: string;
    scheduledAt: string;
    attachments?: AttachmentData[];
  }) => {
    const res = await fetch(getApiUrl("/api/emails/schedule"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...userHeaders },
      body: JSON.stringify(payload),
    });
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      if (contentType.includes("application/json")) {
        const data = await res.json();
        throw new Error(data.error || "Failed to schedule email");
      }
      throw new Error(`Server error ${res.status}: payload may be too large`);
    }
    const data = await res.json();
    // Optimistically prepend the new email to the list when on the right tab
    const newEmail: EmailItem = data.email;
    if (currentTab === "SCHEDULED" || currentTab === "ALL") {
      setEmails((prev) => [newEmail, ...prev]);
    }
    // Always refresh stats
    fetchStats();
    showToast("Email scheduled successfully!", "success");
  };

  const handleRescheduleSubmit = async (id: string, scheduledAt: string) => {
    const res = await fetch(getApiUrl(`/api/emails/${id}/reschedule`), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...userHeaders },
      body: JSON.stringify({ scheduledAt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to reschedule email");
    // Optimistic update
    patchEmail(id, { scheduledAt, status: "SCHEDULED", errorReason: null });
    fetchStats();
    showToast("Email rescheduled successfully!", "success");
  };

  const handleCancelEmail = async (id: string) => {
    if (!window.confirm("Are you sure you want to cancel this scheduled email?")) return;
    try {
      const res = await fetch(getApiUrl(`/api/emails/${id}/cancel`), {
        method: "POST",
        headers: userHeaders,
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to cancel email", "error");
        return;
      }
      // Optimistically mark as cancelled (keep in list so user can see it)
      patchEmail(id, { status: "CANCELLED" });
      fetchStats();
      showToast("Email cancelled.", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to cancel email", "error");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="app-layout">
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 9999,
            padding: "12px 20px",
            borderRadius: "12px",
            background:
              toastMessage.type === "success"
                ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                : "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.9rem",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          {toastMessage.text}
        </div>
      )}

      <Sidebar
        currentTab={currentTab}
        onTabChange={openTab}
        scheduledCount={stats?.scheduled || 0}
        sentCount={stats?.sent || 0}
        onOpenCompose={() => openCompose()}
      />

      <main className="app-main">
        <Header
          searchTerm={searchTerm}
          onSearchChange={(term) => {
            setSearchTerm(term);
            fetchEmails(currentTab, term);
          }}
          health={health}
          onRefresh={refreshAllData}
          isRefreshing={isRefreshing}
        />

        <EmailList
          emails={emails}
          currentTab={currentTab}
          user={user}
          onCancelEmail={handleCancelEmail}
          onOpenReschedule={(email) => openCompose(email)}
          onViewDetails={openEmailDetail}
          loading={loading}
        />
      </main>

      <ScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={closeCompose}
        onSchedule={handleScheduleSubmit}
        onReschedule={handleRescheduleSubmit}
        editingEmail={editingEmail}
      />

      <EmailDetailModal
        email={selectedDetailEmail}
        onClose={closeEmailDetail}
        user={user}
      />
    </div>
  );
};

export const App: React.FC = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AppContent /> : <LoginView />;
};
