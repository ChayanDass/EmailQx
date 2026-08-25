import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { getUserIdentity } from "../utils/auth.util";

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
    console.error("[StatsController] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats", details: error.message || "Internal server error" });
  }
}
