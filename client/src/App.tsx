import React, { useEffect, useState } from "react";
import { useAuth } from "./context/AuthContext";
import { useEmailManager } from "./hooks/useEmailManager";
import { readRouteParams, pushRouteParams } from "./utils/url";

import { LoginView } from "./components/LoginView";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { EmailList } from "./components/EmailList";
import { ScheduleModal } from "./components/ScheduleModal";
import { EmailDetailModal } from "./components/EmailDetailModal";
import { EmailItem, AttachmentData } from "./types";

export const AppContent: React.FC = () => {
  const { user } = useAuth();
  const init = readRouteParams();

  const [currentTab, setCurrentTab] = useState<string>(init.tab);
  const [searchTerm, setSearchTerm] = useState<string>("");

  const {
    emails,
    stats,
    health,
    loading,
    isRefreshing,
    emailsMap,
    fetchEmails,
    refreshAllData,
    scheduleEmail,
    rescheduleEmail,
    cancelEmail,
  } = useEmailManager(user, currentTab, searchTerm);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(init.compose);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(init.editId);
  const [editingEmail, setEditingEmail] = useState<EmailItem | null>(null);

  const [selectedDetailEmailId, setSelectedDetailEmailId] = useState<string | null>(init.emailId);
  const [selectedDetailEmail, setSelectedDetailEmail] = useState<EmailItem | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    if (editingEmailId && emailsMap.has(editingEmailId)) {
      setEditingEmail(emailsMap.get(editingEmailId) ?? null);
    }
  }, [editingEmailId, emails, emailsMap]);

  useEffect(() => {
    if (selectedDetailEmailId && emailsMap.has(selectedDetailEmailId)) {
      setSelectedDetailEmail(emailsMap.get(selectedDetailEmailId) ?? null);
    }
  }, [selectedDetailEmailId, emails, emailsMap]);

  useEffect(() => {
    const onPopState = () => {
      const p = readRouteParams();
      setCurrentTab(p.tab);
      setSelectedDetailEmailId(p.emailId);
      setIsScheduleModalOpen(p.compose);
      setEditingEmailId(p.editId);
      if (!p.emailId) setSelectedDetailEmail(null);
      if (!p.compose) {
        setEditingEmail(null);
        setEditingEmailId(null);
      }
      fetchEmails(p.tab, "");
      setSearchTerm("");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [fetchEmails]);

  const openTab = (tab: string) => {
    setCurrentTab(tab);
    setSelectedDetailEmail(null);
    setSelectedDetailEmailId(null);
    setIsScheduleModalOpen(false);
    pushRouteParams(tab);
    fetchEmails(tab, searchTerm);
  };

  const openEmailDetail = (email: EmailItem) => {
    setSelectedDetailEmail(email);
    setSelectedDetailEmailId(email.id);
    setIsScheduleModalOpen(false);
    pushRouteParams(currentTab, email.id);
  };

  const closeEmailDetail = () => {
    setSelectedDetailEmail(null);
    setSelectedDetailEmailId(null);
    pushRouteParams(currentTab);
  };

  const openCompose = (email?: EmailItem) => {
    setEditingEmail(email ?? null);
    setEditingEmailId(email?.id ?? null);
    setIsScheduleModalOpen(true);
    setSelectedDetailEmail(null);
    setSelectedDetailEmailId(null);
    pushRouteParams(currentTab, null, true, email?.id);
  };

  const closeCompose = () => {
    setIsScheduleModalOpen(false);
    setEditingEmail(null);
    setEditingEmailId(null);
    pushRouteParams(currentTab);
  };

  const handleScheduleSubmit = async (payload: {
    senderEmail?: string;
    recipient: string;
    subject: string;
    body: string;
    scheduledAt: string;
    attachments?: AttachmentData[];
  }) => {
    try {
      await scheduleEmail(payload);
      showToast("Email scheduled successfully!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to schedule email", "error");
      throw err;
    }
  };

  const handleRescheduleSubmit = async (id: string, scheduledAt: string) => {
    try {
      await rescheduleEmail(id, scheduledAt);
      showToast("Email rescheduled successfully!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to reschedule email", "error");
      throw err;
    }
  };

  const handleCancelEmail = async (id: string) => {
    if (!window.confirm("Are you sure you want to cancel this scheduled email?")) return;
    try {
      await cancelEmail(id);
      showToast("Email cancelled.", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to cancel email", "error");
    }
  };

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
