import { createClient } from 'redis';
import './env';
import { logger } from '../utils/logger';

// Redis is an optional cache. It is opt-in (REDIS_ENABLED=true + REDIS_URL) and every
// caller goes through cacheGet/cacheSet, which silently no-op when Redis is unavailable.
let client: any = null;

export const redisClient = {
  get isOpen(): boolean {
    return !!client && client.isReady;
  },
};

export const connectRedis = async () => {
  if (process.env.REDIS_ENABLED !== 'true' || !process.env.REDIS_URL) {
    logger.info('Redis disabled (set REDIS_ENABLED=true and REDIS_URL to enable). Running without cache.');
    return;
  }
  const c = createClient({
    url: process.env.REDIS_URL,
    socket: { connectTimeout: 5000, reconnectStrategy: (retries) => (retries > 5 ? false : Math.min(retries * 500, 3000)) },
  });
  // Without an 'error' listener node-redis throws and can crash the process.
  c.on('error', (err) => logger.error('Redis error', err));
  try {
    await c.connect();
    client = c;
    logger.info('Redis connected');
  } catch (err) {
    logger.warn('Failed to connect to Redis. Running in degraded mode without cache.', err);
    c.destroy();
  }
};

export const disconnectRedis = async () => {
  if (client) await client.quit().catch(() => undefined);
};

export const cacheGet = async (key: string): Promise<string | null> => {
  if (!client || !client.isReady) return null;
  try {
    return await client.get(key);
  } catch (err) {
    logger.error('Redis get error', err);
    return null;
  }
};

export const cacheSet = async (key: string, value: string): Promise<void> => {
  if (!client || !client.isReady) return;
  try {
    await client.set(key, value);
  } catch (err) {
    logger.error('Redis set error', err);
  }
};

export const cacheDel = async (key: string): Promise<void> => {
  if (!client || !client.isReady) return;
  try {
    await client.del(key);
  } catch (err) {
    logger.error('Redis del error', err);
  }
};

export default redisClient;
