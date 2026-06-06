import BullMQ from 'bullmq';
import client from '../redis/redis.js';

const { Queue, JobScheduler } = BullMQ;
const casualQueueName = 'casual-game-queue';

const casualQueue = new Queue(casualQueueName, {
  connection: client,
});


const casualQueueScheduler = new JobScheduler(casualQueueName, {
  connection: client,
});

casualQueueScheduler.waitUntilReady().catch((err) => {
  console.error('Casual queue scheduler failed to start:', err);
});

export { casualQueue, casualQueueName };

