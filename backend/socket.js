import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import redisClient from "./redis/redis.js";
import registerCasualQueueEvents from "./queues/casualQueueSocket.js";

const MAX_ROOM_PLAYERS = 4;
let io;

const initSocket = (server) => {
    if (io) return io;

    io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

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
                const redisPlayerId = playerId.toString();
                const roomState = io.sockets.adapter.rooms.get(room);
                const roomSize = roomState ? roomState.size : 0;
                if (roomSize >= MAX_ROOM_PLAYERS) {
                    socket.emit('joinRoomError', { message: 'Room is full.' });
                    return;
                }

                // Keys for player info and scores
                const playersKey = `room:${room}:players`;
                const scoresKey = `room:${room}:scores`;
                
                // If player not present, add to players hash and scores sorted set
                const exists = await redisClient.hexists(playersKey, redisPlayerId);
                if (!exists) {
                    const playerObj = { playerId: redisPlayerId, playerName, score: 0 };
                    await redisClient.hset(playersKey, redisPlayerId, JSON.stringify(playerObj));
                    await redisClient.zadd(scoresKey, 0, redisPlayerId);
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
            } catch (err) {socket.emit('roomPlayers', players);

                console.error('Redis clear drawing error:', err.message || err);
            }
        });

        socket.on('guess', ({ room, playerName, playerId, guess }) => {
            if (room) io.to(room).emit('guess', { playerName, guess });
        });

        socket.on('correctGuess', async ({ room, playerId, points }) => {
            try {
                if (playerId && points && room) {
                    const scoresKey = `room:${room}:scores`;
                    const playersKey = `room:${room}:players`;
                    await redisClient.zincrby(scoresKey, points, playerId.toString());

                    const raw = await redisClient.hget(playersKey, playerId.toString());
                    if (raw) {
                        try {
                            const playerObj = JSON.parse(raw);
                            playerObj.score = (playerObj.score || 0) + points;
                            await redisClient.hset(playersKey, playerId.toString(), JSON.stringify(playerObj));
                        } catch (e) {
                            // ignore parse errors
                        }
                    }

                    // send updated players list
                    const playersRaw = await redisClient.hgetall(playersKey);
                    const players = Object.values(playersRaw).map((v) => JSON.parse(v));
                    io.to(room).emit('roomPlayers', players);
                }
                if (room) io.to(room).emit('correctGuess', { playerId, points });
            } catch (err) {
                console.error('Error updating score:', err.message);
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