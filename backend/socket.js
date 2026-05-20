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

        socket.on('joinRoom', ({ room, playerId, playerName }) => {
            if (room) {
                socket.join(room);
                io.to(room).emit('playerJoined', { playerId, playerName });
            }
        });

        socket.on('drawing', (data) => {
            if (data?.room) socket.to(data.room).emit('drawing', data);
        });

        socket.on('guess', ({ room, playerId, guess }) => {
            if (room) io.to(room).emit('guess', { playerId, guess });
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