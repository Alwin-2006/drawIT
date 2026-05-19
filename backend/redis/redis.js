import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const client = new Redis(redisUrl);

client.on("error", (err) => {
  console.error("Redis connection error:", err);
});

client.on("connect", () => {
  console.log("Redis client connected");
});

export default client;
