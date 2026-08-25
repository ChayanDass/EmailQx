import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { scheduleEmailJob, cancelEmailJob, rescheduleEmailJob, emailQueue } from "../queue/email.queue";
import { redisClient } from "../config/redis";
import {
  MAX_EMAILS_PER_HOUR_PER_SENDER,
  MAX_EMAILS_PER_HOUR_GLOBAL,
  MIN_EMAIL_DELAY_MS,
} from "../services/rateLimiter.service";
import { WORKER_CONCURRENCY } from "../queue/email.worker";

const ScheduleEmailSchema = z.object({
  senderEmail: z.string().email().optional().default("sender1@reachinbox.ai"),
  recipient: z.string().email("Invalid email address format"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  scheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format for scheduledAt",
  }),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        data: z.string(), // base64
      })
    )
    .optional()
    .default([]),
});

const RescheduleEmailSchema = z.object({
  scheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format for scheduledAt",
  }),
});

// Helper to extract user info from request headers
function getUserIdentity(req: Request) {
  const emailHeader = (req.headers["x-user-email"] as string) || (req.query.userEmail as string);
  const nameHeader = (req.headers["x-user-name"] as string) || (req.query.userName as string);
  return {
    userEmail: emailHeader ? emailHeader.toLowerCase().trim() : undefined,
    userName: nameHeader ? nameHeader.trim() : undefined,
  };
}

export async function syncUser(req: Request, res: Response): Promise<void> {
  try {
    const { email, name, picture } = req.body;
    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.upsert({
      where: { email: cleanEmail },
      update: {
        name: name || undefined,
        picture: picture || undefined,
      },
      create: {
        email: cleanEmail,
        name: name || cleanEmail.split("@")[0],
        picture,
      },
    });

    res.json({ message: "User synced successfully", user });
  } catch (error: any) {
    console.error("[Controller] Error syncing user:", error);
    res.status(500).json({ error: "Failed to sync user", details: error.message || "Internal server error" });
  }
}

export async function scheduleEmail(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = ScheduleEmailSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Validation failed", details: parseResult.error.flatten() });
      return;
    }

    const { senderEmail, recipient, subject, body, scheduledAt, attachments } = parseResult.data;
    const scheduledDate = new Date(scheduledAt);
    const { userEmail, userName } = getUserIdentity(req);

    let userId: string | undefined = undefined;

    if (userEmail) {
      const user = await prisma.user.upsert({
        where: { email: userEmail },
        update: { name: userName || undefined },
        create: { email: userEmail, name: userName || userEmail.split("@")[0] },
      });
      userId = user.id;
    }

    // Create DB record isolated by user
    const email = await prisma.email.create({
      data: {
        userId,
        userEmail,
        senderEmail,
        recipient,
        subject,
        body,
        scheduledAt: scheduledDate,
        status: "SCHEDULED",
        attachments: JSON.stringify(attachments),
      },
    });

    // Enqueue job in BullMQ
    await scheduleEmailJob(email.id, scheduledDate);

    res.status(201).json({
      message: "Email scheduled successfully",
      email,
    });
  } catch (error: any) {
    console.error("[Controller] Error scheduling email:", error);
    res.status(500).json({ error: "Failed to schedule email", details: error.message || "Internal server error" });
  }
}

export async function listEmails(
  req: Request<{}, {}, {}, { status?: string; search?: string; limit?: string; offset?: string; userEmail?: string }>,
  res: Response
): Promise<void> {
  try {
    const { status, search, limit = "50", offset = "0" } = req.query;
    const { userEmail } = getUserIdentity(req);

    const whereClause: any = {};

    // Isolate by user if userEmail header or query is present
    if (userEmail) {
      whereClause.userEmail = userEmail;
    }

    if (status && typeof status === "string" && status !== "ALL") {
      whereClause.status = status.toUpperCase();
    }

    if (search && typeof search === "string" && search.trim() !== "") {
      const searchTerm = search.trim();
      whereClause.OR = [
        { senderEmail: { contains: searchTerm } },
        { recipient: { contains: searchTerm } },
        { subject: { contains: searchTerm } },
        { body: { contains: searchTerm } },
      ];
    }

    const take = parseInt(limit as string, 10) || 50;
    const skip = parseInt(offset as string, 10) || 0;

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.email.count({ where: whereClause }),
    ]);

    res.json({
      emails,
      total,
      limit: take,
      offset: skip,
    });
  } catch (error: any) {
    console.error("[Controller] Error listing emails:", error);
    res.status(500).json({ error: "Failed to fetch emails", details: error.message || "Internal server error" });
  }
}

export async function getEmailById(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const email = await prisma.email.findUnique({
      where: { id },
    });

    if (!email) {
      res.status(404).json({ error: "Email not found" });
      return;
    }

    res.json({ email });
  } catch (error: any) {
    console.error("[Controller] Error getting email:", error);
    res.status(500).json({ error: "Failed to fetch email", details: error.message || "Internal server error" });
  }
}

export async function cancelEmail(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const email = await prisma.email.findUnique({
      where: { id },
    });

    if (!email) {
      res.status(404).json({ error: "Email not found" });
      return;
    }

    if (email.status === "SENT") {
      res.status(400).json({ error: "Cannot cancel an email that has already been sent" });
      return;
    }

    if (email.status === "CANCELLED") {
      res.status(400).json({ error: "Email is already cancelled" });
      return;
    }

    await cancelEmailJob(id);

    const updatedEmail = await prisma.email.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    res.json({
      message: "Email cancelled successfully",
      email: updatedEmail,
    });
  } catch (error: any) {
    console.error("[Controller] Error cancelling email:", error);
    res.status(500).json({ error: "Failed to cancel email", details: error.message || "Internal server error" });
  }
}

export async function rescheduleEmail(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const parseResult = RescheduleEmailSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Validation failed", details: parseResult.error.flatten() });
      return;
    }

    const email = await prisma.email.findUnique({
      where: { id },
    });

    if (!email) {
      res.status(404).json({ error: "Email not found" });
      return;
    }

    if (email.status === "SENT") {
      res.status(400).json({ error: "Cannot reschedule an email that has already been sent" });
      return;
    }

    const newScheduledDate = new Date(parseResult.data.scheduledAt);

    await rescheduleEmailJob(id, newScheduledDate);

    const updatedEmail = await prisma.email.update({
      where: { id },
      data: {
        scheduledAt: newScheduledDate,
        status: "SCHEDULED",
        errorReason: null,
      },
    });

    res.json({
      message: "Email rescheduled successfully",
      email: updatedEmail,
    });
  } catch (error: any) {
    console.error("[Controller] Error rescheduling email:", error);
    res.status(500).json({ error: "Failed to reschedule email", details: error.message || "Internal server error" });
  }
}

export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const { userEmail } = getUserIdentity(req);
    const userWhere = userEmail ? { userEmail } : {};

    const [scheduledCount, sentCount, failedCount, cancelledCount, totalCount] = await Promise.all([
      prisma.email.count({ where: { ...userWhere, status: "SCHEDULED" } }),
      prisma.email.count({ where: { ...userWhere, status: "SENT" } }),
      prisma.email.count({ where: { ...userWhere, status: "FAILED" } }),
      prisma.email.count({ where: { ...userWhere, status: "CANCELLED" } }),
      prisma.email.count({ where: userWhere }),
    ]);

    const nextUpcoming = await prisma.email.findFirst({
      where: { ...userWhere, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
    });

    res.json({
      stats: {
        scheduled: scheduledCount,
        sent: sentCount,
        failed: failedCount,
        cancelled: cancelledCount,
        total: totalCount,
      },
      nextUpcoming,
    });
  } catch (error: any) {
    console.error("[Controller] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats", details: error.message || "Internal server error" });
  }
}

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
