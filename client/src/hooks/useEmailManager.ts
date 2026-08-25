import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ApiService, ScheduleEmailPayload } from "../services/api.service";
import { EmailItem, SystemStats, HealthStatus } from "../types";
import { UserProfile } from "../context/AuthContext";

export function useEmailManager(user: UserProfile | null, currentTab: string, searchTerm: string) {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const emailsMapRef = useRef<Map<string, EmailItem>>(new Map());

  const userHeaders = useMemo(
    (): Record<string, string> =>
      user?.email
        ? { "x-user-email": user.email, "x-user-name": user.name || "" }
        : {},
    [user?.email, user?.name]
  );

  const fetchHealth = useCallback(async () => {
    const data = await ApiService.fetchHealth();
    setHealth(data);
  }, []);

  const fetchStats = useCallback(async () => {
    const data = await ApiService.fetchStats(userHeaders);
    if (data) setStats(data);
  }, [userHeaders]);

  const fetchEmails = useCallback(
    async (tab = currentTab, search = searchTerm) => {
      try {
        const list = await ApiService.fetchEmails(userHeaders, tab, search);
        setEmails(list);
        emailsMapRef.current = new Map(list.map((e) => [e.id, e]));
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

  useEffect(() => {
    refreshAllData();

    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchStats();
        fetchEmails();
      }
    }, 10000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshAllData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshAllData, fetchStats, fetchEmails]);

  const patchEmail = useCallback((id: string, patch: Partial<EmailItem>) => {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const scheduleEmail = useCallback(
    async (payload: ScheduleEmailPayload) => {
      const newEmail = await ApiService.scheduleEmail(userHeaders, payload);
      if (currentTab === "SCHEDULED" || currentTab === "ALL") {
        setEmails((prev) => [newEmail, ...prev]);
      }
      fetchStats();
      return newEmail;
    },
    [currentTab, fetchStats, userHeaders]
  );

  const rescheduleEmail = useCallback(
    async (id: string, scheduledAt: string) => {
      await ApiService.rescheduleEmail(userHeaders, id, scheduledAt);
      patchEmail(id, { scheduledAt, status: "SCHEDULED", errorReason: null });
      fetchStats();
    },
    [fetchStats, patchEmail, userHeaders]
  );

  const cancelEmail = useCallback(
    async (id: string) => {
      await ApiService.cancelEmail(userHeaders, id);
      patchEmail(id, { status: "CANCELLED" });
      fetchStats();
    },
    [fetchStats, patchEmail, userHeaders]
  );

  return {
    emails,
    stats,
    health,
    loading,
    isRefreshing,
    emailsMap: emailsMapRef.current,
    fetchEmails,
    refreshAllData,
    scheduleEmail,
    rescheduleEmail,
    cancelEmail,
  };
}
