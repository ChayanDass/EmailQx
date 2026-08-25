import { Queue } from "bullmq";
import { redisOptions } from "../config/redis";

export const EMAIL_QUEUE_NAME = "email-scheduler-queue";

export interface EmailJobData {
  emailId: string;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000, // 5 seconds initial backoff on failure
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export async function scheduleEmailJob(emailId: string, scheduledAt: Date): Promise<void> {
  const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());
  console.log(`[Queue] Scheduling job for emailId: ${emailId} with delay: ${delayMs}ms (Target: ${scheduledAt.toISOString()})`);

  // We use emailId as the jobId to ensure 1-to-1 mapping and easy retrieval/cancellation
  await emailQueue.add(
    "send-scheduled-email",
    { emailId },
    {
      jobId: emailId,
      delay: delayMs,
    }
  );
}

export async function cancelEmailJob(emailId: string): Promise<boolean> {
  const job = await emailQueue.getJob(emailId);
  if (job) {
    await job.remove();
    console.log(`[Queue] Cancelled job ${emailId} from BullMQ queue`);
    return true;
  }
  console.log(`[Queue] Job ${emailId} not found in BullMQ queue (may have already run or been removed)`);
  return false;
}

export async function rescheduleEmailJob(emailId: string, newScheduledAt: Date): Promise<void> {
  await cancelEmailJob(emailId);
  await scheduleEmailJob(emailId, newScheduledAt);
}
