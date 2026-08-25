import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { redisClient } from "../config/redis";
import { emailQueue } from "../queue/email.queue";
import {
  MAX_EMAILS_PER_HOUR_PER_SENDER,
  MAX_EMAILS_PER_HOUR_GLOBAL,
  MIN_EMAIL_DELAY_MS,
} from "../services/rateLimiter.service";
import { WORKER_CONCURRENCY } from "../queue/email.worker";

export async function getHealth(_req: Request, res: Response): Promise<void> {
  try {
    let redisConnected = false;
    try {
      const ping = await redisClient.ping();
      redisConnected = ping === "PONG";
    } catch {
      redisConnected = false;
    }

    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    const delayedJobCount = await emailQueue.getDelayedCount();
    const activeJobCount = await emailQueue.getActiveCount();

    res.json({
      status: redisConnected && dbConnected ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        redis: redisConnected ? "connected" : "disconnected",
        database: dbConnected ? "connected" : "disconnected",
      },
      queue: {
        delayedJobs: delayedJobCount,
        activeJobs: activeJobCount,
      },
      config: {
        workerConcurrency: WORKER_CONCURRENCY,
        minEmailDelayMs: MIN_EMAIL_DELAY_MS,
        maxEmailsPerHourPerSender: MAX_EMAILS_PER_HOUR_PER_SENDER,
        maxEmailsPerHourGlobal: MAX_EMAILS_PER_HOUR_GLOBAL,
      },
    });
  } catch (error: any) {
    res.status(500).json({ status: "error", details: error.message || "Internal server error" });
  }
}
