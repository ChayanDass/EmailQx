import { Router } from "express";
import {
  scheduleEmail,
  listEmails,
  getEmailById,
  cancelEmail,
  rescheduleEmail,
  getStats,
  getHealth,
  syncUser,
} from "../controllers/email.controller";

const router = Router();

router.get("/health", getHealth);
router.get("/stats", getStats);
router.post("/users/sync", syncUser);

router.post("/emails/schedule", scheduleEmail);
router.get("/emails", listEmails);
router.get("/emails/:id", getEmailById);
router.post("/emails/:id/cancel", cancelEmail);
router.post("/emails/:id/reschedule", rescheduleEmail);

export default router;
