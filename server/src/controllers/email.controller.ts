import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { scheduleEmailJob, cancelEmailJob, rescheduleEmailJob } from "../queue/email.queue";
import { getUserIdentity } from "../utils/auth.util";

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
        data: z.string(),
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

    await scheduleEmailJob(email.id, scheduledDate);

    res.status(201).json({
      message: "Email scheduled successfully",
      email,
    });
  } catch (error: any) {
    console.error("[EmailController] Error scheduling email:", error);
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
    console.error("[EmailController] Error listing emails:", error);
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
    console.error("[EmailController] Error getting email:", error);
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
    console.error("[EmailController] Error cancelling email:", error);
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
    console.error("[EmailController] Error rescheduling email:", error);
    res.status(500).json({ error: "Failed to reschedule email", details: error.message || "Internal server error" });
  }
}
