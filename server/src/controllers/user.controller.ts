import { Request, Response } from "express";
import { prisma } from "../config/prisma";

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
    console.error("[UserController] Error syncing user:", error);
    res.status(500).json({ error: "Failed to sync user", details: error.message || "Internal server error" });
  }
}
