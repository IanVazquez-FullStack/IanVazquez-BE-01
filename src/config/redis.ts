import IORedis from "ioredis";

/**
 * BullMQ connection factory. `maxRetriesPerRequest: null` is required so a
 * worker waiting on a queue does not fail its `brpoplpush`/`blpop` when Redis
 * is briefly unavailable — it keeps blocking instead of throwing. Every
 * producer and worker gets its own connection (BullMQ's recommendation).
 */
export function createRedisConnection(redisUrl?: string): IORedis {
  const url = redisUrl ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  return new IORedis(url, { maxRetriesPerRequest: null });
}
