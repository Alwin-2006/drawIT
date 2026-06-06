import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import redisClient from './redis/redis.js';
import registerCasualQueueEvents from './queues/casualQueueSocket.js';
import registerRankedQueueEvents from './queues/rankedQueueEvents.js';
import {
  MAX_ROOM_PLAYERS,
  normalizePlayerId,
  normalizeWord,
  calculateGuessPoints,
} from './utils/gameUtils.js';
import {
  getRoundElapsedSeconds,
  checkAllNonDrawersGuessed,
  endRoundForRoom,
  setRoomTimer,
} from './services/gameService.js';
import { calculateForfeitPenalty } from './services/eloService.js';
import { Player } from './models/player.model.js';

let io;

// Reconnection forfeit timers: playerId → NodeJS.Timeout
const reconnectTimers = new Map();
const RECONNECT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns the ranked room ID that `playerId` is currently in, or null.
 * We store this mapping in Redis as  ranked:player:<playerId>:room
 */
const getRankedRoomForPlayer = (playerId) =>
  redisClient.get(`ranked:player:${playerId}:room`);

const setRankedRoomForPlayer = (playerId, roomId) =>
  redisClient.set(`ranked:player:${playerId}:room`, roomId);

const clearRankedRoomForPlayer = (playerId) =>
  redisClient.del(`ranked:player:${playerId}:room`);

/**
 * Returns true if `roomId` is a ranked room (has the isRanked flag in Redis).
 */
const isRankedRoom = async (roomId) => {
  if (!roomId) return false;
  const val = await redisClient.hget(`ranked:room:${roomId}:data`, 'isRanked');
  return val === '1';
};

/**
 * Apply forfeit penalty to a player and persist it to MongoDB.
 */
const applyForfeitPenalty = async (playerId) => {
  try {
    const playerDoc = await Player.findById(playerId).select('rating username');
    if (!playerDoc) return;

    const { newRating, delta } = calculateForfeitPenalty(playerDoc.rating);
    playerDoc.rating = newRating;
    await playerDoc.save();

    console.log(
      `[socket] Forfeit penalty applied to ${playerDoc.username}: ${playerDoc.rating - delta} → ${newRating} (${delta})`,
    );
  } catch (err) {
    console.error('[socket] Failed to apply forfeit penalty:', err.message || err);
  }
};

/**
 * Remove a player from a ranked room entirely.
 * If the room is now empty, end the game and clean up all state.
 */
const evictPlayerFromRankedRoom = async (playerId, roomId) => {
  const membersKey = `ranked:room:${roomId}:members`;
  const playersKey = `room:${roomId}:players`;

  await redisClient.hdel(membersKey, playerId);
  await redisClient.hdel(playersKey, playerId);
  await clearRankedRoomForPlayer(playerId);

  const remaining = await redisClient.hlen(membersKey);
  console.log(`[socket] Evicted ${playerId} from ranked room ${roomId}. Remaining: ${remaining}`);

  if (remaining === 0) {
    // Everyone is gone — clean up all game state for this room
    await cleanupRankedRoom(roomId);
    console.log(`[socket] Ranked room ${roomId} is empty after evictions — cleaned up.`);
    return;
  }

  // Notify remaining players
  if (io) {
    const playersRaw = await redisClient.hgetall(playersKey);
    const players = Object.values(playersRaw || {}).map((v) => JSON.parse(v));
    io.to(roomId).emit('roomPlayers', players);
    io.to(roomId).emit('playerLeft', { playerId });
  }
};

/**
 * Full Redis cleanup for a ranked room.
 */
const cleanupRankedRoom = async (roomId) => {
  const keys = [
    `ranked:room:${roomId}:members`,
    `ranked:room:${roomId}:data`,
    `room:${roomId}:players`,
    `room:${roomId}:scores`,
    `room:${roomId}:words`,
    `room:${roomId}:submittedPlayers`,
    `room:${roomId}:turnsInRound`,
    `room:${roomId}:roundsRemaining`,
    `room:${roomId}:currentWord`,
    `room:${roomId}:currentDrawer`,
    `room:${roomId}:guessedPlayers`,
    `room:${roomId}:lastDrawer`,
    `room:${roomId}:data`,
    `room:${roomId}:roundStartedAt`,
  ];
  try {
    await redisClient.del(...keys);
  } catch (e) {
    console.error('[socket] cleanupRankedRoom error:', e.message || e);
  }
};

// ─── Socket.IO init ──────────────────────────────────────────────────────────

const initSocket = (server) => {
  if (io) return io;

  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // ── Auth middleware: attach decoded JWT to socket.data if token present ──
  io.use((socket, next) => {
    const token = socket.handshake?.auth?.token;
    if (!token) {
      // Allow unauthenticated connections (casual / guests)
      socket.data.authenticated = false;
      return next();
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.authenticated = true;
      socket.data.decodedPlayerId = decoded.id; // MongoDB _id string
    } catch (_) {
      socket.data.authenticated = false;
    }
    next();
  });

  io.on('connection', async (socket) => {
    console.log('[socket] connected', socket.id, '| auth:', socket.data.authenticated);

    // Register queue event handlers
    registerCasualQueueEvents(socket);
    registerRankedQueueEvents(socket);

    // ── Ranked reconnect: if authenticated player has an ongoing ranked room ──
    if (socket.data.authenticated && socket.data.decodedPlayerId) {
      const playerId = socket.data.decodedPlayerId;

      // Cancel any pending forfeit timer
      if (reconnectTimers.has(playerId)) {
        clearTimeout(reconnectTimers.get(playerId));
        reconnectTimers.delete(playerId);
        console.log(`[socket] Reconnect timer cancelled for ${playerId}`);
      }

      const activeRoom = await getRankedRoomForPlayer(playerId);
      if (activeRoom) {
        // Restore their socket into the room
        socket.join(activeRoom);
        socket.data.room = activeRoom;
        socket.data.playerId = playerId;

        // Update their socketId in Redis so messages reach the new socket
        const playersKey = `room:${activeRoom}:players`;
        const raw = await redisClient.hget(playersKey, playerId);
        if (raw) {
          const playerObj = JSON.parse(raw);
          playerObj.socketId = socket.id;
          await redisClient.hset(playersKey, playerId, JSON.stringify(playerObj));
        }

        // Also update in ranked members
        const membersKey = `ranked:room:${activeRoom}:members`;
        const rawMember = await redisClient.hget(membersKey, playerId);
        if (rawMember) {
          const memberObj = JSON.parse(rawMember);
          memberObj.socketId = socket.id;
          await redisClient.hset(membersKey, playerId, JSON.stringify(memberObj));
        }

        // Send reconnect event with current room state
        const playersRaw = await redisClient.hgetall(playersKey);
        const players = Object.values(playersRaw || {}).map((v) => JSON.parse(v));

        const currentWord = await redisClient.get(`room:${activeRoom}:currentWord`);
        const currentDrawer = await redisClient.get(`room:${activeRoom}:currentDrawer`);
        const scores = await redisClient.zrange(`room:${activeRoom}:scores`, 0, -1, 'WITHSCORES');

        socket.emit('rankedReconnect', {
          roomId: activeRoom,
          players,
          scores,
          currentDrawer,
          // Don't reveal the word to non-drawers — Game.jsx already handles this
          isDrawer: normalizePlayerId(currentDrawer) === normalizePlayerId(playerId),
          yourId: playerId,
        });

        io.to(activeRoom).emit('playerReconnected', { playerId });
        console.log(`[socket] Player ${playerId} reconnected to ranked room ${activeRoom}`);
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // joinRoom
    // ────────────────────────────────────────────────────────────────────────
    socket.on('joinRoom', async ({ room, playerId, playerName }) => {
      if (!room || !playerId) return;

      // Ranked rooms require authentication
      const ranked = await isRankedRoom(room);
      if (ranked) {
        if (!socket.data.authenticated) {
          console.warn('[socket] joinRoom ranked rejected — not authenticated', { socketId: socket.id, room });
          return socket.emit('joinRoomError', { message: 'Authentication required for ranked rooms.' });
        }
        if (normalizePlayerId(socket.data.decodedPlayerId) !== normalizePlayerId(playerId)) {
          console.warn('[socket] joinRoom ranked rejected — playerId mismatch', {
            socketId: socket.id,
            decodedPlayerId: socket.data.decodedPlayerId,
            sentPlayerId: playerId,
          });
          return socket.emit('joinRoomError', { message: 'Player ID mismatch.' });
        }
      }

      console.log('[socket] joinRoom', { room, playerId, ranked, socketId: socket.id });

      try {
        const redisPlayerId = normalizePlayerId(playerId);

        // For ranked rooms the worker pre-registered players in ranked:room:*:members.
        // Don't use the Socket.IO adapter room size to gate entry — use the Redis
        // member count instead, and allow re-joining (socket already in room is fine).
        if (!ranked) {
          const roomState = io.sockets.adapter.rooms.get(room);
          if ((roomState ? roomState.size : 0) >= MAX_ROOM_PLAYERS) {
            socket.emit('joinRoomError', { message: 'Room is full.' });
            return;
          }
        }

        const playersKey = `room:${room}:players`;
        const scoresKey = `room:${room}:scores`;

        let raw = await redisClient.hget(playersKey, redisPlayerId);
        let playerObj = raw
          ? JSON.parse(raw)
          : { playerId: redisPlayerId, playerName, score: 0 };
        playerObj.socketId = socket.id;
        playerObj.playerName = playerName || playerObj.playerName;

        await redisClient.hset(playersKey, redisPlayerId, JSON.stringify(playerObj));
        await redisClient.zadd(scoresKey, playerObj.score || 0, redisPlayerId);

        socket.join(room);
        socket.data.room = room;
        socket.data.playerId = redisPlayerId;

        // For ranked: store player→room mapping so reconnect works
        if (ranked) {
          await setRankedRoomForPlayer(redisPlayerId, room);
        }

        const playersRaw = await redisClient.hgetall(playersKey);
        const players = Object.values(playersRaw).map((v) => JSON.parse(v));

        console.log('[socket] joinRoom success — broadcasting roomPlayers to', room, 'count:', players.length);
        io.to(room).emit('roomPlayers', players);
        socket.emit('joinedRoom', { room, players });
      } catch (err) {
        console.error('[socket] joinRoom error:', err);
      }
    });

    // ────────────────────────────────────────────────────────────────────────
    // draw
    // ────────────────────────────────────────────────────────────────────────
    socket.on('drawing', async (data) => {
      if (!data.room) return;

      const ranked = await isRankedRoom(data.room);
      if (ranked && !socket.data.authenticated) return;

      socket.to(data.room).emit('drawing', data);
    });

    // ────────────────────────────────────────────────────────────────────────
    // clearDrawing
    // ────────────────────────────────────────────────────────────────────────
    socket.on('clearDrawing', async ({ room }) => {
      if (!room) return;

      const ranked = await isRankedRoom(room);
      if (ranked && !socket.data.authenticated) return;

      await redisClient.del(`room:${room}:data`);
      io.to(room).emit('clearDrawing');
    });

    // ────────────────────────────────────────────────────────────────────────
    // guess
    // ────────────────────────────────────────────────────────────────────────
    socket.on('guess', async ({ room, playerName, playerId, guess }) => {
      if (!room || !guess) return;

      const ranked = await isRankedRoom(room);
      if (ranked && !socket.data.authenticated) return;

      try {
        const currentWord = await redisClient.get(`room:${room}:currentWord`);
        const currentDrawer = await redisClient.get(`room:${room}:currentDrawer`);
        const isCorrect = currentWord && normalizeWord(guess) === currentWord;

        io.to(room).emit('guess', { playerName, guess });

        if (isCorrect && playerId) {
          const guesserId = normalizePlayerId(playerId);
          const drawerId = normalizePlayerId(currentDrawer);
          const guessedPlayersKey = `room:${room}:guessedPlayers`;

          if (guesserId === drawerId) return;
          if (await redisClient.sismember(guessedPlayersKey, guesserId)) return;

          const elapsedSeconds = await getRoundElapsedSeconds(room);
          const points = calculateGuessPoints(elapsedSeconds);
          const drawerPoints = Math.floor(points / 2);

          const playersKey = `room:${room}:players`;
          const scoresKey = `room:${room}:scores`;

          const updateScore = async (id, p) => {
            await redisClient.zincrby(scoresKey, p, id);
            const raw = await redisClient.hget(playersKey, id);
            if (raw) {
              const obj = JSON.parse(raw);
              obj.score = (obj.score || 0) + p;
              await redisClient.hset(playersKey, id, JSON.stringify(obj));
            }
          };

          await updateScore(guesserId, points);
          if (drawerId) await updateScore(drawerId, drawerPoints);

          await redisClient.sadd(guessedPlayersKey, guesserId);

          const updatedPlayersRaw = await redisClient.hgetall(playersKey);
          const players = Object.values(updatedPlayersRaw).map((v) => JSON.parse(v));
          io.to(room).emit('roomPlayers', players);
          io.to(room).emit('correctGuess', { playerId: guesserId, playerName, points, elapsedSeconds });

          if (await checkAllNonDrawersGuessed(room, currentDrawer, updatedPlayersRaw)) {
            await endRoundForRoom(room, 'all_guessed', io);
          }
        }
      } catch (err) {
        console.error('[socket] guess error:', err);
      }
    });

    // ────────────────────────────────────────────────────────────────────────
    // submitWord
    // ────────────────────────────────────────────────────────────────────────
    socket.on('submitWord', async ({ room, playerId, playerName, word }) => {
      if (!room || !word) return;

      const ranked = await isRankedRoom(room);
      if (ranked && !socket.data.authenticated) return;

      try {
        await redisClient.rpush(`room:${room}:words`, JSON.stringify({ word, playerId, playerName }));
        await redisClient.sadd(`room:${room}:submittedPlayers`, playerId);

        const playersRaw = await redisClient.hgetall(`room:${room}:players`);
        const subCount = await redisClient.scard(`room:${room}:submittedPlayers`);

        io.to(room).emit('wordSubmitted', {
          playerId,
          playerName,
          submittedCount: subCount,
          totalPlayers: Object.keys(playersRaw).length,
        });
      } catch (err) {
        console.error('[socket] submitWord error:', err);
      }
    });

    // ────────────────────────────────────────────────────────────────────────
    // disconnect
    // ────────────────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const { room, playerId } = socket.data;
      if (!room || !playerId) return;

      const ranked = await isRankedRoom(room);

      if (ranked) {
        // ── Ranked disconnect: start forfeit timer ──
        console.log(`[socket] Ranked player ${playerId} disconnected from room ${room}. Starting forfeit timer.`);

        // Notify room that player temporarily disconnected
        io.to(room).emit('playerDisconnected', { playerId, reconnectWindowMs: RECONNECT_TIMEOUT_MS });

        const timer = setTimeout(async () => {
          reconnectTimers.delete(playerId);
          console.log(`[socket] Forfeit timer expired for ${playerId} in room ${room}.`);

          // Only apply ELO penalty if the game actually started (at least one round began).
          // If everyone left during the word-input phase, no penalty — the game never started.
          const turnsPlayed = await redisClient.get(`room:${room}:turnsInRound`);
          const roundsKey = await redisClient.get(`room:${room}:roundsRemaining`);
          const gameStarted = turnsPlayed !== null || roundsKey !== null;

          if (gameStarted) {
            await applyForfeitPenalty(playerId);
          } else {
            console.log(`[socket] Game not started yet — no penalty for ${playerId}`);
          }

          // Evict from room (also handles empty-room cleanup)
          await evictPlayerFromRankedRoom(playerId, room);

          if (io) {
            io.to(room).emit('playerForfeited', { playerId, penaltyApplied: gameStarted });
          }
        }, RECONNECT_TIMEOUT_MS);

        reconnectTimers.set(playerId, timer);
      } else {
        // ── Casual disconnect: existing behaviour ──
        await redisClient.hdel(`room:${room}:players`, playerId);
        const playersRaw = await redisClient.hgetall(`room:${room}:players`);
        const players = Object.values(playersRaw || {}).map((v) => JSON.parse(v));
        io.to(room).emit('roomPlayers', players);
      }
    });
  });

  return io;
};

export default initSocket;
export const getIo = () => io;
