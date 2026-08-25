import { Worker, Job } from "bullmq";
import { redisOptions } from "../config/redis";
import {
  EMAIL_QUEUE_NAME,
  EmailJobData,
  emailQueue,
  rescheduleEmailJob,
} from "./email.queue";
import { prisma } from "../config/prisma";
import { sendEmailViaEthereal } from "../services/ethereal.service";
import {
  checkAndIncrementRateLimit,
  MIN_EMAIL_DELAY_MS,
} from "../services/rateLimiter.service";

export const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "5", 10);

export const emailWorker = new Worker<EmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailJobData>) => {
    const { emailId } = job.data;
    console.log(`[Worker] Processing job ${job.id} for emailId ${emailId}`);

    const email = await prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      console.warn(`[Worker] Email record ${emailId} not found in DB. Skipping job.`);
      return;
    }

    if (email.status === "CANCELLED") {
      console.log(`[Worker] Email ${emailId} was cancelled. Skipping send.`);
      return;
    }

    if (email.status === "SENT") {
      console.log(`[Worker] Email ${emailId} is already marked SENT. Idempotency skip.`);
      return;
    }

    // Atomic DB idempotency lock: transition SCHEDULED → SENDING
    const updateResult = await prisma.email.updateMany({
      where: { id: emailId, status: "SCHEDULED" },
      data: { status: "SENDING" },
    });

    if (updateResult.count === 0) {
      console.log(`[Worker] Idempotency lock missed for email ${emailId} (already processing). Skipping.`);
      return;
    }

    // Check Redis hourly rate limit
    const rateLimit = await checkAndIncrementRateLimit(email.senderEmail);

    if (!rateLimit.allowed && rateLimit.nextWindowDate) {
      console.warn(
        `[RateLimiter] ${rateLimit.reason}. Rescheduling email ${emailId} to ${rateLimit.nextWindowDate.toISOString()}`
      );
      await prisma.email.update({
        where: { id: emailId },
        data: { status: "SCHEDULED", scheduledAt: rateLimit.nextWindowDate },
      });
      await rescheduleEmailJob(emailId, rateLimit.nextWindowDate);
      return;
    }

    // Enforce provider throttling delay
    if (MIN_EMAIL_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, MIN_EMAIL_DELAY_MS));
    }

    try {
      const attachments = (() => {
        try { return JSON.parse(email.attachments || "[]"); } catch { return []; }
      })();

      const result = await sendEmailViaEthereal({
        senderEmail: email.senderEmail,
        to: email.recipient,
        subject: email.subject,
        body: email.body,
        attachments,
      });

      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: "SENT",
          sentAt: new Date(),
          etherealPreviewUrl: result.previewUrl || null,
          errorReason: null,
        },
      });

      console.log(`[Worker] Sent email ${emailId} from ${email.senderEmail} to ${email.recipient}`);
    } catch (err: any) {
      console.error(`[Worker] Failed to send email ${emailId}:`, err);
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: "FAILED",
          errorReason: err.message || "Failed to send email via SMTP",
        },
      });
      throw err;
    }
  },
  {
    connection: redisOptions,
    concurrency: WORKER_CONCURRENCY,
  }
);

emailWorker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

// Re-enqueue any SCHEDULED emails that lost their BullMQ job on server restart
export async function syncPendingJobsOnStartup(): Promise<void> {
  try {
    console.log("[Startup] Checking for pending scheduled emails in DB...");
    const pendingEmails = await prisma.email.findMany({
      where: { status: "SCHEDULED" },
      select: { id: true, scheduledAt: true }, // only fetch what we need
    });

    console.log(`[Startup] Found ${pendingEmails.length} pending scheduled emails.`);

    if (pendingEmails.length === 0) return;

    // Check all existing BullMQ jobs in parallel (not sequentially)
    const jobChecks = await Promise.all(
      pendingEmails.map((email) => emailQueue.getJob(email.id))
    );

    // Re-enqueue only emails whose BullMQ job is missing
    const toEnqueue = pendingEmails.filter((_, i) => !jobChecks[i]);

    if (toEnqueue.length === 0) {
      console.log("[Startup] All pending jobs already present in queue.");
      return;
    }

    // Batch-enqueue missing jobs in parallel (safe: jobId deduplicates in BullMQ)
    await Promise.all(
      toEnqueue.map((email) => {
        const delay = Math.max(0, email.scheduledAt.getTime() - Date.now());
        console.log(`[Startup] Re-enqueuing missing job for email ${email.id}`);
        return emailQueue.add(
          "send-scheduled-email",
          { emailId: email.id },
          { jobId: email.id, delay }
        );
      })
    );

    console.log(`[Startup] Re-enqueued ${toEnqueue.length} job(s).`);
  } catch (error) {
    console.error("[Startup] Error syncing pending jobs:", error);
  }
}
