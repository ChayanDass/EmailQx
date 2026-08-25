import { Request } from "express";

export interface UserIdentity {
  userEmail?: string;
  userName?: string;
}

export function getUserIdentity(req: Request): UserIdentity {
  const emailHeader = (req.headers["x-user-email"] as string) || (req.query.userEmail as string);
  const nameHeader = (req.headers["x-user-name"] as string) || (req.query.userName as string);
  return {
    userEmail: emailHeader ? emailHeader.toLowerCase().trim() : undefined,
    userName: nameHeader ? nameHeader.trim() : undefined,
  };
}
