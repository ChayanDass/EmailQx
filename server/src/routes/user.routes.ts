import { Router } from "express";
import { syncUser } from "../controllers/user.controller";

const router = Router();

router.post("/users/sync", syncUser);

export default router;
