import { EventEmitter } from "node:events";
import { redis, redisEnabled } from "../config/redis.js";

/**
 * Fan-out for "this user's email just got verified", consumed by the SSE route
 * so an already-open tab can flip live without polling.
 *
 * Always delivers same-process via a local EventEmitter first (zero-latency,
 * works even if Redis is down). When Redis is configured, also publishes on a
 * per-user channel (`email-verified:<userId>`) via a lazily-created, ref-counted
 * `redis.duplicate()` subscriber connection, so the event still reaches this
 * user's other tabs if they're being served by a different instance. Degrades
 * to local-only delivery on any Redis failure — same convention as the rest of
 * this repo's Redis usage (config/redis.js, services/downloadCounter.service.js).
 */

const channel = (userId) => `email-verified:${userId}`;

const localEmitter = new EventEmitter();
localEmitter.setMaxListeners(0);

let subscriber = null;
const refCounts = new Map(); // userId -> number of active local subscribers

const getSubscriber = () => {
  if (subscriber) return subscriber;
  subscriber = redis.duplicate();
  subscriber.on("error", (err) => console.error("emailEvents subscriber error:", err.message));
  subscriber.on("message", (ch, payload) => {
    if (!ch.startsWith("email-verified:")) return;
    const userId = ch.slice("email-verified:".length);
    localEmitter.emit(channel(userId), safeParse(payload));
  });
  return subscriber;
};

const safeParse = (payload) => {
  try {
    return JSON.parse(payload);
  } catch {
    return { emailVerified: true };
  }
};

/** Publish "verified" for a user to every tab/instance listening. */
export const publishEmailVerified = (userId) => {
  const payload = { emailVerified: true, at: Date.now() };
  localEmitter.emit(channel(userId), payload);

  if (!redisEnabled) return;
  redis.publish(channel(userId), JSON.stringify(payload)).catch((err) => {
    console.error("publishEmailVerified: Redis publish failed:", err.message);
  });
};

/**
 * Subscribe to verification events for one user. Returns an `unsubscribe()`
 * cleanup function — always call it when the SSE connection closes.
 */
export const subscribeToUser = (userId, onEvent) => {
  localEmitter.on(channel(userId), onEvent);

  let subscribedRedisChannel = false;
  if (redisEnabled) {
    try {
      const count = refCounts.get(userId) || 0;
      refCounts.set(userId, count + 1);
      if (count === 0) {
        getSubscriber().subscribe(channel(userId)).catch((err) => {
          console.error("subscribeToUser: Redis SUBSCRIBE failed:", err.message);
        });
      }
      subscribedRedisChannel = true;
    } catch (err) {
      console.error("subscribeToUser: Redis setup failed:", err.message);
    }
  }

  return () => {
    localEmitter.off(channel(userId), onEvent);

    if (!subscribedRedisChannel) return;
    const count = (refCounts.get(userId) || 1) - 1;
    if (count <= 0) {
      refCounts.delete(userId);
      subscriber?.unsubscribe(channel(userId)).catch((err) => {
        console.error("subscribeToUser: Redis UNSUBSCRIBE failed:", err.message);
      });
    } else {
      refCounts.set(userId, count);
    }
  };
};
