import BullMQ from 'bullmq';
import client from '../redis/redis.js';

const { Queue } = BullMQ;

export const rankedQueueName = 'ranked-game-queue';

export const rankedQueue = new Queue(rankedQueueName, {
  connection: client,
});

rankedQueue.waitUntilReady().catch((err) => {
  console.error('[rankedQueue] Failed to connect to Redis:', err);
});
