import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import emailRoutes from "./routes/email.routes";
import { emailWorker, syncPendingJobsOnStartup } from "./queue/email.worker";
import { prisma } from "./config/prisma";
import { redisClient } from "./config/redis";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// API Routes
app.use("/api", emailRoutes);

// Root route welcome info
app.get("/", (_req, res) => {
  res.json({
    service: "ReachInbox Email Scheduler Service",
    status: "running",
    docs: "/api/health",
  });
});

async function startServer() {
  try {
    // Synchronize pending DB jobs with BullMQ queue on boot
    await syncPendingJobsOnStartup();

    app.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(`ReachInbox Email Scheduler API running on port ${PORT}`);
      console.log(`Health Check: http://localhost:${PORT}/api/health`);
      console.log(`=================================================`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown handling
async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  try {
    await emailWorker.close();
    await redisClient.quit();
    await prisma.$disconnect();
    console.log("Cleanup completed. Server stopped.");
    process.exit(0);
  } catch (err) {
    console.error("Error during graceful shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

startServer();
