import { Router } from "express";
import emailRoutes from "./email.routes";
import userRoutes from "./user.routes";
import healthRoutes from "./health.routes";
import statsRoutes from "./stats.routes";

const apiRouter = Router();

apiRouter.use(healthRoutes);
apiRouter.use(statsRoutes);
apiRouter.use(userRoutes);
apiRouter.use(emailRoutes);

export default apiRouter;
