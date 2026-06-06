import BullMQ from 'bullmq';
import client from '../redis/redis.js';
import { rankedQueueName } from './rankedQueue.js';

const { Worker } = BullMQ;

export const MAX_RANKED_ROOM_PLAYERS = 4;

// Redis key for the sorted set of open ranked rooms per bucket
const rankedOpenRoomsKey = (bucket) => `ranked:${bucket}:openRooms`;
const rankedRoomMembersKey = (roomId) => `ranked:room:${roomId}:members`;

// Ranked rooms are flagged so socket.js can distinguish them from casual rooms
export const rankedRoomDataKey = (roomId) => `ranked:room:${roomId}:data`;

const makeRoomId = () =>
  `ranked-room-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

/**
 * ELO bucket boundaries (lower-bound inclusive).
 * A player is placed in the highest bucket whose floor they meet.
 *
 * Bronze:   1200 – 1399
 * Silver:   1400 – 1599
 * Gold:     1600 – 1799
 * Platinum: 1800+
 */
export const ELO_BUCKETS = [
  { name: 'platinum', floor: 1800 },
  { name: 'gold',     floor: 1600 },
  { name: 'silver',   floor: 1400 },
  { name: 'bronze',   floor: 1200 },
];

export const getBucket = (rating) => {
  for (const bucket of ELO_BUCKETS) {
    if (rating >= bucket.floor) return bucket.name;
  }
  // Fallback: below 1200 → bronze (shouldn't happen but be safe)
  return 'bronze';
};

// Lua script: atomically add a player to a room or reject if full
const addPlayerToRoomScript = `
  local roomKey    = KEYS[1]
  local openRooms  = KEYS[2]
  local playerId   = ARGV[1]
  local playerData = ARGV[2]
  local maxPlayers = tonumber(ARGV[3])
  local roomId     = ARGV[4]
  local score      = tonumber(ARGV[5])

  local current = redis.call('hlen', roomKey)
  if current >= maxPlayers then
    return {err = 'ROOM_FULL'}
  end

  redis.call('hset', roomKey, playerId, playerData)
  current = redis.call('hlen', roomKey)

  if current < maxPlayers then
    redis.call('zadd', openRooms, score, roomId)
  else
    redis.call('zrem', openRooms, roomId)
  end

  return current
`;

export const createRankedWorker = (io) => {
  if (!io) throw new Error('Socket.IO instance required to create ranked worker');

  const worker = new Worker(
    rankedQueueName,
    async (job) => {
      const data = job.data || {};
      console.log('[rankedWorker] processing job', job.id, data);

      const { socketId, playerId, playerName, rating } = data;
      if (!socketId || !playerId || !playerName || rating == null) {
        throw new Error('Invalid ranked match request: missing socketId, playerId, playerName or rating');
      }

      const bucket = getBucket(rating);
      const openRooms = rankedOpenRoomsKey(bucket);

      let roomId = (await client.zrange(openRooms, 0, 0))[0];
      if (!roomId) roomId = makeRoomId();

      const roomKey = rankedRoomMembersKey(roomId);

      let count;
      try {
        count = await client.eval(
          addPlayerToRoomScript,
          2,
          roomKey,
          openRooms,
          playerId.toString(),
          JSON.stringify(data),
          MAX_RANKED_ROOM_PLAYERS.toString(),
          roomId,
          Date.now(),
        );
      } catch (err) {
        if (err.message?.includes('ROOM_FULL')) {
          await client.zrem(openRooms, roomId);
          roomId = makeRoomId();
          const freshRoomKey = rankedRoomMembersKey(roomId);
          count = await client.eval(
            addPlayerToRoomScript,
            2,
            freshRoomKey,
            openRooms,
            playerId.toString(),
            JSON.stringify(data),
            MAX_RANKED_ROOM_PLAYERS.toString(),
            roomId,
            Date.now(),
          );
        } else {
          throw err;
        }
      }

      // Persist ranked room metadata so socket.js can identify it
      await client.hset(rankedRoomDataKey(roomId), {
        bucket,
        createdAt: Date.now(),
        isRanked: '1',
      });

      // Build current member list
      const members = await client.hgetall(rankedRoomMembersKey(roomId));
      const players = [];

      for (const [, playerJson] of Object.entries(members)) {
        try {
          const p = JSON.parse(playerJson);
          players.push(p);
        } catch (_) { /* ignore corrupt entries */ }
      }

      const isRoomFull = count >= MAX_RANKED_ROOM_PLAYERS;

      if (!isRoomFull) {
        // Notify the newly queued player they are waiting
        const opponentList = players
          .filter((p) => p.playerId !== playerId)
          .map((p) => ({ playerId: p.playerId, playerName: p.playerName, rating: p.rating }));

        io.to(socketId).emit('matched', {
          roomId,
          opponentList,
          yourId: playerId,
          roomReady: false,
          isRanked: true,
        });

        // Notify existing members a new player joined
        for (const p of players) {
          if (p.playerId !== playerId && p.socketId) {
            io.to(p.socketId).emit('playerJoined', {
              playerId,
              playerName,
              rating,
            });
          }
        }

        return { matched: false, queued: true, roomId };
      }

      // Room is full — notify everyone with their roomId so they can navigate
      for (const p of players) {
        const opponentList = players
          .filter((op) => op.playerId !== p.playerId)
          .map((op) => ({ playerId: op.playerId, playerName: op.playerName, rating: op.rating }));

        io.to(p.socketId).emit('matched', {
          roomId,
          opponentList,
          yourId: p.playerId,
          roomReady: true,
          isRanked: true,
        });
      }

      console.log('[rankedWorker] matched ranked room', roomId, 'bucket', bucket,
        'players', players.map((p) => p.playerId));

      return { matched: true, roomId, bucket, players: players.map((p) => p.playerId) };
    },
    {
      connection: client,
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    console.log('[rankedWorker] job completed', job.id);
  });

  worker.on('failed', (job, err) => {
    console.error('[rankedWorker] job failed', job?.id, err);
  });

  return worker;
};
