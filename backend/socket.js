import { Server } from "socket.io";
import redisClient from "./redis/redis.js";
import registerCasualQueueEvents from "./queues/casualQueueSocket.js";
import {
    MAX_ROOM_PLAYERS,
    normalizePlayerId,
    normalizeWord,
    calculateGuessPoints
} from "./utils/gameUtils.js";
import {
    getRoundElapsedSeconds,
    checkAllNonDrawersGuessed,
    endRoundForRoom,
    setRoomTimer
} from "./services/gameService.js";

let io;

const initSocket = (server) => {
    if (io) return io;

    io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        console.log('Socket connected:', socket.id);
        registerCasualQueueEvents(socket);

        socket.on('joinRoom', async ({ room, playerId, playerName }) => {
            if (!room || !playerId) return;
            try {
                const redisPlayerId = normalizePlayerId(playerId);
                const roomState = io.sockets.adapter.rooms.get(room);
                if ((roomState ? roomState.size : 0) >= MAX_ROOM_PLAYERS) {
                    socket.emit('joinRoomError', { message: 'Room is full.' });
                    return;
                }

                const playersKey = `room:${room}:players`;
                const scoresKey = `room:${room}:scores`;

                let raw = await redisClient.hget(playersKey, redisPlayerId);
                let playerObj = raw ? JSON.parse(raw) : { playerId: redisPlayerId, playerName, score: 0 };
                playerObj.socketId = socket.id;
                playerObj.playerName = playerName || playerObj.playerName;

                await redisClient.hset(playersKey, redisPlayerId, JSON.stringify(playerObj));
                await redisClient.zadd(scoresKey, playerObj.score || 0, redisPlayerId);

                socket.join(room);
                socket.data.room = room;
                socket.data.playerId = redisPlayerId;

                const playersRaw = await redisClient.hgetall(playersKey);
                const players = Object.values(playersRaw).map(v => JSON.parse(v));

                io.to(room).emit('roomPlayers', players);
                socket.emit('joinedRoom', { room, players });
            } catch (err) {
                console.error('Join room error:', err);
            }
        });

        socket.on('draw', (data) => {
            if (data.room) socket.to(data.room).emit('draw', data);
        });

        socket.on('clearDrawing', async ({ room }) => {
            if (!room) return;
            await redisClient.del(`room:${room}:data`);
            io.to(room).emit('clearDrawing');
        });

        socket.on('guess', async ({ room, playerName, playerId, guess }) => {
            if (!room || !guess) return;
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
                    const players = Object.values(updatedPlayersRaw).map(v => JSON.parse(v));
                    io.to(room).emit('roomPlayers', players);
                    io.to(room).emit('correctGuess', { playerId: guesserId, playerName, points, elapsedSeconds });

                    if (await checkAllNonDrawersGuessed(room, currentDrawer, updatedPlayersRaw)) {
                        await endRoundForRoom(room, 'all_guessed', io);
                    }
                }
            } catch (error) {
                console.error('Guess error:', error);
            }
        });

        socket.on('submitWord', async ({ room, playerId, playerName, word }) => {
            if (!room || !word) return;
            try {
                await redisClient.rpush(`room:${room}:words`, JSON.stringify({ word, playerId, playerName }));
                await redisClient.sadd(`room:${room}:submittedPlayers`, playerId);

                const playersRaw = await redisClient.hgetall(`room:${room}:players`);
                const subCount = await redisClient.scard(`room:${room}:submittedPlayers`);

                io.to(room).emit('wordSubmitted', { playerId, playerName, submittedCount: subCount, totalPlayers: Object.keys(playersRaw).length });
            } catch (err) {
                console.error('Submit word error:', err);
            }
        });

        socket.on('disconnect', async () => {
            const { room, playerId } = socket.data;
            if (room && playerId) {
                await redisClient.hdel(`room:${room}:players`, playerId);
                const playersRaw = await redisClient.hgetall(`room:${room}:players`);
                const players = Object.values(playersRaw || {}).map(v => JSON.parse(v));
                io.to(room).emit('roomPlayers', players);
            }
        });
    });

    return io;
};

export default initSocket;
export const getIo = () => io;