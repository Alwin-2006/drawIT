import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import redisClient from "./redis/redis.js";

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
        
        socket.on('joinRoom', async ({ room, playerId, playerName }) => {
            if (!room || !playerId) return;
            try {
                const redisPlayerId = playerId.toString();
                const existingScore = await redisClient.zscore(room, redisPlayerId);
                if (existingScore === null) {
                    await redisClient.zadd(room, 0,{ score: 0, playerID: redisPlayerId,playerName:playerName });
                }

                const leaderboard = await redisClient.zrevrange(room, 0, -1);
                const formattedLeaderboard = leaderboard.map((entry) => ({
                    playerId: entry.playerID,
                    playerName,
                    score: entry.score,
                }));

                socket.join(room);
                socket.emit('roomLeaderboard', formattedLeaderboard);
                io.to(room).emit('playerJoined', { playerId, playerName });
            } catch (error) {
                console.error('Redis joinRoom error:', error.message);
            }
        });

        socket.on('drawing', (data) => {
            if (data?.room) socket.to(data.room).emit('drawing', data);
        });

        socket.on('guess', ({ room, playerName, playerId, guess }) => {
            if (room) io.to(room).emit('guess', { playerName, guess });
        });

        socket.on('correctGuess', async ({ room, playerId, points }) => {
            try {
                if (playerId && points) {
                    await redisClient.zIncrBy('game:leaderboard', points, playerId.toString());
                }
                if (room) io.to(room).emit('correctGuess', { playerId, points });
            } catch (err) {
                console.error('Error updating score:', err.message);
            }
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', socket.id, reason);
        });
    });

    return io;
};

export default initSocket;