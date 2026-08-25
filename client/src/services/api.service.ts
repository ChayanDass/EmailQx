import { getApiUrl } from "../config/api";
import { EmailItem, SystemStats, HealthStatus, AttachmentData } from "../types";

export interface ScheduleEmailPayload {
  senderEmail?: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  attachments?: AttachmentData[];
}

export const ApiService = {
  async fetchHealth(): Promise<HealthStatus | null> {
    try {
      const res = await fetch(getApiUrl("/api/health"));
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  },

  async fetchStats(headers: Record<string, string>): Promise<SystemStats | null> {
    try {
      const res = await fetch(getApiUrl("/api/stats"), { headers });
      if (res.ok) {
        const data = await res.json();
        return data.stats;
      }
      return null;
    } catch (err) {
      console.error("[ApiService] Error fetching stats:", err);
      return null;
    }
  },

  async fetchEmails(
    headers: Record<string, string>,
    status?: string,
    search?: string
  ): Promise<EmailItem[]> {
    try {
      const query = new URLSearchParams();
      if (status && status !== "ALL") query.append("status", status);
      if (search?.trim()) query.append("search", search.trim());

      const res = await fetch(getApiUrl(`/api/emails?${query.toString()}`), { headers });
      if (res.ok) {
        const data = await res.json();
        return data.emails || [];
      }
      return [];
    } catch (err) {
      console.error("[ApiService] Error fetching emails:", err);
      return [];
    }
  },

  async scheduleEmail(headers: Record<string, string>, payload: ScheduleEmailPayload): Promise<EmailItem> {
    const res = await fetch(getApiUrl("/api/emails/schedule"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      if (contentType.includes("application/json")) {
        const data = await res.json();
        throw new Error(data.error || "Failed to schedule email");
      }
      throw new Error(`Server error ${res.status}`);
    }

    const data = await res.json();
    return data.email;
  },

  async rescheduleEmail(headers: Record<string, string>, id: string, scheduledAt: string): Promise<void> {
    const res = await fetch(getApiUrl(`/api/emails/${id}/reschedule`), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ scheduledAt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to reschedule email");
  },

  async cancelEmail(headers: Record<string, string>, id: string): Promise<void> {
    const res = await fetch(getApiUrl(`/api/emails/${id}/cancel`), {
      method: "POST",
      headers,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to cancel email");
  },

  async syncUser(email: string, name?: string, picture?: string): Promise<void> {
    try {
      await fetch(getApiUrl("/api/users/sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, picture }),
      });
    } catch (err) {
      console.error("[ApiService] Failed to sync user:", err);
    }
  },
};
