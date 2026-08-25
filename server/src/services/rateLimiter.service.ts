import { redisClient } from "../config/redis";

export const MAX_EMAILS_PER_HOUR_PER_SENDER = parseInt(
  process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || "50",
  10
);

export const MAX_EMAILS_PER_HOUR_GLOBAL = parseInt(
  process.env.MAX_EMAILS_PER_HOUR_GLOBAL || "500",
  10
);

export const MIN_EMAIL_DELAY_MS = parseInt(
  process.env.MIN_EMAIL_DELAY_MS || "1000",
  10
);

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  nextWindowDate?: Date;
}

function getCurrentHourKey(): string {
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hour = String(d.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:00:00Z`;
}

function getNextHourWindowDate(): Date {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
  return d;
}

/**
 * Atomically increment both counters first (INCR is atomic in Redis),
 * then check if either exceeded the limit and roll back if so.
 * This eliminates the read-check-write TOCTOU race under high concurrency.
 */
export async function checkAndIncrementRateLimit(
  senderEmail: string
): Promise<RateLimitCheckResult> {
  const hourKey = getCurrentHourKey();
  const senderKey = `ratelimit:sender:${senderEmail}:${hourKey}`;
  const globalKey = `ratelimit:global:${hourKey}`;

  // Atomic increment both counters in one pipeline round-trip
  const incrPipeline = redisClient.pipeline();
  incrPipeline.incr(senderKey);
  incrPipeline.expire(senderKey, 7200);
  incrPipeline.incr(globalKey);
  incrPipeline.expire(globalKey, 7200);
  const results = await incrPipeline.exec();

  const newSenderCount = (results?.[0]?.[1] as number) ?? 1;
  const newGlobalCount = (results?.[2]?.[1] as number) ?? 1;

  // Check per-sender limit
  if (newSenderCount > MAX_EMAILS_PER_HOUR_PER_SENDER) {
    // Roll back the increments we just made
    const rollback = redisClient.pipeline();
    rollback.decr(senderKey);
    rollback.decr(globalKey);
    await rollback.exec();

    return {
      allowed: false,
      reason: `Sender ${senderEmail} exceeded hourly limit (${newSenderCount - 1}/${MAX_EMAILS_PER_HOUR_PER_SENDER})`,
      nextWindowDate: getNextHourWindowDate(),
    };
  }

  // Check global limit
  if (newGlobalCount > MAX_EMAILS_PER_HOUR_GLOBAL) {
    const rollback = redisClient.pipeline();
    rollback.decr(senderKey);
    rollback.decr(globalKey);
    await rollback.exec();

    return {
      allowed: false,
      reason: `Global hourly email limit reached (${newGlobalCount - 1}/${MAX_EMAILS_PER_HOUR_GLOBAL})`,
      nextWindowDate: getNextHourWindowDate(),
    };
  }

  return { allowed: true };
}
