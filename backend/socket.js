import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import redisClient from "./redis/redis.js";
import registerCasualQueueEvents from "./queues/casualQueueSocket.js";

const MAX_ROOM_PLAYERS = 4;
export const ROUND_DURATION_MS = 60000;
export const GUESS_POINTS_MAX = 500;
export const GUESS_POINTS_MIN = 50;
export const GUESS_POINTS_DECAY_PER_SEC = 10;

let io;
// In-memory timers per room to end rounds on timeout (cleared when round ends early)
const roomTimers = new Map();
// Round start timestamps (ms) for time-based scoring — O(1) lookup per guess
const roundStartTimes = new Map();

/** Points for a correct guess: max(50, 500 - elapsedSeconds * 10) */
export const calculateGuessPoints = (elapsedSeconds) => {
    const elapsed = Math.max(0, Math.floor(elapsedSeconds));
    return Math.max(GUESS_POINTS_MIN, GUESS_POINTS_MAX - elapsed * GUESS_POINTS_DECAY_PER_SEC);
};

export const getRoundElapsedSeconds = (room) => {
    const startedAt = roundStartTimes.get(room);
    if (!startedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
};

const markRoundStarted = async (room) => {
    const now = Date.now();
    roundStartTimes.set(room, now);
    try {
        await redisClient.set(`room:${room}:roundStartedAt`, String(now));
    } catch (e) {
        console.error('Failed to persist round start time:', e.message || e);
    }
};

const clearRoundStartTime = async (room) => {
    roundStartTimes.delete(room);
    try {
        await redisClient.del(`room:${room}:roundStartedAt`);
    } catch (e) {
        /* ignore */
    }
};

const normalizePlayerId = (id) => (id == null ? '' : String(id).trim());

const normalizeWord = (word) =>
    String(word ?? '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

const checkAllNonDrawersGuessed = async (room, drawerId, playersRaw) => {
    const guessedPlayersKey = `room:${room}:guessedPlayers`;
    const allPlayerIds = Object.keys(playersRaw);
    const normalizedDrawerId = normalizePlayerId(drawerId);

    const nonDrawerIds = normalizedDrawerId
        ? allPlayerIds.filter((id) => normalizePlayerId(id) !== normalizedDrawerId)
        : allPlayerIds;

    if (nonDrawerIds.length === 0) {
        return false;
    }

    const guessedIds = await redisClient.smembers(guessedPlayersKey);
    const guessedSet = new Set(guessedIds.map(normalizePlayerId));

    return nonDrawerIds.every((id) => guessedSet.has(normalizePlayerId(id)));
};

const initSocket = (server) => {
    if (io) return io;

    io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    // TTL/key-expiration handling removed — rounds are ended only when all players have guessed.

    // Simple token auth for socket connections
    /*io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token || (socket.handshake.headers?.authorization && socket.handshake.headers.authorization.split(' ')[1]);
            if (!token) return next(new Error('Authentication error'));

            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret_fallback');
            socket.user = decoded;
            return next();
        } catch (err) {
            console.error('Socket auth error:', err.message);
            return next(new Error('Authentication error'));
        }
    });*/

    io.on('connection', (socket) => {
        console.log('Socket connected:', socket.id, 'user:', socket.user?.id || socket.user?.username || 'unknown');

        registerCasualQueueEvents(socket);
        
        socket.on('joinRoom', async ({ room, playerId, playerName }) => {
            if (!room || !playerId) return;
            try {
                const redisPlayerId = normalizePlayerId(playerId);
                if (!redisPlayerId) return;
                const roomState = io.sockets.adapter.rooms.get(room);
                const roomSize = roomState ? roomState.size : 0;
                
                if (roomSize >= MAX_ROOM_PLAYERS) {
                    socket.emit('joinRoomError', { message: 'Room is full.' });
                    return;
                }

                // Keys for player info and scores
                const playersKey = `room:${room}:players`;
                const scoresKey = `room:${room}:scores`;
                
                
                // Add or update player entry in players hash and ensure scores sorted set
                const exists = await redisClient.hexists(playersKey, redisPlayerId);
                let playerObj;
                if (!exists) {
                    playerObj = { playerId: redisPlayerId, playerName, score: 0, socketId: socket.id };
                    await redisClient.hset(playersKey, redisPlayerId, JSON.stringify(playerObj));
                    await redisClient.zadd(scoresKey, 0, redisPlayerId);
                } else {
                    // preserve existing score while updating socketId and playerName
                    const raw = await redisClient.hget(playersKey, redisPlayerId);
                    try {
                        playerObj = JSON.parse(raw);
                        playerObj.socketId = socket.id;
                        playerObj.playerName = playerName || playerObj.playerName;
                    } catch (e) {
                        playerObj = { playerId: redisPlayerId, playerName, score: 0, socketId: socket.id };
                    }
                    await redisClient.hset(playersKey, redisPlayerId, JSON.stringify(playerObj));
                }

                // Read full player list from hash
                const playersRaw = await redisClient.hgetall(playersKey);
                console.log(playersRaw);
                const players = Object.values(playersRaw).map((v) => JSON.parse(v));

                socket.join(room);
                socket.emit('joinedRoom', {
                    room,
                    playerId: redisPlayerId,
                    playerName,
                });
                // Send full players list to joining socket
                socket.emit('roomPlayers', players);

                const drawingKey = `room:${room}:data`;
                const drawingEntries = await redisClient.lrange(drawingKey, 0, -1);
                if (drawingEntries && drawingEntries.length) {
                    const drawingHistory = drawingEntries.map((entry) => JSON.parse(entry));
                    socket.emit('drawingHistory', drawingHistory);
                }

                // attach player/room info to socket for disconnect handling
                socket.data = socket.data || {};
                socket.data.room = room;
                socket.data.playerId = redisPlayerId;
                socket.data.playerName = playerName;

                io.to(room).emit('playerJoined', { playerId, playerName });
            } catch (error) {
                console.error('Redis joinRoom error:', error.message);
            }
        });

        socket.on('drawing', async (data) => {
            if (!data?.room || !data?.from || !data?.to) return;

            const payload = {
                from: data.from,
                to: data.to,
                tool: data.tool || 'pencil',
                color: data.color || '#000000',
                width: data.width || 4,
            };

            socket.to(data.room).emit('drawing', payload);

            try {
                const drawingKey = `room:${data.room}:data`;
                await redisClient.rpush(drawingKey, JSON.stringify(payload));
            } catch (err) {
                console.error('Redis save drawing error:', err.message || err);
            }
        });

        // Clear saved drawing history for a room and notify all clients
        socket.on('clearDrawing', async ({ room }) => {
            if (!room) return;
            try {
                const drawingKey = `room:${room}:data`;
                await redisClient.del(drawingKey);
                io.to(room).emit('clearDrawing');
            } catch (err) {
                console.error('Redis clear drawing error:', err.message || err);
            }
        });

        socket.on('guess', async ({ room, playerName, playerId, guess }) => {
            if (!room || !guess) return;

            try {
                const currentWordKey = `room:${room}:currentWord`;
                const currentDrawerKey = `room:${room}:currentDrawer`;
                const guessedPlayersKey = `room:${room}:guessedPlayers`;
                const currentWord = await redisClient.get(currentWordKey);
                const currentDrawer = await redisClient.get(currentDrawerKey);
                const guessNormalized = normalizeWord(guess);
                const isCorrect = Boolean(currentWord && guessNormalized === currentWord);

                // Always broadcast the guess to the room (chat)
                io.to(room).emit('guess', { playerName, guess });

                // If correct, award time-based points once per non-drawer guesser
                if (isCorrect && playerId) {
                    const guesserId = normalizePlayerId(playerId);
                    const drawerId = normalizePlayerId(currentDrawer);
                    const scoresKey = `room:${room}:scores`;
                    const playersKey = `room:${room}:players`;

                    const isDrawer = guesserId && guesserId === drawerId;
                    const alreadyGuessed =
                        !isDrawer &&
                        guesserId &&
                        (await redisClient.sismember(guessedPlayersKey, guesserId));

                    if (!isDrawer && guesserId && !alreadyGuessed) {
                        const elapsedSeconds = getRoundElapsedSeconds(room);
                        const points = calculateGuessPoints(elapsedSeconds);

                        await redisClient.zincrby(scoresKey, points, guesserId);

                        const raw = await redisClient.hget(playersKey, guesserId);
                        if (raw) {
                            try {
                                const playerObj = JSON.parse(raw);
                                playerObj.score = (playerObj.score || 0) + points;
                                await redisClient.hset(playersKey, guesserId, JSON.stringify(playerObj));
                            } catch (e) {
                                // ignore parse errors
                            }
                        }

                        await redisClient.sadd(guessedPlayersKey, guesserId);

                        const updatedPlayersRaw = await redisClient.hgetall(playersKey);
                        const players = Object.values(updatedPlayersRaw).map((v) =>
                            JSON.parse(v),
                        );
                        io.to(room).emit('roomPlayers', players);
                        io.to(room).emit('correctGuess', {
                            playerId: guesserId,
                            playerName,
                            points,
                            elapsedSeconds,
                        });

                        const allGuessed = await checkAllNonDrawersGuessed(
                            room,
                            currentDrawer,
                            updatedPlayersRaw,
                        );
                        if (allGuessed) {
                            await endRoundForRoom(room, 'all_guessed');
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing guess:', error.message);
            }
        });

        socket.on('submitWord', async ({ room, playerId, playerName, word }) => {
            if (!room || !word) return;
            try {
                const wordsKey = `room:${room}:words`;
                const submittedPlayersKey = `room:${room}:submittedPlayers`;
                const playersKey = `room:${room}:players`;
                
                // Store word with player info
                await redisClient.rpush(wordsKey, JSON.stringify({ word, playerId, playerName }));
                
                // Add player to submitted set
                await redisClient.sadd(submittedPlayersKey, playerId);
                
                // Get total players and submitted count
                const playersRaw = await redisClient.hgetall(playersKey);
                const totalPlayers = Object.keys(playersRaw).length;
                const submittedCount = await redisClient.scard(submittedPlayersKey);
                
                console.log(`Word submitted: ${word} by ${playerName} for room ${room}. Submitted: ${submittedCount}/${totalPlayers}`);
                
                // Notify room of submission status
                io.to(room).emit('wordSubmitted', {
                    playerName,
                    submittedCount,
                    totalPlayers,
                    allSubmitted: submittedCount === totalPlayers,
                });
            } catch (error) {
                console.error('Redis submitWord error:', error.message);
            }
        });
              

        socket.on('disconnect', async (reason) => {
            console.log('Socket disconnected:', socket.id, reason);
            try {
                const room = socket.data?.room;
                const playerId = socket.data?.playerId;
                const playerName = socket.data?.playerName;
                if (room && playerId) {
                    const playersKey = `room:${room}:players`;
                    const scoresKey = `room:${room}:scores`;
                    await redisClient.hdel(playersKey, playerId);
                    await redisClient.zrem(scoresKey, playerId);

                    // send updated players list
                    const playersRaw = await redisClient.hgetall(playersKey);
                    const players = Object.values(playersRaw).map((v) => JSON.parse(v));
                    io.to(room).emit('roomPlayers', players);
                    io.to(room).emit('playerLeft', { playerId, playerName });
                }
            } catch (err) {
                console.error('Error handling disconnect cleanup:', err.message || err);
            }
        });
    });

    return io;
};

export default initSocket;

export const getIo = () => io;

export const clearRoomTimer = (room) => {
    try {
        const t = roomTimers.get(room);
        if (t) {
            clearTimeout(t);
            roomTimers.delete(room);
        }
    } catch (e) {
        // ignore
    }
};

/** End the active round and broadcast `endRound` to the room (idempotent). */
export const endRoundForRoom = async (room, reason) => {
    if (!room) return false;

    clearRoomTimer(room);
    await clearRoundStartTime(room);

    const currentWordKey = `room:${room}:currentWord`;
    const currentDrawerKey = `room:${room}:currentDrawer`;
    const guessedPlayersKey = `room:${room}:guessedPlayers`;

    const currentWord = await redisClient.get(currentWordKey);
    if (!currentWord) {
        return false;
    }

    try {
        await redisClient.del(currentWordKey);
        await redisClient.del(currentDrawerKey);
        await redisClient.del(guessedPlayersKey);
    } catch (e) {
        console.error('Failed to cleanup round keys:', e.message || e);
    }

    const ioLocal = getIo();
    if (ioLocal) {
        ioLocal.to(room).emit('endRound', { room, reason, word: currentWord });
    }
    return true;
};

// Start a timer for a room which emits endRound when it expires.
export const setRoomTimer = (room, duration = ROUND_DURATION_MS) => {
    try {
        clearRoomTimer(room);
        markRoundStarted(room);

        const t = setTimeout(async () => {
            try {
                await endRoundForRoom(room, 'timeout');
            } catch (err) {
                console.error('Error in room timer handler:', err.message || err);
            } finally {
                roomTimers.delete(room);
            }
        }, duration);

        roomTimers.set(room, t);
    } catch (e) {
        console.error('Failed to set room timer:', e.message || e);
    }
};