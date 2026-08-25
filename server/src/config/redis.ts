import Redis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

export const redisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

export const redisClient = new Redis(redisOptions);

redisClient.on("connect", () => {
  console.log(`[Redis] Connected to ${REDIS_HOST}:${REDIS_PORT}`);
});

redisClient.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});
