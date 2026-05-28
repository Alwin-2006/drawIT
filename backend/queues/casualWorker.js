import BullMQ from 'bullmq';
import { casualQueueName } from './casualQueue.js';
import client from '../redis/redis.js';

const { Worker } = BullMQ;
const openRoomsKey = 'casual:openRooms';
const MAX_ROOM_PLAYERS = 4;

const makeRoomId = () => `room-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
const roomMembersKey = (roomId) => `casual:room:${roomId}:members`;

const addPlayerToRoomScript = `
  local roomKey = KEYS[1]
  local openRoomsKey = KEYS[2]
  local playerId = ARGV[1]
  local playerData = ARGV[2]
  local maxPlayers = tonumber(ARGV[3])
  local roomId = ARGV[4]
  local score = tonumber(ARGV[5])

  local currentCount = redis.call('hlen', roomKey)
  if currentCount >= maxPlayers then
    return { err = 'ROOM_FULL' }
  end

  redis.call('hset', roomKey, playerId, playerData)
  currentCount = redis.call('hlen', roomKey)
  if currentCount < maxPlayers then
    redis.call('zadd', openRoomsKey, score, roomId)
  else
    redis.call('zrem', openRoomsKey, roomId)
  end

  return currentCount
`;

export const createCasualWorker = (io) => {
  if (!io) {
    throw new Error('Socket.IO instance required to create casual worker');
  }

  const worker = new Worker(
    casualQueueName,
    async (job) => {
      const data = job.data || {};
      console.log('[casualWorker] processing job', job.id, data);

      if (!data.socketId || !data.playerId || !data.playerName) {
        throw new Error('Invalid match request: missing socketId, playerId or playerName');
      }

      let roomId = (await client.zrange(openRoomsKey, 0, 0))[0];
      if (!roomId) {
        roomId = makeRoomId();
      }

      const roomKey = roomMembersKey(roomId);
      let count;

      try {
        count = await client.eval(
          addPlayerToRoomScript,
          2,
          roomKey,
          openRoomsKey,
          data.playerId.toString(),
          JSON.stringify(data),
          MAX_ROOM_PLAYERS.toString(),
          roomId,
          Date.now(),
        );
      } catch (error) {
        if (error.message?.includes('ROOM_FULL')) {
          await client.zrem(openRoomsKey, roomId);
          roomId = makeRoomId();
          const roomKey2 = roomMembersKey(roomId);
          count = await client.eval(
            addPlayerToRoomScript,
            2,
            roomKey2,
            openRoomsKey,
            data.playerId.toString(),
            JSON.stringify(data),
            MAX_ROOM_PLAYERS.toString(),
            roomId,
            Date.now(),
          );
        } else {
          throw error;
        }
      }

      const members = await client.hgetall(roomKey);
      const sockets = [];
      const players = [];

      for (const [playerIdKey, playerJson] of Object.entries(members)) {
        try {
          const player = JSON.parse(playerJson);
          players.push(player);
          const socket = io.sockets.sockets.get(player.socketId);
          if (socket) {
            sockets.push({ socket, player });
          }
        } catch (e) {
          // ignore invalid entries
        }
      }

      for (const { socket } of sockets) {
        socket.join(roomId);
      }

      const isRoomFull = count >= MAX_ROOM_PLAYERS;

      if (!isRoomFull) {
        const opponentList = players
          .filter((p) => p.playerId !== data.playerId)
          .map((p) => ({ playerId: p.playerId, playerName: p.playerName }));

        io.to(data.socketId).emit('matched', {
          roomId,
          opponentList,
          yourId: data.playerId,
          roomReady: false,
        });

        for (const { socket, player } of sockets) {
          if (player.playerId !== data.playerId) {
            socket.emit('playerJoined', {
              playerId: data.playerId,
              playerName: data.playerName,
            });
          }
        }

        return { matched: false, queued: true, roomId };
      }

      for (const { socket, player } of sockets) {
        const opponentList = players
          .filter((p) => p.playerId !== player.playerId)
          .map((p) => ({ playerId: p.playerId, playerName: p.playerName }));

        socket.emit('matched', {
          roomId,
          opponentList,
          yourId: player.playerId,
        });
      }

      console.log('[casualWorker] matched room', roomId, 'with players', players.map((p) => p.playerId));
      return { matched: true, roomId, players: players.map((p) => p.playerId) };
    },
    {
      connection: client,
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    console.log('[casualWorker] job completed', job.id);
  });

  worker.on('failed', (job, err) => {
    console.error('[casualWorker] job failed', job.id, err);
  });

  return worker;
};
