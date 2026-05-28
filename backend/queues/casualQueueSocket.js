import { casualQueue } from './casualQueue.js';

const registerCasualQueueEvents = (socket) => {
  socket.on('playCasual', async ({ playerId, playerName, preferences } = {}) => {
    if (!playerId || !playerName) {
      return socket.emit('playCasualError', {
        message: 'playerId and playerName are required to join the casual queue.',
      });
    }

    const jobData = {
      playerId: playerId.toString(),
      playerName,
      socketId: socket.id,
      requestedAt: new Date().toISOString(),
      preferences: preferences || {},
    };

    try {
      const job = await casualQueue.add('findMatch', jobData, {
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 3000,
        },
      });

      socket.emit('playCasualQueued', {
        jobId: job.id,
        queuedAt: job.timestamp,
        state: 'queued',
      });
    } catch (error) {
      console.error('Failed to enqueue casual play request:', error);
      socket.emit('playCasualError', {
        message: error?.message || 'Unable to queue play request.',
      });
    }
  });
};

export default registerCasualQueueEvents;
