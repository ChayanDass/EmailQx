import Redis, { RedisOptions } from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";
import dotenv from "dotenv";

dotenv.config();

const isLocalMode =
  process.env.USE_LOCAL_REDIS === "true" ||
  process.env.USE_LOCAL_REDIS === "1" ||
  process.env.REDIS_MODE === "local";

const UPSTASH_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function parseRedisConfig(): RedisOptions {
  // If explicitly forced to local mode, bypass Upstash credentials
  if (isLocalMode) {
    const host = process.env.REDIS_HOST || "127.0.0.1";
    const port = parseInt(process.env.REDIS_PORT || "6379", 10);
    return {
      host,
      port,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  // If Upstash REST variables are provided and not in local mode
  if (UPSTASH_REST_URL && UPSTASH_REST_TOKEN && UPSTASH_REST_URL.includes("upstash.io")) {
    try {
      const urlObj = new URL(UPSTASH_REST_URL);
      return {
        host: urlObj.hostname,
        port: 6379,
        password: UPSTASH_REST_TOKEN,
        tls: { rejectUnauthorized: false },
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };
    } catch (err) {
      console.warn("[Redis] Failed to parse UPSTASH_REDIS_REST_URL, checking other env vars:", err);
    }
  }

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl && redisUrl.trim() !== "") {
    try {
      const parsedUrl = new URL(redisUrl.trim());
      const isTls = parsedUrl.protocol === "rediss:";
      return {
        host: parsedUrl.hostname,
        port: parseInt(parsedUrl.port || "6379", 10),
        username: parsedUrl.username ? decodeURIComponent(parsedUrl.username) : undefined,
        password: parsedUrl.password ? decodeURIComponent(parsedUrl.password) : undefined,
        tls: isTls ? { rejectUnauthorized: false } : undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };
    } catch (err) {
      console.warn("[Redis] Failed to parse REDIS_URL, falling back to host/port env vars:", err);
    }
  }

  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = parseInt(process.env.REDIS_PORT || "6379", 10);
  const password = process.env.REDIS_PASSWORD || process.env.REDIS_TOKEN || undefined;
  const username = process.env.REDIS_USERNAME || process.env.REDIS_USER || undefined;
  const isTls =
    process.env.REDIS_TLS === "true" ||
    process.env.REDIS_TLS === "1" ||
    host.includes("upstash.io");

  return {
    host,
    port,
    username,
    password,
    tls: isTls ? { rejectUnauthorized: false } : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export const redisOptions: RedisOptions = parseRedisConfig();

export const redisClient = new Redis(redisOptions);

redisClient.on("connect", () => {
  const isTls = !!redisOptions.tls;
  console.log(
    `[Redis] Connected successfully to ${redisOptions.host}:${redisOptions.port}${
      isTls ? " (TLS/SSL Enabled)" : ""
    }`
  );
});

redisClient.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});

// REST client for @upstash/redis with automatic proxy fallback to local redisClient (ioredis)
const rawUpstash =
  UPSTASH_REST_URL && UPSTASH_REST_TOKEN && !isLocalMode
    ? new UpstashRedis({
        url: UPSTASH_REST_URL,
        token: UPSTASH_REST_TOKEN,
      })
    : null;

export const upstashRedis = new Proxy(rawUpstash || {}, {
  get(target, prop) {
    if (rawUpstash && prop in rawUpstash) {
      const val = (rawUpstash as any)[prop];
      return typeof val === "function" ? val.bind(rawUpstash) : val;
    }
    if (prop in redisClient) {
      const val = (redisClient as any)[prop];
      return typeof val === "function" ? val.bind(redisClient) : val;
    }
    return undefined;
  },
}) as unknown as UpstashRedis;
