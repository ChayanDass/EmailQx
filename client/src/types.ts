export type EmailStatus = "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";

export interface AttachmentData {
  name: string;
  type: string;
  data: string; // base64
}

export interface EmailItem {
  id: string;
  senderEmail: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: EmailStatus;
  etherealPreviewUrl?: string | null;
  errorReason?: string | null;
  attachments?: string | null; // JSON string from DB
  createdAt: string;
  updatedAt: string;
}

export interface SystemStats {
  scheduled: number;
  sent: number;
  failed: number;
  cancelled: number;
  total: number;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  services: {
    redis: "connected" | "disconnected";
    database: "connected" | "disconnected";
  };
  queue: {
    delayedJobs: number;
    activeJobs: number;
  };
  config?: {
    workerConcurrency: number;
    minEmailDelayMs: number;
    maxEmailsPerHourPerSender: number;
    maxEmailsPerHourGlobal: number;
  };
}
