import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// shared publisher — reused across all API routes for pub/sub publishing
// SSE subscriber routes still need their own connections (Redis pub/sub requirement)
let publisher: Redis | null = null;

export function getRedisPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    publisher.connect().catch((err) => {
      console.error("[redis] publisher connection failed:", err);
    });
  }
  return publisher;
}

// for SSE routes that need a dedicated subscriber connection
export function createRedisSubscriber(): Redis {
  return new Redis(REDIS_URL);
}
