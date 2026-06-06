import jwt from 'jsonwebtoken';
import { Player } from '../models/player.model.js';
import { rankedQueue } from './rankedQueue.js';

/**
 * Registers the `playRanked` socket event handler.
 *
 * The client MUST have authenticated via JWT before calling this event.
 * The socket's JWT is verified here, the player's current rating is fetched
 * from MongoDB, and a job is pushed to the ranked BullMQ queue.
 */
const registerRankedQueueEvents = (socket) => {
  socket.on('playRanked', async () => {
    // --- 1. Verify JWT from socket handshake auth ---
    const token = socket.handshake?.auth?.token;
    if (!token) {
      return socket.emit('playRankedError', {
        message: 'Authentication required to play ranked.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return socket.emit('playRankedError', {
        message: 'Invalid or expired token. Please log in again.',
      });
    }

    // --- 2. Fetch player from DB to get fresh rating ---
    let player;
    try {
      player = await Player.findById(decoded.id).select('username rating _id');
    } catch (err) {
      return socket.emit('playRankedError', {
        message: 'Failed to fetch player data.',
      });
    }

    if (!player) {
      return socket.emit('playRankedError', {
        message: 'Player not found.',
      });
    }

    const jobData = {
      playerId: player._id.toString(),
      playerName: player.username,
      rating: player.rating,
      socketId: socket.id,
      requestedAt: new Date().toISOString(),
    };

    // --- 3. Push job into ranked BullMQ queue ---
    try {
      const job = await rankedQueue.add('findRankedMatch', jobData, {
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 3000,
        },
      });

      socket.emit('playRankedQueued', {
        jobId: job.id,
        queuedAt: job.timestamp,
        state: 'queued',
        rating: player.rating,
      });
    } catch (err) {
      console.error('[rankedQueueEvents] Failed to enqueue ranked play request:', err);
      socket.emit('playRankedError', {
        message: err?.message || 'Unable to queue ranked play request.',
      });
    }
  });
};

export default registerRankedQueueEvents;
